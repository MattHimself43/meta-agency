import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { AlertTriangle, ArrowLeft, Printer, Rocket } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import { checklistFor } from "@/lib/campaigns/service";
import { CATEGORY_LABEL, RESTRICTED_RULES, type SpecialCategory } from "@/lib/campaigns/special-category";
import { OBJECTIVE_LABEL, PLACEMENTS, TT_LOCATIONS, type Audience, type Location, type Placements, type PlanAd, type Schedule } from "@/lib/campaigns/plan";
import { getSettings } from "@/lib/settings";
import { formatUsdWithTtd } from "@/lib/money";
import { formatAst } from "@/lib/time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Notice, PageHeader } from "@/components/page-header";
import { PlanEditor } from "./plan-editor";
import { budgetAction, planStatusAction } from "../../deliver-actions";
import { buildViaApiAction, saveLeadFormAction } from "../../connect-actions";
import { metaMode } from "@/lib/meta/client";
import type { MetaIds } from "@/lib/meta/build";

export const metadata = { title: "Campaign plan" };

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const actor = await requireStaffPage();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [plan] = await db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.id, id));
  if (!plan) notFound();
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, plan.clientId));
  const [limitStep] = await db.select().from(schema.onboardingSteps).where(and(eq(schema.onboardingSteps.clientId, plan.clientId), eq(schema.onboardingSteps.stepKey, "spending_limit")));
  const [creatives, changes, checklist, settings] = await Promise.all([
    db.select().from(schema.creatives).where(eq(schema.creatives.clientId, plan.clientId)).orderBy(desc(schema.creatives.createdAt)),
    db.select().from(schema.budgetChanges).where(eq(schema.budgetChanges.campaignPlanId, id)).orderBy(desc(schema.budgetChanges.createdAt)).limit(10),
    checklistFor(plan),
    getSettings(),
  ]);
  const mode = await metaMode();
  const meta = (plan.metaIds ?? {}) as MetaIds;
  const template = ((await db.select().from(schema.niches).where(eq(schema.niches.id, client?.nicheId ?? "00000000-0000-0000-0000-000000000000")))[0]?.campaignTemplates as { key: string; destination: string }[] | undefined)?.find((t) => t.key === plan.template);
  const special = plan.specialAdCategory as SpecialCategory;
  const isOwner = actor.role === "owner";
  const canLaunch = limitStep?.status === "done";
  const statusOp = (op: string, label: string, variant: "default" | "outline" | "secondary" = "default", extra?: React.ReactNode) => (
    <form action={planStatusAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      {extra}
      <Button size="sm" variant={variant}>{label}</Button>
    </form>
  );

  return (
    <>
      <Link href={`/dashboard/clients/${plan.clientId}?tab=campaigns`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand-cyan"><ArrowLeft className="h-4 w-4" /> {client?.name}</Link>
      <PageHeader kicker={`Campaign plan · ${mode === "api" ? "Meta API mode" : "Manual mode"}`} title={plan.name} description={`${OBJECTIVE_LABEL[plan.objective] ?? plan.objective} · ${formatUsdWithTtd(plan.budgetUsdCents, settings.exchangeRate)} per ${plan.budgetType === "daily" ? "day" : "campaign"}${plan.launchedAt ? ` · launched ${formatAst(plan.launchedAt, "d MMM")}` : ""}`} actions={<Badge variant={plan.status === "live" ? "low" : plan.status === "draft" ? "muted" : "default"}>{plan.status.replace("_", " ")}</Badge>} />
      {sp.error ? <Notice tone="error">{sp.error}</Notice> : null}
      {sp.notice ? <Notice>{sp.notice === "saved" ? "Saved." : sp.notice}</Notice> : null}

      <Card className="glass-strong mb-6">
        <CardContent className="flex flex-wrap items-center gap-3 pt-5 sm:pt-6">
          <ol className="flex flex-1 flex-wrap items-center gap-2 text-xs">
            {["draft", "approved", "built_paused", "live"].map((s, i) => <li key={s} className={`rounded-full px-3 py-1 ${plan.status === s ? "btn-grad font-semibold" : "btn-ghost-line text-muted-foreground"}`}>{i + 1}. {s === "built_paused" ? "built (paused)" : s}</li>)}
          </ol>
          {plan.status === "draft" && isOwner ? statusOp("approve", "Approve plan") : null}
          {plan.status === "approved" && mode === "api" ? (
            <form action={buildViaApiAction}>
              <input type="hidden" name="id" value={id} />
              <Button size="sm">Build in Meta (PAUSED)</Button>
            </form>
          ) : null}
          {plan.status === "approved" ? statusOp("built", mode === "api" ? "Built by hand instead" : "Mark built (paused)", "secondary", <Input name="metaCampaignId" placeholder="Meta campaign ID" className="h-9 w-48" />) : null}
          {(plan.status === "built_paused" || plan.status === "paused") && isOwner ? (
            <form action={planStatusAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="op" value="launch" />
              <Button size="sm" disabled={!canLaunch} title={canLaunch ? undefined : "Confirm the spending limit on the client's onboarding first"}><Rocket /> Launch</Button>
            </form>
          ) : null}
          {plan.status === "live" ? statusOp("pause", "Pause", "outline") : null}
          {!canLaunch && plan.status !== "draft" ? <p className="w-full text-xs text-amber-200">Launch is locked until the client&apos;s account spending limit is confirmed (Clients → onboarding).</p> : null}
        </CardContent>
      </Card>

      {mode === "api" ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Meta API</CardTitle>
            <CardDescription>Build creates the campaign, ad sets, creatives and ads in {client?.name}&apos;s ad account, all PAUSED. Only the owner&apos;s Launch switches them on — the server refuses ACTIVE from anywhere else.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!client?.pageId ? <p className="text-amber-200">Run the Meta access check on the client page first — it finds the Page ID the ads run from.</p> : null}
            {template?.destination === "ON_AD" ? (
              <form action={saveLeadFormAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={id} />
                <Field label="Instant form ID" hint="Create the lead form in Meta (Page → Instant forms), paste its ID"><Input name="leadFormId" defaultValue={meta.leadFormId ?? ""} className="w-56" inputMode="numeric" /></Field>
                <Button size="sm" variant="secondary">Save</Button>
              </form>
            ) : null}
            {meta.campaignId ? (
              <p>Campaign <code>{meta.campaignId}</code> · {meta.adSetIds?.length ?? 0} ad set(s) · {meta.adIds?.length ?? 0} ad(s){meta.builtAt ? ` · built ${formatAst(new Date(meta.builtAt))}` : ""}{meta.apiVersion ? ` · ${meta.apiVersion}` : ""}</p>
            ) : null}
            {meta.warnings?.length ? <ul className="list-disc space-y-1 pl-5 text-amber-200">{meta.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : null}
            {meta.lastError ? <p className="text-red-300">Last build error: {meta.lastError} — fix it and press Build again; anything already created is reused, not duplicated.</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {special ? (
        <Notice tone="error">
          <AlertTriangle className="mr-1 inline h-4 w-4" /> May fall under Meta&apos;s <b>{CATEGORY_LABEL[special]}</b> special ad category. Restricted targeting applied: {RESTRICTED_RULES.slice(0, 3).join(" · ")}. Confirm against Meta&apos;s current policy before approving.
        </Notice>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <Card>
            <CardHeader><CardTitle>Plan</CardTitle><CardDescription>Editing an approved plan sends it back to draft.</CardDescription></CardHeader>
            <CardContent>
              <PlanEditor
                id={id}
                name={plan.name}
                objective={plan.objective}
                audiences={plan.audiences as Audience[]}
                locations={plan.locations as Location[]}
                placements={plan.placements as Placements}
                schedule={plan.schedule as Schedule}
                ads={plan.ads as PlanAd[]}
                restricted={Boolean(special)}
                specialConfirmed={plan.specialAdCategoryConfirmed}
                specialLabel={special ? CATEGORY_LABEL[special] : null}
                notes={plan.notes}
                creatives={creatives.map((c) => ({ id: c.id, hook: c.hook, primaryText: c.primaryText, headline: c.headline, cta: c.cta, format: c.format, status: c.status }))}
                locked={plan.status === "live"}
                allLocations={TT_LOCATIONS}
                allPlacements={PLACEMENTS}
                objectives={OBJECTIVE_LABEL}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Budget</CardTitle><CardDescription>Raises over 20% in 7 days, or bigger than US${(settings.budgetChangeLimitCents / 100).toFixed(0)}/day, need approval. Enforced on the server.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <form action={budgetAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={id} />
                <Field label="Daily budget (US$)"><Input name="budget" type="number" step="0.01" min={1} defaultValue={plan.budgetUsdCents / 100} className="w-36" /></Field>
                <div className="min-w-[12rem] flex-1"><Field label="Reason"><Input name="reason" placeholder="e.g. cost per chat well under target" /></Field></div>
                <Button size="sm" type="submit" variant="secondary">Change budget</Button>
              </form>
              {changes.length ? (
                <ul className="space-y-1 text-xs text-[#c2d1ef]">{changes.map((c) => <li key={c.id}>{formatAst(c.createdAt, "d MMM")}: US${(c.oldBudgetUsdCents / 100).toFixed(2)} → US${(c.newBudgetUsdCents / 100).toFixed(2)} · <Badge variant={c.status === "applied" ? "low" : c.status === "pending" ? "medium" : "muted"}>{c.status}</Badge></li>)}</ul>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="xl:col-span-2 print:col-span-5">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle>Ads Manager checklist</CardTitle><CardDescription>Follow it in order. It ends with the campaign switched OFF.</CardDescription></div>
            <Button asChild size="xs" variant="ghost"><a href={`/dashboard/campaigns/${id}/checklist`} target="_blank"><Printer /> Print</a></Button>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {checklist.map((s) => (
                <li key={s.n} className="flex gap-3">
                  <span className="btn-grad grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold">{s.n}</span>
                  <div className="min-w-0">
                    <p className="font-display font-semibold">{s.title}</p>
                    {s.warning ? <p className="text-xs text-amber-200">⚑ {s.warning}</p> : null}
                    <ul className="mt-1 space-y-1">{s.items.map((it, i) => <li key={i} className="break-words text-sm text-[#c2d1ef]">{it}</li>)}</ul>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
