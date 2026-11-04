/**
 * Honesty check: every price, deposit, rate or term in an ad must appear in the client's own intake answers.
 * Deterministic on purpose — it can't be talked out of a mismatch. A mismatch blocks approval until the owner
 * overrides it with a reason.
 */
export type Claim = { text: string; kind: "money" | "percent" | "term"; value: number };
export type HonestyResult = { ok: boolean; checked: number; mismatches: { claim: string; reason: string }[]; checkedAt: string };

const MONEY = /(?:TT\$|US\$|\$|TTD\s?|USD\s?)\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k|K|thousand|m|M|mil(?:lion)?)?(?![\d%])/g;
const BARE_K = /(?<![$\d.])\b(\d+(?:\.\d+)?)\s?(k|K)\b/g;
const PERCENT = /(\d+(?:\.\d+)?)\s?%/g;
const TERM = /\b(\d+)[\s-]?(months?|mths?|years?|yrs?)\b/gi;

function money(n: string, suffix?: string) {
  let v = Number(n.replace(/,/g, ""));
  if (suffix && /^(k|thousand)$/i.test(suffix)) v *= 1000;
  if (suffix && /^m/i.test(suffix)) v *= 1_000_000;
  return v;
}

export function extractClaims(text: string): Claim[] {
  const out: Claim[] = [];
  const seen = new Set<string>();
  const push = (c: Claim) => {
    const k = `${c.kind}:${c.value}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  };
  for (const m of text.matchAll(MONEY)) push({ text: m[0].trim(), kind: "money", value: money(m[1]!, m[2]) });
  for (const m of text.matchAll(BARE_K)) push({ text: m[0].trim(), kind: "money", value: money(m[1]!, m[2]) });
  for (const m of text.matchAll(PERCENT)) push({ text: m[0].trim(), kind: "percent", value: Number(m[1]) });
  for (const m of text.matchAll(TERM)) {
    const unit = m[2]!.toLowerCase().startsWith("y") ? 12 : 1;
    push({ text: m[0].trim(), kind: "term", value: Number(m[1]) * unit });
  }
  return out;
}

/** All numbers the client actually gave us, normalised the same way. */
export function factValues(intake: Record<string, unknown>): Set<string> {
  const text = Object.values(intake)
    .filter((v) => typeof v === "string")
    .join("\n");
  return new Set(extractClaims(text).map((c) => `${c.kind}:${c.value}`));
}

export function checkHonesty(
  copy: { hook?: string | null; primaryText?: string | null; headline?: string | null; cta?: string | null },
  intake: Record<string, unknown>,
  now = new Date(),
): HonestyResult {
  const text = [copy.hook, copy.primaryText, copy.headline, copy.cta].filter(Boolean).join("\n");
  const claims = extractClaims(text);
  const facts = factValues(intake);
  const mismatches = claims
    .filter((c) => !facts.has(`${c.kind}:${c.value}`))
    .map((c) => ({ claim: c.text, reason: `“${c.text}” isn't in the client's intake answers` }));
  return { ok: mismatches.length === 0, checked: claims.length, mismatches, checkedAt: now.toISOString() };
}
