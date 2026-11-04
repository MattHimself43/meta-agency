import "server-only";
import { desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createApproval } from "@/lib/approvals";
import { getSettings } from "@/lib/settings";
import { sendSystemEmail, escapeHtml } from "@/lib/email";
import { formatAst } from "@/lib/time";
import { ROUTINE_PHASE } from "./definitions";
import { processJobs, enqueueJob } from "@/lib/jobs";
import { registerJobHandlers } from "@/lib/job-handlers";
import { planOutreachBatch } from "@/lib/outreach/batch";
import { rescoreLeads } from "@/lib/leads/service";
import { TT_AREAS } from "@/lib/leads/research";
import { aiAvailable } from "@/lib/ai/client";
import type { RoutineHandler } from "./types";
import { creativeRefresh, invoiceChaser, monthEndClose, morningCheck, onboardingChaser, weeklyReports, weeklyReview } from "./deliver";

const notBuilt =
  (key: string): RoutineHandler =>
  async () => ({ status: "skipped", digest: `Skipped: built in Phase ${ROUTINE_PHASE[key] ?? "?"}` });

export const routineHandlers: Record<string, RoutineHandler> = {
  /** Phase 0 acceptance: a scheduled run that lands one item in the approval queue. */
  system_test: async ({ routine, run, now }) => {
    const occurrence = run.scheduledFor ?? now;
    const { approval, created } = await createApproval({
      itemType: "system_test",
      title: `Scheduler check — ${formatAst(occurrence)}`,
      summary: "If you can see this, the dispatcher ran the System test routine on time. Approve or reject it to test the approval log.",
      preview: { body: `Routine "${routine.name}" ran at ${formatAst(now)} AST (scheduled for ${formatAst(occurrence)}).` },
      requestedBy: `routine:${routine.key}`,
      // Same occurrence → same approval, so a rerun never duplicates it. "Run now" gets its own key.
      dedupeKey: run.scheduledFor ? `system_test:${run.scheduledFor.toISOString()}` : `system_test:manual:${run.id}`,
    });
    return {
      digest: created ? "System test OK — 1 test item added to the approval queue" : "System test OK — already queued for this slot",
      output: { approvalId: approval.id, created },
    };
  },

  daily_digest: async ({ now }) => {
    const settings = await getSettings();
    const to = settings.digestEmail ?? settings.ownerEmail;
    const since = new Date(now.getTime() - 24 * 3600_000);
    const [runs, pending, alerts] = await Promise.all([
      db
        .select({ name: schema.routines.name, digest: schema.routineRuns.digestLine, status: schema.routineRuns.status })
        .from(schema.routineRuns)
        .innerJoin(schema.routines, eq(schema.routines.id, schema.routineRuns.routineId))
        .where(gte(schema.routineRuns.startedAt, since))
        .orderBy(desc(schema.routineRuns.startedAt)),
      db.select({ n: sql<number>`count(*)::int` }).from(schema.approvals).where(eq(schema.approvals.status, "pending")),
      db.select().from(schema.alerts).where(isNull(schema.alerts.resolvedAt)).orderBy(desc(schema.alerts.createdAt)).limit(20),
    ]);
    const lines = runs.filter((r) => r.digest && r.status !== "skipped").map((r) => `${r.name}: ${r.digest}`);
    const pendingN = pending[0]?.n ?? 0;
    if (!to) return { status: "skipped", digest: "Digest not sent: set an owner or digest email in Settings" };
    const html = `
      <h2>${escapeHtml(settings.agencyName)} — daily digest</h2>
      <p><strong>${pendingN}</strong> item(s) waiting for approval. <a href="${process.env.APP_URL ?? ""}/dashboard">Open AgencyOS</a></p>
      ${alerts.length ? `<h3>Alerts</h3><ul>${alerts.map((a) => `<li>${escapeHtml(a.title)}</li>`).join("")}</ul>` : ""}
      <h3>Last 24 hours</h3>
      <ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("") || "<li>No routine activity.</li>"}</ul>`;
    const res = await sendSystemEmail({ to, subject: `Daily digest — ${pendingN} to approve`, html });
    if (res.skipped) return { status: "skipped", digest: `Digest not sent: ${res.reason}` };
    return { digest: `Digest emailed to ${to}`, output: { pending: pendingN, lines: lines.length } };
  },

  morning_check: morningCheck,
  /** Mon-Fri 08:00: openers for the top-scored uncontacted leads + follow-ups due today. */
  outreach_batch: async ({ run, now, deadline }) => {
    registerJobHandlers();
    const plan = await planOutreachBatch(now, run.id);
    // Draft as many as fit in this call; the dispatcher drains the rest every 15 minutes.
    const jobs = await processJobs(deadline - 10_000);
    return {
      digest: `Outreach: ${plan.openers} opener(s) and ${plan.followups} follow-up(s) queued for drafting${aiAvailable() ? "" : " (template drafts — AI not configured)"}`,
      output: { ...plan, jobs },
    };
  },

  /** Mondays 06:00: research ~25 new leads, rescore everyone, recheck who started ads. */
  lead_refresh: async ({ run, now }) => {
    registerJobHandlers();
    const rescored = await rescoreLeads();
    if (!aiAvailable()) return { status: "skipped", digest: `Rescored ${rescored} lead(s). Research skipped: AI not configured`, output: { rescored } };
    const week = Math.floor(now.getTime() / (7 * 86400_000));
    const niches = await db.select().from(schema.niches).where(eq(schema.niches.active, true));
    let research = 0;
    // ~25 leads: 5 jobs of 5, spread over niches (car dealers first) and a rotating set of areas.
    const dealers = niches.find((n) => n.slug === "car_dealers") ?? niches[0];
    const realEstate = niches.find((n) => n.slug === "real_estate") ?? dealers;
    for (let i = 0; i < 5; i++) {
      const niche = i < 3 ? dealers : realEstate;
      if (!niche) break;
      const area = TT_AREAS[(week * 5 + i) % TT_AREAS.length]!;
      if (await enqueueJob("lead_research", { nicheId: niche.id, area, count: 5 }, { dedupeKey: `lead_research:${run.scheduledFor?.toISOString() ?? run.id}:${i}`, routineRunId: run.id })) research++;
    }
    const noAds = await db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(sql`${schema.leads.runsMetaAds} is not true and ${schema.leads.stage} not in ('won','lost') and ${schema.leads.doNotContact} = false`)
      .limit(10);
    for (const l of noAds) await enqueueJob("ad_check", { leadId: l.id }, { dedupeKey: `ad_check:${l.id}:${astWeek(now)}`, routineRunId: run.id });
    return { digest: `Lead refresh: ${research} research job(s), ${noAds.length} ad check(s) queued, ${rescored} rescored`, output: { research, adChecks: noAds.length, rescored } };
  },
  weekly_reports: weeklyReports,
  creative_refresh: creativeRefresh,
  month_end_close: monthEndClose,
  onboarding_chaser: onboardingChaser,
  invoice_chaser: invoiceChaser,
  weekly_review: weeklyReview,
};

export function isBuilt(key: string) {
  return (ROUTINE_PHASE[key] ?? 99) <= CURRENT_PHASE;
}
export const CURRENT_PHASE = 2;

function astWeek(d: Date) {
  return formatAst(d, "RRRR-II");
}

