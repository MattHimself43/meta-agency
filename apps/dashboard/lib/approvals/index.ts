import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { AuthError, type Actor } from "@/lib/auth";
import { APPROVAL_TYPES, isApprovalType, roleCanApprove, shouldAutoApprove, type ApprovalType, type Risk } from "./types";
import { handlers } from "./handlers";

export type Approval = typeof schema.approvals.$inferSelect;

export type CreateApprovalInput = {
  itemType: ApprovalType;
  title: string;
  summary?: string;
  preview?: Record<string, unknown>;
  subjectTable?: string;
  subjectId?: string;
  riskLevel?: Risk;
  requestedBy?: string;
  /** Idempotency: a rerun with the same key returns the existing item instead of creating a duplicate. */
  dedupeKey?: string;
  isDemo?: boolean;
};

/**
 * Put an item in the approval queue. If the owner has switched on auto-approve for this
 * (auto-approvable) type, it is approved immediately and logged as auto-approved.
 */
export async function createApproval(input: CreateApprovalInput, tx?: Tx): Promise<{ approval: Approval; created: boolean }> {
  const run = async (t: Tx) => {
    const info = APPROVAL_TYPES[input.itemType];
    // Risk can be raised by the caller but never lowered below the type's default.
    const risk = maxRisk(info.defaultRisk, input.riskLevel ?? info.defaultRisk);
    const inserted = await t
      .insert(schema.approvals)
      .values({
        itemType: input.itemType,
        title: input.title,
        summary: input.summary,
        preview: input.preview ?? {},
        subjectTable: input.subjectTable,
        subjectId: input.subjectId,
        riskLevel: risk,
        requestedBy: input.requestedBy ?? "system",
        dedupeKey: input.dedupeKey,
        isDemo: input.isDemo ?? false,
      })
      .onConflictDoNothing({ target: schema.approvals.dedupeKey })
      .returning();

    if (!inserted[0]) {
      const [existing] = await t.select().from(schema.approvals).where(eq(schema.approvals.dedupeKey, input.dedupeKey!)).limit(1);
      return { approval: existing!, created: false };
    }
    let approval = inserted[0];
    await logAudit(
      {
        actorType: approval.requestedBy.startsWith("routine:") ? "routine" : approval.requestedBy === "ai" ? "ai" : "system",
        actorId: approval.requestedBy,
        action: "approval.requested",
        entityTable: "approvals",
        entityId: approval.id,
        approvalId: approval.id,
        details: { itemType: approval.itemType, risk, subjectTable: approval.subjectTable, subjectId: approval.subjectId },
      },
      t,
    );

    const settings = await getSettings();
    if (shouldAutoApprove(approval.itemType, settings.autoApproveRules)) {
      await handlers[approval.itemType]?.onApprove?.({ tx: t, approval, actor: null });
      [approval] = await t
        .update(schema.approvals)
        .set({ status: "auto_approved", decidedAt: new Date(), decisionNote: "Auto-approved by rule in Settings" })
        .where(eq(schema.approvals.id, approval.id))
        .returning();
      await logAudit(
        {
          actorType: "system",
          action: "approval.auto_approved",
          entityTable: "approvals",
          entityId: approval!.id,
          approvalId: approval!.id,
          details: { rule: approval!.itemType },
        },
        t,
      );
    }
    return { approval: approval!, created: true };
  };
  return tx ? run(tx) : db.transaction(run);
}

export type Decision = "approve" | "reject";

/** Approve or reject a pending item. Runs the type's handler and writes the audit log in one transaction. */
export async function decideApproval(id: string, decision: Decision, actor: Actor, note?: string): Promise<Approval> {
  return db.transaction(async (tx) => {
    const [approval] = await tx.select().from(schema.approvals).where(eq(schema.approvals.id, id)).for("update").limit(1);
    if (!approval) throw new Error("Approval not found");
    if (approval.status !== "pending") throw new Error(`Already ${approval.status.replace("_", " ")}`);
    if (!roleCanApprove(actor.role, approval.itemType, approval.riskLevel)) throw new AuthError("Only the owner can decide this item");

    const handler = handlers[approval.itemType];
    if (decision === "approve") await handler?.onApprove?.({ tx, approval, actor });
    else await handler?.onReject?.({ tx, approval, actor });

    const [updated] = await tx
      .update(schema.approvals)
      .set({
        status: decision === "approve" ? "approved" : "rejected",
        decidedBy: actor.userId,
        decidedAt: new Date(),
        decisionNote: note ?? null,
      })
      .where(and(eq(schema.approvals.id, id), eq(schema.approvals.status, "pending")))
      .returning();

    await logAudit(
      {
        actorType: "user",
        actorId: actor.userId,
        action: decision === "approve" ? "approval.approved" : "approval.rejected",
        entityTable: approval.subjectTable ?? "approvals",
        entityId: approval.subjectId ?? approval.id,
        approvalId: approval.id,
        approvedBy: decision === "approve" ? actor.userId : null,
        details: { itemType: approval.itemType, risk: approval.riskLevel, note: note ?? null },
      },
      tx,
    );
    return updated!;
  });
}

/** "Approve all": decides only pending low-risk items the actor is allowed to approve. */
export async function approveAllLowRisk(actor: Actor): Promise<number> {
  const pending = await db
    .select({ id: schema.approvals.id, itemType: schema.approvals.itemType })
    .from(schema.approvals)
    .where(and(eq(schema.approvals.status, "pending"), eq(schema.approvals.riskLevel, "low")));
  let n = 0;
  for (const p of pending) {
    if (!roleCanApprove(actor.role, p.itemType, "low")) continue;
    try {
      await decideApproval(p.id, "approve", actor, "Approve all (low risk)");
      n++;
    } catch {
      // Raced with another decision; skip.
    }
  }
  return n;
}

/** Edit the draft content before approving. Keeps the original in the audit log. */
export async function editApproval(id: string, patch: { body?: string; title?: string }, actor: Actor): Promise<Approval> {
  return db.transaction(async (tx) => {
    const [approval] = await tx.select().from(schema.approvals).where(eq(schema.approvals.id, id)).for("update").limit(1);
    if (!approval) throw new Error("Approval not found");
    if (approval.status !== "pending") throw new Error("Only pending items can be edited");
    if (!roleCanApprove(actor.role, approval.itemType, approval.riskLevel)) throw new AuthError("Only the owner can edit this item");

    const preview = { ...approval.preview, ...(patch.body !== undefined ? { body: patch.body } : {}) };
    const [updated] = await tx
      .update(schema.approvals)
      .set({ preview, title: patch.title ?? approval.title })
      .where(eq(schema.approvals.id, id))
      .returning();

    if (patch.body !== undefined && approval.subjectTable === "messages" && approval.subjectId) {
      await tx.update(schema.messages).set({ body: patch.body }).where(eq(schema.messages.id, approval.subjectId));
    }
    await logAudit(
      {
        actorType: "user",
        actorId: actor.userId,
        action: "approval.edited",
        entityTable: "approvals",
        entityId: id,
        approvalId: id,
        details: { before: { title: approval.title, body: approval.preview?.body ?? null }, after: patch },
      },
      tx,
    );
    return updated!;
  });
}

export async function pendingCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.approvals).where(eq(schema.approvals.status, "pending"));
  return row?.n ?? 0;
}


function maxRisk(a: Risk, b: Risk): Risk {
  const order: Risk[] = ["low", "medium", "high"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))]!;
}

export { APPROVAL_TYPES, isApprovalType };
