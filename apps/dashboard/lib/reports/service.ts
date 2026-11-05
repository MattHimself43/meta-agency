import "server-only";
import React from "react";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { addDays, endOfMonth, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { db, schema } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { createApproval } from "@/lib/approvals";
import { getSettings } from "@/lib/settings";
import { generateToken, hashToken } from "@/lib/crypto";
import { aiAvailable, runPrompt } from "@/lib/ai/client";
import { reportNarrativeV1 } from "@/lib/ai/prompts/deliver.v1";
import { rowsFor, targetCpr } from "@/lib/performance/service";
import { periodSummary, shiftDay } from "@/lib/performance/metrics";

export type ReportContent = {
  type: "weekly" | "monthly";
  title: string;
  periodLabel: string;
  headline: string;
  metrics: ReturnType<typeof periodSummary>;
  targetCpr: number | null;
  whatHappened: string[];
  whatWorked: string[];
  whatChanges: string[];
  upsell: string | null;
  whatsappSummary: string;
  source: "ai" | "template";
};

const usd = (c: number | null | undefined) => (c == null ? "—" : `US$${(c / 100).toFixed(2)}`);

/** Week = Monday–Sunday (AST). `weekStart` is the Monday. */
export function lastWeekStart(today: string) {
  const d = parseISO(today);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return format(addDays(d, -dow - 7), "yyyy-MM-dd");
}

async function changesMade(clientId: string, from: string, to: string) {
  const recs = await db
    .select()
    .from(schema.recommendations)
    .where(and(eq(schema.recommendations.clientId, clientId), inArray(schema.recommendations.status, ["approved", "applied"]), gte(schema.recommendations.createdAt, parseISO(from)), lte(schema.recommendations.createdAt, addDays(parseISO(to), 1))));
  return recs.map((r) => r.reasoning);
}

function templateNarrative(type: "weekly" | "monthly", m: ReturnType<typeof periodSummary>, target: number | null, nextPackage: string | null): Omit<ReportContent, "type" | "title" | "periodLabel" | "metrics" | "targetCpr" | "source"> {
  const c = m.current;
  const onTarget = target && c.cpr ? c.cpr <= target : null;
  const headline = c.results
    ? `${c.results} lead${c.results === 1 ? "" : "s"} and chats for ${usd(c.spend)} — ${usd(c.cpr)} each${onTarget == null ? "" : onTarget ? ", on target" : `, above the ${usd(target)} target`}.`
    : c.spend
      ? `${usd(c.spend)} spent with no leads or chats yet — we're changing the ads.`
      : "No ad spend recorded for this period.";
  const whatHappened = [
    `Ad spend: ${usd(c.spend)} · WhatsApp chats: ${c.chats} · form leads: ${c.leads}`,
    m.previous.results || m.previous.spend ? `Previous period: ${m.previous.results} results at ${usd(m.previous.cpr)}` : "First period with results recorded",
  ];
  const whatWorked = m.best ? [`“${m.best.adName}” brought ${m.best.results} results at ${usd(m.best.cpr)} each`] : [];
  const whatChanges = [
    m.worst ? `Cut or refresh “${m.worst.adName}” (${m.worst.results} results for ${usd(m.worst.spend)})` : "Keep the current ads running",
    onTarget === false ? "Test new hooks to bring the cost per result down" : "Add one new ad to keep things fresh",
  ];
  const upsell = type === "monthly" && onTarget && nextPackage ? `Results are on target — moving to ${nextPackage} would let us add retargeting and more creative.` : null;
  return { headline, whatHappened, whatWorked, whatChanges, upsell, whatsappSummary: `${type === "weekly" ? "Weekly" : "Monthly"} update: ${headline} Full report: {link}` };
}

/** Build one report (idempotent per client + type + period start) and queue it for approval. */
export async function generateReport(clientId: string, type: "weekly" | "monthly", periodStart: string) {
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!client) throw new Error("Client not found");
  const [existing] = await db.select().from(schema.reports).where(and(eq(schema.reports.clientId, clientId), eq(schema.reports.type, type), eq(schema.reports.periodStart, periodStart)));
  if (existing) return { report: existing, created: false };

  const periodEnd = type === "weekly" ? shiftDay(periodStart, 6) : format(endOfMonth(parseISO(periodStart)), "yyyy-MM-dd");
  const prevStart = type === "weekly" ? shiftDay(periodStart, -7) : format(startOfMonth(subMonths(parseISO(periodStart), 1)), "yyyy-MM-dd");
  const prevEnd = shiftDay(periodStart, -1);
  const [niche] = client.nicheId ? await db.select().from(schema.niches).where(eq(schema.niches.id, client.nicheId)) : [];
  const rows = await rowsFor(clientId, prevStart);
  const metrics = periodSummary(rows, periodStart, periodEnd, prevStart, prevEnd);
  const target = targetCpr(client, niche ?? null, rows);
  const pkgs = await db.select().from(schema.packages).where(eq(schema.packages.active, true));
  const current = pkgs.find((p) => p.id === client.packageId);
  const next = current ? pkgs.filter((p) => p.monthlyFeeCents > current.monthlyFeeCents).sort((a, b) => a.monthlyFeeCents - b.monthlyFeeCents)[0]?.name ?? null : null;
  const periodLabel = type === "weekly" ? `${format(parseISO(periodStart), "d MMM")} – ${format(parseISO(periodEnd), "d MMM yyyy")}` : format(parseISO(periodStart), "MMMM yyyy");

  let narrative = templateNarrative(type, metrics, target, next);
  let source: "ai" | "template" = "template";
  let aiRunId: string | null = null;
  if (aiAvailable() && (metrics.current.spend || metrics.current.results)) {
    const r = await runPrompt(
      reportNarrativeV1,
      { type, client: client.name, period: periodLabel, metrics: { current: metrics.current, previous: metrics.previous }, target_cost_per_result_usd: target ? target / 100 : null, best_ad: metrics.best, worst_ad: metrics.worst, changes_made: await changesMade(clientId, periodStart, periodEnd), next_package: next },
      `report:${type}`,
    );
    narrative = { headline: r.output.headline, whatHappened: r.output.what_happened, whatWorked: r.output.what_worked, whatChanges: r.output.what_changes, upsell: type === "monthly" ? r.output.upsell : null, whatsappSummary: `${r.output.whatsapp_summary} Full report: {link}` };
    source = "ai";
    aiRunId = r.usageId;
  }
  const content: ReportContent = { type, title: type === "weekly" ? "Weekly report" : "Monthly review", periodLabel, metrics, targetCpr: target, ...narrative, source };
  const inserted = await db
    .insert(schema.reports)
    .values({ clientId, type, periodStart, periodEnd, content, aiRunId, isDemo: client.isDemo })
    .onConflictDoNothing()
    .returning();
  if (!inserted[0]) return { report: (await db.select().from(schema.reports).where(and(eq(schema.reports.clientId, clientId), eq(schema.reports.type, type), eq(schema.reports.periodStart, periodStart))))[0]!, created: false };
  await createApproval({ itemType: "report", title: `${content.title} — ${client.name} (${periodLabel})`, summary: content.headline, preview: { body: content.whatsappSummary.replace(" Full report: {link}", ""), reportId: inserted[0].id }, subjectTable: "reports", subjectId: inserted[0].id, requestedBy: `routine:${type}_reports`, dedupeKey: `report:${clientId}:${type}:${periodStart}`, isDemo: client.isDemo });
  return { report: inserted[0], created: true };
}

/** On approval: mint a share link (raw token returned once; hash stored). */
export async function shareReport(reportId: string, actorId: string | null) {
  const token = generateToken();
  await db.update(schema.reports).set({ status: "approved", shareTokenHash: hashToken(token) }).where(eq(schema.reports.id, reportId));
  await logAudit({ actorType: actorId ? "user" : "system", actorId, action: "report.shared", entityTable: "reports", entityId: reportId, approvedBy: actorId });
  return token;
}

export async function findSharedReport(token: string) {
  const [r] = await db.select().from(schema.reports).where(and(eq(schema.reports.shareTokenHash, hashToken(token)), eq(schema.reports.status, "approved")));
  return r ?? null;
}

export async function renderReportPdf(reportId: string) {
  const [r] = await db.select().from(schema.reports).where(eq(schema.reports.id, reportId));
  if (!r) return null;
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, r.clientId));
  const settings = await getSettings();
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { ReportPdf } = await import("@/lib/pdf/report-pdf");
  const buf = await renderToBuffer(React.createElement(ReportPdf, { r: r.content as ReportContent, agencyName: settings.agencyName, clientName: client?.name ?? "" }) as Parameters<typeof renderToBuffer>[0]);
  return { buf, filename: `${r.type}-report-${r.periodStart}.pdf` };
}

export async function reportsFor(clientId: string) {
  return db.select().from(schema.reports).where(eq(schema.reports.clientId, clientId)).orderBy(desc(schema.reports.periodStart));
}
