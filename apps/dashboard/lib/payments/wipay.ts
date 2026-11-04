import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { raiseAlert } from "@/lib/alerts";
import { getIntegration } from "@/lib/integrations/store";
import { httpJson } from "@/lib/integrations/http";
import { markInvoicePaid } from "@/lib/billing/service";
import { buildRequest, orderIdFor, verifyResponse, wipayConfig, formatTotal } from "./wipay-core";
import type { PaymentProvider } from "./index";

async function config() {
  const integ = await getIntegration("wipay");
  return wipayConfig(process.env, integ.config.feeStructure as string | undefined);
}

export function responseUrl() {
  return `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}/api/payments/wipay/response`;
}

/**
 * Create a hosted checkout for an invoice (one attempt row per click). Returns WiPay's checkout URL.
 * A successful request only means the checkout exists — the invoice is marked paid in handleWipayResponse.
 */
async function startCheckout(invoiceId: string) {
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId));
  if (!inv?.number) throw new Error("Invoice not found");
  if (inv.status === "paid") throw new Error("This invoice is already paid. Thank you!");
  if (inv.status === "draft" || inv.status === "void") throw new Error("This invoice isn't ready for payment.");
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, inv.clientId));
  const cfg = await config();
  const orderId = orderIdFor(inv.number);
  const req = buildRequest(cfg, { orderId, totalCents: inv.totalCents, currency: inv.currency, responseUrl: responseUrl(), invoiceId: inv.id, email: client?.email, name: client?.contactName });
  const [attempt] = await db
    .insert(schema.paymentAttempts)
    .values({ invoiceId: inv.id, environment: cfg.environment, orderId, totalSent: req.fields.total!, currency: inv.currency })
    .returning();
  const res = await httpJson<{ url?: string; message?: string; transaction_id?: string }>("WiPay", req.url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(req.fields),
  }, (b) => (b as { message?: string })?.message ?? null);
  if (!res.url || !res.transaction_id) {
    await db.update(schema.paymentAttempts).set({ status: "error", response: { message: res.message ?? null } }).where(eq(schema.paymentAttempts.id, attempt!.id));
    throw new Error(`WiPay couldn't start the payment: ${res.message ?? "no checkout URL returned"}`);
  }
  await db.update(schema.paymentAttempts).set({ checkoutUrl: res.url, transactionId: res.transaction_id }).where(eq(schema.paymentAttempts.id, attempt!.id));
  await logAudit({ actorType: "portal", actorId: null, action: "payment.checkout_created", entityTable: "invoices", entityId: inv.id, details: { provider: "wipay", environment: cfg.environment, orderId, total: req.fields.total } });
  return { url: res.url, orderId };
}

export type WipayOutcome = { result: "paid" | "already_paid" | "failed" | "rejected" | "unknown"; invoiceNumber: string | null; message: string | null };

/** GET response_url handler. Verifies the hash with our stored total, then marks the invoice paid (idempotent). */
export async function handleWipayResponse(q: Record<string, string | undefined>): Promise<WipayOutcome> {
  const orderId = q.order_id ?? "";
  const [attempt] = orderId ? await db.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.orderId, orderId)) : [];
  if (!attempt) return { result: "unknown", invoiceNumber: null, message: "We couldn't match this payment to an invoice. Please contact us." };
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, attempt.invoiceId));
  const cfg = await config();
  if (cfg.environment !== attempt.environment) return { result: "rejected", invoiceNumber: inv?.number ?? null, message: "Environment mismatch." };
  const verdict = verifyResponse(q, attempt, cfg.apiKey);
  const response = Object.fromEntries(Object.entries(q).filter(([k]) => ["status", "transaction_id", "order_id", "total", "message", "date", "currency", "card"].includes(k)));

  if (!verdict.ok) {
    await db.update(schema.paymentAttempts).set({ status: verdict.status, response: { ...response, reason: verdict.reason } }).where(eq(schema.paymentAttempts.id, attempt.id));
    await logAudit({ actorType: "webhook", actorId: null, action: `payment.${verdict.status}`, entityTable: "invoices", entityId: attempt.invoiceId, details: { orderId, reason: verdict.reason } });
    if (verdict.status === "rejected") await raiseAlert({ kind: "payment", severity: "urgent", title: `WiPay response rejected for ${inv?.number ?? "an invoice"}`, body: verdict.reason, link: `/dashboard/billing/${attempt.invoiceId}`, dedupeKey: `wipay_rejected:${orderId}` });
    return { result: verdict.status === "rejected" ? "rejected" : "failed", invoiceNumber: inv?.number ?? null, message: verdict.status === "rejected" ? "We couldn't verify this payment." : (q.message ?? "The payment didn't go through.") };
  }
  const wasPaid = inv?.status === "paid";
  await db.update(schema.paymentAttempts).set({ status: "success", transactionId: verdict.transactionId, response }).where(eq(schema.paymentAttempts.id, attempt.id));
  // Amount recorded = what we asked for (the response total can include the customer's card fee).
  await markInvoicePaid(attempt.invoiceId, { method: "wipay", reference: verdict.transactionId, amountCents: Math.round(Number(attempt.totalSent) * 100) }, { type: "webhook", id: null });
  return { result: wasPaid ? "already_paid" : "paid", invoiceNumber: inv?.number ?? null, message: null };
}

export const wipayProvider: PaymentProvider = {
  name: "wipay",
  startCheckout,
};

export { formatTotal };
