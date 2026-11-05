import "server-only";
import React from "react";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { db, schema } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { createApproval } from "@/lib/approvals";
import { getSettings } from "@/lib/settings";
import { astDateString } from "@/lib/time";
import { activeProvider, issuePayLink } from "@/lib/payments";
import { draftInvoice } from "./invoices";

export type Invoice = typeof schema.invoices.$inferSelect;

/**
 * 1st-of-month run: one monthly-fee invoice draft per active client, into the approval queue.
 * Idempotent: (client, "YYYY-MM") is unique, so a rerun the same month creates nothing new.
 */
export async function monthlyInvoiceRun(now = new Date()) {
  const period = astDateString(now).slice(0, 7);
  const clients = await db.select().from(schema.clients).where(eq(schema.clients.status, "active"));
  let created = 0;
  let existing = 0;
  for (const c of clients) {
    if (!c.packageId) continue;
    const [pkg] = await db.select().from(schema.packages).where(eq(schema.packages.id, c.packageId));
    if (!pkg || pkg.monthlyFeeCents <= 0) continue;
    const r = await db.transaction((tx) =>
      draftInvoice(tx, { clientId: c.id, kind: "monthly", periodKey: period, clientName: c.name, lines: [{ description: `${pkg.name} package — management fee, ${period}`, unitCents: pkg.monthlyFeeCents }], requestedBy: "routine:month_end_close", isDemo: c.isDemo }),
    );
    if (r.created) created++;
    else existing++;
  }
  return { period, created, existing };
}

export async function markInvoiceSent(id: string, actorId: string) {
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id));
  if (!inv) throw new Error("Invoice not found");
  if (!inv.number) throw new Error("Approve the invoice first (that gives it its number).");
  let paymentLink = inv.paymentLink;
  // WiPay on: the client gets our /pay link (each click starts a fresh hosted checkout).
  if ((await activeProvider()) && !paymentLink) paymentLink = await issuePayLink(inv.id, actorId);
  await db.update(schema.invoices).set({ status: inv.status === "approved" ? "sent" : inv.status, sentAt: inv.sentAt ?? new Date(), paymentLink }).where(eq(schema.invoices.id, id));
  await logAudit({ actorType: "user", actorId, action: "invoice.sent", entityTable: "invoices", entityId: id });
}

/** Bank transfer (or cash) received — recorded by hand while WiPay is off. */
export async function markInvoicePaid(id: string, input: { method: "bank_transfer" | "cash" | "wipay" | "other"; reference: string | null; amountCents?: number; receivedAt?: Date }, actor: { type: "user" | "webhook"; id: string | null }) {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(schema.invoices).where(eq(schema.invoices.id, id)).for("update");
    if (!inv) throw new Error("Invoice not found");
    if (inv.status === "paid") return inv;
    if (!inv.number) throw new Error("Approve the invoice first.");
    await tx.insert(schema.payments).values({ invoiceId: id, amountCents: input.amountCents ?? inv.totalCents, currency: inv.currency, method: input.method, reference: input.reference || `${input.method}:${inv.number}:${Date.now()}`, receivedAt: input.receivedAt ?? new Date(), isDemo: inv.isDemo }).onConflictDoNothing();
    const [paid] = await tx.update(schema.invoices).set({ status: "paid", paidAt: input.receivedAt ?? new Date() }).where(eq(schema.invoices.id, id)).returning();
    await logAudit({ actorType: actor.type, actorId: actor.id, action: "invoice.paid", entityTable: "invoices", entityId: id, details: { method: input.method, reference: input.reference } }, tx);
    return paid!;
  });
}

export const REMINDER_DAYS = [3, 10, 21] as const;

export function reminderText(daysOverdue: 3 | 10 | 21, inv: { number: string; totalCents: number; dueDate: string }, contactFirst: string | null) {
  const amount = `TT$${(inv.totalCents / 100).toLocaleString("en-TT", { minimumFractionDigits: 2 })}`;
  const hi = contactFirst ? `Hi ${contactFirst}` : "Hi";
  if (daysOverdue === 3) return `${hi}, quick reminder that invoice ${inv.number} for ${amount} was due on ${inv.dueDate}. Bank details are on the invoice. Thanks!`;
  if (daysOverdue === 10) return `${hi}, invoice ${inv.number} (${amount}) is now 10 days overdue. Could you let me know when to expect payment? Happy to resend it.`;
  return `${hi}, invoice ${inv.number} (${amount}) is now 3 weeks overdue. Per our agreement I'll need to pause work on the account from Friday until it's settled — your ads and account are not affected. Please let me know if there's a problem.`;
}

/**
 * Daily 11:00: mark overdue invoices and draft reminders at 3, 10 and 21 days (the 21-day one suggests pausing work).
 * Each reminder is drafted once per invoice (reminders_sent), and goes to the approval queue — never sent automatically.
 */
export async function chaseOverdue(now = new Date()) {
  const today = astDateString(now);
  await db.update(schema.invoices).set({ status: "overdue" }).where(and(inArray(schema.invoices.status, ["sent", "approved"]), lt(schema.invoices.dueDate, today)));
  const overdue = await db.select().from(schema.invoices).where(eq(schema.invoices.status, "overdue"));
  let drafted = 0;
  for (const inv of overdue) {
    if (!inv.dueDate || !inv.number) continue;
    const days = differenceInCalendarDays(parseISO(today), parseISO(inv.dueDate));
    const step = [...REMINDER_DAYS].reverse().find((d) => days >= d);
    if (!step || inv.remindersSent[String(step)]) continue;
    const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, inv.clientId));
    const body = reminderText(step, { number: inv.number, totalCents: inv.totalCents, dueDate: inv.dueDate }, client?.contactName?.split(" ")[0] ?? null);
    await db.transaction(async (tx) => {
      const [msg] = await tx.insert(schema.messages).values({ clientId: inv.clientId, channel: "whatsapp", purpose: "invoice_reminder", variants: [body], body, status: "draft", dueAt: now, dedupeKey: `invoice_reminder:${inv.id}:${step}`, isDemo: inv.isDemo }).onConflictDoNothing().returning();
      if (!msg) return;
      await createApproval({ itemType: "invoice_reminder", title: `${step === 21 ? "Final reminder" : "Payment reminder"} — ${client?.name} · ${inv.number} (${days} days overdue)`, summary: step === 21 ? "Suggests pausing work until paid" : undefined, preview: { body, clientId: inv.clientId, invoiceId: inv.id }, subjectTable: "messages", subjectId: msg.id, requestedBy: "routine:invoice_chaser", riskLevel: step === 21 ? "high" : "medium", dedupeKey: `approval:invoice_reminder:${inv.id}:${step}`, isDemo: inv.isDemo }, tx);
      await tx.update(schema.invoices).set({ remindersSent: { ...inv.remindersSent, [String(step)]: now.toISOString() } }).where(eq(schema.invoices.id, inv.id));
      drafted++;
    });
  }
  return { overdue: overdue.length, drafted };
}

export async function renderInvoicePdf(id: string) {
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id));
  if (!inv) return null;
  const lines = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, id)).orderBy(asc(schema.invoiceLines.sortOrder));
  const settings = await getSettings();
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, inv.clientId));
  const agency = (inv.agencySnapshot as object | null) ?? { name: settings.agencyName, address: settings.addressLines, registrationNumber: settings.registrationNumber, vatNumber: settings.vatNumber, bank: settings.bankDetails };
  const clientSnap = (inv.clientSnapshot as object | null) ?? { name: client?.name, contact: client?.contactName, email: client?.email, whatsapp: client?.whatsapp };
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { InvoicePdf } = await import("@/lib/pdf/invoice-pdf");
  const buf = await renderToBuffer(
    React.createElement(InvoicePdf, { number: inv.number, status: inv.status, issueDate: inv.issueDate, dueDate: inv.dueDate, agency, client: clientSnap, lines, subtotalCents: inv.subtotalCents, vatCents: inv.vatCents, totalCents: inv.totalCents, vatRatePct: settings.vatRateBps / 100, paymentLink: inv.paymentLink }) as Parameters<typeof renderToBuffer>[0],
  );
  return { buf, filename: `${inv.number ?? "invoice-draft"}.pdf` };
}

export async function revenueSummary(now = new Date()) {
  const month = astDateString(now).slice(0, 7);
  const [[mrr], [collected], [outstanding]] = await Promise.all([
    db.select({ c: sql<number>`coalesce(sum(${schema.packages.monthlyFeeCents}),0)::bigint` }).from(schema.clients).innerJoin(schema.packages, eq(schema.packages.id, schema.clients.packageId)).where(eq(schema.clients.status, "active")),
    db.select({ c: sql<number>`coalesce(sum(${schema.payments.amountCents}),0)::bigint` }).from(schema.payments).where(gte(schema.payments.receivedAt, parseISO(`${month}-01T04:00:00Z`))),
    db.select({ c: sql<number>`coalesce(sum(${schema.invoices.totalCents}),0)::bigint` }).from(schema.invoices).where(inArray(schema.invoices.status, ["approved", "sent", "overdue"])),
  ]);
  const byNiche = await db
    .select({ niche: schema.niches.name, c: sql<number>`coalesce(sum(${schema.payments.amountCents}),0)::bigint` })
    .from(schema.payments)
    .innerJoin(schema.invoices, eq(schema.invoices.id, schema.payments.invoiceId))
    .innerJoin(schema.clients, eq(schema.clients.id, schema.invoices.clientId))
    .leftJoin(schema.niches, eq(schema.niches.id, schema.clients.nicheId))
    .groupBy(schema.niches.name);
  return { mrr: Number(mrr?.c ?? 0), collectedThisMonth: Number(collected?.c ?? 0), outstanding: Number(outstanding?.c ?? 0), byNiche: byNiche.map((r) => ({ niche: r.niche ?? "No niche", cents: Number(r.c) })) };
}

export async function invoicesList(filter?: string) {
  const rows = await db
    .select({ inv: schema.invoices, client: schema.clients.name })
    .from(schema.invoices)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.invoices.clientId))
    .where(filter && ["draft", "approved", "sent", "paid", "overdue", "void"].includes(filter) ? sql`${schema.invoices.status} = ${filter}` : undefined)
    .orderBy(desc(schema.invoices.createdAt))
    .limit(200);
  return rows;
}
