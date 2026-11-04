import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { addDays } from "date-fns";
import { db, schema, type Tx } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { createApproval } from "@/lib/approvals";
import { aiAvailable, runPrompt } from "@/lib/ai/client";
import { outreachMessage, replyHandler } from "@/lib/ai/prompts";
import { getSettings } from "@/lib/settings";
import { astDateString, astToUtc } from "@/lib/time";
import { fillTemplate } from "./templates";

type Lead = typeof schema.leads.$inferSelect;
type Message = typeof schema.messages.$inferSelect;
type Step = typeof schema.sequenceSteps.$inferSelect;
export type Channel = "whatsapp" | "email" | "dm";

const PURPOSE_BY_STEP: Record<string, "opener" | "followup_day3" | "followup_day7"> = {
  outreach_opener: "opener",
  followup_day3: "followup_day3",
  followup_day7: "followup_day7",
};

/** End of the current day in Trinidad, as a UTC instant. */
export function endOfAstDay(now = new Date()): Date {
  return astToUtc(`${astDateString(now)}T23:59:59`);
}
export function startOfAstDay(now = new Date()): Date {
  return astToUtc(`${astDateString(now)}T00:00:00`);
}

/** The lead's sequence, or the default active sequence for its niche. */
export async function sequenceForLead(tx: Tx | typeof db, lead: Lead) {
  if (lead.sequenceId) {
    const [s] = await tx.select().from(schema.sequences).where(eq(schema.sequences.id, lead.sequenceId));
    if (s) return s;
  }
  const [s] = await tx
    .select()
    .from(schema.sequences)
    .where(and(eq(schema.sequences.active, true), lead.nicheId ? eq(schema.sequences.nicheId, lead.nicheId) : sql`true`))
    .orderBy(asc(schema.sequences.createdAt))
    .limit(1);
  return s ?? null;
}

async function stepsOf(tx: Tx | typeof db, sequenceId: string) {
  return tx.select().from(schema.sequenceSteps).where(eq(schema.sequenceSteps.sequenceId, sequenceId)).orderBy(asc(schema.sequenceSteps.stepOrder));
}

/** Pick a channel the lead can actually be reached on, preferring the step's channel. */
export function pickChannel(preferred: string, lead: Pick<Lead, "whatsapp" | "phone" | "email" | "facebookUrl" | "instagramUrl">): Channel | null {
  const has = { whatsapp: Boolean(lead.whatsapp ?? lead.phone), email: Boolean(lead.email), dm: Boolean(lead.facebookUrl ?? lead.instagramUrl) };
  if (preferred in has && has[preferred as Channel]) return preferred as Channel;
  return (["whatsapp", "email", "dm"] as const).find((c) => has[c]) ?? null;
}

/** Draft text for a sequence step: Claude when configured, otherwise the niche template filled with known facts only. */
export async function generateStepText(lead: Lead, step: Step, channel: Channel) {
  const [niche] = lead.nicheId ? await db.select().from(schema.niches).where(eq(schema.niches.id, lead.nicheId)) : [];
  const purpose = PURPOSE_BY_STEP[step.purpose] ?? "opener";
  const templates = await db
    .select()
    .from(schema.messageTemplates)
    .where(and(eq(schema.messageTemplates.active, true), eq(schema.messageTemplates.purpose, purpose), lead.nicheId ? eq(schema.messageTemplates.nicheId, lead.nicheId) : sql`true`));
  const previous = await db
    .select({ body: schema.messages.body })
    .from(schema.messages)
    .where(and(eq(schema.messages.leadId, lead.id), eq(schema.messages.status, "sent")))
    .orderBy(asc(schema.messages.sentAt));

  if (aiAvailable()) {
    const res = await runPrompt(
      outreachMessage,
      {
        purpose,
        channel,
        niche: niche?.name ?? "local business",
        lead: {
          business_name: lead.businessName,
          contact_name: lead.contactName,
          area: lead.area,
          runs_meta_ads: lead.runsMetaAds,
          ad_count: lead.adCount,
          ad_notes: lead.adNotes,
          facts: lead.facts,
          score_reasons: lead.scoreReasons,
        },
        template_examples: templates.map((t) => t.body),
        previous_messages: previous.map((p) => p.body ?? "").filter(Boolean),
      },
      `outreach:${purpose}`,
    );
    const variants = res.output.variants.filter((v) => v.trim()).slice(0, 2);
    return { variants, missing: res.output.missing_facts, aiRunId: res.usageId, source: "ai" as const };
  }

  const chosen = templates.slice(0, 2);
  const filled = chosen.map((t) => fillTemplate(t.body, lead));
  const variants = filled.map((f) => f.text);
  if (variants.length === 1) variants.push(variants[0]!.replace(/Mind if I send|Could I send|Can I send/, "Would it help if I sent"));
  const missing = [...new Set(filled.flatMap((f) => f.missing)), "AI not configured — drafted from template"];
  return { variants, missing, aiRunId: null, source: "template" as const };
}

/**
 * Create (or return) the draft for one sequence step and put it in the approval queue.
 * Idempotent on (lead, sequence, step) so reruns of the outreach batch never duplicate drafts.
 */
export async function draftStep(lead: Lead, step: Step, opts: { requestedBy: string; dueAt?: Date; existing?: Message }) {
  if (lead.doNotContact) return { status: "skipped" as const, reason: "do not contact" };
  if (lead.stage === "won" || lead.stage === "lost") return { status: "skipped" as const, reason: `lead is ${lead.stage}` };
  const channel = pickChannel(step.channel, lead);
  if (!channel) return { status: "skipped" as const, reason: "no way to contact" };

  const dedupeKey = `seq:${lead.id}:${step.sequenceId}:${step.stepOrder}`;
  const [already] = opts.existing ? [opts.existing] : await db.select().from(schema.messages).where(eq(schema.messages.dedupeKey, dedupeKey));
  if (already && already.body) return { status: "exists" as const, message: already };

  const text = await generateStepText(lead, step, channel);
  return db.transaction(async (tx) => {
    let message: Message;
    if (already) {
      [message] = await tx
        .update(schema.messages)
        .set({ channel, variants: text.variants, body: text.variants[0], chosenVariant: 0, aiRunId: text.aiRunId })
        .where(eq(schema.messages.id, already.id))
        .returning() as [Message];
    } else {
      const inserted = await tx
        .insert(schema.messages)
        .values({
          leadId: lead.id,
          channel,
          purpose: step.purpose,
          sequenceStepId: step.id,
          stepOrder: step.stepOrder,
          templateId: step.templateId,
          variants: text.variants,
          chosenVariant: 0,
          body: text.variants[0],
          status: "draft",
          dueAt: opts.dueAt ?? new Date(),
          dedupeKey,
          aiRunId: text.aiRunId,
          isDemo: lead.isDemo,
        })
        .onConflictDoNothing({ target: schema.messages.dedupeKey })
        .returning();
      if (!inserted[0]) return { status: "exists" as const, message: (await tx.select().from(schema.messages).where(eq(schema.messages.dedupeKey, dedupeKey)))[0]! };
      message = inserted[0];
    }
    if (!lead.sequenceId) await tx.update(schema.leads).set({ sequenceId: step.sequenceId }).where(eq(schema.leads.id, lead.id));

    const { approval } = await createApproval(
      {
        itemType: step.purpose === "outreach_opener" ? "outreach_opener" : step.purpose === "followup_day7" ? "followup_day7" : "followup_day3",
        title: `${step.purpose === "outreach_opener" ? "First message" : step.purpose === "followup_day3" ? "Day-3 follow-up" : "Day-7 last nudge"} to ${lead.businessName}`,
        summary: `${channel === "whatsapp" ? "WhatsApp" : channel === "email" ? "Email" : "DM"} · fit score ${lead.fitScoreOverride ?? lead.fitScore ?? "—"}${text.source === "template" ? " · template draft" : ""}`,
        preview: { body: text.variants[0], variants: text.variants, channel, leadId: lead.id, missing_facts: text.missing },
        subjectTable: "messages",
        subjectId: message.id,
        requestedBy: opts.requestedBy,
        dedupeKey: `approval:${dedupeKey}`,
        isDemo: lead.isDemo,
      },
      tx,
    );
    await tx.insert(schema.activities).values({ leadId: lead.id, type: "message_draft", channel, body: text.variants[0], metadata: { messageId: message.id, step: step.stepOrder }, isDemo: lead.isDemo });
    return { status: "drafted" as const, message, approvalStatus: approval.status };
  });
}

/** Draft the first message of the lead's sequence. */
export async function draftOpener(leadId: string, requestedBy: string) {
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
  if (!lead) throw new Error("Lead not found");
  const seq = await sequenceForLead(db, lead);
  if (!seq) return { status: "skipped" as const, reason: "no sequence for this niche" };
  const [first] = await stepsOf(db, seq.id);
  if (!first) return { status: "skipped" as const, reason: "sequence has no steps" };
  return draftStep(lead, first, { requestedBy });
}

/** How many messages went out today (AST) on a channel. */
export async function sentToday(channel: Channel, now = new Date()) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.messages)
    .where(and(eq(schema.messages.status, "sent"), eq(schema.messages.channel, channel), gte(schema.messages.sentAt, startOfAstDay(now))));
  return r?.n ?? 0;
}

/**
 * Matthias pressed send on his phone (or sent the email) — record it and schedule the next step.
 * Enforces the daily send limit and do-not-contact. Never sends anything itself.
 */
export async function markSent(messageId: string, actorId: string, now = new Date()) {
  const [msg] = await db.select().from(schema.messages).where(eq(schema.messages.id, messageId));
  if (!msg) throw new Error("Message not found");
  if (msg.status === "sent") return { message: msg, next: null };
  if (msg.status !== "approved") throw new Error("Approve this message before marking it sent.");
  const [lead] = msg.leadId ? await db.select().from(schema.leads).where(eq(schema.leads.id, msg.leadId)) : [];
  if (lead?.doNotContact) throw new Error("This lead is on the do-not-contact list.");

  const settings = await getSettings();
  const limit = settings.sendLimits[msg.channel] ?? Infinity;
  if ((await sentToday(msg.channel as Channel, now)) >= limit) throw new Error(`Daily ${msg.channel} limit reached (${limit}). Change it in Settings if needed.`);

  return db.transaction(async (tx) => {
    const [sent] = await tx.update(schema.messages).set({ status: "sent", sentAt: now }).where(and(eq(schema.messages.id, messageId), eq(schema.messages.status, "approved"))).returning();
    if (!sent) throw new Error("Message was already updated.");
    if (msg.templateId) await tx.update(schema.messageTemplates).set({ sentCount: sql`${schema.messageTemplates.sentCount} + 1` }).where(eq(schema.messageTemplates.id, msg.templateId));
    await logAudit({ actorType: "user", actorId, action: "message.marked_sent", entityTable: "messages", entityId: messageId, details: { channel: msg.channel, purpose: msg.purpose } }, tx);
    if (!lead) return { message: sent, next: null };

    await tx.insert(schema.activities).values({ leadId: lead.id, type: "message_sent", channel: msg.channel, body: msg.body, metadata: { messageId, step: msg.stepOrder }, isDemo: lead.isDemo, createdBy: actorId });
    const patch: Partial<Lead> = { lastContactedAt: now };
    if (lead.stage === "new") patch.stage = "contacted";

    // Schedule the next step (text is drafted by the outreach batch on the day it's due).
    let next: Message | null = null;
    const step = msg.sequenceStepId ? (await tx.select().from(schema.sequenceSteps).where(eq(schema.sequenceSteps.id, msg.sequenceStepId)))[0] : undefined;
    if (step && !lead.sequenceStoppedAt) {
      const [nextStep] = await tx
        .select()
        .from(schema.sequenceSteps)
        .where(and(eq(schema.sequenceSteps.sequenceId, step.sequenceId), sql`${schema.sequenceSteps.stepOrder} > ${step.stepOrder}`))
        .orderBy(asc(schema.sequenceSteps.stepOrder))
        .limit(1);
      if (nextStep) {
        const dueAt = addDays(now, nextStep.dayOffset - step.dayOffset);
        const inserted = await tx
          .insert(schema.messages)
          .values({
            leadId: lead.id,
            channel: pickChannel(nextStep.channel, lead) ?? msg.channel,
            purpose: nextStep.purpose,
            sequenceStepId: nextStep.id,
            stepOrder: nextStep.stepOrder,
            templateId: nextStep.templateId,
            status: "draft",
            dueAt,
            dedupeKey: `seq:${lead.id}:${nextStep.sequenceId}:${nextStep.stepOrder}`,
            isDemo: lead.isDemo,
          })
          .onConflictDoNothing({ target: schema.messages.dedupeKey })
          .returning();
        next = inserted[0] ?? null;
        patch.nextAction = nextStep.purpose === "followup_day7" ? "Day-7 last nudge" : "Day-3 follow-up";
        patch.nextActionDue = dueAt;
      } else {
        // Last step sent: sequence finished → Nurture.
        patch.stage = "nurture";
        patch.sequenceStoppedAt = now;
        patch.sequenceStopReason = "sequence finished";
        patch.nextAction = "Nurture check-in";
        patch.nextActionDue = addDays(now, 60);
        await tx.insert(schema.activities).values({ leadId: lead.id, type: "stage_change", body: `${lead.stage} → Nurture (sequence finished)`, metadata: { from: lead.stage, to: "nurture" }, isDemo: lead.isDemo });
      }
    }
    await tx.update(schema.leads).set(patch).where(eq(schema.leads.id, lead.id));
    return { message: sent, next };
  });
}

/** Stop the sequence: cancel unsent drafts and their pending approvals. */
export async function stopSequence(tx: Tx, leadId: string, reason: string) {
  const pending = await tx
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(and(eq(schema.messages.leadId, leadId), inArray(schema.messages.status, ["draft", "approved"]), sql`${schema.messages.sequenceStepId} is not null`));
  if (pending.length) {
    const ids = pending.map((p) => p.id);
    await tx.update(schema.messages).set({ status: "cancelled" }).where(inArray(schema.messages.id, ids));
    await tx
      .update(schema.approvals)
      .set({ status: "cancelled", decisionNote: `Sequence stopped: ${reason}`, decidedAt: new Date() })
      .where(and(eq(schema.approvals.subjectTable, "messages"), inArray(schema.approvals.subjectId, ids), eq(schema.approvals.status, "pending")));
  }
  await tx
    .update(schema.leads)
    .set({ sequenceStoppedAt: new Date(), sequenceStopReason: reason })
    .where(and(eq(schema.leads.id, leadId), isNull(schema.leads.sequenceStoppedAt)));
  return pending.length;
}

export type ReplyClass = "interested" | "question" | "not_now" | "no" | "stop";

/** Keyword fallback when AI isn't configured. Errs towards "question" so a human always reads it. */
export function classifyReplyFallback(text: string): ReplyClass {
  const t = text.toLowerCase();
  if (/\b(stop|unsubscribe|remove me|don'?t (message|contact|text)|leave me alone|spam)\b/.test(t)) return "stop";
  if (/\b(not interested|no thanks|no thank you|we'?re good|we are good)\b/.test(t)) return "no";
  if (/\b(not now|later|next month|busy|another time|maybe later)\b/.test(t)) return "not_now";
  if (/\b(yes|sure|ok(ay)?|interested|send it|let'?s talk|call me|sounds good)\b/.test(t)) return "interested";
  return "question";
}

/**
 * Prospect replied (pasted in, or synced from Gmail later). The reply stops the sequence, is classified,
 * and — except for "stop" — a response draft goes to the approval queue. "Stop" sets do-not-contact.
 */
export async function recordReply(leadId: string, replyText: string, actorId: string | null, opts: { channel?: Channel } = {}) {
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
  if (!lead) throw new Error("Lead not found");
  const history = await db
    .select({ body: schema.activities.body, type: schema.activities.type })
    .from(schema.activities)
    .where(and(eq(schema.activities.leadId, leadId), inArray(schema.activities.type, ["message_sent", "reply"])))
    .orderBy(asc(schema.activities.occurredAt));
  const [lastSent] = await db
    .select()
    .from(schema.messages)
    .where(and(eq(schema.messages.leadId, leadId), eq(schema.messages.status, "sent")))
    .orderBy(desc(schema.messages.sentAt))
    .limit(1);

  let classification: ReplyClass;
  let draft: string | null = null;
  let nextAction = "Reply";
  let aiRunId: string | null = null;
  const [niche] = lead.nicheId ? await db.select().from(schema.niches).where(eq(schema.niches.id, lead.nicheId)) : [];
  if (aiAvailable()) {
    const res = await runPrompt(
      replyHandler,
      {
        niche: niche?.name ?? "local business",
        lead: { business_name: lead.businessName, contact_name: lead.contactName },
        conversation: history.map((h) => ({ from: h.type === "reply" ? ("lead" as const) : ("matthias" as const), text: h.body ?? "" })),
        reply: replyText,
        booking_link: `${process.env.APP_URL ?? ""}/book`,
      },
      "outreach:reply",
    );
    classification = res.output.classification;
    draft = res.output.response_draft;
    nextAction = res.output.next_action;
    aiRunId = res.usageId;
  } else {
    classification = classifyReplyFallback(replyText);
    nextAction = { interested: "Book the call", question: "Answer their question", not_now: "Check back in 60 days", no: "Close as lost", stop: "Do not contact" }[classification];
  }

  return db.transaction(async (tx) => {
    const now = new Date();
    await tx.insert(schema.activities).values({ leadId, type: "reply", channel: opts.channel ?? lastSent?.channel ?? "whatsapp", body: replyText, metadata: { classification }, isDemo: lead.isDemo, createdBy: actorId });
    if (lastSent) await tx.update(schema.messages).set({ status: "replied" }).where(eq(schema.messages.id, lastSent.id));
    if (lastSent?.templateId) await tx.update(schema.messageTemplates).set({ replyCount: sql`${schema.messageTemplates.replyCount} + 1` }).where(eq(schema.messageTemplates.id, lastSent.templateId));
    const cancelled = await stopSequence(tx, leadId, "replied");

    const stage: Lead["stage"] =
      classification === "stop" || classification === "no" ? "lost" : classification === "not_now" ? "nurture" : lead.stage === "new" || lead.stage === "contacted" ? "replied" : lead.stage;
    await tx
      .update(schema.leads)
      .set({
        stage,
        doNotContact: classification === "stop" ? true : lead.doNotContact,
        lostReason: classification === "stop" ? "Asked not to be contacted" : classification === "no" ? "Declined" : lead.lostReason,
        nextAction,
        nextActionDue: classification === "not_now" ? addDays(now, 60) : now,
      })
      .where(eq(schema.leads.id, leadId));
    if (stage !== lead.stage) {
      await tx.insert(schema.activities).values({ leadId, type: "stage_change", body: `${lead.stage} → ${stage} (reply: ${classification})`, metadata: { from: lead.stage, to: stage }, isDemo: lead.isDemo });
    }

    let message: Message | null = null;
    if (classification !== "stop") {
      const body = draft ?? "";
      [message] = await tx
        .insert(schema.messages)
        .values({
          leadId,
          channel: opts.channel ?? (lastSent?.channel as Channel) ?? "whatsapp",
          purpose: "reply_draft",
          classification,
          variants: body ? [body] : [],
          body: body || null,
          status: "draft",
          dueAt: now,
          aiRunId,
          isDemo: lead.isDemo,
        })
        .returning() as [Message];
      await createApproval(
        {
          itemType: "reply_draft",
          title: `Reply to ${lead.businessName} (${classification.replace("_", " ")})`,
          summary: `They said: “${replyText.slice(0, 140)}${replyText.length > 140 ? "…" : ""}”`,
          preview: { body: body || (aiAvailable() ? "" : "AI not configured — write your reply here with Edit."), leadId, classification },
          subjectTable: "messages",
          subjectId: message.id,
          requestedBy: aiRunId ? "ai" : "system",
          isDemo: lead.isDemo,
        },
        tx,
      );
    }
    await logAudit({ actorType: actorId ? "user" : "system", actorId, action: "lead.reply_recorded", entityTable: "leads", entityId: leadId, details: { classification, cancelledDrafts: cancelled } }, tx);
    return { classification, stage, cancelledDrafts: cancelled, message };
  });
}

/** Approved, unsent messages due today (AST), with their leads. */
export async function todaysSends(now = new Date()) {
  return db
    .select({ message: schema.messages, lead: schema.leads })
    .from(schema.messages)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.messages.leadId))
    .where(and(eq(schema.messages.status, "approved"), lte(schema.messages.dueAt, endOfAstDay(now)), eq(schema.leads.doNotContact, false)))
    .orderBy(asc(schema.messages.dueAt));
}

/** Approved messages to existing clients (invoice reminders, onboarding nudges) due today. */
export async function todaysClientSends(now = new Date()) {
  return db
    .select({ message: schema.messages, client: schema.clients })
    .from(schema.messages)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.messages.clientId))
    .where(and(eq(schema.messages.status, "approved"), lte(schema.messages.dueAt, endOfAstDay(now))))
    .orderBy(asc(schema.messages.dueAt));
}

/** Drafts (follow-ups) whose day has come but whose text hasn't been written yet. */
export async function dueUnwrittenFollowups(now = new Date()) {
  return db
    .select({ message: schema.messages, lead: schema.leads, step: schema.sequenceSteps })
    .from(schema.messages)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.messages.leadId))
    .innerJoin(schema.sequenceSteps, eq(schema.sequenceSteps.id, schema.messages.sequenceStepId))
    .where(and(eq(schema.messages.status, "draft"), isNull(schema.messages.body), lte(schema.messages.dueAt, endOfAstDay(now)), eq(schema.leads.doNotContact, false)));
}
