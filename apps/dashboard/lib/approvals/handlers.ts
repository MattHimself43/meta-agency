import "server-only";
import { eq } from "drizzle-orm";
import { schema, type Tx } from "@/lib/db";
import type { Actor } from "@/lib/auth";

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
