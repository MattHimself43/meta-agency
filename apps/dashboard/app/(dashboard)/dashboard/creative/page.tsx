import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Sparkles } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import { isEnabled } from "@/lib/settings";
import { aiAvailable } from "@/lib/ai/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Notice, PageHeader } from "@/components/page-header";
import { CreativeCard } from "@/components/creatives/creative-card";
import { cn } from "@/lib/utils";
import { generateCopyAction } from "../deliver-actions";

export const metadata = { title: "Creative studio" };
const FILTERS = [
  { key: "all", label: "All", statuses: null },
  { key: "todo", label: "To pick", statuses: ["draft", "starred"] },
  { key: "client", label: "With client", statuses: ["client_review", "rejected"] },
  { key: "ready", label: "Approved", statuses: ["approved", "live"] },
  { key: "tired", label: "Fatigued", statuses: ["fatigued"] },
] as const;
const sel = "h-10 w-full rounded-xl border border-[var(--line)] bg-[rgba(8,16,31,0.6)] px-3 text-sm text-foreground";

export default async function CreativeStudio({ searchParams }: { searchParams: Promise<{ f?: string; client?: string; notice?: string; error?: string }> }) {
  await requireStaffPage();
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.key === sp.f) ?? FILTERS[1];
  const clients = await db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).where(inArray(schema.clients.status, ["onboarding", "active", "paused"])).orderBy(asc(schema.clients.name));
  const clientId = clients.find((c) => c.id === sp.client)?.id;
  const conds = [filter.statuses ? inArray(schema.creatives.status, [...filter.statuses]) : undefined, clientId ? eq(schema.creatives.clientId, clientId) : undefined].filter(Boolean);
  const rows = await db.select({ c: schema.creatives, client: schema.clients.name }).from(schema.creatives).innerJoin(schema.clients, eq(schema.clients.id, schema.creatives.clientId)).where(conds.length ? and(...(conds as never[])) : undefined).orderBy(desc(schema.creatives.createdAt)).limit(120);
  const higgsfield = await isEnabled("higgsfield");
  const back = `/dashboard/creative?f=${filter.key}${clientId ? `&client=${clientId}` : ""}`;

  return (
    <>
      <PageHeader kicker="Deliver" title="Creative studio" description="Star the winners, send them to the client, and only approved, fact-checked ads go into campaigns." />
      {sp.error ? <Notice tone="error">{sp.error}</Notice> : null}
      {sp.notice ? <Notice>{sp.notice === "saved" ? "Saved." : sp.notice}</Notice> : null}
      <Card className="glass-strong mb-6">
        <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-cyan" /> Write ad copy</CardTitle><CardDescription>{aiAvailable() ? "Claude writes 5–10 hooks, texts and headlines from the client's intake answers." : "Template copy from the client's intake answers (add an API key for Claude)."} Every price and term is checked against the intake.</CardDescription></CardHeader>
        <CardContent>
          <form action={generateCopyAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="back" value={back} />
            <Field label="Client"><select name="clientId" className={`${sel} min-w-[14rem]`} defaultValue={clientId}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="How many"><Input name="count" type="number" min={1} max={10} defaultValue={6} className="w-24" /></Field>
            <Field label="Format"><select name="format" className={sel} defaultValue="4:5">{["1:1", "4:5", "9:16"].map((f) => <option key={f}>{f}</option>)}</select></Field>
            <Button type="submit" disabled={!clients.length}>Generate</Button>
          </form>
          <p className="mt-3 text-xs text-[#5f6f92]">{higgsfield ? "Higgsfield image/video generation arrives in Phase 3." : "Image & video: make variants elsewhere (Canva, CapCut…) from the client's own photos in 1:1, 4:5 and 9:16, upload them to the client's Assets, then attach them to a creative."}</p>
        </CardContent>
      </Card>
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {FILTERS.map((f) => <Link key={f.key} href={`/dashboard/creative?f=${f.key}${clientId ? `&client=${clientId}` : ""}`} className={cn("rounded-full px-4 py-1.5", filter.key === f.key ? "btn-grad font-semibold" : "btn-ghost-line text-muted-foreground hover:text-foreground")}>{f.label}</Link>)}
        {clientId ? <Link href={`/dashboard/creative?f=${filter.key}`} className="text-xs text-muted-foreground hover:text-brand-cyan">× all clients</Link> : null}
      </nav>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map(({ c, client }) => <CreativeCard key={c.id} c={c} back={back} clientName={client} />)}</div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nothing here.</p> : null}
    </>
  );
}
