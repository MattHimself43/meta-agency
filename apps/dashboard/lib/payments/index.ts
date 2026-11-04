import "server-only";
import { getSettings } from "@/lib/settings";

/**
 * How an invoice gets paid. Bank transfer is always available (Mark paid by hand).
 * WiPay lives behind the `wipay` feature flag and is implemented in Phase 3 from WiPay's current docs —
 * see lib/payments/wipay.ts. No WiPay endpoint is called until then.
 */
export type PaymentLink = { url: string; provider: string; reference: string };
export interface PaymentProvider {
  readonly name: string;
  createPaymentLink(invoice: { id: string; number: string; totalCents: number; currency: "TTD" | "USD"; clientName: string }): Promise<PaymentLink>;
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
