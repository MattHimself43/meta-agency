/** Fatigue: frequency above 3, or CTR 30 % below the ad's own first-7-day average. */
export type AdDay = { adName: string; date: string; impressions: number; clicks: number; frequency: number | null; ctr: number | null };
export type Fatigue = { adName: string; reasons: string[]; frequency: number | null; ctrNow: number | null; ctrBaseline: number | null };

const ctrOf = (d: AdDay) => (d.ctr != null ? d.ctr : d.impressions ? (d.clicks / d.impressions) * 100 : null);

function avg(xs: (number | null)[]) {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

export function detectFatigue(rows: AdDay[], opts: { frequencyMax?: number; ctrDrop?: number; recentDays?: number } = {}): Fatigue[] {
  const freqMax = opts.frequencyMax ?? 3;
  const drop = opts.ctrDrop ?? 0.3;
  const recent = opts.recentDays ?? 3;
  const byAd = new Map<string, AdDay[]>();
  for (const r of rows) byAd.set(r.adName, [...(byAd.get(r.adName) ?? []), r]);
  const out: Fatigue[] = [];
  for (const [adName, days] of byAd) {
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const baseline = sorted.length >= 7 + recent ? avg(sorted.slice(0, 7).map(ctrOf)) : null;
    const now = avg(sorted.slice(-recent).map(ctrOf));
    const freq = sorted.at(-1)?.frequency ?? null;
    const reasons: string[] = [];
    if (freq != null && freq > freqMax) reasons.push(`Frequency ${freq.toFixed(1)} (over ${freqMax})`);
    if (baseline != null && now != null && now < baseline * (1 - drop)) reasons.push(`CTR ${now.toFixed(2)}% vs ${baseline.toFixed(2)}% in its first week`);
    if (reasons.length) out.push({ adName, reasons, frequency: freq, ctrNow: now, ctrBaseline: baseline });
  }
  return out;
}
