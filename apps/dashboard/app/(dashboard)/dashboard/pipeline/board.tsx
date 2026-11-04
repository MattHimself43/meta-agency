"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ScoreBadge } from "@/components/sell/badges";
import { moveStageInline } from "../sell-actions";

export type Card = { id: string; name: string; stage: string; score: number | null; override: number | null; area: string | null; nextAction: string | null; value: number | null; dnc: boolean };
const STAGES: { key: string; label: string }[] = [
  { key: "new", label: "New" }, { key: "contacted", label: "Contacted" }, { key: "replied", label: "Replied" }, { key: "call_booked", label: "Call booked" },
  { key: "proposal_sent", label: "Proposal sent" }, { key: "won", label: "Won" }, { key: "lost", label: "Lost" }, { key: "nurture", label: "Nurture" },
];

export function Board({ cards }: { cards: Card[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [over, setOver] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [optimistic, move] = useOptimistic(cards, (state, { id, stage }: { id: string; stage: string }) => state.map((c) => (c.id === id ? { ...c, stage } : c)));

  function moveTo(id: string, stage: string) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    let reason: string | undefined;
    if (stage === "lost") {
      reason = window.prompt(`Why was ${card.name} lost?`)?.trim();
      if (!reason) return;
    }
    if (stage === "won" && !window.confirm(`Mark ${card.name} as Won? This creates the client, onboarding steps and the setup-fee invoice draft.`)) return;
    start(async () => {
      move({ id, stage });
      const r = await moveStageInline(id, stage as never, reason);
      if (!r.ok) setMessage({ tone: "error", text: r.error });
      else if (r.portalToken) setMessage({ tone: "ok", text: `${card.name} is now a client. Portal link (copy it now): ${window.location.origin}/portal/${r.portalToken}` });
      else setMessage(null);
      router.refresh();
    });
  }

  return (
    <>
      {message ? (
        <p className={cn("mb-4 break-all rounded-xl border px-3 py-2 text-sm", message.tone === "ok" ? "border-[rgba(60,220,160,0.25)] bg-[rgba(60,220,160,0.08)] text-[#7cf5c4]" : "border-red-400/30 bg-red-500/10 text-red-300")}>{message.text}</p>
      ) : null}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        {STAGES.map((s) => {
          const col = optimistic.filter((c) => c.stage === s.key);
          const value = col.reduce((sum, c) => sum + (c.value ?? 0), 0);
          return (
            <section
              key={s.key}
              aria-label={s.label}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(s.key);
              }}
              onDragLeave={() => setOver((o) => (o === s.key ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                moveTo(e.dataTransfer.getData("text/plain"), s.key);
              }}
              className={cn("glass flex w-[17rem] shrink-0 snap-start flex-col rounded-[22px] p-3 transition-colors", over === s.key && "border-brand-cyan/60 bg-[rgba(46,107,255,0.12)]")}
            >
              <header className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="font-display text-sm font-semibold">{s.label} <span className="text-[#5f6f92]">{col.length}</span></h2>
                {value ? <span className="text-[11px] text-[#5f6f92]">TT${Math.round(value / 100).toLocaleString()}/mo</span> : null}
              </header>
              <ul className="flex min-h-24 flex-col gap-2">
                {col.map((c) => (
                  <li
                    key={c.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                    className={cn("cursor-grab rounded-2xl border border-[var(--line)] bg-[rgba(8,16,31,0.7)] p-3 active:cursor-grabbing", c.dnc && "opacity-50")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/dashboard/leads/${c.id}`} className="text-sm font-medium leading-snug hover:text-brand-cyan">{c.name}</Link>
                      <ScoreBadge score={c.score} override={c.override} />
                    </div>
                    <p className="mt-1 text-xs text-[#5f6f92]">{[c.area, c.nextAction].filter(Boolean).join(" · ") || "—"}</p>
                    <label className="mt-2 block md:hidden">
                      <span className="sr-only">Move {c.name}</span>
                      <select value={c.stage} onChange={(e) => moveTo(c.id, e.target.value)} className="h-8 w-full rounded-lg border border-[var(--line)] bg-[rgba(8,16,31,0.8)] px-2 text-xs">
                        {STAGES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
