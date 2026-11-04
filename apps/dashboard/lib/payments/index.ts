import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { generateToken, hashToken } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

/**
 * How an invoice gets paid. Bank transfer is always available (Mark paid by hand).
 * With the `wipay` flag on, the client gets a /pay/<token> link; each "Pay by card" click starts a fresh
 * WiPay hosted checkout (lib/payments/wipay.ts). All WiPay specifics stay behind this interface.
 */
export interface PaymentProvider {
  readonly name: string;
  /** Start a hosted checkout for this invoice and return the URL to send the payer to. */
  startCheckout(invoiceId: string): Promise<{ url: string; orderId: string }>;
}

export async function activeProvider(): Promise<PaymentProvider | null> {
  const s = await getSettings();
  if (!s.featureFlags.wipay) return null;
  const { wipayProvider } = await import("./wipay");
  return wipayProvider;
}

export async function bankTransferText() {
  const s = await getSettings();
  const b = s.bankDetails;
  return `Bank transfer to ${b.accountName}, ${b.bank} (${b.branch}), ${b.accountType} account ${b.accountNumber}.`;
}

export function payUrl(token: string) {
  return `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}/pay/${token}`;
}

/**
 * Create (or replace) the invoice's pay link. The link only lets someone view the amount and pay this invoice.
 * Its hash is the lookup key; the full URL is kept on the invoice so it can go in the PDF and the WhatsApp text.
 */
export async function issuePayLink(invoiceId: string, actorId: string | null) {
  const token = generateToken();
  const url = payUrl(token);
  await db.update(schema.invoices).set({ payTokenHash: hashToken(token), paymentLink: url }).where(eq(schema.invoices.id, invoiceId));
  await logAudit({ actorType: actorId ? "user" : "system", actorId, action: "invoice.pay_link_issued", entityTable: "invoices", entityId: invoiceId });
  return url;
}

/** Public /pay/<token> lookup: rate-limited, hashed. */
export async function resolvePayToken(token: string, ip: string) {
  if (!/^[A-Za-z0-9_-]{43,}$/.test(token)) return null;
  const rl = await rateLimit(`pay:${ip}`, 60, 600);
  if (!rl.ok) throw new Error("Too many requests. Please wait a few minutes.");
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.payTokenHash, hashToken(token)));
  return inv ?? null;
}
