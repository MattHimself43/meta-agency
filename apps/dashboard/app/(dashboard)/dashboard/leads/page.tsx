import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Download, Plus, Search, Sparkles, Upload, X } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import { listLeads, type LeadFilters } from "@/lib/queries/leads";
import { aiAvailable } from "@/lib/ai/client";
import { TT_AREAS } from "@/lib/leads/research";
import { formatTtPhone } from "@/lib/phone";
import { formatAst } from "@/lib/time";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Flash } from "@/components/sell/flash";
import { ScoreBadge, StageBadge } from "@/components/sell/badges";
import { bulkLeadsAction, createLeadAction, deleteViewAction, researchAction, saveViewAction } from "../sell-actions";

export const metadata = { title: "Leads" };

const select = "h-10 rounded-xl border border-[var(--line)] bg-[rgba(8,16,31,0.6)] px-3 text-sm text-foreground";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<LeadFilters & { notice?: string; error?: string }> }) {
  await requireStaffPage();
  const sp = await searchParams;
  const filters: LeadFilters = { q: sp.q, niche: sp.niche, stage: sp.stage, area: sp.area, minScore: sp.minScore, ads: sp.ads, sort: sp.sort };
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const [rows, niches, views] = await Promise.all([
    listLeads(filters),
    db.select().from(schema.niches).orderBy(asc(schema.niches.name)),
    db.select().from(schema.savedViews).where(eq(schema.savedViews.page, "leads")).orderBy(asc(schema.savedViews.name)),
  ]);
  const ai = aiAvailable();

  return (
    <>
      <PageHeader
        kicker="Sell"
        title="Leads"
        description={`${rows.length}${rows.length === 300 ? "+" : ""} lead${rows.length === 1 ? "" : "s"}${query ? " matching filters" : ""}. Highest fit score first.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/leads/import">
                <Upload /> Import CSV
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/api/export/leads" download>
                <Download /> Export
              </a>
            </Button>
          </div>
        }
      />
      <Flash notice={sp.notice} error={sp.error} />

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <details className="glass group rounded-[22px] p-5 [&[open]]:pb-6">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-display font-semibold [&::-webkit-details-marker]:hidden">
            <Plus className="h-4 w-4 text-brand-cyan" /> Add a lead
          </summary>
          <form action={createLeadAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Business name"><Input name="businessName" required /></Field>
            <Field label="Niche">
              <select name="nicheId" className={select} defaultValue={niches[0]?.id}>
                {niches.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </Field>
            <Field label="Contact name"><Input name="contactName" /></Field>
            <Field label="Phone / WhatsApp" hint="Local or +1868 format"><Input name="phone" inputMode="tel" /></Field>
            <Field label="Area"><Input name="area" list="tt-areas" /></Field>
            <Field label="Facebook page"><Input name="facebookUrl" placeholder="facebook.com/…" /></Field>
            <div className="sm:col-span-2"><Field label="Notes"><Textarea name="notes" rows={2} /></Field></div>
            <div className="sm:col-span-2"><Button type="submit">Add lead</Button></div>
          </form>
        </details>

        <details className="glass rounded-[22px] p-5 [&[open]]:pb-6">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-display font-semibold [&::-webkit-details-marker]:hidden">
            <Sparkles className="h-4 w-4 text-brand-cyan" /> Research new leads
          </summary>
          {ai ? (
            <form action={researchAction} className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="Niche">
                <select name="nicheId" className={select}>{niches.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select>
              </Field>
              <Field label="Area"><Input name="area" list="tt-areas" defaultValue="Chaguanas" required /></Field>
              <Field label="How many"><Input name="count" type="number" min={1} max={25} defaultValue={10} /></Field>
              <p className="text-xs text-muted-foreground sm:col-span-3">Uses web search (Google Maps, Facebook/Instagram pages, websites, Ministry of Trade dealer list, Meta Ad Library). Duplicates are skipped; every fact keeps its source URL.</p>
              <div className="sm:col-span-3"><Button type="submit"><Search /> Start research</Button></div>
            </form>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Add <code>ANTHROPIC_API_KEY</code> to turn on AI lead research. Until then, add leads by hand or import a CSV.</p>
          )}
        </details>
      </div>
      <datalist id="tt-areas">{TT_AREAS.map((a) => <option key={a} value={a} />)}</datalist>

      <form method="get" className="glass mb-3 flex flex-wrap items-end gap-2 rounded-[22px] p-4">
        <div className="min-w-[10rem] flex-1"><Input name="q" defaultValue={sp.q} placeholder="Search name, contact, phone…" /></div>
        <select name="niche" defaultValue={sp.niche ?? ""} className={select}>
          <option value="">All niches</option>
          {niches.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <select name="stage" defaultValue={sp.stage ?? ""} className={select}>
          <option value="">All stages</option>
          {["new", "contacted", "replied", "call_booked", "proposal_sent", "won", "lost", "nurture"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <Input name="area" defaultValue={sp.area} placeholder="Area" className="w-32" list="tt-areas" />
        <select name="minScore" defaultValue={sp.minScore ?? ""} className={select}>
          <option value="">Any score</option>
          {[8, 7, 6, 5].map((s) => <option key={s} value={s}>{s}+</option>)}
        </select>
        <select name="ads" defaultValue={sp.ads ?? ""} className={select}>
          <option value="">Ads: any</option>
          <option value="yes">Runs Meta ads</option>
          <option value="no">No ads found</option>
        </select>
        <select name="sort" defaultValue={sp.sort ?? ""} className={select}>
          <option value="">Sort: score</option>
          <option value="due">Next action due</option>
          <option value="recent">Newest</option>
          <option value="name">Name</option>
        </select>
        <Button type="submit" size="sm">Filter</Button>
        {query ? <Button asChild variant="ghost" size="sm"><Link href="/dashboard/leads"><X /> Clear</Link></Button> : null}
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {views.map((v) => (
          <span key={v.id} className="inline-flex items-center">
            <Link href={`/dashboard/leads?${v.query}`} className={`rounded-l-full px-3 py-1 ${v.query === query ? "btn-grad font-semibold" : "btn-ghost-line text-muted-foreground hover:text-foreground"}`}>{v.name}</Link>
            <form action={deleteViewAction}>
              <input type="hidden" name="id" value={v.id} />
              <button className="btn-ghost-line rounded-r-full border-l-0 px-2 py-1 text-muted-foreground hover:text-red-300" aria-label={`Delete view ${v.name}`}>×</button>
            </form>
          </span>
        ))}
        {query ? (
          <form action={saveViewAction} className="flex items-center gap-1">
            <input type="hidden" name="query" value={query} />
            <Input name="name" placeholder="Name this view" className="h-8 w-40" required />
            <Button size="xs" variant="secondary">Save view</Button>
          </form>
        ) : null}
      </div>

      <form action={bulkLeadsAction} id="bulk">
        <input type="hidden" name="back" value={`/dashboard/leads${query ? `?${query}` : ""}`} />
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] p-3 text-sm sm:px-5">
            <span className="text-muted-foreground">With selected:</span>
            <select name="action" className={`${select} h-8`} defaultValue="opener">
              <option value="opener">Draft first message</option>
              <option value="stage">Move to stage…</option>
              <option value="dnc">Do not contact</option>
            </select>
            <select name="stage" className={`${select} h-8`} defaultValue="">
              <option value="">(stage)</option>
              {["contacted", "replied", "call_booked", "proposal_sent", "lost", "nurture"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
            <Button size="xs" type="submit">Apply</Button>
          </div>
          <CardContent className="px-0 pb-2 sm:px-0 sm:pb-2">
            <Table>
              <THead>
                <TR>
                  <TH className="w-8"><span className="sr-only">Select</span></TH>
                  <TH>Business</TH>
                  <TH>Score</TH>
                  <TH>Stage</TH>
                  <TH className="hidden md:table-cell">Area</TH>
                  <TH className="hidden lg:table-cell">Meta ads</TH>
                  <TH className="hidden md:table-cell">Phone</TH>
                  <TH className="hidden xl:table-cell">Next action</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map(({ lead: l, nicheName }) => (
                  <TR key={l.id} className={l.doNotContact ? "opacity-50" : ""}>
                    <TD><input type="checkbox" name="ids" value={l.id} className="h-4 w-4 accent-[#5fe3ff]" aria-label={`Select ${l.businessName}`} /></TD>
                    <TD>
                      <Link href={`/dashboard/leads/${l.id}`} className="font-medium hover:text-brand-cyan">{l.businessName}</Link>
                      <p className="text-xs text-[#5f6f92]">{nicheName ?? "No niche"}{l.contactName ? ` · ${l.contactName}` : ""}{l.doNotContact ? " · do not contact" : ""}</p>
                    </TD>
                    <TD><ScoreBadge score={l.fitScore} override={l.fitScoreOverride} /></TD>
                    <TD><StageBadge stage={l.stage} /></TD>
                    <TD className="hidden md:table-cell text-[#c2d1ef]">{l.area ?? "—"}</TD>
                    <TD className="hidden lg:table-cell text-xs text-[#c2d1ef]">{l.runsMetaAds == null ? "Unknown" : l.runsMetaAds ? `Yes${l.adCount ? ` (${l.adCount})` : ""}` : "No"}</TD>
                    <TD className="hidden md:table-cell whitespace-nowrap text-xs text-[#c2d1ef]">{formatTtPhone(l.phone)}</TD>
                    <TD className="hidden xl:table-cell text-xs text-[#c2d1ef]">{l.nextAction ? `${l.nextAction}${l.nextActionDue ? ` · ${formatAst(l.nextActionDue, "d MMM")}` : ""}` : "—"}</TD>
                  </TR>
                ))}
                {rows.length === 0 ? (
                  <TR><TD colSpan={8} className="py-10 text-center text-muted-foreground">No leads match. Add one, import a CSV or run research.</TD></TR>
                ) : null}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </form>
    </>
  );
}
