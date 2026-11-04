import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { CheckCircle2, Circle, Download, ExternalLink, FileVideo, KeyRound, Megaphone, Plus, Sparkles, Upload } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import { clientContext, steps } from "@/lib/clients/onboarding";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatUsdWithTtd } from "@/lib/money";
import { formatAst, astDateString } from "@/lib/time";
import { waLink } from "@/lib/phone";
import { monthToDate, rowsFor, targetCpr } from "@/lib/performance/service";
import { shiftDay, snapshot, byAd } from "@/lib/performance/metrics";
import type { CampaignTemplate } from "@/lib/campaigns/plan";
import type { ReportContent } from "@/lib/reports/service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Notice, PageHeader } from "@/components/page-header";
import { GeneratePanel, LeadInbox, MetaAccessPanel, PullInsightsButton, SalesPanel } from "@/components/connect/client-panels";
import { Uploader } from "@/components/portal/uploader";
import { CreativeCard } from "@/components/creatives/creative-card";
import { cn } from "@/lib/utils";
import { createPlanAction, generateCopyAction, generateReportAction, importCsvAction, ownerStepAction, rotatePortalAction, staffIntakeAction, updateClientAction } from "../../deliver-actions";

const TABS = ["overview", "assets", "creatives", "campaigns", "performance", "leads", "reports", "billing", "details"] as const;
type Tab = (typeof TABS)[number];
const sel = "h-10 w-full rounded-xl border border-[var(--line)] bg-[rgba(8,16,31,0.6)] px-3 text-sm text-foreground";
const usd = (c: number | null | undefined) => (c == null ? "—" : `US$${(c / 100).toFixed(2)}`);

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; notice?: string; error?: string; portal?: string }> }) {
  const actor = await requireStaffPage();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [exists] = await db.select({ id: schema.clients.id }).from(schema.clients).where(eq(schema.clients.id, id));
  if (!exists) notFound();
  const ctx = await clientContext(id);
  const c = ctx.client;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "overview";
  const back = `/dashboard/clients/${id}?tab=${tab}`;
  const isOwner = actor.role === "owner";

  return (
    <>
      <PageHeader
        kicker={ctx.niche?.name ?? "Client"}
        title={c.name}
        description={[c.contactName, ctx.pkg ? `${ctx.pkg.name} · ${formatMoney(ctx.pkg.monthlyFeeCents, "TTD", { decimals: false })}/mo` : null, c.adAccountId].filter(Boolean).join(" · ")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={c.status === "active" ? "low" : c.status === "onboarding" ? "medium" : "muted"}>{c.status}</Badge>
            {c.whatsapp ? <Button asChild size="sm" variant="outline"><a href={waLink(c.whatsapp)} target="_blank" rel="noopener noreferrer">WhatsApp</a></Button> : null}
          </div>
        }
      />
      {sp.error ? <Notice tone="error">{sp.error}</Notice> : null}
      {sp.notice ? <Notice>{sp.notice === "saved" ? "Saved." : sp.notice}</Notice> : null}
      {sp.portal ? <Notice>New portal link (shown once — copy it now; the old link stopped working): <span className="break-all font-mono text-xs">{`${process.env.APP_URL ?? ""}/portal/${sp.portal}`}</span></Notice> : null}

      <nav className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 text-sm sm:mx-0 sm:flex-wrap sm:px-0">
        {TABS.map((t) => (
          <Link key={t} href={`/dashboard/clients/${id}?tab=${t}`} className={cn("shrink-0 rounded-full px-4 py-1.5 capitalize transition-all", tab === t ? "btn-grad font-semibold" : "btn-ghost-line text-muted-foreground hover:text-foreground")}>{t}</Link>
        ))}
      </nav>

      {tab === "overview" ? <Overview ctx={ctx} isOwner={isOwner} /> : null}
      {tab === "assets" ? <Assets clientId={id} /> : null}
      {tab === "creatives" ? <Creatives clientId={id} back={back} /> : null}
      {tab === "campaigns" ? <Campaigns ctx={ctx} /> : null}
      {tab === "performance" ? <Performance ctx={ctx} /> : null}
      {tab === "leads" ? <LeadInbox clientId={id} /> : null}
      {tab === "reports" ? <Reports clientId={id} /> : null}
      {tab === "billing" ? <Billing clientId={id} /> : null}
      {tab === "details" ? <Details ctx={ctx} /> : null}
    </>
  );
}

type Ctx = Awaited<ReturnType<typeof clientContext>>;

async function Overview({ ctx, isOwner }: { ctx: Ctx; isOwner: boolean }) {
  const c = ctx.client;
  const all = await steps(c.id);
  const [agreement] = await db.select().from(schema.agreements).where(eq(schema.agreements.clientId, c.id)).orderBy(desc(schema.agreements.createdAt)).limit(1);
  const acts = await db.select().from(schema.activities).where(eq(schema.activities.clientId, c.id)).orderBy(desc(schema.activities.occurredAt)).limit(15);
  return (
    <div className="grid gap-6 xl:grid-cols-5">
      <div className="space-y-6 xl:col-span-3">
        <Card className="glass-strong">
          <CardHeader><CardTitle>Onboarding</CardTitle><CardDescription>Client steps happen in their portal; the last two are yours.</CardDescription></CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {all.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--line)] p-3">
                  {s.status === "done" ? <CheckCircle2 className="h-5 w-5 text-[#7cf5c4]" /> : <Circle className="h-5 w-5 text-[#5f6f92]" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{s.label}{s.ownerOnly ? <Badge variant="default" className="ml-2">you</Badge> : null}</p>
                    <p className="text-xs text-[#5f6f92]">{s.status === "done" && s.completedAt ? `Done ${formatAst(s.completedAt, "d MMM, h:mm a")}` : "Waiting"}</p>
                  </div>
                  {s.stepKey === "agreement" && agreement?.signedPdfPath ? <Button asChild size="xs" variant="outline"><a href={`/api/files/${agreement.signedPdfPath}`}><Download /> Signed PDF</a></Button> : null}
                  {s.ownerOnly && s.status !== "done" && isOwner ? (
                    <form action={ownerStepAction} className="flex w-full flex-wrap items-center gap-3 border-t border-[var(--line)] pt-3 text-xs sm:w-auto sm:border-0 sm:pt-0">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="step" value={s.stepKey} />
                      {s.stepKey === "access_check" ? (
                        <>
                          <label className="flex items-center gap-1"><input type="checkbox" name="page" className="accent-[#5fe3ff]" /> Page</label>
                          <label className="flex items-center gap-1"><input type="checkbox" name="adAccount" className="accent-[#5fe3ff]" /> Ad account</label>
                          <label className="flex items-center gap-1"><input type="checkbox" name="pixel" className="accent-[#5fe3ff]" /> Pixel</label>
                        </>
                      ) : (
                        <span className="text-[#c2d1ef]">Checked in Billing &amp; payments → Account spending limit</span>
                      )}
                      <Button size="xs">Confirm</Button>
                    </form>
                  ) : null}
                  {s.status === "done" && isOwner ? (
                    <form action={ownerStepAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="step" value={s.stepKey} /><input type="hidden" name="reopen" value="1" /><Button size="xs" variant="ghost">Reopen</Button></form>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4 text-sm">
              <KeyRound className="h-4 w-4 text-brand-cyan" />
              <span className="flex-1 text-muted-foreground">Portal link: links are stored hashed, so create a new one to share (the old one stops working).</span>
              {isOwner ? <form action={rotatePortalAction}><input type="hidden" name="id" value={c.id} /><Button size="sm" variant="secondary">New portal link</Button></form> : null}
            </div>
          </CardContent>
        </Card>
        <MetaAccessPanel clientId={c.id} adAccountId={c.adAccountId} pageId={c.pageId} pixelId={c.pixelId} />

        <Card>
          <CardHeader><CardTitle>Intake answers</CardTitle><CardDescription>The only facts ads may use. You can fill these in for the client.</CardDescription></CardHeader>
          <CardContent>
            <form action={staffIntakeAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={c.id} />
              {ctx.intakeSchema.map((f) => (
                <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
                  <Field label={f.label}>{f.type === "textarea" ? <Textarea name={`q:${f.key}`} rows={2} defaultValue={c.intake[f.key] ?? ""} /> : <Input name={`q:${f.key}`} defaultValue={c.intake[f.key] ?? ""} />}</Field>
                </div>
              ))}
              <div className="sm:col-span-2"><Button size="sm" type="submit">Save answers</Button></div>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card className="xl:col-span-2">
        <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {acts.map((a) => <li key={a.id}><p className="text-xs text-[#5f6f92]">{formatAst(a.occurredAt, "d MMM, h:mm a")}</p><p className="whitespace-pre-wrap text-sm text-[#c2d1ef]">{a.body}</p></li>)}
            {acts.length === 0 ? <li className="text-sm text-muted-foreground">Nothing yet.</li> : null}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

async function Assets({ clientId }: { clientId: string }) {
  const assets = await db.select().from(schema.assets).where(eq(schema.assets.clientId, clientId)).orderBy(desc(schema.assets.createdAt));
  return (
    <div className="space-y-6">
      <GeneratePanel clientId={clientId} />
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4 text-brand-cyan" /> Upload</CardTitle><CardDescription>Tag files (car model, property, lot) so they&apos;re easy to find when building ads.</CardDescription></CardHeader><CardContent><Uploader clientId={clientId} /></CardContent></Card>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {assets.map((a) => (
          <li key={a.id} className="glass overflow-hidden rounded-[18px]">
            <a href={`/api/files/${a.filePath}`} target="_blank" rel="noopener noreferrer" className="block aspect-square bg-[rgba(8,16,31,0.6)]">
              {a.mimeType?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/${a.filePath}`} alt={a.tags.join(", ")} className="h-full w-full object-cover" loading="lazy" />
              ) : <span className="grid h-full place-items-center text-muted-foreground"><FileVideo className="h-8 w-8" /></span>}
            </a>
            <div className="p-2 text-xs"><p className="text-[#c2d1ef]">{a.type} · {a.uploadedVia}</p><p className="truncate text-[#5f6f92]">{a.tags.join(", ") || "no tags"}</p></div>
          </li>
        ))}
      </ul>
      {assets.length === 0 ? <p className="text-sm text-muted-foreground">No files yet — the client uploads them in the portal, or you can upload here.</p> : null}
    </div>
  );
}

async function Creatives({ clientId, back }: { clientId: string; back: string }) {
  const [items, assets, plans] = await Promise.all([
    db.select().from(schema.creatives).where(eq(schema.creatives.clientId, clientId)).orderBy(desc(schema.creatives.createdAt)),
    db.select().from(schema.assets).where(eq(schema.assets.clientId, clientId)),
    db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.clientId, clientId)),
  ]);
  const assetOpts = assets.filter((a) => a.mimeType?.startsWith("image/") || a.mimeType?.startsWith("video/")).map((a) => ({ path: a.filePath, label: `${a.type}: ${a.tags.join(", ") || a.filePath.split("/").at(-1)}` }));
  return (
    <div className="space-y-6">
      <Card className="glass-strong">
        <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-cyan" /> Write ad copy</CardTitle><CardDescription>Uses only the intake answers. Every number is checked against them.</CardDescription></CardHeader>
        <CardContent>
          <form action={generateCopyAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="clientId" value={clientId} />
            <input type="hidden" name="back" value={back} />
            <Field label="How many"><Input name="count" type="number" min={1} max={10} defaultValue={6} className="w-24" /></Field>
            <Field label="Format"><select name="format" className={sel} defaultValue="4:5">{["1:1", "4:5", "9:16"].map((f) => <option key={f}>{f}</option>)}</select></Field>
            <Field label="For campaign"><select name="campaignPlanId" className={sel}><option value="">Any</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Button type="submit">Generate</Button>
          </form>
          <p className="mt-3 text-xs text-[#5f6f92]">Image and video generation (Higgsfield) is off — make visuals elsewhere from the client&apos;s photos, upload them under Assets, then attach them to a creative.</p>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((c) => <CreativeCard key={c.id} c={c} back={back} assets={assetOpts} />)}</div>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">No creatives yet.</p> : null}
    </div>
  );
}

async function Campaigns({ ctx }: { ctx: Ctx }) {
  const plans = await db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.clientId, ctx.client.id)).orderBy(desc(schema.campaignPlans.createdAt));
  const templates = ((ctx.niche?.campaignTemplates as CampaignTemplate[]) ?? []) as CampaignTemplate[];
  return (
    <div className="space-y-6">
      <Card className="glass-strong">
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4 text-brand-cyan" /> New campaign plan</CardTitle></CardHeader>
        <CardContent>
          <form action={createPlanAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="clientId" value={ctx.client.id} />
            <Field label="Template"><select name="template" className={`${sel} min-w-[16rem]`}>{templates.map((t) => <option key={t.key} value={t.key}>{t.name}{t.specialAdCategory ? " (special ad category)" : ""}</option>)}</select></Field>
            <Button type="submit">Create plan</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <Table>
          <THead><TR><TH>Plan</TH><TH>Status</TH><TH>Budget</TH><TH className="hidden md:table-cell">Ads</TH></TR></THead>
          <TBody>
            {plans.map((p) => (
              <TR key={p.id}>
                <TD><Link href={`/dashboard/campaigns/${p.id}`} className="font-medium hover:text-brand-cyan"><Megaphone className="mr-1.5 inline h-3.5 w-3.5 text-brand-cyan" />{p.name}</Link>{p.specialAdCategory ? <Badge variant="medium" className="ml-2">{p.specialAdCategory === "HOUSING" ? "Housing" : "Credit"}</Badge> : null}</TD>
                <TD><Badge variant={p.status === "live" ? "low" : p.status === "draft" ? "muted" : "default"}>{p.status.replace("_", " ")}</Badge></TD>
                <TD className="text-sm">{usd(p.budgetUsdCents)}/{p.budgetType === "daily" ? "day" : "total"}</TD>
                <TD className="hidden md:table-cell text-sm">{(p.ads as unknown[]).length}</TD>
              </TR>
            ))}
            {plans.length === 0 ? <TR><TD colSpan={4} className="py-8 text-center text-muted-foreground">No plans yet.</TD></TR> : null}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

async function Performance({ ctx }: { ctx: Ctx }) {
  const c = ctx.client;
  const settings = await getSettings();
  const yesterday = shiftDay(astDateString(), -1);
  const rows = await rowsFor(c.id, shiftDay(yesterday, -29));
  const live = await db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.clientId, c.id));
  const daily = live.filter((p) => p.status === "live").reduce((s, p) => s + p.budgetUsdCents, 0) || (c.monthlyBudgetUsdCents ? Math.round(c.monthlyBudgetUsdCents / 30) : null);
  const snap = snapshot(rows, { yesterday, targetCpr: targetCpr(c, ctx.niche, rows), dailyBudgetCents: daily, live: live.some((p) => p.status === "live") });
  const mtd = await monthToDate(c.id);
  const ads = byAd(rows.filter((r) => r.date >= shiftDay(yesterday, -6))).sort((a, b) => b.spend - a.spend);
  const dayOfMonth = Number(astDateString().slice(8, 10));
  const planMonth = c.monthlyBudgetUsdCents ?? null;
  const pace = planMonth ? Math.round((mtd / (planMonth * (dayOfMonth / 30))) * 100) : null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2"><PullInsightsButton clientId={c.id} /></div>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { k: "Yesterday", v: usd(snap.yesterday.spend), s: `${snap.yesterday.results} results · ${usd(snap.yesterday.cpr)} each` },
          { k: "Last 7 days", v: usd(snap.last7.spend), s: `${snap.last7.results} results · ${usd(snap.last7.cpr)} each` },
          { k: "Target per result", v: usd(snap.targetCpr), s: snap.targetCpr && snap.last7.cpr ? (snap.last7.cpr <= snap.targetCpr ? "on target" : "above target") : "" },
          { k: "Month to date", v: usd(mtd), s: formatUsdWithTtd(mtd, settings.exchangeRate).split(" ").slice(1).join(" ") },
          { k: "Pacing", v: pace == null ? "—" : `${pace}%`, s: planMonth ? `of ${usd(planMonth)} plan` : "set a monthly budget" },
        ].map((t) => (
          <div key={t.k} className="glass rounded-[18px] p-4"><p className="text-xs text-muted-foreground">{t.k}</p><p className="gradient-text mt-1 font-display text-2xl font-semibold">{t.v}</p><p className="text-[11px] text-[#5f6f92]">{t.s}</p></div>
        ))}
      </section>
      {snap.flags.length ? <Card className="!border-amber-300/25"><CardContent className="space-y-1 pt-5 text-sm text-amber-200 sm:pt-6">{snap.flags.map((f) => <p key={f}>⚑ {f}</p>)}</CardContent></Card> : null}
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader><CardTitle>Ads — last 7 days</CardTitle></CardHeader>
          <Table>
            <THead><TR><TH>Ad</TH><TH>Spend</TH><TH>Results</TH><TH>Per result</TH><TH className="hidden sm:table-cell">CTR</TH></TR></THead>
            <TBody>
              {ads.map((a) => <TR key={a.adName}><TD className="text-sm">{a.adName}</TD><TD className="text-sm">{usd(a.spend)}</TD><TD className="text-sm">{a.results}</TD><TD className="text-sm">{usd(a.cpr)}</TD><TD className="hidden sm:table-cell text-sm">{a.ctr?.toFixed(2) ?? "—"}%</TD></TR>)}
              {ads.length === 0 ? <TR><TD colSpan={5} className="py-8 text-center text-muted-foreground">No results imported yet.</TD></TR> : null}
            </TBody>
          </Table>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Import from Ads Manager</CardTitle><CardDescription>Manual mode: Ads Manager → Reports → Breakdown by Day (and by Ad) → Export CSV. Re-importing a date range updates it.</CardDescription></CardHeader>
          <CardContent>
            <form action={importCsvAction} className="space-y-3" encType="multipart/form-data">
              <input type="hidden" name="clientId" value={c.id} />
              <input type="file" name="file" accept=".csv,text/csv" required className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-[rgba(46,107,255,0.2)] file:px-4 file:py-2 file:text-[#bcd3ff]" />
              <Button type="submit" size="sm">Import CSV</Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <SalesPanel clientId={c.id} />
    </div>
  );
}

async function Reports({ clientId }: { clientId: string }) {
  const reports = await db.select().from(schema.reports).where(eq(schema.reports.clientId, clientId)).orderBy(desc(schema.reports.periodStart));
  return (
    <div className="space-y-6">
      <Card className="glass-strong">
        <CardHeader><CardTitle>Make a report now</CardTitle><CardDescription>Routines do this every Monday (weekly) and on the 1st (monthly).</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(["weekly", "monthly"] as const).map((t) => <form key={t} action={generateReportAction}><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="type" value={t} /><Button size="sm" variant={t === "weekly" ? "default" : "outline"}>{t === "weekly" ? "Last week's report" : "This month so far"}</Button></form>)}
        </CardContent>
      </Card>
      <Card>
        <Table>
          <THead><TR><TH>Report</TH><TH>Period</TH><TH>Status</TH><TH className="hidden md:table-cell">Headline</TH></TR></THead>
          <TBody>
            {reports.map((r) => <TR key={r.id}><TD><Link href={`/dashboard/reports/${r.id}`} className="font-medium hover:text-brand-cyan">{r.type === "weekly" ? "Weekly" : "Monthly"}</Link></TD><TD className="text-sm">{r.periodStart} → {r.periodEnd}</TD><TD><Badge variant={r.status === "approved" ? "low" : "muted"}>{r.status}</Badge></TD><TD className="hidden md:table-cell max-w-md truncate text-sm text-[#c2d1ef]">{(r.content as ReportContent).headline}</TD></TR>)}
            {reports.length === 0 ? <TR><TD colSpan={4} className="py-8 text-center text-muted-foreground">No reports yet.</TD></TR> : null}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

async function Billing({ clientId }: { clientId: string }) {
  const invs = await db.select().from(schema.invoices).where(eq(schema.invoices.clientId, clientId)).orderBy(desc(schema.invoices.createdAt));
  return (
    <Card>
      <Table>
        <THead><TR><TH>Invoice</TH><TH>Kind</TH><TH>Total</TH><TH>Status</TH><TH className="hidden md:table-cell">Due</TH></TR></THead>
        <TBody>
          {invs.map((i) => <TR key={i.id}><TD><Link href={`/dashboard/billing/${i.id}`} className="font-medium hover:text-brand-cyan">{i.number ?? "Draft"}</Link></TD><TD className="text-sm">{i.kind} · {i.periodKey}</TD><TD className="text-sm">{formatMoney(i.totalCents, "TTD")}</TD><TD><Badge variant={i.status === "paid" ? "low" : i.status === "overdue" ? "high" : "muted"}>{i.status}</Badge></TD><TD className="hidden md:table-cell text-sm">{i.dueDate ?? "—"}</TD></TR>)}
          {invs.length === 0 ? <TR><TD colSpan={5} className="py-8 text-center text-muted-foreground">No invoices yet.</TD></TR> : null}
        </TBody>
      </Table>
    </Card>
  );
}

async function Details({ ctx }: { ctx: Ctx }) {
  const c = ctx.client;
  const pkgs = await db.select().from(schema.packages).orderBy(asc(schema.packages.sortOrder));
  const target = (c.kpiTargets as { cost_per_result_usd_cents?: number }).cost_per_result_usd_cents;
  return (
    <Card>
      <CardContent className="pt-5 sm:pt-6">
        <form action={updateClientAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="id" value={c.id} />
          <Field label="Name"><Input name="name" defaultValue={c.name} required /></Field>
          <Field label="Contact"><Input name="contactName" defaultValue={c.contactName ?? ""} /></Field>
          <Field label="WhatsApp"><Input name="whatsapp" defaultValue={c.whatsapp ?? ""} /></Field>
          <Field label="Email"><Input name="email" defaultValue={c.email ?? ""} /></Field>
          <Field label="Package"><select name="packageId" defaultValue={c.packageId ?? ""} className={sel}><option value="">None</option>{pkgs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Status"><select name="status" defaultValue={c.status} className={sel}>{["onboarding", "active", "paused", "churned"].map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Start date"><Input name="startDate" type="date" defaultValue={c.startDate ?? ""} /></Field>
          <Field label="Minimum term ends"><Input name="contractEnd" type="date" defaultValue={c.contractEnd ?? ""} /></Field>
          <Field label="Monthly ad budget (US$)" hint="Paid by the client to Meta"><Input name="monthlyBudget" type="number" step="1" defaultValue={(c.monthlyBudgetUsdCents ?? 0) / 100} /></Field>
          <Field label="Target cost per result (US$)" hint="Blank = niche default"><Input name="targetCpr" type="number" step="0.01" defaultValue={target ? target / 100 : ""} /></Field>
          <Field label="Ad account ID"><Input name="adAccountId" defaultValue={c.adAccountId ?? ""} /></Field>
          <Field label="Page URL"><Input name="pageUrl" defaultValue={c.pageUrl ?? ""} /></Field>
          <Field label="Pixel ID"><Input name="pixelId" defaultValue={c.pixelId ?? ""} /></Field>
          <div className="sm:col-span-2 lg:col-span-3"><Button type="submit">Save</Button>{c.pageUrl ? <Button asChild variant="ghost" size="sm" className="ml-2"><a href={c.pageUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /> Open Page</a></Button> : null}</div>
        </form>
      </CardContent>
    </Card>
  );
}
