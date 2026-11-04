import { asc, gte, sql } from "drizzle-orm";
import { startOfMonth } from "date-fns";
import { Download } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireOwnerPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { APPROVAL_TYPES } from "@/lib/approvals/types";
import { FLAG_INFO } from "@/lib/flags";
import { formatMoney } from "@/lib/money";
import { EXPORTABLE_TABLES } from "@/lib/export";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Notice, PageHeader, SectionLabel } from "@/components/page-header";
import { updateFlagsAction, updateOperationsAction, updateProfileAction } from "../actions";
import type { FeatureFlags } from "@/lib/db/schema";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireOwnerPage();
  const saved = (await searchParams).saved;
  const s = await getSettings();
  const [packages, [aiCost]] = await Promise.all([
    db.select().from(schema.packages).orderBy(asc(schema.packages.sortOrder)),
    db
      .select({ micros: sql<number>`coalesce(sum(${schema.aiUsage.costUsdMicros}),0)::bigint`, calls: sql<number>`count(*)::int` })
      .from(schema.aiUsage)
      .where(gte(schema.aiUsage.createdAt, startOfMonth(new Date()))),
  ]);
  const banner = (key: string) => (saved === key ? <Notice>Saved.</Notice> : null);

  return (
    <>
      <PageHeader kicker="System" title="Settings" description="Everything about the business identity is editable — placeholders stay until registration." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Agency profile</CardTitle>
            <CardDescription>Shown on invoices, proposals and the client portal.</CardDescription>
          </CardHeader>
          <CardContent>
            {banner("profile")}
            <form action={updateProfileAction} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Agency name"><Input name="agencyName" defaultValue={s.agencyName} required /></Field>
                <Field label="Owner name"><Input name="ownerName" defaultValue={s.ownerName} required /></Field>
                <Field label="Owner email"><Input name="ownerEmail" type="email" defaultValue={s.ownerEmail ?? ""} /></Field>
                <Field label="Owner WhatsApp"><Input name="ownerWhatsapp" defaultValue={s.ownerWhatsapp ?? ""} placeholder="+1868…" /></Field>
                <Field label="Digest email" hint="Defaults to owner email"><Input name="digestEmail" type="email" defaultValue={s.digestEmail ?? ""} /></Field>
                <Field label="Registration no."><Input name="registrationNumber" defaultValue={s.registrationNumber} /></Field>
              </div>
              <Field label="Address (one line per row)"><Textarea name="address" rows={3} defaultValue={s.addressLines.join("\n")} /></Field>
              <SectionLabel>Bank transfer details</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Bank"><Input name="bank" defaultValue={s.bankDetails.bank} /></Field>
                <Field label="Branch"><Input name="branch" defaultValue={s.bankDetails.branch} /></Field>
                <Field label="Account name"><Input name="accountName" defaultValue={s.bankDetails.accountName} /></Field>
                <Field label="Account number"><Input name="accountNumber" defaultValue={s.bankDetails.accountNumber} /></Field>
                <Field label="Account type"><Input name="accountType" defaultValue={s.bankDetails.accountType} /></Field>
              </div>
              <SectionLabel>Invoicing (TTD)</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Prefix"><Input name="invoicePrefix" defaultValue={s.invoicePrefix} /></Field>
                <Field label="Next number" hint="Can only go up"><Input name="nextInvoiceNumber" type="number" min={s.nextInvoiceNumber} defaultValue={s.nextInvoiceNumber} /></Field>
                <Field label="Due in (days)"><Input name="invoiceDueDays" type="number" min={0} defaultValue={s.invoiceDueDays} /></Field>
                <Field label="VAT number"><Input name="vatNumber" defaultValue={s.vatNumber ?? ""} /></Field>
                <Field label="VAT rate %"><Input name="vatRate" type="number" step="0.01" defaultValue={s.vatRateBps / 100} /></Field>
              </div>
              <label className="flex items-center gap-3 text-sm"><Switch name="vatEnabled" defaultChecked={s.vatEnabled} /> Charge VAT</label>
              <label className="flex items-center gap-3 text-sm"><Switch name="foundingOfferEnabled" defaultChecked={s.foundingOfferEnabled} /> Founding-client offer (setup fee waived for first {s.foundingOfferSlots} clients)</label>
              <Button type="submit">Save profile</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Operations</CardTitle>
              <CardDescription>Timezone: {s.timezone} (AST, UTC−4). Ad spend in USD; fees in TTD.</CardDescription>
            </CardHeader>
            <CardContent>
              {banner("operations")}
              <form action={updateOperationsAction} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Exchange rate (TT$ per US$1)"><Input name="exchangeRate" type="number" step="0.0001" defaultValue={Number(s.exchangeRate)} /></Field>
                  <Field label="Budget change needing approval (US$/day)" hint="Plus any rise over 20% in 7 days">
                    <Input name="budgetChangeLimit" type="number" step="1" defaultValue={s.budgetChangeLimitCents / 100} />
                  </Field>
                </div>
                <SectionLabel>Daily send limits</SectionLabel>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="WhatsApp"><Input name="limitWhatsapp" type="number" defaultValue={s.sendLimits.whatsapp ?? 10} /></Field>
                  <Field label="Email"><Input name="limitEmail" type="number" defaultValue={s.sendLimits.email ?? 20} /></Field>
                  <Field label="DM"><Input name="limitDm" type="number" defaultValue={s.sendLimits.dm ?? 10} /></Field>
                </div>
                <SectionLabel>Auto-approve</SectionLabel>
                <ul className="space-y-2">
                  {Object.entries(APPROVAL_TYPES).map(([type, info]) => (
                    <li key={type} className="flex items-center gap-3 text-sm">
                      <Switch name={`auto_${type}`} defaultChecked={info.autoApprovable && s.autoApproveRules[type] === true} disabled={!info.autoApprovable} />
                      <span className={info.autoApprovable ? "" : "text-muted-foreground"}>{info.label}</span>
                      {!info.autoApprovable ? <Badge variant="muted">always needs you</Badge> : null}
                    </li>
                  ))}
                </ul>
                <Button type="submit">Save operations</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Feature flags</CardTitle>
              <CardDescription>Everything works with all flags off (Manual mode).</CardDescription>
            </CardHeader>
            <CardContent>
              {banner("flags")}
              <form action={updateFlagsAction} className="space-y-3">
                {(Object.keys(FLAG_INFO) as (keyof FeatureFlags)[]).map((k) => (
                  <label key={k} className="flex items-start gap-3">
                    <Switch name={k} defaultChecked={s.featureFlags[k]} className="mt-0.5" />
                    <span>
                      <span className="text-sm font-medium">{FLAG_INFO[k].label}</span>
                      <span className="block text-xs text-muted-foreground">{FLAG_INFO[k].description}</span>
                      <span className="block text-[11px] text-[#5f6f92]">{FLAG_INFO[k].phase}</span>
                    </span>
                  </label>
                ))}
                <Button type="submit">Save flags</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Packages</CardTitle>
            <CardDescription>Ad spend is paid by the client to Meta and isn&apos;t included. Editing arrives with Billing (Phase 2).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {packages.map((p) => (
              <div key={p.id} className={`rounded-2xl border p-4 ${p.recommended ? "border-[var(--line-strong)] bg-[linear-gradient(170deg,rgba(46,107,255,0.2),rgba(18,32,64,0.45))]" : "border-[var(--line)] bg-[rgba(12,22,46,0.35)]"}`}>
                <div className="flex items-center gap-2">
                  <p className="font-display font-semibold">{p.name}</p>
                  {p.recommended ? <Badge>recommended</Badge> : null}
                  <span className="ml-auto text-sm">
                    {formatMoney(p.setupFeeCents, "TTD", { decimals: false })} setup · {formatMoney(p.monthlyFeeCents, "TTD", { decimals: false })}/mo
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.includes.join(" · ")}</p>
                {p.recommendedSpend ? <p className="text-xs text-muted-foreground">Recommended ad spend: {p.recommendedSpend}</p> : null}
              </div>
            ))}
            {packages.length === 0 ? <p className="text-sm text-muted-foreground">Run the seed to add packages.</p> : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>AI cost this month</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="gradient-text font-display text-[34px] font-semibold tracking-[-0.03em]">US${(Number(aiCost?.micros ?? 0) / 1_000_000).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{aiCost?.calls ?? 0} AI calls</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Export</CardTitle>
              <CardDescription>CSV of any table. Supabase also keeps daily backups (see README).</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {EXPORTABLE_TABLES.map((t) => (
                <Button key={t} asChild size="xs" variant="outline">
                  <a href={`/api/export/${t}`} download>
                    <Download /> {t}
                  </a>
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
