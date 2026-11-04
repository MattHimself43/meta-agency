/**
 * Approval item types. This file is the single source of truth for risk and auto-approve eligibility.
 *
 * Rule: the AI prepares, Matthias approves. Only types with `autoApprovable: true` may ever be
 * auto-approved, and only when the owner switches them on in Settings. Everything else needs a click,
 * no matter what is stored in settings.auto_approve_rules (enforced server-side in lib/approvals/index.ts).
 */
export type Risk = "low" | "medium" | "high";

export type ApprovalTypeInfo = {
  label: string;
  defaultRisk: Risk;
  autoApprovable: boolean;
  /** Owner must approve even if team seats are enabled */
  ownerOnly: boolean;
};

export const APPROVAL_TYPES = {
  system_test: { label: "System test", defaultRisk: "low", autoApprovable: false, ownerOnly: false },
  outreach_opener: { label: "First message", defaultRisk: "medium", autoApprovable: false, ownerOnly: false },
  followup_day3: { label: "Day-3 follow-up", defaultRisk: "low", autoApprovable: true, ownerOnly: false },
  followup_day7: { label: "Day-7 last nudge", defaultRisk: "low", autoApprovable: true, ownerOnly: false },
  reply_draft: { label: "Reply to prospect", defaultRisk: "medium", autoApprovable: false, ownerOnly: false },
  onboarding_nudge: { label: "Onboarding nudge", defaultRisk: "low", autoApprovable: false, ownerOnly: false },
  kickoff_plan: { label: "First-month plan", defaultRisk: "medium", autoApprovable: false, ownerOnly: true },
  creative_pick: { label: "Creative pick", defaultRisk: "medium", autoApprovable: false, ownerOnly: false },
  campaign_build: { label: "Build campaign (paused)", defaultRisk: "medium", autoApprovable: false, ownerOnly: true },
  campaign_launch: { label: "Campaign launch", defaultRisk: "high", autoApprovable: false, ownerOnly: true },
  budget_change: { label: "Budget change", defaultRisk: "high", autoApprovable: false, ownerOnly: true },
  recommendation: { label: "Optimisation", defaultRisk: "medium", autoApprovable: false, ownerOnly: false },
  report: { label: "Client report", defaultRisk: "medium", autoApprovable: false, ownerOnly: false },
  invoice: { label: "Invoice", defaultRisk: "high", autoApprovable: false, ownerOnly: true },
  invoice_reminder: { label: "Invoice reminder", defaultRisk: "medium", autoApprovable: false, ownerOnly: true },
} as const satisfies Record<string, ApprovalTypeInfo>;

export type ApprovalType = keyof typeof APPROVAL_TYPES;

export function isApprovalType(t: string): t is ApprovalType {
  return Object.prototype.hasOwnProperty.call(APPROVAL_TYPES, t);
}

/** Server-side gate: auto-approve only if the type allows it AND the owner switched it on. */
export function shouldAutoApprove(type: string, rules: Record<string, boolean> | null | undefined): boolean {
  if (!isApprovalType(type)) return false;
  if (!APPROVAL_TYPES[type].autoApprovable) return false;
  return rules?.[type] === true;
}

/** Can this role approve this item? */
export function roleCanApprove(role: "owner" | "account_manager" | "none", type: string, risk: Risk): boolean {
  if (role === "owner") return true;
  if (role !== "account_manager") return false;
  if (!isApprovalType(type) || APPROVAL_TYPES[type].ownerOnly) return false;
  return risk === "low";
}

const RISK_ORDER: Record<Risk, number> = { high: 0, medium: 1, low: 2 };
/** Highest risk first, then newest first. */
export function sortQueue<T extends { riskLevel: Risk; createdAt: Date }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel] || b.createdAt.getTime() - a.createdAt.getTime(),
  );
}
