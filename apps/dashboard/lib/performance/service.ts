import "server-only";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { createApproval } from "@/lib/approvals";
import { raiseAlert } from "@/lib/alerts";
import { astDateString } from "@/lib/time";
import { mapAdsManagerCsv } from "./ads-csv";
import { shiftDay, snapshot, type Row, type Snapshot } from "./metrics";

/** Import an Ads Manager CSV (Manual mode). Re-importing the same rows updates them instead of duplicating. */
export async function importPerformanceCsv(clientId: string, text: string, actorId: string) {
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!client) throw new Error("Client not found");
  const { rows, skipped, missing } = mapAdsManagerCsv(text);
  if (missing.length) throw new Error(`The CSV is missing: ${missing.join(", ")}. In Ads Manager use Breakdown → By time → Day, and include Amount spent.`);
  let upserted = 0;
  for (const r of rows) {
    await db
      .insert(schema.performanceDaily)
      .values({ clientId, ...r, frequency: r.frequency?.toFixed(3) ?? null, ctr: r.ctr?.toFixed(4) ?? null, source: "csv", isDemo: client.isDemo })
      .onConflictDoUpdate({
        target: [schema.performanceDaily.clientId, schema.performanceDaily.date, schema.performanceDaily.campaignName, schema.performanceDaily.adSetName, schema.performanceDaily.adName],
        set: { spendUsdCents: r.spendUsdCents, impressions: r.impressions, reach: r.reach, frequency: r.frequency?.toFixed(3) ?? null, clicks: r.clicks, ctr: r.ctr?.toFixed(4) ?? null, leads: r.leads, whatsappConversations: r.whatsappConversations, costPerResultUsdCents: r.costPerResultUsdCents, source: "csv" },
      });
    upserted++;
  }
  const dates = rows.map((r) => r.date).sort();
  await logAudit({ actorType: "user", actorId, action: "performance.csv_imported", entityTable: "clients", entityId: clientId, details: { rows: upserted, skipped, from: dates[0], to: dates.at(-1) } });
  return { rows: upserted, skipped, from: dates[0] ?? null, to: dates.at(-1) ?? null };
}

export async function rowsFor(clientId: string, fromDay: string): Promise<Row[]> {
  const rows = await db
    .select()
    .from(schema.performanceDaily)
    .where(and(eq(schema.performanceDaily.clientId, clientId), gte(schema.performanceDaily.date, fromDay)))
    .orderBy(asc(schema.performanceDaily.date));
  return rows.map((r) => ({ date: r.date, adName: r.adName, campaignName: r.campaignName, spendUsdCents: r.spendUsdCents, impressions: r.impressions, clicks: r.clicks, frequency: r.frequency != null ? Number(r.frequency) : null, ctr: r.ctr != null ? Number(r.ctr) : null, leads: r.leads, whatsappConversations: r.whatsappConversations }));
}

/** KPI target (US$ cents per result): client override, else the niche target that fits how results come in. */
export function targetCpr(client: { kpiTargets: unknown }, niche: { kpiTargets: unknown } | null, rows: Row[]): number | null {
  const ck = client.kpiTargets as { cost_per_result_usd_cents?: number } | null;
  if (ck?.cost_per_result_usd_cents) return ck.cost_per_result_usd_cents;
  const nk = niche?.kpiTargets as Record<string, { usd_cents?: number }> | undefined;
  if (!nk) return null;
  const chats = rows.reduce((s, r) => s + r.whatsappConversations, 0);
  const leads = rows.reduce((s, r) => s + r.leads, 0);
  return (chats >= leads ? nk.cost_per_whatsapp_chat?.usd_cents : nk.cost_per_lead?.usd_cents) ?? nk.cost_per_whatsapp_chat?.usd_cents ?? null;
}

export type BriefEntry = { clientId: string; clientName: string; snapshot: Snapshot; dailyBudgetCents: number | null };

/**
 * The 07:00 morning account check: per active client, yesterday vs target, red flags, fatigue alerts and
 * recommendations (each recommendation goes to the approval queue). Returns the morning brief for Home.
 * Idempotent per day: recommendation and alert dedupe keys include the date.
 */
export async function runMorningCheck(now = new Date()) {
  const yesterday = shiftDay(astDateString(now), -1);
  const clients = await db.select().from(schema.clients).where(inArray(schema.clients.status, ["active", "onboarding"]));
  const brief: BriefEntry[] = [];
  let recCount = 0;
  for (const client of clients) {
    const [niche] = client.nicheId ? await db.select().from(schema.niches).where(eq(schema.niches.id, client.nicheId)) : [];
    const rows = await rowsFor(client.id, shiftDay(yesterday, -20));
    const plans = await db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.clientId, client.id));
    const live = plans.filter((p) => p.status === "live");
    if (!rows.length && !live.length) continue;
    const dailyBudget = live.reduce((s, p) => s + (p.budgetType === "daily" ? p.budgetUsdCents : 0), 0) || (client.monthlyBudgetUsdCents ? Math.round(client.monthlyBudgetUsdCents / 30) : null);
    const kpi = niche?.kpiTargets as { frequency_max?: number } | undefined;
    const snap = snapshot(rows, { yesterday, targetCpr: targetCpr(client, niche ?? null, rows), dailyBudgetCents: dailyBudget, live: live.length > 0, frequencyMax: kpi?.frequency_max ?? 3 });
    brief.push({ clientId: client.id, clientName: client.name, snapshot: snap, dailyBudgetCents: dailyBudget });

    for (const rec of snap.recommendations) {
      const key = `rec:${client.id}:${yesterday}:${rec.type}:${String(rec.payload.adName ?? rec.payload.to ?? "")}`;
      const inserted = await db
        .insert(schema.recommendations)
        .values({ clientId: client.id, campaignPlanId: live[0]?.id ?? null, type: rec.type, reasoning: rec.reasoning, expectedImpact: rec.expectedImpact, payload: rec.payload, dedupeKey: key, isDemo: client.isDemo })
        .onConflictDoNothing({ target: schema.recommendations.dedupeKey })
        .returning();
      if (!inserted[0]) continue;
      recCount++;
      await createApproval({
        itemType: rec.type === "raise_budget" ? "budget_change" : "recommendation",
        title: `${{ pause_ad: "Pause an ad", shift_budget: "Shift budget", new_creative: "New creative needed", raise_budget: "Raise budget", lower_budget: "Lower budget" }[rec.type]} — ${client.name}`,
        summary: rec.expectedImpact,
        preview: { body: rec.reasoning, clientId: client.id, payload: rec.payload },
        subjectTable: "recommendations",
        subjectId: inserted[0].id,
        requestedBy: "routine:morning_check",
        dedupeKey: `approval:${key}`,
        isDemo: client.isDemo,
      });
    }
    for (const f of snap.fatigue) {
      await raiseAlert({ kind: "ad_fatigue", severity: "warning", title: `Ad fatigue: ${f.adName} (${client.name})`, body: f.reasons.join("; "), link: `/dashboard/clients/${client.id}?tab=performance`, dedupeKey: `fatigue:${client.id}:${f.adName}:${yesterday}` });
    }
    if (snap.status === "problem") {
      await raiseAlert({ kind: "performance", severity: "warning", title: `Check ${client.name}: ${snap.flags[0] ?? "results off target"}`, link: `/dashboard/clients/${client.id}?tab=performance`, dedupeKey: `perf:${client.id}:${yesterday}` });
    }
  }
  brief.sort((a, b) => ({ problem: 0, watch: 1, no_data: 2, good: 3 })[a.snapshot.status] - ({ problem: 0, watch: 1, no_data: 2, good: 3 })[b.snapshot.status]);
  return { day: yesterday, brief, recommendations: recCount };
}

export async function monthToDate(clientId: string, now = new Date()) {
  const day = astDateString(now);
  const [r] = await db
    .select({ spend: sql<number>`coalesce(sum(${schema.performanceDaily.spendUsdCents}),0)::bigint` })
    .from(schema.performanceDaily)
    .where(and(eq(schema.performanceDaily.clientId, clientId), gte(schema.performanceDaily.date, `${day.slice(0, 7)}-01`)));
  return Number(r?.spend ?? 0);
}
