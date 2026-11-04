import "server-only";
import { db, schema, type Tx } from "@/lib/db";

export type AuditInput = {
  actorType: "user" | "routine" | "ai" | "system" | "portal" | "webhook";
  actorId?: string | null;
  action: string;
  entityTable?: string | null;
  entityId?: string | null;
  approvalId?: string | null;
  approvedBy?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
};

/** Append a row to the append-only audit log. Pass `tx` to make it part of the same transaction. */
export async function logAudit(input: AuditInput, tx?: Tx) {
  await (tx ?? db).insert(schema.auditLog).values({
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    action: input.action,
    entityTable: input.entityTable ?? null,
    entityId: input.entityId ?? null,
    approvalId: input.approvalId ?? null,
    approvedBy: input.approvedBy ?? null,
    details: input.details ?? {},
    ip: input.ip ?? null,
  });
}
