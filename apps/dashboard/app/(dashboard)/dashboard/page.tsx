import Link from "next/link";
import { AlertTriangle, BellRing, CheckCheck } from "lucide-react";
import { requireStaffPage } from "@/lib/auth";
import { getKpis, getOpenAlerts, getPendingApprovals } from "@/lib/queries/home";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatUsdWithTtd } from "@/lib/money";
import { formatAst } from "@/lib/time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApprovalList } from "@/components/approvals/approval-list";
import { PageHeader } from "@/components/page-header";
import { MorningBrief } from "@/components/deliver/morning-brief";
import { approveAllLowRiskAction, resolveAlertAction } from "./actions";
import { TodaySends } from "@/components/sell/today-sends";
import { Flash } from "@/components/sell/flash";
import { todaysCalls } from "@/lib/queries/home";

export const metadata = { title: "Home" };

export default async function HomePage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const actor = await requireStaffPage();
  const sp = await searchParams;
  const [kpis, approvals, alerts, settings, calls] = await Promise.all([getKpis(), getPendingApprovals(), getOpenAlerts(), getSettings(), todaysCalls()]);
  const lowRisk = approvals.filter((a) => a.riskLevel === "low").length;

  const tiles = [
    { label: "Active clients", value: String(kpis.activeClients) },
    { label: "MRR", value: formatMoney(kpis.mrrTtdCents, "TTD", { decimals: false }) },
    { label: "Pipeline", value: formatMoney(kpis.pipelineTtdCents, "TTD", { decimals: false }) },
    { label: "Contacted this week", value: String(kpis.contactedThisWeek) },
    { label: "Reply rate", value: kpis.replyRate == null ? "—" : `${kpis.replyRate}%` },
    { label: "Ad spend this month", value: formatMoney(kpis.spendMtdUsdCents, "USD", { decimals: false }), hint: formatUsdWithTtd(kpis.spendMtdUsdCents, settings.exchangeRate).split(" ").slice(1).join(" ") },
    { label: "Overdue invoices", value: String(kpis.overdueInvoices), warn: kpis.overdueInvoices > 0 },
  ];

  return (
    <>
      <PageHeader kicker={formatAst(new Date(), "EEEE d MMMM")} title={`Morning, ${settings.ownerName}`} description={`${approvals.length} item${approvals.length === 1 ? "" : "s"} waiting for you. Nothing goes out until you approve it.`} />

      <Flash notice={sp.notice} error={sp.error} />
      <section aria-label="Key numbers" className="-mx-4 mb-6 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0 xl:grid-cols-7">
        {tiles.map((t) => (
          <div key={t.label} className="glass min-w-[9.5rem] snap-start rounded-[18px] p-4">
            <p className="text-xs text-muted-foreground">{t.label}</p>
            <p className={`mt-1.5 whitespace-nowrap font-display text-[24px] font-semibold leading-none tracking-[-0.03em] xl:text-[clamp(18px,1.45vw,26px)] ${t.warn ? "text-red-300" : "gradient-text"}`}>{t.value}</p>
            {t.hint ? <p className="mt-1 text-[11px] text-[#5f6f92]">{t.hint}</p> : null}
          </div>
        ))}
      </section>

      {alerts.length > 0 ? (
        <Card className="mb-6 !border-amber-300/25 !bg-[linear-gradient(160deg,rgba(251,191,36,0.08),rgba(18,32,64,0.42))]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-300" /> Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-amber-300/10">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-2">
                  <BellRing className={`mt-0.5 h-4 w-4 shrink-0 ${a.severity === "urgent" ? "text-red-300" : "text-amber-300"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{a.link ? <Link href={a.link} className="hover:underline">{a.title}</Link> : a.title}</p>
                    {a.body ? <p className="truncate text-xs text-muted-foreground">{a.body}</p> : null}
                  </div>
                  <form action={resolveAlertAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button size="xs" variant="ghost">Dismiss</Button>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="glass-strong lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Approval queue</CardTitle>
              <CardDescription>Highest risk first. Nothing goes out until you approve it.</CardDescription>
            </div>
            {lowRisk > 0 ? (
              <form action={approveAllLowRiskAction}>
                <Button size="sm" variant="secondary">
                  <CheckCheck /> Approve all low risk ({lowRisk})
                </Button>
              </form>
            ) : null}
          </CardHeader>
          <CardContent>
            <ApprovalList items={approvals.slice(0, 15)} role={actor.role} />
            {approvals.length > 15 ? (
              <Link href="/dashboard/approvals" className="mt-2 block text-sm text-brand-cyan hover:underline">
                See all {approvals.length}
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card className="glass-strong">
            <CardHeader>
              <CardTitle>Today&apos;s WhatsApp sends</CardTitle>
              <CardDescription>Openers and due follow-ups, each with Open in WhatsApp and Mark sent.</CardDescription>
            </CardHeader>
            <CardContent>
              <TodaySends back="/dashboard" limit={6} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Morning brief</CardTitle>
              <CardDescription>Yesterday&apos;s spend, leads and cost per lead vs target, per client.</CardDescription>
            </CardHeader>
            <CardContent>
              <MorningBrief />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s calls</CardTitle>
            </CardHeader>
            <CardContent>
              {calls.length === 0 ? (
                <p className="text-sm text-muted-foreground">No calls today. Share <span className="font-mono text-xs">{process.env.APP_URL ?? ""}/book</span> to get some.</p>
              ) : (
                <ul className="space-y-3">
                  {calls.map((c) => (
                    <li key={c.id} className="flex items-start gap-3">
                      <span className="btn-grad shrink-0 rounded-full px-3 py-1 text-xs font-semibold">{formatAst(c.startsAt, "h:mm a")}</span>
                      <div className="min-w-0">
                        {c.leadId ? <Link href={`/dashboard/leads/${c.leadId}`} className="text-sm font-medium hover:text-brand-cyan">{c.businessName ?? c.name}</Link> : <p className="text-sm font-medium">{c.businessName ?? c.name}</p>}
                        <p className="text-xs text-[#5f6f92]">{c.name}{c.callBriefId && c.leadId ? <> · <Link href={`/dashboard/leads/${c.leadId}/docs/call_brief/${c.callBriefId}`} className="text-brand-cyan hover:underline">call brief</Link></> : " · brief being written"}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
