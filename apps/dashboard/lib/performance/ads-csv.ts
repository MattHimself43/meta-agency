import { parseCsv } from "@/lib/csv";

/**
 * Maps a Meta Ads Manager export (Reports → Export → CSV, broken down by Day and by Ad) into performance rows.
 * Header names vary by account language and column preset, so we match a list of aliases.
 */
const ALIASES = {
  date: ["day", "date", "reporting starts"],
  campaign: ["campaign name", "campaign"],
  adSet: ["ad set name", "ad set"],
  ad: ["ad name", "ad"],
  spend: ["amount spent (usd)", "amount spent", "spend", "amount spent (usd)*"],
  impressions: ["impressions"],
  reach: ["reach"],
  frequency: ["frequency"],
  clicks: ["link clicks", "clicks (all)", "clicks"],
  ctr: ["ctr (link click-through rate)", "ctr (all)", "ctr"],
  results: ["results"],
  resultType: ["result indicator", "result type"],
  leads: ["leads", "on-facebook leads", "leads (form)", "meta leads"],
  conversations: ["messaging conversations started", "messaging conversations started (7 days)", "whatsapp conversations", "conversations started"],
  costPerResult: ["cost per result", "cost per results"],
} as const;
type Field = keyof typeof ALIASES;

export type PerfRow = {
  date: string;
  campaignName: string | null;
  adSetName: string | null;
  adName: string | null;
  spendUsdCents: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  clicks: number;
  ctr: number | null;
  leads: number;
  whatsappConversations: number;
  costPerResultUsdCents: number | null;
};

const num = (v: string | undefined) => {
  if (v == null) return null;
  const s = v.replace(/[,$\s]|US\$|USD/g, "").replace(/%$/, "");
  if (!s || s === "-" || s === "--") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Accepts 2026-11-02, 11/2/2026 (US export) or 2/11/2026 when the day can't be a month. */
export function normalizeDate(v: string): string | null {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  let [mm, dd] = [Number(m[1]), Number(m[2])];
  if (mm > 12) [mm, dd] = [dd, mm];
  return `${m[3]}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function mapAdsManagerCsv(text: string): { rows: PerfRow[]; skipped: number; missing: Field[] } {
  const all = parseCsv(text);
  if (all.length < 2) return { rows: [], skipped: 0, missing: ["date"] };
  const headers = all[0]!.map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(
    (Object.keys(ALIASES) as Field[]).map((f) => [f, headers.findIndex((h) => (ALIASES[f] as readonly string[]).includes(h))]),
  ) as Record<Field, number>;
  const missing = (["date", "spend"] as Field[]).filter((f) => col[f] < 0);
  if (missing.length) return { rows: [], skipped: all.length - 1, missing };

  const rows: PerfRow[] = [];
  let skipped = 0;
  for (const r of all.slice(1)) {
    const get = (f: Field) => (col[f] >= 0 ? r[col[f]] : undefined);
    const date = normalizeDate(get("date") ?? "");
    if (!date) {
      skipped++;
      continue;
    }
    const resultType = (get("resultType") ?? "").toLowerCase();
    const results = num(get("results")) ?? 0;
    let leads = num(get("leads")) ?? 0;
    let conversations = num(get("conversations")) ?? 0;
    if (!leads && !conversations && results) {
      if (/messag|conversation|whatsapp/.test(resultType)) conversations = results;
      else if (/lead/.test(resultType)) leads = results;
    }
    const spend = num(get("spend")) ?? 0;
    const cpr = num(get("costPerResult"));
    rows.push({
      date,
      campaignName: get("campaign")?.trim() || null,
      adSetName: get("adSet")?.trim() || null,
      adName: get("ad")?.trim() || null,
      spendUsdCents: Math.round(spend * 100),
      impressions: Math.round(num(get("impressions")) ?? 0),
      reach: Math.round(num(get("reach")) ?? 0),
      frequency: num(get("frequency")),
      clicks: Math.round(num(get("clicks")) ?? 0),
      ctr: num(get("ctr")),
      leads: Math.round(leads),
      whatsappConversations: Math.round(conversations),
      costPerResultUsdCents: cpr != null ? Math.round(cpr * 100) : leads + conversations ? Math.round((spend * 100) / (leads + conversations)) : null,
    });
  }
  return { rows, skipped, missing: [] };
}
