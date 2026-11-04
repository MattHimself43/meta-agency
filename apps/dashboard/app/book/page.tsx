import { formatInTimeZone } from "date-fns-tz";
import { CalendarCheck } from "lucide-react";
import { availableSlots } from "@/lib/booking";
import { getSettings } from "@/lib/settings";
import { TZ } from "@/lib/time";
import { Ambient } from "@/components/ambient";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Notice } from "@/components/page-header";
import { bookAction } from "./actions";

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
        <div className="glass-strong w-full max-w-md rounded-[22px] p-8 text-center">
          <CalendarCheck className="mx-auto h-10 w-10 text-brand-cyan" />
          <p className="kicker mt-4 justify-center">Booked</p>
          <h1 className="mt-2 font-display text-2xl font-semibold">See you {formatInTimeZone(new Date(sp.booked), TZ, "EEEE d MMMM 'at' h:mm a")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Trinidad time. {settings.ownerName} will WhatsApp you before the call. To change the time, just reply to that message.</p>
        </div>
      </main>
    );
  }

  const slots = await availableSlots();
  const byDay = new Map<string, Date[]>();
  for (const s of slots) {
    const k = formatInTimeZone(s, TZ, "yyyy-MM-dd");
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <Ambient />
      <p className="kicker">{agency || "Meta ads"} · Free strategy call</p>
      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">Book a 20-minute call with {settings.ownerName}</h1>
      <p className="mt-2 text-muted-foreground">We&apos;ll look at your current Facebook and Instagram ads and where the quickest wins are. No obligation. All times are Trinidad time.</p>
      {sp.error ? <div className="mt-5"><Notice tone="error">{sp.error}</Notice></div> : null}

      <form action={bookAction} className="mt-8 space-y-6">
        <section className="glass rounded-[22px] p-5 sm:p-6">
          <p className="kicker mb-4">1 · Pick a time</p>
          {byDay.size === 0 ? <p className="text-sm text-muted-foreground">No open times in the next two weeks. Please WhatsApp us instead.</p> : null}
          <div className="space-y-5">
            {[...byDay.entries()].map(([day, list]) => (
              <fieldset key={day}>
                <legend className="mb-2 font-display text-sm font-semibold">{formatInTimeZone(list[0]!, TZ, "EEEE d MMMM")}</legend>
                <div className="flex flex-wrap gap-2">
                  {list.map((s) => (
                    <label key={s.toISOString()} className="cursor-pointer">
                      <input type="radio" name="slot" value={s.toISOString()} required className="peer sr-only" />
                      <span className="btn-ghost-line inline-block rounded-full px-4 py-2 text-sm transition-all peer-checked:border-transparent peer-checked:bg-[linear-gradient(100deg,#2e6bff,#4f9dff_45%,#5fe3ff)] peer-checked:font-semibold peer-checked:text-[#04101f] peer-focus-visible:ring-2 peer-focus-visible:ring-brand-cyan">
                        {formatInTimeZone(s, TZ, "h:mm a")}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </section>
        <section className="glass rounded-[22px] p-5 sm:p-6">
          <p className="kicker mb-4">2 · Your details</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Your name"><Input name="name" required autoComplete="name" /></Field>
            <Field label="Business name"><Input name="businessName" required autoComplete="organization" /></Field>
            <Field label="WhatsApp number"><Input name="phone" required inputMode="tel" autoComplete="tel" placeholder="868-…" /></Field>
            <Field label="Email (optional)"><Input name="email" type="email" autoComplete="email" /></Field>
            <div className="sm:col-span-2"><Field label="Anything we should know? (optional)"><Textarea name="notes" rows={2} /></Field></div>
            <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          </div>
        </section>
        <Button type="submit" size="lg" className="w-full sm:w-auto">Book my call</Button>
      </form>
    </main>
  );
}
