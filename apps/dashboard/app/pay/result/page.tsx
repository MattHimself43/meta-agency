import { CheckCircle2, XCircle } from "lucide-react";
import { Ambient } from "@/components/ambient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment", robots: { index: false, follow: false } };

/** Display only: nothing here changes state (that happened, verified, in /api/payments/wipay/response). */
export default async function PayResult({ searchParams }: { searchParams: Promise<{ r?: string; inv?: string; m?: string }> }) {
  const { r, inv, m } = await searchParams;
  const ok = r === "paid" || r === "already_paid";
  const invoice = inv && /^[A-Za-z0-9-]{1,30}$/.test(inv) ? inv : null;
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <Ambient />
      {ok ? <CheckCircle2 className="mx-auto h-12 w-12 text-[#7cf5c4]" /> : <XCircle className="mx-auto h-12 w-12 text-[#ffb3b3]" />}
      <h1 className="mt-4 font-display text-2xl font-semibold">{ok ? "Payment received — thank you!" : "Payment not completed"}</h1>
      <p className="mt-2 text-muted-foreground">
        {ok ? `Invoice ${invoice ?? ""} is now marked paid. You can close this page.` : (m ?? "The payment didn't go through. You can try again from your invoice link, or pay by bank transfer.")}
      </p>
    </main>
  );
}
