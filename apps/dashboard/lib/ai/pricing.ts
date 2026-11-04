/** USD per million tokens (Anthropic list prices). Used only to estimate cost for Settings → AI cost. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};
/** Web search is billed per search. */
export const WEB_SEARCH_USD_PER_SEARCH = 0.01;

export type UsageTotals = { input: number; output: number; cacheRead: number; cacheWrite: number; webSearches: number };

/** Estimated cost in micro-USD (1e-6 USD). Unknown models fall back to Opus pricing (conservative). */
export function estimateCostMicros(model: string, u: UsageTotals): number {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"]!;
  const usd =
    (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1_000_000 +
    u.webSearches * WEB_SEARCH_USD_PER_SEARCH;
  return Math.round(usd * 1_000_000);
}
