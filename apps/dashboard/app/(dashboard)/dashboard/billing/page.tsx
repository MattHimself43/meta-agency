import Link from "next/link";
import { ExpensesTab } from "@/components/connect/expenses";
import { asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireOwnerPage } from "@/lib/auth";
import { invoicesList, revenueSummary } from "@/lib/billing/service";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Notice, PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { runInvoicesNowAction, updatePackageAction } from "../deliver-actions";

export const metadata = { title: "Billing" };
const TONE = { draft: "muted", approved: "default", sent: "medium", paid: "low", overdue: "high", void: "muted" } as const;

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; notice?: string; error?: string }> }) {
  await requireOwnerPage();
  const sp = await searchParams;
  const tab = sp.tab === "packages" ? "packages" : sp.tab === "expenses" ? "expenses" : "invoices";
  const [rev, settings] = await Promise.all([revenueSummary(), getSettings()]);

  return (
    <>
      <PageHeader kicker="Business" title="Billing" description={`Invoices in TT$ for your fee only — clients pay Meta directly. ${settings.featureFlags.wipay ? "WiPay card payments are on — clients get a pay link." : "Payment by bank transfer; mark paid by hand."}`} actions={<form action={runInvoicesNowAction}><Button size="sm" variant="secondary">Draft this month&apos;s invoices</Button></form>} />
      {sp.error ? <Notice tone="error">{sp.error}</Notice> : null}
      {sp.notice ? <Notice>{sp.notice === "saved" ? "Saved." : sp.notice}</Notice> : null}
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["MRR", rev.mrr], ["Collected this month", rev.collectedThisMonth], ["Outstanding", rev.outstanding]].map(([k, v]) => (
          <div key={k as string} className="glass rounded-[18px] p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="gradient-text mt-1 font-display text-2xl font-semibold">{formatMoney(v as number, "TTD", { decimals: false })}</p></div>
        ))}
        <div className="glass rounded-[18px] p-4"><p className="text-xs text-muted-foreground">Collected by niche</p>{rev.byNiche.length ? rev.byNiche.map((n) => <p key={n.niche} className="text-sm text-[#c2d1ef]">{n.niche}: {formatMoney(n.cents, "TTD", { decimals: false })}</p>) : <p className="text-sm text-[#5f6f92]">No payments yet</p>}</div>
      </section>
      <nav className="mb-4 flex gap-2 text-sm">
        {["invoices", "expenses", "packages"].map((t) => <Link key={t} href={`/dashboard/billing?tab=${t}`} className={cn("rounded-full px-4 py-1.5 capitalize", tab === t ? "btn-grad font-semibold" : "btn-ghost-line text-muted-foreground")}>{t}</Link>)}
      </nav>
      {tab === "invoices" ? <Invoices status={sp.status} /> : tab === "expenses" ? <ExpensesTab collectedThisMonth={rev.collectedThisMonth} rate={Number(settings.exchangeRate)} /> : <Packages />}
    </>
  );
}

async function Invoices({ status }: { status?: string }) {
  const rows = await invoicesList(status);
  return (
    <Card>
      <div className="flex flex-wrap gap-2 border-b border-[var(--line)] p-3 text-xs sm:px-5">
        {["all", "draft", "approved", "sent", "overdue", "paid"].map((s) => <Link key={s} href={`/dashboard/billing?status=${s === "all" ? "" : s}`} className={cn("rounded-full px-3 py-1 capitalize", (status ?? "") === (s === "all" ? "" : s) ? "btn-grad font-semibold" : "btn-ghost-line text-muted-foreground")}>{s}</Link>)}
      </div>
      <Table>
        <THead><TR><TH>Invoice</TH><TH>Client</TH><TH>For</TH><TH>Total</TH><TH>Status</TH><TH className="hidden md:table-cell">Due</TH></TR></THead>
        <TBody>
          {rows.map(({ inv, client }) => (
            <TR key={inv.id}>
              <TD><Link href={`/dashboard/billing/${inv.id}`} className="font-medium hover:text-brand-cyan">{inv.number ?? "Draft"}</Link></TD>
              <TD className="text-sm">{client}</TD>
              <TD className="text-sm text-[#c2d1ef]">{inv.kind === "setup" ? "Setup fee" : inv.periodKey}</TD>
              <TD className="text-sm">{formatMoney(inv.totalCents, "TTD")}</TD>
              <TD><Badge variant={TONE[inv.status]}>{inv.status}</Badge></TD>
              <TD className="hidden md:table-cell text-sm">{inv.dueDate ?? "—"}</TD>
            </TR>
          ))}
          {rows.length === 0 ? <TR><TD colSpan={6} className="py-10 text-center text-muted-foreground">No invoices.</TD></TR> : null}
        </TBody>
      </Table>
    </Card>
  );
}

async function Packages() {
  const pkgs = await db.select().from(schema.packages).orderBy(asc(schema.packages.sortOrder));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {pkgs.map((p) => (
        <Card key={p.id} className={p.recommended ? "glass-strong" : ""}>
          <CardHeader><CardTitle>{p.name}</CardTitle><CardDescription>Prices in TT$. Changes apply to new invoices.</CardDescription></CardHeader>
          <CardContent>
            <form action={updatePackageAction} className="space-y-3">
              <input type="hidden" name="id" value={p.id} />
              <Field label="Name"><Input name="name" defaultValue={p.name} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Setup fee (TT$)"><Input name="setupFee" type="number" step="1" defaultValue={p.setupFeeCents / 100} /></Field>
                <Field label="Monthly (TT$)"><Input name="monthlyFee" type="number" step="1" defaultValue={p.monthlyFeeCents / 100} /></Field>
              </div>
              <Field label="Includes" hint="One per line"><Textarea name="includes" rows={4} defaultValue={p.includes.join("\n")} /></Field>
              <Field label="Recommended ad spend"><Input name="recommendedSpend" defaultValue={p.recommendedSpend ?? ""} /></Field>
              <Field label="Terms"><Textarea name="terms" rows={2} defaultValue={p.terms ?? ""} /></Field>
              <label className="flex items-center gap-2 text-sm"><Switch name="recommended" defaultChecked={p.recommended} /> Recommended</label>
              <label className="flex items-center gap-2 text-sm"><Switch name="active" defaultChecked={p.active} /> Active</label>
              <Button size="sm" type="submit">Save package</Button>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
