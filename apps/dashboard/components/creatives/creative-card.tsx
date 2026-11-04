import { AlertTriangle, ShieldCheck, Star } from "lucide-react";
import type { schema } from "@/lib/db";
import type { HonestyResult } from "@/lib/creatives/honesty";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { creativeStatusAction, editCreativeAction, overrideHonestyAction } from "@/app/(dashboard)/dashboard/deliver-actions";

type Creative = typeof schema.creatives.$inferSelect;
const STATUS_TONE: Record<string, "muted" | "default" | "medium" | "low" | "high"> = { draft: "muted", starred: "default", client_review: "medium", approved: "low", rejected: "high", live: "low", fatigued: "high" };
const STATUS_LABEL: Record<string, string> = { draft: "draft", starred: "starred", client_review: "with client", approved: "approved", rejected: "changes asked", live: "live", fatigued: "fatigued" };

/** One creative with its honesty result and the next allowed actions. */
export function CreativeCard({ c, back, clientName, assets }: { c: Creative; back: string; clientName?: string; assets?: { path: string; label: string }[] }) {
  const h = c.honestyCheck as HonestyResult | null;
  const blocked = h && !h.ok && !c.honestyOverrideReason;
  const act = (to: string, label: string, variant: "default" | "outline" | "secondary" | "ghost" = "outline", disabled = false) => (
    <form action={creativeStatusAction}>
      <input type="hidden" name="id" value={c.id} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="back" value={back} />
      <Button size="xs" variant={variant} disabled={disabled} title={disabled ? "Fix the honesty check first" : undefined}>{label}</Button>
    </form>
  );
  return (
    <article className="glass flex flex-col rounded-[22px] p-4">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge variant={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
        <Badge variant="muted">{c.format}</Badge>
        {h ? (
          h.ok ? <Badge variant="low"><ShieldCheck className="h-3 w-3" /> facts check out</Badge> : c.honestyOverrideReason ? <Badge variant="medium">override: {c.honestyOverrideReason.slice(0, 30)}</Badge> : <Badge variant="high"><AlertTriangle className="h-3 w-3" /> {h.mismatches.length} unverified</Badge>
        ) : null}
        {clientName ? <span className="ml-auto truncate text-[11px] text-[#5f6f92]">{clientName}</span> : null}
      </div>
      {c.mediaPath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/files/${c.mediaPath}`} alt="" className="mb-2 aspect-[4/5] w-full rounded-2xl object-cover" loading="lazy" />
      ) : null}
      <p className="font-display font-semibold leading-snug">{c.hook}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-[#c2d1ef]">{c.primaryText}</p>
      <p className="mt-2 text-xs text-[#5f6f92]">{c.headline} · {c.cta}</p>
      {blocked ? <p className="mt-2 rounded-xl border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-300">{h!.mismatches.map((m) => m.reason).join(" · ")}</p> : null}
      {c.clientComment ? <p className="mt-2 rounded-xl border border-amber-300/25 bg-amber-400/10 p-2 text-xs text-amber-200">Client: {c.clientComment}</p> : null}

      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
        {c.status === "draft" ? act("starred", "★ Star", "secondary") : null}
        {["draft", "starred", "rejected"].includes(c.status) ? act("client_review", "Send to client", "default", Boolean(blocked)) : null}
        {c.status === "client_review" ? act("approved", "Approve for client", "outline", Boolean(blocked)) : null}
        {c.status === "approved" ? act("live", "Mark live", "outline") : null}
        {c.status === "live" ? act("fatigued", "Mark fatigued", "ghost") : null}
        {c.status !== "rejected" && c.status !== "live" ? act("rejected", "Reject", "ghost") : null}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"><Star className="mr-1 inline h-3 w-3" />Edit copy / media</summary>
        <form action={editCreativeAction} className="mt-2 space-y-2">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="back" value={back} />
          <Field label="Hook"><Input name="hook" defaultValue={c.hook ?? ""} /></Field>
          <Field label="Primary text"><Textarea name="primaryText" rows={3} defaultValue={c.primaryText ?? ""} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Headline"><Input name="headline" defaultValue={c.headline ?? ""} /></Field>
            <Field label="Button"><Input name="cta" defaultValue={c.cta ?? ""} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Format">
              <select name="format" defaultValue={c.format} className="h-10 w-full rounded-xl border border-[var(--line)] bg-[rgba(8,16,31,0.6)] px-3 text-sm">{["1:1", "4:5", "9:16"].map((f) => <option key={f}>{f}</option>)}</select>
            </Field>
            <Field label="Media">
              <select name="mediaPath" defaultValue={c.mediaPath ?? ""} className="h-10 w-full rounded-xl border border-[var(--line)] bg-[rgba(8,16,31,0.6)] px-3 text-sm">
                <option value="">None</option>
                {(assets ?? []).map((a) => <option key={a.path} value={a.path}>{a.label}</option>)}
              </select>
            </Field>
          </div>
          <Button size="xs" type="submit" variant="secondary">Save — rechecks honesty</Button>
        </form>
        {blocked ? (
          <form action={overrideHonestyAction} className="mt-2 space-y-2">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="back" value={back} />
            <Input name="reason" placeholder="Override reason, e.g. client confirmed the offer on WhatsApp" required />
            <Button size="xs" type="submit" variant="destructive">Override honesty check</Button>
          </form>
        ) : null}
      </details>
    </article>
  );
}
