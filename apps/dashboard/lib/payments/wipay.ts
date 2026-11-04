import "server-only";
import type { PaymentProvider } from "./index";

/**
 * WiPay (Trinidad & Tobago) — Phase 3.
 * Deliberately not implemented yet: the spec requires reading WiPay's current API docs at build time
 * rather than guessing endpoints. Turning on the `wipay` flag before then shows a clear error instead
 * of creating a broken payment link.
 */
export const wipayProvider: PaymentProvider = {
  name: "wipay",
  async createPaymentLink() {
    throw new Error("WiPay isn't connected yet (Phase 3). Turn the WiPay flag off to use bank transfer.");
  },
};
