import { formatInTimeZone } from "date-fns-tz";
import { CalendarCheck, Clock, ShieldCheck, Sparkles } from "lucide-react";
import { availableSlots } from "@/lib/booking";
import { getSettings } from "@/lib/settings";
import { TZ } from "@/lib/time";
import { Ambient } from "@/components/ambient";
import { BookFlow, type Slot } from "@/components/book/book-flow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book a call", robots: { index: false, follow: false } };

export default async function BookPage({ searchParams }: { searchParams: Promise<{ booked?: string; error?: string }> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const agency = settings.agencyName.startsWith("[") ? "" : settings.agencyName;

  if (sp.booked && !Number.isNaN(Date.parse(sp.booked))) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <Ambient />
        <div className="glass-strong w-full max-w-md rounded-[22px] p-8 text-center animate-[fadeUp_.4s_ease]">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[linear-gradient(135deg,#2e6bff,#5fe3ff)]">
            <CalendarCheck className="h-7 w-7 text-[#04101f]" />
          </div>
          <p className="kicker mt-5 justify-center">You&apos;re booked</p>
          <h1 className="mt-2 font-display text-2xl font-semibold">See you {formatInTimeZone(new Date(sp.booked), TZ, "EEEE d MMMM 'at' h:mm a")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Trinidad time. {settings.ownerName} will WhatsApp you before the call to confirm. To change the time, just reply to that message.</p>
        </div>
      </main>
    );
  }

  const slots = await availableSlots();
  const slotsByDay: Record<string, Slot[]> = {};
  const dayLabels: Record<string, string> = {};
  for (const s of slots) {
    const k = formatInTimeZone(s, TZ, "yyyy-MM-dd");
    (slotsByDay[k] ??= []).push({ iso: s.toISOString(), time: formatInTimeZone(s, TZ, "h:mm a") });
    dayLabels[k] ??= formatInTimeZone(s, TZ, "EEEE d MMMM");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <Ambient />
      <p className="kicker">{agency || "Meta ads"} · Free strategy call</p>
      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">Book a 20-minute call with {settings.ownerName}</h1>
      <p className="mt-2 text-muted-foreground">We&apos;ll look at your Facebook and Instagram ads together and find the quickest wins. Pick a time below — it takes about 30 seconds.</p>

      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#c2d1ef]">
        <li className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-brand-cyan" /> 20 minutes</li>
        <li className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-brand-cyan" /> Real, specific ideas</li>
        <li className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-brand-cyan" /> No obligation</li>
      </ul>

      <BookFlow slotsByDay={slotsByDay} dayLabels={dayLabels} ownerName={settings.ownerName} error={sp.error} />
    </main>
  );
}
