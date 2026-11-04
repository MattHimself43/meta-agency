import "server-only";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { addDays, differenceInCalendarDays, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { db, schema } from "@/lib/db";
import { createApproval } from "@/lib/approvals";
import { raiseAlert } from "@/lib/alerts";
import { astDateString } from "@/lib/time";
import { runMorningCheck } from "@/lib/performance/service";
import { generateReport, lastWeekStart } from "@/lib/reports/service";
import { chaseOverdue, monthlyInvoiceRun, revenueSummary } from "@/lib/billing/service";
import { generateCopy } from "@/lib/creatives/service";
import type { RoutineHandler } from "./types";

/** Daily 07:00 — the morning brief is stored in this run's output and shown on Home. */
export const morningCheck: RoutineHandler = async ({ now }) => {
  // API mode: refresh the last 7 days from Meta first. Manual mode: uses whatever CSVs were imported.
  const { pullAllInsights } = await import("@/lib/meta/service");
  const pulled = await pullAllInsights(now);
  if (pulled.errors.length) await raiseAlert({ kind: "integration", severity: "warning", title: "Meta insights pull failed for some clients", body: pulled.errors.join("\n"), dedupeKey: `meta_insights:${astDateString(now)}` });
  const r = await runMorningCheck(now);
  const problems = r.brief.filter((b) => b.snapshot.status === "problem").length;
  const src = pulled.mode === "api" ? ` · ${pulled.rows} row(s) pulled from Meta` : "";
  return { digest: `Morning check (${r.day}): ${r.brief.length} client(s), ${problems} need attention, ${r.recommendations} recommendation(s) queued${src}`, output: { brief: r.brief, day: r.day, pulled } };
};

/** Mondays 09:00 — last week's report for every active client. */
export const weeklyReports: RoutineHandler = async ({ now }) => {
  const week = lastWeekStart(astDateString(now));
  const clients = await db.select().from(schema.clients).where(eq(schema.clients.status, "active"));
  let created = 0;
  for (const c of clients) if ((await generateReport(c.id, "weekly", week)).created) created++;
  return { digest: `Weekly reports for w/c ${week}: ${created} drafted for approval`, output: { week, created } };
};

/** 1st of the month 08:00 — monthly reviews (last month), invoices (this month), renewals coming up. */
export const monthEndClose: RoutineHandler = async ({ now }) => {
  const today = astDateString(now);
  const lastMonth = format(startOfMonth(subMonths(parseISO(today), 1)), "yyyy-MM-dd");
  const clients = await db.select().from(schema.clients).where(eq(schema.clients.status, "active"));
  let reviews = 0;
  for (const c of clients) if ((await generateReport(c.id, "monthly", lastMonth)).created) reviews++;
  const inv = await monthlyInvoiceRun(now);
  const soon = await db.select().from(schema.clients).where(and(eq(schema.clients.status, "active"), lte(schema.clients.contractEnd, format(addDays(parseISO(today), 30), "yyyy-MM-dd")), gte(schema.clients.contractEnd, today)));
  for (const c of soon) {
    await raiseAlert({ kind: "renewal", severity: "info", title: `Renewal coming up: ${c.name} (${c.contractEnd})`, body: "Minimum term ends within 30 days — check in about continuing.", link: `/dashboard/clients/${c.id}`, dedupeKey: `renewal:${c.id}:${c.contractEnd}` });
  }
  return { digest: `Month-end: ${reviews} monthly review(s), ${inv.created} invoice draft(s) for ${inv.period}${inv.existing ? ` (${inv.existing} already existed)` : ""}, ${soon.length} renewal(s) due`, output: { reviews, invoices: inv, renewals: soon.length } };
};

const STEP_HELP: Record<string, string> = {
  agreement: "sign the agreement",
  intake: "fill in the short business form",
  assets: "upload a few photos and your logo",
  meta_access: "give us partner access in Meta Business Manager",
};

/** Daily 10:00 — a friendly nudge (for approval) when a client's onboarding hasn't moved for 2+ days. */
export const onboardingChaser: RoutineHandler = async ({ now }) => {
  const clients = await db.select().from(schema.clients).where(eq(schema.clients.status, "onboarding"));
  let nudges = 0;
  for (const c of clients) {
    const steps = await db.select().from(schema.onboardingSteps).where(eq(schema.onboardingSteps.clientId, c.id)).orderBy(asc(schema.onboardingSteps.sortOrder));
    const waiting = steps.filter((s) => s.status !== "done" && !s.ownerOnly);
    const ownerWaiting = steps.filter((s) => s.status !== "done" && s.ownerOnly);
    const lastMove = [c.createdAt, ...steps.map((s) => s.completedAt).filter((d): d is Date => Boolean(d))].sort((a, b) => b.getTime() - a.getTime())[0]!;
    const idle = differenceInCalendarDays(now, lastMove);
    if (idle < 2) continue;
    if (!waiting.length) {
      if (ownerWaiting.length) await raiseAlert({ kind: "onboarding_stuck", severity: "warning", title: `${c.name}: waiting on you — ${ownerWaiting.map((s) => s.label).join(", ")}`, link: `/dashboard/clients/${c.id}`, dedupeKey: `onboarding_owner:${c.id}:${astDateString(now)}` });
      continue;
    }
    await raiseAlert({ kind: "onboarding_stuck", severity: "warning", title: `Onboarding stuck ${idle} days: ${c.name}`, body: `Waiting for: ${waiting.map((s) => s.label).join(", ")}`, link: `/dashboard/clients/${c.id}`, dedupeKey: `onboarding_stuck:${c.id}:${Math.floor(now.getTime() / (2 * 86400_000))}` });
    const first = c.contactName?.split(" ")[0];
    const body = `Hi${first ? ` ${first}` : ""}, Matthias here. Just a nudge on the onboarding link I sent — next up is to ${STEP_HELP[waiting[0]!.stepKey] ?? waiting[0]!.label.toLowerCase()}. It takes a few minutes on your phone. Shout if anything's confusing!`;
    const window = Math.floor(now.getTime() / (2 * 86400_000));
    const [msg] = await db.insert(schema.messages).values({ clientId: c.id, channel: "whatsapp", purpose: "onboarding_nudge", variants: [body], body, status: "draft", dueAt: now, dedupeKey: `onboarding_nudge:${c.id}:${window}`, isDemo: c.isDemo }).onConflictDoNothing().returning();
    if (!msg) continue;
    await createApproval({ itemType: "onboarding_nudge", title: `Onboarding nudge — ${c.name} (${idle} days idle)`, preview: { body, clientId: c.id }, subjectTable: "messages", subjectId: msg.id, requestedBy: "routine:onboarding_chaser", dedupeKey: `approval:onboarding_nudge:${c.id}:${window}`, isDemo: c.isDemo });
    nudges++;
  }
  return { digest: `Onboarding chaser: ${nudges} nudge(s) drafted`, output: { nudges } };
};

/** Daily 11:00. */
export const invoiceChaser: RoutineHandler = async ({ now }) => {
  const r = await chaseOverdue(now);
  for (const inv of await db.select().from(schema.invoices).where(eq(schema.invoices.status, "overdue"))) {
    await raiseAlert({ kind: "invoice_overdue", severity: "warning", title: `Invoice overdue: ${inv.number}`, link: `/dashboard/billing/${inv.id}`, dedupeKey: `invoice_overdue:${inv.id}` });
  }
  return { digest: `Invoice chaser: ${r.overdue} overdue, ${r.drafted} reminder(s) drafted`, output: r };
};

/** Every 2nd Wednesday 09:00 — fresh copy for clients whose ads are tiring. */
export const creativeRefresh: RoutineHandler = async ({ now }) => {
  const since = addDays(now, -14);
  const tired = await db.select({ link: schema.alerts.link }).from(schema.alerts).where(and(eq(schema.alerts.kind, "ad_fatigue"), gte(schema.alerts.createdAt, since)));
  const clientIds = [...new Set(tired.map((t) => /clients\/([0-9a-f-]{36})/.exec(t.link ?? "")?.[1]).filter((x): x is string => Boolean(x)))];
  let made = 0;
  for (const id of clientIds) {
    try {
      made += (await generateCopy(id, { count: 4, actorId: null })).length;
    } catch {
      /* no intake yet — skip */
    }
  }
  return { status: clientIds.length ? "succeeded" : "skipped", digest: clientIds.length ? `Creative refresh: ${made} new draft(s) for ${clientIds.length} client(s) with tired ads` : "Creative refresh: no fatigued ads in the last 2 weeks", output: { clients: clientIds.length, made } };
};

/** Fridays 16:00 — pipeline, revenue, reply rates, hours. */
export const weeklyReview: RoutineHandler = async ({ now }) => {
  const weekAgo = addDays(now, -7);
  const [stages, sent, replies, won, rev, minutes] = await Promise.all([
    db.select({ stage: schema.leads.stage, n: sql<number>`count(*)::int` }).from(schema.leads).groupBy(schema.leads.stage),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.activities).where(and(eq(schema.activities.type, "message_sent"), gte(schema.activities.occurredAt, weekAgo))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.activities).where(and(eq(schema.activities.type, "reply"), gte(schema.activities.occurredAt, weekAgo))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.clients).where(gte(schema.clients.createdAt, weekAgo)),
    revenueSummary(now),
    db.select({ m: sql<number>`coalesce(sum(${schema.timeEntries.minutes}),0)::int` }).from(schema.timeEntries).where(gte(schema.timeEntries.date, format(weekAgo, "yyyy-MM-dd"))),
  ]);
  const s = sent[0]?.n ?? 0;
  const rate = s ? Math.round(((replies[0]?.n ?? 0) / s) * 100) : null;
  const pipeline = Object.fromEntries(stages.map((x) => [x.stage, x.n]));
  const active = await db.select({ n: sql<number>`count(*)::int` }).from(schema.clients).where(inArray(schema.clients.status, ["active"]));
  return {
    digest: `Week: ${s} sent, ${rate ?? "—"}% replied, ${won[0]?.n ?? 0} new client(s), ${active[0]?.n ?? 0} active, MRR TT$${(rev.mrr / 100).toLocaleString()}, outstanding TT$${(rev.outstanding / 100).toLocaleString()}`,
    output: { pipeline, sent: s, replies: replies[0]?.n ?? 0, replyRate: rate, newClients: won[0]?.n ?? 0, revenue: rev, minutes: minutes[0]?.m ?? 0 },
  };
};

/** Every 30 min — Gmail replies → recordReply; Meta lead-form leads → lead inbox. Both no-ops while off. */
export const inboxSync: RoutineHandler = async () => {
  const parts: string[] = [];
  const { syncGmailReplies } = await import("@/lib/google");
  const { recordReply } = await import("@/lib/outreach/sequences");
  const gmail = await syncGmailReplies((leadId, text) => recordReply(leadId, text, null, { channel: "email" }));
  if (!gmail.skipped) parts.push(`Gmail: ${gmail.matched} repl${gmail.matched === 1 ? "y" : "ies"} from leads (${gmail.scanned} new emails scanned)`);
  const { metaMode } = await import("@/lib/meta/client");
  if ((await metaMode()) === "api") {
    const { pullMetaLeads } = await import("@/lib/meta/service");
    const clients = await db.select().from(schema.clients).where(eq(schema.clients.status, "active"));
    let added = 0;
    for (const c of clients.filter((c) => c.pageId && !c.isDemo)) {
      try {
        added += (await pullMetaLeads(c.id)).added;
      } catch (e) {
        await raiseAlert({ kind: "integration", severity: "warning", title: `Meta leads couldn't be pulled for ${c.name}`, body: e instanceof Error ? e.message : String(e), dedupeKey: `meta_leads:${c.id}:${astDateString(new Date())}` });
      }
    }
    parts.push(`Meta: ${added} new lead-form lead(s)`);
  }
  if (!parts.length) return { status: "skipped", digest: "Inbox sync: Gmail and the Meta API are off" };
  return { digest: `Inbox sync — ${parts.join(" · ")}` };
};
