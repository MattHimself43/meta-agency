import { addDays, format, parseISO } from "date-fns";
import { detectFatigue, type Fatigue } from "./fatigue";

/** One performance row as stored (cents, counts). Results = leads + WhatsApp conversations. */
export type Row = {
  date: string;
  adName: string | null;
  campaignName: string | null;
  spendUsdCents: number;
  impressions: number;
  clicks: number;
  frequency: number | null;
  ctr: number | null;
  leads: number;
  whatsappConversations: number;
};

export type Totals = { spend: number; results: number; leads: number; chats: number; impressions: number; clicks: number; cpr: number | null; ctr: number | null };

export function totals(rows: Row[]): Totals {
  const t = rows.reduce(
    (a, r) => ({ spend: a.spend + r.spendUsdCents, leads: a.leads + r.leads, chats: a.chats + r.whatsappConversations, impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks }),
    { spend: 0, leads: 0, chats: 0, impressions: 0, clicks: 0 },
  );
  const results = t.leads + t.chats;
  return { ...t, results, cpr: results ? Math.round(t.spend / results) : null, ctr: t.impressions ? (t.clicks / t.impressions) * 100 : null };
}

const inRange = (rows: Row[], from: string, to: string) => rows.filter((r) => r.date >= from && r.date <= to);
export const shiftDay = (day: string, n: number) => format(addDays(parseISO(day), n), "yyyy-MM-dd");

export type AdTotals = Totals & { adName: string };
export function byAd(rows: Row[]): AdTotals[] {
  const m = new Map<string, Row[]>();
  for (const r of rows) m.set(r.adName ?? "(no ad name)", [...(m.get(r.adName ?? "(no ad name)") ?? []), r]);
  return [...m.entries()].map(([adName, rs]) => ({ adName, ...totals(rs) }));
}

export type Rec = { type: "pause_ad" | "shift_budget" | "new_creative" | "raise_budget" | "lower_budget"; reasoning: string; expectedImpact: string; payload: Record<string, unknown> };
export type Snapshot = {
  day: string;
  yesterday: Totals;
  last3: Totals;
  last7: Totals;
  targetCpr: number | null;
  status: "good" | "watch" | "problem" | "no_data";
  flags: string[];
  recommendations: Rec[];
  fatigue: Fatigue[];
};

const usd = (c: number | null) => (c == null ? "—" : `US$${(c / 100).toFixed(2)}`);

/**
 * Morning check for one client: yesterday, last 3 and last 7 days vs the KPI target, red flags,
 * and rule-based recommendations (each one still goes to the approval queue).
 */
export function snapshot(rows: Row[], opts: { yesterday: string; targetCpr: number | null; dailyBudgetCents: number | null; live: boolean; frequencyMax?: number }): Snapshot {
  const y = opts.yesterday;
  const yesterday = totals(inRange(rows, y, y));
  const last3 = totals(inRange(rows, shiftDay(y, -2), y));
  const last7Rows = inRange(rows, shiftDay(y, -6), y);
  const last7 = totals(last7Rows);
  const target = opts.targetCpr;
  const flags: string[] = [];
  const recs: Rec[] = [];

  if (!last7Rows.length) return { day: y, yesterday, last3, last7, targetCpr: target, status: "no_data", flags: opts.live ? ["No results imported for the last 7 days — import yesterday's Ads Manager CSV"] : [], recommendations: [], fatigue: [] };

  if (opts.live && yesterday.spend === 0) flags.push("No spend yesterday — check the campaign is on and the card works");
  if (target && yesterday.cpr && yesterday.cpr > target * 1.3) flags.push(`Cost per result yesterday ${usd(yesterday.cpr)} vs target ${usd(target)}`);
  if (yesterday.spend > 0 && yesterday.results === 0) flags.push(`Spent ${usd(yesterday.spend)} yesterday with no leads or chats`);
  if (opts.dailyBudgetCents && yesterday.spend > opts.dailyBudgetCents * 1.25) flags.push(`Spend ${usd(yesterday.spend)} is above the ${usd(opts.dailyBudgetCents)} daily budget`);

  const fatigue = detectFatigue(
    rows.filter((r) => r.adName).map((r) => ({ adName: r.adName!, date: r.date, impressions: r.impressions, clicks: r.clicks, frequency: r.frequency, ctr: r.ctr })),
    { frequencyMax: opts.frequencyMax ?? 3 },
  );
  for (const f of fatigue) {
    flags.push(`${f.adName}: ${f.reasons.join("; ")}`);
    recs.push({ type: "new_creative", reasoning: `${f.adName} looks tired — ${f.reasons.join("; ")}.`, expectedImpact: "Fresh hooks usually bring CTR back to its first-week level", payload: { adName: f.adName } });
  }

  const ads3 = byAd(inRange(rows, shiftDay(y, -2), y));
  for (const a of ads3) {
    if (target && a.results === 0 && a.spend >= target * 2) {
      recs.push({ type: "pause_ad", reasoning: `${a.adName} spent ${usd(a.spend)} in 3 days with no leads or chats (target ${usd(target)} per result).`, expectedImpact: `Saves about ${usd(Math.round(a.spend / 3))}/day for the ads that are working`, payload: { adName: a.adName } });
    }
  }

  const ads7 = byAd(last7Rows).filter((a) => a.results > 0 && a.spend > 0);
  if (ads7.length >= 2) {
    const sorted = [...ads7].sort((a, b) => (a.cpr ?? Infinity) - (b.cpr ?? Infinity));
    const best = sorted[0]!;
    const worst = sorted.at(-1)!;
    if (best.cpr && worst.cpr && best.cpr <= worst.cpr * 0.6 && (!target || worst.spend > target)) {
      recs.push({ type: "shift_budget", reasoning: `${best.adName} gets results at ${usd(best.cpr)} vs ${usd(worst.cpr)} for ${worst.adName} (last 7 days).`, expectedImpact: "More results for the same spend", payload: { from: worst.adName, to: best.adName } });
    }
  }

  if (target && last7.cpr && opts.dailyBudgetCents) {
    if (last7.cpr <= target * 0.7 && last7.results >= 5) {
      const proposed = Math.round(opts.dailyBudgetCents * 1.15);
      recs.push({ type: "raise_budget", reasoning: `7-day cost per result ${usd(last7.cpr)} is well under the ${usd(target)} target with ${last7.results} results.`, expectedImpact: `About ${Math.round((last7.results / 7) * 0.15 * 10) / 10} more results a day`, payload: { fromCents: opts.dailyBudgetCents, toCents: proposed } });
    } else if (last7.cpr >= target * 1.5 && last7.spend >= target * 5) {
      const proposed = Math.round(opts.dailyBudgetCents * 0.8);
      recs.push({ type: "lower_budget", reasoning: `7-day cost per result ${usd(last7.cpr)} is 50%+ over the ${usd(target)} target.`, expectedImpact: "Limits waste while the ads are fixed", payload: { fromCents: opts.dailyBudgetCents, toCents: proposed } });
    }
  }

  const status = flags.some((f) => /no leads|No spend|above the/.test(f)) || (target && last3.cpr && last3.cpr > target * 1.3) ? "problem" : flags.length ? "watch" : "good";
  return { day: y, yesterday, last3, last7, targetCpr: target, status, flags, recommendations: recs, fatigue };
}

/** Period summary used by weekly and monthly reports. */
export function periodSummary(rows: Row[], from: string, to: string, prevFrom: string, prevTo: string) {
  const cur = inRange(rows, from, to);
  const prev = inRange(rows, prevFrom, prevTo);
  const ads = byAd(cur).filter((a) => a.spend > 0);
  const withResults = ads.filter((a) => a.results > 0).sort((a, b) => (a.cpr ?? Infinity) - (b.cpr ?? Infinity));
  const best = withResults[0] ?? null;
  const worst = ads.length > 1 ? [...ads].sort((a, b) => (b.cpr ?? Infinity) - (a.cpr ?? Infinity) || b.spend - a.spend)[0]! : null;
  return { current: totals(cur), previous: totals(prev), best, worst: worst && worst.adName !== best?.adName ? worst : null, days: new Set(cur.map((r) => r.date)).size };
}
