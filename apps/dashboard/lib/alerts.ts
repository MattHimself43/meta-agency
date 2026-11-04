import "server-only";
import { db, schema, type Tx } from "@/lib/db";

export type AlertInput = {
  kind: string;
  severity?: "info" | "warning" | "urgent";
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string;
};

/** Raise an alert for Home. dedupeKey prevents the same alert stacking up on every run. */
export async function raiseAlert(input: AlertInput, tx?: Tx) {
  await (tx ?? db)
    .insert(schema.alerts)
    .values({ severity: "warning", ...input })
    .onConflictDoNothing({ target: schema.alerts.dedupeKey });
}
