"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { aiAvailable } from "@/lib/ai/client";
import { enqueueJob, processJobs } from "@/lib/jobs";
import { registerJobHandlers } from "@/lib/job-handlers";
import { addNote, createLead, moveStage, setDoNotContact, STAGES, type Stage } from "@/lib/leads/service";
import { draftOpener, markSent, recordReply } from "@/lib/outreach/sequences";
import { approveAndShare, generateAudit, generateCallBrief, generateProposal } from "@/lib/docs/generate";
import { normalizeTtPhone } from "@/lib/phone";
import { astToUtc } from "@/lib/time";
import { LEAD_IMPORT_FIELDS } from "@/lib/csv";
import { parseEditorForm } from "@/lib/docs/sections";

const uuid = z.string().uuid();
const stageEnum = z.enum(STAGES.map((s) => s.key) as [Stage, ...Stage[]]);
const opt = (max = 300) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

function done(path: string, params?: Record<string, string>) {
  revalidatePath("/dashboard", "layout");
  redirect(params ? `${path}?${new URLSearchParams(params)}` : path);
}
function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/* ------------------------------ Leads ------------------------------ */

const leadSchema = z.object({
  businessName: z.string().trim().min(1).max(200),
  nicheId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  area: opt(),
  contactName: opt(),
  phone: opt(40),
  whatsapp: opt(40),
  email: opt().pipe(z.string().email().nullable()),
  facebookUrl: opt(500),
  instagramUrl: opt(500),
  website: opt(500),
  mapsUrl: opt(1000),
  notes: opt(4000),
});

export async function createLeadAction(form: FormData) {
  const actor = await requireStaff();
  const input = leadSchema.parse(Object.fromEntries(form));
  const r = await createLead({ ...input, source: "manual" }, { type: "user", id: actor.userId });
  if (r.status === "duplicate") done(`/dashboard/leads/${r.lead.id}`, { notice: "duplicate" });
  done(`/dashboard/leads/${r.lead.id}`, { notice: "created" });
}

export async function updateLeadAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const input = leadSchema.parse(Object.fromEntries(form));
  const phoneNormalized = normalizeTtPhone(input.phone);
  const override = form.get("fitScoreOverride");
  const fitScoreOverride = override === "" || override == null ? null : z.coerce.number().int().min(1).max(10).parse(override);
  const nextActionDue = form.get("nextActionDue") ? astToUtc(`${form.get("nextActionDue")}T09:00:00`) : null;
  try {
    await db
      .update(schema.leads)
      .set({
        businessName: input.businessName,
        nicheId: input.nicheId,
        area: input.area,
        contactName: input.contactName,
        phone: phoneNormalized ?? input.phone,
        phoneNormalized,
        whatsapp: normalizeTtPhone(input.whatsapp) ?? phoneNormalized,
        email: input.email,
        facebookUrl: input.facebookUrl,
        instagramUrl: input.instagramUrl,
        website: input.website,
        mapsUrl: input.mapsUrl,
        fitScoreOverride,
        nextAction: (form.get("nextAction") as string)?.trim() || null,
        nextActionDue,
      })
      .where(eq(schema.leads.id, id));
  } catch (e) {
    done(`/dashboard/leads/${id}`, { error: /unique/i.test(errMsg(e)) ? "Another lead already has that phone number or Facebook page." : errMsg(e) });
  }
  await logAudit({ actorType: "user", actorId: actor.userId, action: "lead.updated", entityTable: "leads", entityId: id, details: { fitScoreOverride } });
  done(`/dashboard/leads/${id}`, { notice: "saved" });
}

export async function moveStageAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const to = stageEnum.parse(form.get("stage"));
  const back = (form.get("back") as string) || `/dashboard/leads/${id}`;
  let portal: string | null | undefined;
  try {
    const r = await moveStage(id, to, actor.userId, { lostReason: (form.get("lostReason") as string) || undefined });
    portal = r.portalToken;
  } catch (e) {
    done(back, { error: errMsg(e) });
  }
  done(back, portal ? { notice: "won", portal } : { notice: "moved" });
}

/** Used by the drag-and-drop board (client component); returns instead of redirecting. */
export async function moveStageInline(id: string, to: Stage, lostReason?: string) {
  const actor = await requireStaff();
  try {
    const r = await moveStage(uuid.parse(id), stageEnum.parse(to), actor.userId, { lostReason });
    revalidatePath("/dashboard", "layout");
    return { ok: true as const, portalToken: r.portalToken ?? null, clientId: r.client?.id ?? null };
  } catch (e) {
    return { ok: false as const, error: errMsg(e) };
  }
}

export async function noteAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const body = z.string().trim().min(1).max(5000).parse(form.get("body"));
  const type = form.get("type") === "call" ? "call" : "note";
  await addNote(id, body, actor.userId, type);
  done(`/dashboard/leads/${id}`);
}

export async function dncAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  await setDoNotContact(id, form.get("value") === "on", actor.userId);
  done((form.get("back") as string) || `/dashboard/leads/${id}`);
}

const bulkSchema = z.object({ action: z.enum(["stage", "dnc", "opener"]), stage: stageEnum.optional(), ids: z.array(uuid).min(1).max(200) });

export async function bulkLeadsAction(form: FormData) {
  const actor = await requireStaff();
  const { action, stage, ids } = bulkSchema.parse({ action: form.get("action"), stage: form.get("stage") || undefined, ids: form.getAll("ids") });
  const back = (form.get("back") as string) || "/dashboard/leads";
  let ok = 0;
  const errors: string[] = [];
  for (const id of ids) {
    try {
      if (action === "stage" && stage) await moveStage(id, stage, actor.userId, { lostReason: stage === "lost" ? "Bulk update" : undefined });
      else if (action === "dnc") await setDoNotContact(id, true, actor.userId, "Bulk: do not contact");
      else if (action === "opener") {
        const r = await draftOpener(id, `user:${actor.userId}`);
        if (r.status === "skipped") throw new Error(r.reason);
      }
      ok++;
    } catch (e) {
      errors.push(errMsg(e));
    }
  }
  done(back.split("?")[0]!, { notice: `bulk:${ok}`, ...(errors.length ? { error: `${errors.length} skipped: ${[...new Set(errors)].slice(0, 2).join("; ")}` } : {}) });
}

export async function saveViewAction(form: FormData) {
  const actor = await requireStaff();
  const name = z.string().trim().min(1).max(60).parse(form.get("name"));
  const query = z.string().max(500).parse(form.get("query") ?? "");
  await db.insert(schema.savedViews).values({ name, query, page: "leads", createdBy: actor.userId });
  done("/dashboard/leads" + (query ? `?${query}` : ""));
}

export async function deleteViewAction(form: FormData) {
  await requireStaff();
  await db.delete(schema.savedViews).where(eq(schema.savedViews.id, uuid.parse(form.get("id"))));
  done("/dashboard/leads");
}

/** CSV import. Rows arrive already mapped to lead fields (mapping happens in the browser). */
const importRow = z.object(Object.fromEntries(Object.keys(LEAD_IMPORT_FIELDS).map((k) => [k, z.string().max(2000).optional()])) as Record<keyof typeof LEAD_IMPORT_FIELDS, z.ZodOptional<z.ZodString>>);

export async function importLeadsAction(payload: { nicheId: string | null; rows: Record<string, string | undefined>[] }) {
  const actor = await requireStaff();
  const rows = z.array(importRow).max(2000).parse(payload.rows);
  const nicheId = payload.nicheId ? uuid.parse(payload.nicheId) : null;
  const niches = await db.select().from(schema.niches);
  const result = { created: 0, duplicates: 0, invalid: 0, duplicateNames: [] as string[] };
  for (const r of rows) {
    if (!r.business_name?.trim()) {
      result.invalid++;
      continue;
    }
    const rowNiche = r.niche ? niches.find((n) => n.slug === r.niche!.trim().toLowerCase() || n.name.toLowerCase().includes(r.niche!.trim().toLowerCase())) : undefined;
    const res = await createLead(
      {
        businessName: r.business_name,
        nicheId: rowNiche?.id ?? nicheId,
        contactName: r.contact_name,
        phone: r.phone,
        whatsapp: r.whatsapp,
        email: r.email && z.string().email().safeParse(r.email.trim()).success ? r.email : null,
        area: r.area,
        facebookUrl: r.facebook_url,
        instagramUrl: r.instagram_url,
        website: r.website,
        mapsUrl: r.maps_url,
        notes: r.notes,
        source: "csv_import",
      },
      { type: "user", id: actor.userId },
    );
    if (res.status === "created") result.created++;
    else {
      result.duplicates++;
      if (result.duplicateNames.length < 10) result.duplicateNames.push(r.business_name);
    }
  }
  await logAudit({ actorType: "user", actorId: actor.userId, action: "leads.imported", entityTable: "leads", details: { created: result.created, duplicates: result.duplicates, invalid: result.invalid } });
  revalidatePath("/dashboard", "layout");
  return result;
}

/** On-demand lead research: queues the jobs, runs the first one now, the dispatcher does the rest. */
export async function researchAction(form: FormData) {
  const actor = await requireStaff();
  if (!aiAvailable()) done("/dashboard/leads", { error: "Lead research needs the Anthropic API key (ANTHROPIC_API_KEY)." });
  const nicheId = uuid.parse(form.get("nicheId"));
  const area = z.string().trim().min(2).max(80).parse(form.get("area"));
  const count = z.coerce.number().int().min(1).max(25).parse(form.get("count") ?? 10);
  registerJobHandlers();
  const batches = Math.ceil(count / 5);
  for (let i = 0; i < batches; i++) {
    await enqueueJob("lead_research", { nicheId, area, count: Math.min(5, count - i * 5) }, { dedupeKey: `research:${actor.userId}:${nicheId}:${area}:${Date.now()}:${i}` });
  }
  await logAudit({ actorType: "user", actorId: actor.userId, action: "leads.research_requested", details: { nicheId, area, count } });
  await processJobs(Date.now() + 45_000, 1);
  done("/dashboard/leads", { notice: "research" });
}

export async function adCheckAction(form: FormData) {
  await requireStaff();
  const id = uuid.parse(form.get("id"));
  if (!aiAvailable()) done(`/dashboard/leads/${id}`, { error: "Ad check needs the Anthropic API key." });
  registerJobHandlers();
  await enqueueJob("ad_check", { leadId: id }, { dedupeKey: `ad_check:manual:${id}:${Date.now()}` });
  await processJobs(Date.now() + 45_000, 1);
  done(`/dashboard/leads/${id}`, { notice: "adcheck" });
}

/* ------------------------------ Outreach ------------------------------ */

export async function draftOpenerAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  let skipped: string | null = null;
  try {
    const r = await draftOpener(id, `user:${actor.userId}`);
    if (r.status === "skipped") skipped = r.reason;
  } catch (e) {
    done(`/dashboard/leads/${id}`, { error: errMsg(e) });
  }
  // redirect() throws, so it must stay outside the try block above.
  if (skipped) done(`/dashboard/leads/${id}`, { error: `Not drafted: ${skipped}` });
  done(`/dashboard/leads/${id}`, { notice: "drafted" });
}

export async function markSentAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const back = (form.get("back") as string) || "/dashboard";
  try {
    await markSent(id, actor.userId);
  } catch (e) {
    done(back, { error: errMsg(e) });
  }
  done(back, { notice: "sent" });
}

export async function recordReplyAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("leadId"));
  const text = z.string().trim().min(1).max(5000).parse(form.get("reply"));
  const back = (form.get("back") as string) || `/dashboard/leads/${id}`;
  let cls = "";
  try {
    cls = (await recordReply(id, text, actor.userId)).classification;
  } catch (e) {
    done(back, { error: errMsg(e) });
  }
  done(back, { notice: `reply:${cls}` });
}

export async function toggleTemplateAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const active = form.get("active") === "on";
  await db.update(schema.messageTemplates).set({ active }).where(eq(schema.messageTemplates.id, id));
  await logAudit({ actorType: "user", actorId: actor.userId, action: "template.toggled", entityTable: "message_templates", entityId: id, details: { active } });
  done("/dashboard/outreach", { tab: "templates" });
}

export async function updateTemplateAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const body = z.string().trim().min(10).max(2000).parse(form.get("body"));
  await db.update(schema.messageTemplates).set({ body }).where(eq(schema.messageTemplates.id, id));
  await logAudit({ actorType: "user", actorId: actor.userId, action: "template.updated", entityTable: "message_templates", entityId: id });
  done("/dashboard/outreach", { tab: "templates" });
}

/* ------------------------------ Documents ------------------------------ */

export async function generateDocAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("leadId"));
  const kind = z.enum(["audit", "call_brief", "proposal"]).parse(form.get("kind"));
  let docId = "";
  try {
    if (kind === "audit") docId = (await generateAudit(id, actor.userId)).id;
    else if (kind === "call_brief") docId = (await generateCallBrief(id, { actorId: actor.userId })).id;
    else docId = (await generateProposal(id, z.string().trim().min(10, "Paste your call notes first").max(10_000).parse(form.get("notes")), actor.userId)).id;
  } catch (e) {
    done(`/dashboard/leads/${id}`, { error: errMsg(e) });
  }
  done(`/dashboard/leads/${id}/docs/${kind}/${docId}`);
}

export async function saveDocAction(form: FormData) {
  const actor = await requireStaff();
  const kind = z.enum(["audit", "call_brief", "proposal"]).parse(form.get("kind"));
  const id = uuid.parse(form.get("id"));
  const leadId = uuid.parse(form.get("leadId"));
  const table = kind === "audit" ? schema.audits : kind === "call_brief" ? schema.callBriefs : schema.proposals;
  const [row] = await db.select().from(table).where(eq(table.id, id));
  if (!row) throw new Error("Not found");
  // Editing an approved document takes it back to draft: it must be re-approved before it's shared again.
  await db.update(table).set({ content: { ...(row.content as object), ...parseEditorForm(kind, form) }, status: "draft", shareTokenHash: null }).where(eq(table.id, id));
  await logAudit({ actorType: "user", actorId: actor.userId, action: `${kind}.edited`, entityTable: kind, entityId: id });
  done(`/dashboard/leads/${leadId}/docs/${kind}/${id}`, { notice: "saved" });
}

export async function shareDocAction(form: FormData) {
  const actor = await requireStaff();
  const kind = z.enum(["audit", "proposal"]).parse(form.get("kind"));
  const id = uuid.parse(form.get("id"));
  const leadId = uuid.parse(form.get("leadId"));
  const { token } = await approveAndShare(kind, id, actor.userId);
  done(`/dashboard/leads/${leadId}/docs/${kind}/${id}`, { share: token });
}

export async function deleteDraftMessagesAction(form: FormData) {
  await requireStaff();
  const ids = z.array(uuid).parse(form.getAll("ids"));
  await db.update(schema.messages).set({ status: "cancelled" }).where(inArray(schema.messages.id, ids));
  done("/dashboard/outreach");
}

/** Log a call booked outside /book (phone, WhatsApp). Moves the lead to Call booked and queues the brief. */
export async function bookCallAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const when = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).parse(form.get("startsAt"));
  const startsAt = astToUtc(`${when}:00`);
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
  if (!lead) throw new Error("Lead not found");
  const [b] = await db
    .insert(schema.bookings)
    .values({ leadId: id, name: lead.contactName ?? lead.businessName, businessName: lead.businessName, phone: lead.phone, email: lead.email, startsAt, endsAt: new Date(startsAt.getTime() + 20 * 60_000), source: "manual", createdBy: actor.userId })
    .onConflictDoNothing()
    .returning();
  if (!b) done(`/dashboard/leads/${id}`, { error: "You already have a call booked at that time." });
  await db.insert(schema.activities).values({ leadId: id, type: "call", body: `Call booked for ${when.replace("T", " ")} AST`, metadata: { bookingId: b!.id }, createdBy: actor.userId });
  if (!["won", "lost", "call_booked", "proposal_sent"].includes(lead.stage)) await moveStage(id, "call_booked", actor.userId);
  await db.update(schema.leads).set({ nextAction: "Discovery call", nextActionDue: startsAt }).where(eq(schema.leads.id, id));
  registerJobHandlers();
  await enqueueJob("call_brief", { leadId: id, bookingId: b!.id }, { dedupeKey: `call_brief:${b!.id}` });
  done(`/dashboard/leads/${id}`, { notice: "moved" });
}
