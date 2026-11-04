/**
 * Fit score 1-10 from a niche's scoring rules. Pure, so it's easy to test and to rerun on every refresh.
 *
 * Each rule has a weight; each signal is 0-1 (null = unknown). Unknown signals count as neutral (0.5)
 * but at half weight, so a lead with little evidence lands near the middle instead of the top or bottom.
 */
export type ScoringRule = { key: string; label: string; weight: number };
export type Signals = Record<string, number | null | undefined>;

export function computeFitScore(rules: ScoringRule[], signals: Signals): { score: number; reasons: string[] } {
  if (!rules.length) return { score: 5, reasons: ["No scoring rules for this niche"] };
  let total = 0;
  let weights = 0;
  const reasons: string[] = [];
  for (const r of rules) {
    const raw = signals[r.key];
    const known = typeof raw === "number" && Number.isFinite(raw);
    const v = known ? Math.min(1, Math.max(0, raw)) : 0.5;
    const w = known ? r.weight : r.weight / 2;
    total += v * w;
    weights += w;
    if (!known) reasons.push(`Unknown: ${r.label}`);
    else if (v >= 0.6) reasons.push(`✓ ${r.label}`);
    else if (v <= 0.3) reasons.push(`✗ ${r.label}`);
  }
  const score = Math.round(1 + 9 * (weights ? total / weights : 0.5));
  return { score: Math.min(10, Math.max(1, score)), reasons };
}

/** The score shown everywhere: Matthias's override wins and is kept across rescoring. */
export function effectiveScore(lead: { fitScore: number | null; fitScoreOverride: number | null }): number | null {
  return lead.fitScoreOverride ?? lead.fitScore;
}
