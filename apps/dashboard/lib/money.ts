export type Currency = "USD" | "TTD";

const PREFIX: Record<Currency, string> = { USD: "US$", TTD: "TT$" };

/** Format integer cents, e.g. formatMoney(250000, "TTD") -> "TT$2,500.00" */
export function formatMoney(cents: number | null | undefined, currency: Currency, opts: { decimals?: boolean } = {}): string {
  if (cents == null) return "—";
  const decimals = opts.decimals ?? true;
  const value = cents / 100;
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value).toLocaleString("en-TT", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
  return `${sign}${PREFIX[currency]}${abs}`;
}

/** Convert USD cents to TTD cents using a TTD-per-USD rate (default 6.80). */
export function usdToTtdCents(usdCents: number, rate: number | string = 6.8): number {
  return Math.round(usdCents * Number(rate));
}

export function ttdToUsdCents(ttdCents: number, rate: number | string = 6.8): number {
  return Math.round(ttdCents / Number(rate));
}

/** "US$120.00 (≈ TT$816.00)" */
export function formatUsdWithTtd(usdCents: number | null | undefined, rate: number | string): string {
  if (usdCents == null) return "—";
  return `${formatMoney(usdCents, "USD")} (≈ ${formatMoney(usdToTtdCents(usdCents, rate), "TTD")})`;
}

/** VAT in basis points, e.g. 1250 = 12.5 %. Rounds half up to the cent. */
export function vatCents(subtotalCents: number, rateBps: number): number {
  return Math.round((subtotalCents * rateBps) / 10000);
}
