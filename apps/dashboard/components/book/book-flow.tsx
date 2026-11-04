"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Loader2, MessageCircle, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { bookAction } from "@/app/book/actions";

export type Slot = { iso: string; time: string };
export type BookFlowProps = {
  slotsByDay: Record<string, Slot[]>; // key: yyyy-MM-dd (AST)
  dayLabels: Record<string, string>; // key -> "Monday 8 December"
  ownerName: string;
  error?: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function monthCells(year: number, month: number) {
  const startDow = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: startDow }, () => null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function BookFlow({ slotsByDay, dayLabels, ownerName, error }: BookFlowProps) {
  const availableKeys = useMemo(() => Object.keys(slotsByDay).sort(), [slotsByDay]);
  const months = useMemo(() => {
    // Distinct [year, month] that contain availability, in order.
    const seen = new Set<string>();
    const out: { y: number; m: number }[] = [];
    for (const k of availableKeys) {
      const [y, m] = k.split("-").map(Number);
      const id = `${y}-${m}`;
      if (!seen.has(id)) {
        seen.add(id);
        out.push({ y: y!, m: m! - 1 });
      }
    }
    return out.length ? out : [{ y: new Date().getFullYear(), m: new Date().getMonth() }];
  }, [availableKeys]);

  const [monthIdx, setMonthIdx] = useState(0);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const step = slot ? 3 : day ? 2 : 1;

  const cur = months[Math.min(monthIdx, months.length - 1)]!;
  const cells = monthCells(cur.y, cur.m);
  const availSet = new Set(availableKeys);
  const times = day ? (slotsByDay[day] ?? []) : [];

  const Stepper = () => (
    <ol className="mb-7 flex items-center gap-2 text-xs sm:text-sm">
      {[
        { n: 1, label: "Pick a day", Icon: CalendarDays },
        { n: 2, label: "Pick a time", Icon: Clock },
        { n: 3, label: "Your details", Icon: User },
      ].map(({ n, label, Icon }, i) => {
        const done = step > n;
        const active = step === n;
        return (
          <li key={n} className="flex flex-1 items-center gap-2">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[13px] font-semibold transition-all ${done ? "border-transparent bg-[linear-gradient(100deg,#2e6bff,#5fe3ff)] text-[#04101f]" : active ? "border-brand-cyan text-brand-cyan" : "border-[var(--line-strong)] text-[#5f6f92]"}`}>
              {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </span>
            <span className={`hidden font-display font-medium sm:inline ${active || done ? "text-foreground" : "text-[#5f6f92]"}`}>{label}</span>
            {i < 2 ? <span className={`h-px flex-1 ${done ? "bg-brand-cyan/50" : "bg-[var(--line)]"}`} /> : null}
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className="mt-8">
      <Stepper />
      {error ? <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">{error}</div> : null}

      {/* Selection summary once something is chosen */}
      {day ? (
        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
          <button type="button" onClick={() => { setDay(null); setSlot(null); }} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[rgba(46,107,255,0.1)] px-3 py-1 text-[#bcd3ff] transition-colors hover:border-brand-cyan">
            <CalendarDays className="h-3.5 w-3.5" /> {dayLabels[day]} <span className="text-[#5f6f92]">· change</span>
          </button>
          {slot ? (
            <button type="button" onClick={() => setSlot(null)} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[rgba(46,107,255,0.1)] px-3 py-1 text-[#bcd3ff] transition-colors hover:border-brand-cyan">
              <Clock className="h-3.5 w-3.5" /> {times.find((t) => t.iso === slot)?.time} <span className="text-[#5f6f92]">· change</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {/* STEP 1 — calendar */}
      {step === 1 ? (
        <section key="cal" className="glass-strong animate-[fadeUp_.3s_ease] rounded-[22px] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <button type="button" aria-label="Previous month" disabled={monthIdx === 0} onClick={() => setMonthIdx((i) => Math.max(0, i - 1))} className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line-strong)] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="font-display text-lg font-semibold">{MONTHS[cur.m]} {cur.y}</p>
            <button type="button" aria-label="Next month" disabled={monthIdx >= months.length - 1} onClick={() => setMonthIdx((i) => Math.min(months.length - 1, i + 1))} className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line-strong)] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-[#5f6f92]">
            {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((d, i) => {
              if (d === null) return <span key={i} />;
              const k = keyOf(cur.y, cur.m, d);
              const open = availSet.has(k);
              const count = slotsByDay[k]?.length ?? 0;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!open}
                  onClick={() => { setDay(k); setSlot(null); }}
                  aria-label={open ? `${dayLabels[k]}, ${count} times open` : undefined}
                  className={`relative aspect-square rounded-xl text-sm transition-all ${
                    open
                      ? "bg-[rgba(46,107,255,0.12)] font-semibold text-foreground ring-1 ring-inset ring-[rgba(95,227,255,0.25)] hover:bg-[rgba(46,107,255,0.28)] hover:ring-brand-cyan"
                      : "text-[#3a475f]"
                  }`}
                >
                  {d}
                  {open ? <span className="absolute inset-x-0 bottom-1 mx-auto h-1 w-1 rounded-full bg-brand-cyan" /> : null}
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">{availableKeys.length ? "Tap a highlighted day. All times are Trinidad time." : "No open days in the next two weeks — please WhatsApp us instead."}</p>
        </section>
      ) : null}

      {/* STEP 2 — times */}
      {step === 2 ? (
        <section key="time" className="glass-strong animate-[fadeUp_.3s_ease] rounded-[22px] p-5 sm:p-6">
          <p className="kicker mb-1">{dayLabels[day!]}</p>
          <h2 className="mb-4 font-display text-lg font-semibold">What time suits you?</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {times.map((t) => (
              <button key={t.iso} type="button" onClick={() => setSlot(t.iso)} className="btn-ghost-line rounded-xl px-4 py-3 text-sm font-medium transition-all hover:border-brand-cyan hover:text-foreground">
                {t.time}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* STEP 3 — details */}
      {step === 3 ? (
        <form
          key="details"
          action={bookAction}
          onSubmit={() => setSubmitting(true)}
          className="glass-strong animate-[fadeUp_.3s_ease] space-y-4 rounded-[22px] p-5 sm:p-6"
        >
          <input type="hidden" name="slot" value={slot!} />
          <div>
            <p className="kicker mb-1">Last step</p>
            <h2 className="font-display text-lg font-semibold">Where should {ownerName.split(" ")[0] || "we"} reach you?</h2>
            <p className="mt-1 text-sm text-muted-foreground">We&apos;ll send a WhatsApp to confirm your {times.find((t) => t.iso === slot)?.time} call on {dayLabels[day!]}.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Your name"><Input name="name" required autoComplete="name" /></Field>
            <Field label="Business name"><Input name="businessName" required autoComplete="organization" /></Field>
            <Field label="WhatsApp number"><Input name="phone" required inputMode="tel" autoComplete="tel" placeholder="868-…" /></Field>
            <Field label="Email (optional)"><Input name="email" type="email" autoComplete="email" /></Field>
            <div className="sm:col-span-2"><Field label="Anything we should know? (optional)"><Textarea name="notes" rows={2} placeholder="What do you sell, and what's your ad budget like right now?" /></Field></div>
            <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          </div>
          <Button type="submit" size="lg" disabled={submitting} className="w-full">
            {submitting ? <><Loader2 className="animate-spin" /> Booking…</> : <><MessageCircle /> Confirm my call</>}
          </Button>
          <p className="text-center text-xs text-[#5f6f92]">No obligation. 20 minutes. We never share your details.</p>
        </form>
      ) : null}
    </div>
  );
}
