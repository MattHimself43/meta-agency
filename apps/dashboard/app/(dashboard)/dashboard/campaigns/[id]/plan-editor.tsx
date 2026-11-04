"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Audience, Location, Placements, PlanAd, Schedule } from "@/lib/campaigns/plan";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { savePlanAction } from "../../deliver-actions";

const sel = "h-10 w-full rounded-xl border border-[var(--line)] bg-[rgba(8,16,31,0.6)] px-3 text-sm text-foreground";
type Creative = { id: string; hook: string | null; primaryText: string | null; headline: string | null; cta: string | null; format: "1:1" | "4:5" | "9:16"; status: string };

export function PlanEditor(p: {
  id: string;
  name: string;
  objective: string;
  audiences: Audience[];
  locations: Location[];
  placements: Placements;
  schedule: Schedule;
  ads: PlanAd[];
  restricted: boolean;
  specialConfirmed: boolean;
  specialLabel: string | null;
  notes: string | null;
  creatives: Creative[];
  locked: boolean;
  allLocations: string[];
  allPlacements: string[];
  objectives: Record<string, string>;
}) {
  const [audiences, setAudiences] = useState(p.audiences);
  const [locations, setLocations] = useState(p.locations);
  const [placements, setPlacements] = useState(p.placements);
  const [schedule, setSchedule] = useState(p.schedule);
  const [ads, setAds] = useState(p.ads);
  const upd = <T,>(list: T[], set: (v: T[]) => void, i: number, patch: Partial<T>) => set(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const approved = p.creatives.filter((c) => ["approved", "live", "starred", "client_review"].includes(c.status));

  return (
    <form action={savePlanAction} className="space-y-5">
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="audiences" value={JSON.stringify(audiences)} />
      <input type="hidden" name="locations" value={JSON.stringify(locations)} />
      <input type="hidden" name="placements" value={JSON.stringify(placements)} />
      <input type="hidden" name="schedule" value={JSON.stringify(schedule)} />
      <input type="hidden" name="ads" value={JSON.stringify(ads)} />
      <fieldset disabled={p.locked} className="space-y-5 disabled:opacity-60">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Campaign name"><Input name="name" defaultValue={p.name} /></Field>
          <Field label="Objective"><select name="objective" defaultValue={p.objective} className={sel}>{Object.entries(p.objectives).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Start"><Input type="date" value={schedule.start ?? ""} onChange={(e) => setSchedule({ ...schedule, start: e.target.value || null })} /></Field>
          <Field label="End (optional)"><Input type="date" value={schedule.end ?? ""} onChange={(e) => setSchedule({ ...schedule, end: e.target.value || null })} /></Field>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between"><p className="kicker">Audiences</p><Button type="button" size="xs" variant="ghost" onClick={() => setAudiences([...audiences, { name: "New audience", type: "broad", ageMin: p.restricted ? 18 : 25, ageMax: 65, genders: "all", interests: [] }])}><Plus /> Add</Button></div>
          {p.restricted ? <p className="text-xs text-amber-200">Special ad category: age 18–65+ and all genders are enforced when you save.</p> : null}
          {audiences.map((a, i) => (
            <div key={i} className="grid gap-2 rounded-2xl border border-[var(--line)] p-3 sm:grid-cols-6">
              <div className="sm:col-span-2"><Field label="Name"><Input value={a.name} onChange={(e) => upd(audiences, setAudiences, i, { name: e.target.value })} /></Field></div>
              <Field label="Type"><select className={sel} value={a.type} onChange={(e) => upd(audiences, setAudiences, i, { type: e.target.value as Audience["type"] })}>{["broad", "interests", "retargeting", "lookalike"].map((t) => <option key={t}>{t}</option>)}</select></Field>
              <Field label="Age from"><Input type="number" min={18} max={65} value={a.ageMin} onChange={(e) => upd(audiences, setAudiences, i, { ageMin: Number(e.target.value) })} /></Field>
              <Field label="to"><Input type="number" min={18} max={65} value={a.ageMax} onChange={(e) => upd(audiences, setAudiences, i, { ageMax: Number(e.target.value) })} /></Field>
              <Field label="Gender"><select className={sel} value={a.genders} onChange={(e) => upd(audiences, setAudiences, i, { genders: e.target.value as Audience["genders"] })}>{["all", "men", "women"].map((g) => <option key={g}>{g}</option>)}</select></Field>
              <div className="sm:col-span-5"><Field label="Interests (comma separated)"><Input value={a.interests.join(", ")} onChange={(e) => upd(audiences, setAudiences, i, { interests: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></Field></div>
              <div className="flex items-end"><Button type="button" size="xs" variant="ghost" onClick={() => setAudiences(audiences.filter((_, j) => j !== i))} disabled={audiences.length === 1}><Trash2 /></Button></div>
              <div className="sm:col-span-6"><Field label="Notes"><Input value={a.notes ?? ""} onChange={(e) => upd(audiences, setAudiences, i, { notes: e.target.value })} /></Field></div>
            </div>
          ))}
        </section>

        <section className="space-y-2">
          <p className="kicker">Locations (Trinidad &amp; Tobago)</p>
          <div className="flex flex-wrap gap-2">
            {p.allLocations.map((l) => {
              const on = locations.some((x) => x.name === l);
              return <button type="button" key={l} onClick={() => setLocations(on ? locations.filter((x) => x.name !== l) : [...locations, { name: l, radiusKm: l.includes("whole country") ? null : p.restricted ? 25 : 10 }])} className={`rounded-full px-3 py-1 text-xs ${on ? "btn-grad font-semibold" : "btn-ghost-line text-muted-foreground"}`}>{l}</button>;
            })}
          </div>
          {locations.filter((l) => l.radiusKm != null).map((l) => (
            <div key={l.name} className="flex items-center gap-2 text-xs text-[#c2d1ef]">{l.name} + <Input type="number" min={p.restricted ? 25 : 1} max={200} className="h-8 w-20" value={l.radiusKm ?? 10} onChange={(e) => setLocations(locations.map((x) => (x.name === l.name ? { ...x, radiusKm: Number(e.target.value) } : x)))} /> km</div>
          ))}
        </section>

        <section className="space-y-2">
          <p className="kicker">Placements</p>
          <div className="flex gap-2 text-sm">
            {(["advantage", "manual"] as const).map((m) => <button type="button" key={m} onClick={() => setPlacements({ ...placements, mode: m })} className={`rounded-full px-4 py-1.5 ${placements.mode === m ? "btn-grad font-semibold" : "btn-ghost-line text-muted-foreground"}`}>{m === "advantage" ? "Advantage+ (recommended)" : "Manual"}</button>)}
          </div>
          {placements.mode === "manual" ? (
            <div className="flex flex-wrap gap-2">{p.allPlacements.map((pl) => { const on = placements.list.includes(pl); return <button type="button" key={pl} onClick={() => setPlacements({ ...placements, list: on ? placements.list.filter((x) => x !== pl) : [...placements.list, pl] })} className={`rounded-full px-3 py-1 text-xs ${on ? "btn-grad font-semibold" : "btn-ghost-line text-muted-foreground"}`}>{pl}</button>; })}</div>
          ) : null}
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="kicker">Ads</p>
            {approved.length ? (
              <select className={`${sel} h-8 w-auto max-w-xs text-xs`} value="" onChange={(e) => { const c = approved.find((x) => x.id === e.target.value); if (c) setAds([...ads, { creativeId: c.id, name: c.hook ?? "Ad", format: c.format, primaryText: c.primaryText ?? "", headline: c.headline ?? "", cta: c.cta ?? "Send WhatsApp message", mediaNote: "" }]); }}>
                <option value="">+ Add from creatives…</option>
                {approved.map((c) => <option key={c.id} value={c.id}>[{c.status}] {c.hook}</option>)}
              </select>
            ) : null}
            <Button type="button" size="xs" variant="ghost" onClick={() => setAds([...ads, { creativeId: null, name: "New ad", format: "4:5", primaryText: "", headline: "", cta: "Send WhatsApp message", mediaNote: "" }])}><Plus /> Blank ad</Button>
          </div>
          {ads.map((a, i) => (
            <div key={i} className="space-y-2 rounded-2xl border border-[var(--line)] p-3">
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="sm:col-span-2"><Field label="Ad name"><Input value={a.name} onChange={(e) => upd(ads, setAds, i, { name: e.target.value })} /></Field></div>
                <Field label="Format"><select className={sel} value={a.format} onChange={(e) => upd(ads, setAds, i, { format: e.target.value as PlanAd["format"] })}>{["1:1", "4:5", "9:16"].map((f) => <option key={f}>{f}</option>)}</select></Field>
                <Field label="Button"><Input value={a.cta} onChange={(e) => upd(ads, setAds, i, { cta: e.target.value })} /></Field>
              </div>
              <Field label="Primary text"><Textarea rows={2} value={a.primaryText} onChange={(e) => upd(ads, setAds, i, { primaryText: e.target.value })} /></Field>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Headline"><Input value={a.headline} onChange={(e) => upd(ads, setAds, i, { headline: e.target.value })} /></Field>
                <Field label="Media"><Input value={a.mediaNote} placeholder="e.g. Tiida photo (Assets)" onChange={(e) => upd(ads, setAds, i, { mediaNote: e.target.value })} /></Field>
              </div>
              <Button type="button" size="xs" variant="ghost" onClick={() => setAds(ads.filter((_, j) => j !== i))}><Trash2 /> Remove</Button>
            </div>
          ))}
          {!ads.length ? <p className="text-sm text-muted-foreground">No ads yet. Approve creatives in the Creative studio, then add them here.</p> : null}
        </section>

        {p.specialLabel ? (
          <label className="flex items-start gap-3 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-3 text-sm text-amber-100">
            <input type="checkbox" name="specialConfirmed" defaultChecked={p.specialConfirmed} className="mt-1 h-4 w-4 accent-[#5fe3ff]" />
            <span>I&apos;ve checked Meta&apos;s current policy: this campaign is declared as <b>{p.specialLabel}</b> and uses the restricted targeting.</span>
          </label>
        ) : null}
        <Field label="Notes"><Textarea name="notes" rows={2} defaultValue={p.notes ?? ""} /></Field>
        <Button type="submit">Save plan</Button>
      </fieldset>
      {p.locked ? <p className="text-xs text-muted-foreground">Live campaigns can&apos;t be edited — pause it first.</p> : null}
    </form>
  );
}
