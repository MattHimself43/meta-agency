import "server-only";
import { eq } from "drizzle-orm";
import { schema, type Tx } from "@/lib/db";
import type { Actor } from "@/lib/auth";
import { finaliseInvoice } from "@/lib/billing/invoices";
import { applyBudgetChange } from "@/lib/campaigns/service";

type Approval = typeof schema.approvals.$inferSelect;
export type DecisionContext = { tx: Tx; approval: Approval; actor: Actor | null };
export type Handler = {
  onApprove?: (ctx: DecisionContext) => Promise<void>;
  onReject?: (ctx: DecisionContext) => Promise<void>;
};

/**
 * What happens to the underlying record when an approval is decided.
 * Each later phase registers its own handler here (messages, invoices, campaigns…).
 * Handlers run inside the same transaction as the decision and the audit log entry.
 */
export const handlers: Partial<Record<string, Handler>> = {
  system_test: {},

  // Message drafts: approving marks the message approved (it is never sent automatically —
  // WhatsApp is sent by Matthias from his phone; email sends happen in Phase 1/3 after approval).
  outreach_opener: messageHandler(),
  followup_day3: messageHandler(),
  followup_day7: messageHandler(),
  reply_draft: messageHandler(),
  onboarding_nudge: messageHandler(),
  invoice_reminder: messageHandler(),

  // Budget changes: approving applies the new budget (update Ads Manager to match in Manual mode).
  budget_change: {
    onApprove: async ({ tx, approval, actor }) => {
      if (approval.subjectTable === "budget_changes" && approval.subjectId) return applyBudgetChange(approval.subjectId, actor?.userId ?? null, tx);
      if (approval.subjectTable === "recommendations" && approval.subjectId) return applyRecommendationBudget(tx, approval.subjectId, actor?.userId ?? null);
    },
    onReject: async ({ tx, approval }) => {
      if (approval.subjectTable === "budget_changes" && approval.subjectId) await tx.update(schema.budgetChanges).set({ status: "rejected" }).where(eq(schema.budgetChanges.id, approval.subjectId));
      if (approval.subjectTable === "recommendations" && approval.subjectId) await tx.update(schema.recommendations).set({ status: "rejected" }).where(eq(schema.recommendations.id, approval.subjectId));
    },
  },

  // Optimisation recommendations: approve = you'll do it in Ads Manager (Manual mode); budget decreases apply here.
  recommendation: {
    onApprove: async ({ tx, approval, actor }) => {
      if (approval.subjectTable !== "recommendations" || !approval.subjectId) return;
      const [rec] = await tx.select().from(schema.recommendations).where(eq(schema.recommendations.id, approval.subjectId));
      if (rec?.type === "lower_budget") return applyRecommendationBudget(tx, rec.id, actor?.userId ?? null);
      await tx.update(schema.recommendations).set({ status: "approved" }).where(eq(schema.recommendations.id, approval.subjectId));
    },
    onReject: async ({ tx, approval }) => {
      if (approval.subjectTable === "recommendations" && approval.subjectId) await tx.update(schema.recommendations).set({ status: "rejected" }).where(eq(schema.recommendations.id, approval.subjectId));
    },
  },

  // Reports: approving marks it ready to share; the share link is created on the report page.
  report: {
    onApprove: async ({ tx, approval }) => {
      if (approval.subjectTable === "reports" && approval.subjectId) await tx.update(schema.reports).set({ status: "approved" }).where(eq(schema.reports.id, approval.subjectId));
    },
    onReject: async ({ tx, approval }) => {
      if (approval.subjectTable === "reports" && approval.subjectId) await tx.update(schema.reports).set({ status: "archived" }).where(eq(schema.reports.id, approval.subjectId));
    },
  },

  kickoff_plan: {
    onApprove: async ({ tx, approval }) => {
      if (approval.subjectTable === "clients" && approval.subjectId) {
        await tx.insert(schema.activities).values({ clientId: approval.subjectId, type: "note", body: `First-month plan approved:\n${String(approval.preview?.body ?? "")}` });
      }
    },
  },

  // Invoices: approval assigns the next sequential number, issue and due dates.
  invoice: {
    onApprove: async ({ tx, approval }) => {
      if (approval.subjectTable === "invoices" && approval.subjectId) await finaliseInvoice(tx, approval.subjectId);
    },
    onReject: async ({ tx, approval }) => {
      if (approval.subjectTable === "invoices" && approval.subjectId)
        await tx.update(schema.invoices).set({ status: "void" }).where(eq(schema.invoices.id, approval.subjectId));
    },
  },
};

function messageHandler(): Handler {
  return {
    onApprove: async ({ tx, approval }) => {
      if (approval.subjectTable !== "messages" || !approval.subjectId) return;
      await tx.update(schema.messages).set({ status: "approved" }).where(eq(schema.messages.id, approval.subjectId));
    },
    onReject: async ({ tx, approval }) => {
      if (approval.subjectTable !== "messages" || !approval.subjectId) return;
      await tx.update(schema.messages).set({ status: "cancelled" }).where(eq(schema.messages.id, approval.subjectId));
    },
  };
}

/** An approved budget recommendation applies straight away: the owner's approval is the guardrail. */
async function applyRecommendationBudget(tx: DecisionContext["tx"], recId: string, actorId: string | null) {
  const [rec] = await tx.select().from(schema.recommendations).where(eq(schema.recommendations.id, recId));
  if (!rec) return;
  const toCents = Number(rec.payload.toCents);
  if (rec.campaignPlanId && Number.isFinite(toCents) && toCents > 0) {
    const [plan] = await tx.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.id, rec.campaignPlanId));
    if (plan) {
      const [change] = await tx.insert(schema.budgetChanges).values({ campaignPlanId: plan.id, oldBudgetUsdCents: plan.budgetUsdCents, newBudgetUsdCents: toCents, status: "pending", reason: rec.reasoning, requestedBy: "routine", createdBy: actorId }).returning();
      await applyBudgetChange(change!.id, actorId, tx);
    }
  }
  await tx.update(schema.recommendations).set({ status: "applied" }).where(eq(schema.recommendations.id, recId));
}
