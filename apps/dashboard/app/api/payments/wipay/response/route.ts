import { NextResponse, type NextRequest } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { handleWipayResponse } from "@/lib/payments/wipay";

export const dynamic = "force-dynamic";

/**
 * WiPay redirects the payer's browser here (GET) after checkout. Everything in the query string is untrusted:
 * handleWipayResponse re-computes the hash from our stored total before marking anything paid.
 */
export async function GET(req: NextRequest) {
  if (!(await rateLimit(`wipay:${clientIp(req.headers)}`, 30, 600)).ok) return new NextResponse("Too many requests", { status: 429 });
  const q = Object.fromEntries(req.nextUrl.searchParams.entries());
  let outcome;
  try {
    outcome = await handleWipayResponse(q);
  } catch (e) {
    console.error("wipay response", e instanceof Error ? e.message : e);
    outcome = { result: "unknown" as const, invoiceNumber: null, message: "Something went wrong recording your payment. Please contact us — you haven't been charged twice." };
  }
  const to = new URL("/pay/result", req.nextUrl.origin);
  to.searchParams.set("r", outcome.result);
  if (outcome.invoiceNumber) to.searchParams.set("inv", outcome.invoiceNumber);
  if (outcome.message) to.searchParams.set("m", outcome.message.slice(0, 200));
  return NextResponse.redirect(to, 303);
}
