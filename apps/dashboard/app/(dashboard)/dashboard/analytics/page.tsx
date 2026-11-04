import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatUsdWithTtd } from "@/lib/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  await requireStaffPage();
  const settings = await getSettings();
  const monthStart = new Date().toISOString().slice(0, 7) + "-01";
  const since90 = new Date(Date.now() - 90 * 86400_000);
  const [[spendAll], [spendMonth], byNiche, clients, revenue, funnel] = await Promise.all([
    db.select({ c: sql<number>`coalesce(sum(${schema.performanceDaily.spendUsdCents}),0)::bigint` }).from(schema.performanceDaily),
    db.select({ c: sql<number>`coalesce(sum(${schema.performanceDaily.spendUsdCents}),0)::bigint` }).from(schema.performanceDaily).where(gte(schema.performanceDaily.date, monthStart)),
    db.select({ niche: schema.niches.name, spend: sql<number>`coalesce(sum(${schema.performanceDaily.spendUsdCents}),0)::bigint`, results: sql<number>`coalesce(sum(${schema.performanceDaily.leads} + ${schema.performanceDaily.whatsappConversations}),0)::int` }).from(schema.performanceDaily).innerJoin(schema.clients, eq(schema.clients.id, schema.performanceDaily.clientId)).leftJoin(schema.niches, eq(schema.niches.id, schema.clients.nicheId)).groupBy(schema.niches.name),
    db.select({ status: schema.clients.status, n: sql<number>`count(*)::int` }).from(schema.clients).groupBy(schema.clients.status),
    db.select({ client: schema.clients.name, c: sql<number>`coalesce(sum(${schema.payments.amountCents}),0)::bigint` }).from(schema.payments).innerJoin(schema.invoices, eq(schema.invoices.id, schema.payments.invoiceId)).innerJoin(schema.clients, eq(schema.clients.id, schema.invoices.clientId)).groupBy(schema.clients.name),
    Promise.all([
      db.select({ n: sql<number>`count(distinct ${schema.activities.leadId})::int` }).from(schema.activities).where(and(eq(schema.activities.type, "message_sent"), gte(schema.activities.occurredAt, since90))),
      db.select({ n: sql<number>`count(distinct ${schema.activities.leadId})::int` }).from(schema.activities).where(and(eq(schema.activities.type, "reply"), gte(schema.activities.occurredAt, since90))),
      db.select({ n: sql<number>`count(distinct ${schema.bookings.leadId})::int` }).from(schema.bookings).where(gte(schema.bookings.createdAt, since90)),
      db.select({ n: sql<number>`count(*)::int` }).from(schema.clients).where(gte(schema.clients.createdAt, since90)),
    ]),
  ]);
  const statusN = Object.fromEntries(clients.map((c) => [c.status, c.n]));
  const everActive = (statusN.active ?? 0) + (statusN.paused ?? 0) + (statusN.churned ?? 0);
  const retention = everActive ? Math.round((((statusN.active ?? 0) + (statusN.paused ?? 0)) / everActive) * 100) : null;
  const [contacted, replied, calls, won] = funnel.map((f) => f[0]?.n ?? 0);
  const steps = [["Contacted", contacted], ["Replied", replied], ["Call booked", calls], ["Won", won]] as const;
  const max = Math.max(1, contacted ?? 0);

  return (
    <>
      <PageHeader kicker="Business" title="Analytics" description="Across all clients. Ad spend in US$ (TT$ at your exchange rate)." />
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="glass rounded-[18px] p-4"><p className="text-xs text-muted-foreground">Ad spend managed (all time)</p><p className="gradient-text mt-1 font-display text-2xl font-semibold">{formatMoney(Number(spendAll?.c ?? 0), "USD", { decimals: false })}</p><p className="text-[11px] text-[#5f6f92]">{formatUsdWithTtd(Number(spendAll?.c ?? 0), settings.exchangeRate).split(" ").slice(1).join(" ")}</p></div>
        <div className="glass rounded-[18px] p-4"><p className="text-xs text-muted-foreground">This month</p><p className="gradient-text mt-1 font-display text-2xl font-semibold">{formatMoney(Number(spendMonth?.c ?? 0), "USD", { decimals: false })}</p></div>
        <div className="glass rounded-[18px] p-4"><p className="text-xs text-muted-foreground">Client retention</p><p className="gradient-text mt-1 font-display text-2xl font-semibold">{retention == null ? "—" : `${retention}%`}</p><p className="text-[11px] text-[#5f6f92]">{statusN.active ?? 0} active · {statusN.churned ?? 0} churned</p></div>
        <div className="glass rounded-[18px] p-4"><p className="text-xs text-muted-foreground">Revenue per client (collected)</p><p className="gradient-text mt-1 font-display text-2xl font-semibold">{revenue.length ? formatMoney(Math.round(revenue.reduce((s, r) => s + Number(r.c), 0) / revenue.length), "TTD", { decimals: false }) : "—"}</p></div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Outreach funnel</CardTitle><CardDescription>Last 90 days, unique leads.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {steps.map(([k, v]) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-sm"><span>{k}</span><span className="text-[#c2d1ef]">{v}{contacted && k !== "Contacted" ? ` · ${Math.round(((v ?? 0) / contacted) * 100)}%` : ""}</span></div>
                <div className="h-2 rounded-full bg-[rgba(120,170,255,0.12)]"><div className="h-full rounded-full bg-[linear-gradient(100deg,#2e6bff,#5fe3ff)]" style={{ width: `${((v ?? 0) / max) * 100}%` }} /></div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Cost per result by niche</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {byNiche.map((n) => <div key={n.niche ?? "x"} className="flex justify-between text-sm"><span>{n.niche ?? "No niche"}</span><span className="text-[#c2d1ef]">{n.results ? `US$${(Number(n.spend) / n.results / 100).toFixed(2)}` : "—"} · {n.results} results</span></div>)}
            {byNiche.length === 0 ? <p className="text-sm text-muted-foreground">No results imported yet.</p> : null}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Revenue by client</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {revenue.map((r) => <div key={r.client} className="flex justify-between text-sm"><span>{r.client}</span><span className="text-[#c2d1ef]">{formatMoney(Number(r.c), "TTD", { decimals: false })}</span></div>)}
            {revenue.length === 0 ? <p className="text-sm text-muted-foreground">No payments recorded yet.</p> : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
