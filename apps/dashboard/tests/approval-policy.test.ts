import { describe, expect, it } from "vitest";
import { APPROVAL_TYPES, roleCanApprove, shouldAutoApprove, sortQueue } from "@/lib/approvals/types";

describe("auto-approve policy (server-side gate)", () => {
  it("only day-3 and day-7 follow-ups are auto-approvable by default", () => {
    const auto = Object.entries(APPROVAL_TYPES).filter(([, i]) => i.autoApprovable).map(([k]) => k);
    expect(auto.sort()).toEqual(["followup_day3", "followup_day7"]);
  });
  it("needs the owner's switch on", () => {
    expect(shouldAutoApprove("followup_day3", {})).toBe(false);
    expect(shouldAutoApprove("followup_day3", { followup_day3: true })).toBe(true);
  });
  it("ignores tampered settings for first messages, launches, budget raises and invoices", () => {
    const rules = { outreach_opener: true, campaign_launch: true, budget_change: true, invoice: true };
    for (const t of Object.keys(rules)) expect(shouldAutoApprove(t, rules)).toBe(false);
    expect(shouldAutoApprove("made_up_type", { made_up_type: true })).toBe(false);
  });
});

describe("who can approve", () => {
  it("owner can approve anything", () => {
    expect(roleCanApprove("owner", "campaign_launch", "high")).toBe(true);
  });
  it("account manager: low risk, non-owner-only only", () => {
    expect(roleCanApprove("account_manager", "followup_day3", "low")).toBe(true);
    expect(roleCanApprove("account_manager", "outreach_opener", "medium")).toBe(false);
    expect(roleCanApprove("account_manager", "invoice", "low")).toBe(false);
    expect(roleCanApprove("account_manager", "campaign_launch", "low")).toBe(false);
  });
  it("no role: never", () => {
    expect(roleCanApprove("none", "system_test", "low")).toBe(false);
  });
});

describe("queue order", () => {
  it("highest risk first, then newest", () => {
    const at = (m: number) => new Date(2026, 10, 3, 9, m);
    const q = sortQueue([
      { id: "a", riskLevel: "low" as const, createdAt: at(5) },
      { id: "b", riskLevel: "high" as const, createdAt: at(1) },
      { id: "c", riskLevel: "high" as const, createdAt: at(3) },
      { id: "d", riskLevel: "medium" as const, createdAt: at(9) },
    ]);
    expect(q.map((x) => x.id)).toEqual(["c", "b", "d", "a"]);
  });
});
