/**
 * Budget guardrail (enforced server-side in lib/campaigns/service.ts, never just in the UI).
 * A change needs owner approval if:
 *  - it raises the budget more than 20 % above the lowest budget in effect during the last 7 days, or
 *  - the change is bigger than the owner's per-day limit in Settings, or
 *  - it's an increase requested by anyone other than the owner (AI, routines, account managers).
 */
export type Requester = "owner" | "ai" | "routine" | "account_manager";

export function budgetChangeNeedsApproval(input: {
  currentCents: number;
  newCents: number;
  /** Budgets in effect at any point in the last 7 days. */
  recentBudgetsCents: number[];
  ownerLimitCents: number;
  requestedBy: Requester;
}): { needsApproval: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const increase = input.newCents > input.currentCents;
  const floor = Math.min(input.currentCents, ...input.recentBudgetsCents.filter((b) => b > 0));
  if (increase && floor > 0 && input.newCents > floor * 1.2) {
    reasons.push(`Raises the budget ${Math.round((input.newCents / floor - 1) * 100)}% above the last 7 days (limit 20%)`);
  }
  const delta = Math.abs(input.newCents - input.currentCents);
  if (delta > input.ownerLimitCents) {
    reasons.push(`Change of US$${(delta / 100).toFixed(2)}/day is over your US$${(input.ownerLimitCents / 100).toFixed(2)} limit`);
  }
  if (increase && input.requestedBy !== "owner") reasons.push("Budget increases not made by the owner always need approval");
  return { needsApproval: reasons.length > 0, reasons };
}
