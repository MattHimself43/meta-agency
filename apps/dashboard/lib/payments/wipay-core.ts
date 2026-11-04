import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * WiPay Payments API v1 (docs.wipayfinancial.com, read Nov 2026):
 *   POST {base}/plugins/payments/request   (form fields, Accept: application/json → { url, message, transaction_id })
 *   base: live https://tt.wipayfinancial.com · sandbox https://ttsb.wipayfinancial.com
 *   The customer pays on WiPay's hosted page, then is redirected (GET) to response_url with
 *   status, transaction_id, order_id, total, hash (success only), message, date, currency, card, data.
 *   hash = md5(transaction_id + original_total(2 dp, as sent) + api_key). The request itself is unauthenticated,
 *   so this hash check is the security control. Sandbox: account_number 1234567890, API key 123.
 */
export const WIPAY_SANDBOX = { accountNumber: "1234567890", apiKey: "123" } as const;

export type WipayConfig = {
  environment: "sandbox" | "live";
  accountNumber: string;
  apiKey: string;
  baseUrl: string;
  feeStructure: "customer_pay" | "merchant_absorb" | "split";
};

export function wipayConfig(env: Record<string, string | undefined>, feeStructure?: string): WipayConfig {
  const environment = env.WIPAY_ENVIRONMENT === "live" ? "live" : "sandbox";
  const accountNumber = env.WIPAY_ACCOUNT_NUMBER || (environment === "sandbox" ? WIPAY_SANDBOX.accountNumber : "");
  const apiKey = env.WIPAY_API_KEY || (environment === "sandbox" ? WIPAY_SANDBOX.apiKey : "");
  if (!accountNumber || !apiKey) throw new Error("WiPay live mode needs WIPAY_ACCOUNT_NUMBER and WIPAY_API_KEY.");
  const fs = feeStructure === "merchant_absorb" || feeStructure === "split" ? feeStructure : "customer_pay";
  const baseUrl = (env.WIPAY_BASE_URL || (environment === "live" ? "https://tt.wipayfinancial.com" : "https://ttsb.wipayfinancial.com")).replace(/\/$/, "");
  return { environment, accountNumber, apiKey, baseUrl, feeStructure: fs };
}

/** Cents → "1234.50" — exactly what we send and later hash. */
export function formatTotal(cents: number) {
  if (!Number.isInteger(cents) || cents <= 0) throw new Error("Invoice total must be positive.");
  return (cents / 100).toFixed(2);
}

/** Alphanumeric/-/_; must not start or end with - or _ ; WiPay recommends ≤ 16 chars. */
export function orderIdFor(invoiceNumber: string) {
  const base = invoiceNumber.replace(/[^A-Za-z0-9]/g, "").slice(-10) || "INV";
  return `${base}-${randomBytes(3).toString("hex")}`;
}

export function buildRequest(cfg: WipayConfig, input: { orderId: string; totalCents: number; currency: "TTD" | "USD"; responseUrl: string; invoiceId: string; email?: string | null; name?: string | null }) {
  const fields: Record<string, string> = {
    account_number: cfg.accountNumber,
    country_code: "TT",
    currency: input.currency,
    environment: cfg.environment,
    fee_structure: cfg.feeStructure,
    method: "credit_card_co",
    order_id: input.orderId,
    origin: "AgencyOS",
    response_url: input.responseUrl,
    total: formatTotal(input.totalCents),
    data: JSON.stringify({ invoice_id: input.invoiceId }),
    version: "1.0.0",
  };
  if (input.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email) && input.email.length <= 50) fields.email = input.email;
  const [fname, ...rest] = (input.name ?? "").trim().split(/\s+/);
  if (fname) fields.fname = fname.slice(0, 30);
  if (fname && rest.length) fields.lname = rest.join(" ").slice(0, 30);
  return { url: `${cfg.baseUrl}/plugins/payments/request`, fields };
}

export function expectedHash(transactionId: string, totalSent: string, apiKey: string) {
  return createHash("md5").update(`${transactionId}${totalSent}${apiKey}`).digest("hex");
}

export type WipayVerdict =
  | { ok: true; transactionId: string }
  | { ok: false; status: "failed" | "error" | "rejected"; reason: string; transactionId: string | null };

/**
 * Decide what a response_url redirect means. `attempt` is our stored request (order id + exact total sent).
 * Only `ok: true` may mark an invoice paid.
 */
export function verifyResponse(q: Record<string, string | undefined>, attempt: { orderId: string; totalSent: string }, apiKey: string): WipayVerdict {
  const tx = q.transaction_id ?? null;
  if (q.order_id !== attempt.orderId) return { ok: false, status: "rejected", reason: "order_id doesn't match", transactionId: tx };
  if (q.status !== "success") return { ok: false, status: q.status === "failed" ? "failed" : "error", reason: q.message || q.reasonDescription || `status=${q.status ?? "missing"}`, transactionId: tx };
  if (!tx || !q.hash) return { ok: false, status: "rejected", reason: "missing transaction_id or hash", transactionId: tx };
  // Transaction IDs embed the order id: [SB-]<n>-<user>-<order_id>-<datetime>
  if (!tx.includes(`-${attempt.orderId}-`)) return { ok: false, status: "rejected", reason: "transaction_id doesn't belong to this order", transactionId: tx };
  const want = Buffer.from(expectedHash(tx, attempt.totalSent, apiKey));
  const got = Buffer.from(q.hash.toLowerCase());
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, status: "rejected", reason: "hash mismatch", transactionId: tx };
  return { ok: true, transactionId: tx };
}
