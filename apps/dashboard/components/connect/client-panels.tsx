import { and, desc, eq, gte } from "drizzle-orm";
import { Download, ShieldCheck, Sparkles, Users } from "lucide-react";
import { db, schema } from "@/lib/db";
import { metaMode } from "@/lib/meta/client";
import { generator } from "@/lib/creatives/generate";
import { monthToDate } from "@/lib/performance/service";
import { astDateString, formatAst } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { addSaleAction, generateVariantAction, pullInsightsAction, pullLeadsAction, updateMetaLeadAction, verifyAccessAction } from "@/app/(dashboard)/dashboard/connect-actions";

const sel = "h-9 rounded-xl border border-[var(--line)] bg-[rgba(8,16,31,0.6)] px-2 text-sm text-foreground";

/** Overview tab, API mode: verify access through Meta instead of ticking by hand. */
export async function MetaAccessPanel({ clientId, adAccountId, pageId, pixelId }: { clientId: string; adAccountId: string | null; pageId: string | null; pixelId: string | null }) {
  if ((await metaMode()) !== "api") return null;
  const [step] = await db.select().from(schema.onboardingSteps).where(and(eq(schema.onboardingSteps.clientId, clientId), eq(schema.onboardingSteps.stepKey, "access_check")));
  const ev = (step?.evidence ?? {}) as { via?: string; checkedAt?: string; adAccount?: { name?: string; currency?: string }; spendCap?: { set: boolean; usdCents?: number } };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand-cyan" /> Meta access check</CardTitle>
        <CardDescription>Reads the ad account, Pages and pixels the agency can reach. Ticks “Agency access verified” and, if Meta reports one, “Spending limit set”.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Ad account {adAccountId ?? "—"} · Page {pageId ?? "not found yet"} · Pixel {pixelId ?? "not found yet"}
          {ev.via === "meta_api" && ev.checkedAt ? ` · last checked ${formatAst(new Date(ev.checkedAt))}` : ""}
          {ev.spendCap ? ` · spending limit ${ev.spendCap.set ? `US$${((ev.spendCap.usdCents ?? 0) / 100).toFixed(2)}` : "not set in Meta"}` : ""}
        </p>
        <form action={verifyAccessAction}>
          <input type="hidden" name="clientId" value={clientId} />
          <Button size="sm" disabled={!adAccountId}>Check access via Meta API</Button>
        </form>
        {pixelId ? <PixelHealth clientId={clientId} /> : null}
      </CardContent>
    </Card>
  );
}

/** Performance tab, API mode. */
export async function PullInsightsButton({ clientId }: { clientId: string }) {
  if ((await metaMode()) !== "api") return null;
  return (
    <form action={pullInsightsAction} className="inline">
      <input type="hidden" name="clientId" value={clientId} />
      <Button size="sm" variant="secondary"><Download /> Pull last 28 days from Meta</Button>
    </form>
  );
}

/** Assets tab: Higgsfield variants (flag on) or the "generate externally and upload" note. */
export async function GeneratePanel({ clientId }: { clientId: string }) {
  const gen = await generator();
  const [photos, gens] = await Promise.all([
    db.select().from(schema.assets).where(and(eq(schema.assets.clientId, clientId), eq(schema.assets.type, "photo"))).orderBy(desc(schema.assets.createdAt)).limit(30),
    db.select().from(schema.creativeGenerations).where(eq(schema.creativeGenerations.clientId, clientId)).orderBy(desc(schema.creativeGenerations.createdAt)).limit(10),
  ]);
  if (!gen) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-cyan" /> Image &amp; video variants</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Higgsfield is off. Generate variants in your tool of choice from the client&apos;s own photos (1:1, 4:5, 9:16), then upload them above with the tag <code>generated</code>.</CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-cyan" /> Generate a variant (Higgsfield)</CardTitle>
        <CardDescription>From one of the client&apos;s own photos. The result is saved here as a creative asset tagged “generated”. Check it before it goes in any ad — it must still show the real stock.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {photos.length ? (
          <form action={generateVariantAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="clientId" value={clientId} />
            <Field label="Photo">
              <select name="assetId" className={`${sel} w-full`} required>
                {photos.map((p) => <option key={p.id} value={p.id}>{(p.tags as string[]).join(", ") || p.filePath.split("/").pop()}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Output"><select name="kind" className={`${sel} w-full`} defaultValue="video"><option value="video">Video</option><option value="image">Image</option></select></Field>
              <Field label="Format"><select name="format" className={`${sel} w-full`} defaultValue="9:16"><option>9:16</option><option>4:5</option><option>1:1</option></select></Field>
            </div>
            <Field label="Prompt (optional)" hint="Leave empty for a safe default that keeps the real product"><Textarea name="prompt" rows={2} /></Field>
            <div className="flex items-end"><Button size="sm">Generate</Button></div>
          </form>
        ) : <p className="text-sm text-muted-foreground">Upload a photo first.</p>}
        {gens.length ? (
          <ul className="space-y-1 text-sm">
            {gens.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2">
                <Badge variant={g.status === "completed" ? "low" : g.status === "failed" || g.status === "error" || g.status === "nsfw" ? "high" : "muted"}>{g.status}</Badge>
                <span className="text-muted-foreground">{g.format} · {g.model} · {formatAst(g.createdAt)}</span>
                {g.error ? <span className="text-red-300">{g.error}</span> : null}
                {g.outputAssetIds.length ? <span>{g.outputAssetIds.length} saved</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** v2 lead inbox: instant-form leads pulled from Meta. */
export async function LeadInbox({ clientId }: { clientId: string }) {
  const [mode, leads] = await Promise.all([metaMode(), db.select().from(schema.metaLeads).where(eq(schema.metaLeads.clientId, clientId)).orderBy(desc(schema.metaLeads.createdTime)).limit(100)]);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-brand-cyan" /> Lead inbox</CardTitle>
          {mode === "api" ? (
            <form action={pullLeadsAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <Button size="sm" variant="secondary"><Download /> Pull new leads</Button>
            </form>
          ) : null}
        </div>
        <CardDescription>{mode === "api" ? "Instant-form leads from Meta, pulled every 30 minutes by Inbox sync. Mark what happened so cost per sale stays honest." : "Needs the Meta API (flag on + token). Until then the client sees leads in Meta Business Suite."}</CardDescription>
      </CardHeader>
      <CardContent>
        {leads.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {leads.map((l) => (
              <li key={l.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{l.fields.full_name ?? l.fields.first_name ?? "Lead"} <span className="text-muted-foreground">· {l.fields.phone_number ?? l.fields.email ?? ""}</span></p>
                  <p className="text-xs text-muted-foreground">{l.formName ?? l.formId} · {l.adName ?? ""} · {l.createdTime ? formatAst(l.createdTime) : ""}</p>
                  <p className="mt-1 text-xs text-[#c2d1ef]">{Object.entries(l.fields).filter(([k]) => !["full_name", "first_name", "phone_number", "email"].includes(k)).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}</p>
                </div>
                <form action={updateMetaLeadAction} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="clientId" value={clientId} />
                  <select name="status" defaultValue={l.status} className={sel}>
                    {["new", "contacted", "qualified", "sold", "junk"].map((s) => <option key={s}>{s}</option>)}
                  </select>
                  <Button size="sm" variant="ghost">Save</Button>
                </form>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No leads yet.</p>}
      </CardContent>
    </Card>
  );
}

/** v2 cost per sale: the client tells you what sold; spend comes from Meta/CSV. */
export async function SalesPanel({ clientId }: { clientId: string }) {
  const month = `${astDateString().slice(0, 7)}-01`;
  const [sales, spend, settings] = await Promise.all([
    db.select().from(schema.clientSales).where(and(eq(schema.clientSales.clientId, clientId), gte(schema.clientSales.date, month))).orderBy(desc(schema.clientSales.date)),
    monthToDate(clientId),
    getSettings(),
  ]);
  const count = sales.reduce((s, r) => s + r.count, 0);
  const cps = count ? Math.round(spend / count) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost per sale (this month)</CardTitle>
        <CardDescription>Log sales the client says came from the ads. Spend US${(spend / 100).toFixed(2)} ÷ {count} sale(s){cps != null ? ` = US$${(cps / 100).toFixed(2)} (≈ ${formatMoney(Math.round(cps * Number(settings.exchangeRate)), "TTD")}) per sale` : ""}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form action={addSaleAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="clientId" value={clientId} />
          <Field label="Date"><Input name="date" type="date" defaultValue={astDateString()} className="w-40" /></Field>
          <Field label="How many"><Input name="count" type="number" min={1} max={100} defaultValue={1} className="w-24" /></Field>
          <Field label="Value (TT$, optional)"><Input name="value" inputMode="decimal" className="w-36" /></Field>
          <Field label="Note"><Input name="note" placeholder="e.g. 2019 Tiida, from WhatsApp ad" className="w-64" /></Field>
          <Button size="sm" variant="secondary">Add sale</Button>
        </form>
        {sales.length ? <ul className="text-sm text-muted-foreground">{sales.map((s) => <li key={s.id}>{s.date} · {s.count} sold{s.valueTtdCents ? ` · ${formatMoney(s.valueTtdCents, "TTD")}` : ""}{s.note ? ` · ${s.note}` : ""}</li>)}</ul> : null}
      </CardContent>
    </Card>
  );
}

/** v2 pixel check: has the client's pixel fired in the last 3 days? */
async function PixelHealth({ clientId }: { clientId: string }) {
  const { pixelHealth } = await import("@/lib/meta/service");
  let r: Awaited<ReturnType<typeof pixelHealth>>;
  try {
    r = await pixelHealth(clientId);
  } catch (e) {
    return <p className="text-xs text-muted-foreground">Pixel check unavailable: {e instanceof Error ? e.message : String(e)}</p>;
  }
  return (
    <p className={`text-xs ${r.ok ? "text-[#7cf5c4]" : "text-amber-200"}`}>
      Pixel {r.ok ? "is firing" : "needs attention"}{"lastFired" in r && r.lastFired ? ` · last fired ${formatAst(new Date(r.lastFired))}` : ""}{r.reason ? ` · ${r.reason}` : ""}
    </p>
  );
}
