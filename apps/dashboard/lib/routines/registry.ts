import "server-only";
import { desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createApproval } from "@/lib/approvals";
import { getSettings } from "@/lib/settings";
import { sendSystemEmail, escapeHtml } from "@/lib/email";
import { formatAst } from "@/lib/time";
import { ROUTINE_PHASE } from "./definitions";
import type { RoutineHandler } from "./types";

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

  morning_check: notBuilt("morning_check"),
  outreach_batch: notBuilt("outreach_batch"),
  lead_refresh: notBuilt("lead_refresh"),
  weekly_reports: notBuilt("weekly_reports"),
  creative_refresh: notBuilt("creative_refresh"),
  month_end_close: notBuilt("month_end_close"),
  onboarding_chaser: notBuilt("onboarding_chaser"),
  invoice_chaser: notBuilt("invoice_chaser"),
  weekly_review: notBuilt("weekly_review"),
};

export function isBuilt(key: string) {
  return (ROUTINE_PHASE[key] ?? 99) <= CURRENT_PHASE;
}
export const CURRENT_PHASE = 0;

