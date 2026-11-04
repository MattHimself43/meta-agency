import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { CreditCard, Landmark } from "lucide-react";
import { db, schema } from "@/lib/db";
import { clientIp } from "@/lib/rate-limit";
import { activeProvider, bankTransferText, resolvePayToken } from "@/lib/payments";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { Ambient } from "@/components/ambient";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay invoice", robots: { index: false, follow: false } };

async function payByCard(form: FormData) {
  "use server";
  const token = String(form.get("token") ?? "");
  const inv = await resolvePayToken(token, clientIp(await headers()));
  if (!inv) notFound();
  const provider = await activeProvider();
  if (!provider) redirect(`/pay/${token}?error=${encodeURIComponent("Card payments aren't switched on. Please use bank transfer.")}`);
  let url: string;
  try {
    url = (await provider.startCheckout(inv.id)).url;
  } catch (e) {
    redirect(`/pay/${token}?error=${encodeURIComponent(e instanceof Error ? e.message : "Couldn't start the payment.")}`);
  }
  redirect(url);
}

export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  let inv;
  try {
    inv = await resolvePayToken(token, clientIp(await headers()));
  } catch {
    return <p className="p-10 text-center text-muted-foreground">Too many requests — try again in a few minutes.</p>;
  }
  if (!inv?.number) notFound();
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, inv.clientId));
  const settings = await getSettings();
  const card = Boolean(await activeProvider());
  const bank = await bankTransferText();
  const paid = inv.status === "paid";

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:py-16">
      <Ambient />
      <p className="kicker">{settings.agencyName.startsWith("[") ? "Invoice" : settings.agencyName}</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em]">Invoice {inv.number}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{client?.name.replace(/^Demo — /, "")}</p>
      <div className="glass-strong mt-6 space-y-4 rounded-[22px] p-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Amount</p>
            <p className="font-display text-3xl font-semibold">{formatMoney(inv.totalCents, inv.currency)}</p>
          </div>
          <p className="text-right text-sm text-muted-foreground">{paid ? "Paid — thank you" : inv.dueDate ? `Due ${inv.dueDate}` : null}</p>
        </div>
        {error ? <p role="alert" className="rounded-xl border border-[rgba(255,120,120,0.3)] bg-[rgba(255,90,90,0.08)] p-3 text-sm text-[#ffb3b3]">{error}</p> : null}
        {paid ? null : (
          <>
            {card ? (
              <form action={payByCard}>
                <input type="hidden" name="token" value={token} />
                <Button type="submit" size="lg" className="w-full"><CreditCard /> Pay by card (WiPay)</Button>
                <p className="mt-2 text-xs text-muted-foreground">You&apos;ll enter your card on WiPay&apos;s secure page. We never see your card details.</p>
              </form>
            ) : null}
            <div className="rounded-2xl border border-[var(--line)] p-4 text-sm">
              <p className="flex items-center gap-2 font-medium"><Landmark className="h-4 w-4" /> {card ? "Or pay by bank transfer" : "Pay by bank transfer"}</p>
              <p className="mt-1 text-muted-foreground">{bank} Reference: {inv.number}.</p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
