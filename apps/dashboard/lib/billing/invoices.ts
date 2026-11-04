import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { addDays } from "date-fns";
import { schema, type Tx } from "@/lib/db";
import { vatCents } from "@/lib/money";
import { astDateString } from "@/lib/time";
import { createApproval } from "@/lib/approvals";
import { getSettings } from "@/lib/settings";

type Line = { description: string; unitCents: number; quantity?: number };

/**
 * Draft an invoice (TTD) and queue it for approval. Idempotent per (client, periodKey):
 * re-running for the same period returns the existing invoice.
 */
export async function draftInvoice(
  tx: Tx,
  input: { clientId: string; kind: "setup" | "monthly" | "other"; periodKey: string; lines: Line[]; clientName: string; requestedBy: string; isDemo?: boolean },
) {
  const existing = await tx
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.clientId, input.clientId), eq(schema.invoices.periodKey, input.periodKey)))
    .limit(1);
  if (existing[0]) return { invoice: existing[0], created: false };

  const settings = await getSettings();
  const subtotal = input.lines.reduce((s, l) => s + Math.round(l.unitCents * (l.quantity ?? 1)), 0);
  const vat = settings.vatEnabled ? vatCents(subtotal, settings.vatRateBps) : 0;
  const [invoice] = await tx
    .insert(schema.invoices)
    .values({
      clientId: input.clientId,
      kind: input.kind,
      periodKey: input.periodKey,
      currency: "TTD",
      subtotalCents: subtotal,
      vatCents: vat,
      totalCents: subtotal + vat,
      status: "draft",
      isDemo: input.isDemo ?? false,
    })
    .returning();
  await tx.insert(schema.invoiceLines).values(
    input.lines.map((l, i) => ({
      invoiceId: invoice!.id,
      description: l.description,
      quantity: String(l.quantity ?? 1),
      unitCents: l.unitCents,
      amountCents: Math.round(l.unitCents * (l.quantity ?? 1)),
      sortOrder: i,
      isDemo: input.isDemo ?? false,
    })),
  );
  await createApproval(
    {
      itemType: "invoice",
      title: `Invoice draft — ${input.clientName} (${input.kind === "setup" ? "setup fee" : input.periodKey})`,
      summary: `TT$${((subtotal + vat) / 100).toLocaleString("en-TT", { minimumFractionDigits: 2 })} · numbered when approved`,
      preview: { body: input.lines.map((l) => `${l.description}: TT$${(l.unitCents / 100).toFixed(2)}`).join("\n") },
      subjectTable: "invoices",
      subjectId: invoice!.id,
      requestedBy: input.requestedBy,
      dedupeKey: `invoice:${input.clientId}:${input.periodKey}`,
      isDemo: input.isDemo,
    },
    tx,
  );
  return { invoice: invoice!, created: true };
}

/**
 * On approval: take the next sequential number atomically, stamp issue/due dates and snapshots.
 * Numbers are only consumed by approved invoices, so there are no gaps.
 */
export async function finaliseInvoice(tx: Tx, invoiceId: string) {
  const [s] = await tx.execute<{ n: number; prefix: string; due_days: number }>(sql`
    UPDATE settings SET next_invoice_number = next_invoice_number + 1 WHERE id = 1
    RETURNING next_invoice_number - 1 AS n, invoice_prefix AS prefix, invoice_due_days AS due_days`) as unknown as { n: number; prefix: string; due_days: number }[];
  const settings = await getSettings();
  const [inv] = await tx.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId));
  if (!inv || inv.number) return;
  const [client] = await tx.select().from(schema.clients).where(eq(schema.clients.id, inv.clientId));
  const today = new Date();
  await tx
    .update(schema.invoices)
    .set({
      number: `${s!.prefix}${String(s!.n).padStart(4, "0")}`,
      status: "approved",
      issueDate: astDateString(today),
      dueDate: astDateString(addDays(today, Number(s!.due_days))),
      agencySnapshot: {
        name: settings.agencyName,
        address: settings.addressLines,
        registrationNumber: settings.registrationNumber,
        vatNumber: settings.vatNumber,
        bank: settings.bankDetails,
      },
      clientSnapshot: { name: client?.name, contact: client?.contactName, email: client?.email, whatsapp: client?.whatsapp },
    })
    .where(eq(schema.invoices.id, invoiceId));
}
