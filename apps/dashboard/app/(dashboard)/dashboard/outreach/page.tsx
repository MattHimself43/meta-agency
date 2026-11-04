import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import { formatAst } from "@/lib/time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/page-header";
import { Flash } from "@/components/sell/flash";
import { TodaySends } from "@/components/sell/today-sends";
import { cn } from "@/lib/utils";
import { dncAction, recordReplyAction, toggleTemplateAction, updateTemplateAction } from "../sell-actions";

export const metadata = { title: "Outreach" };
const TABS = [
  { key: "today", label: "Today" },
  { key: "replies", label: "Replies" },
  { key: "templates", label: "Templates" },
  { key: "sequences", label: "Sequences" },
  { key: "dnc", label: "Do not contact" },
] as const;
const select = "h-10 w-full rounded-xl border border-[var(--line)] bg-[rgba(8,16,31,0.6)] px-3 text-sm text-foreground";

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ tab?: string; notice?: string; error?: string }> }) {
  await requireStaffPage();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "today";

  return (
    <>
      <PageHeader kicker="Sell" title="Outreach" description="WhatsApp is never sent automatically: open each message on your phone and press send yourself, then tap Mark sent." />
      <Flash notice={sp.notice} error={sp.error} />
      <nav className="mb-5 flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <Link key={t.key} href={`/dashboard/outreach?tab=${t.key}`} className={cn("rounded-full px-4 py-1.5 transition-all", tab === t.key ? "btn-grad font-semibold" : "btn-ghost-line text-muted-foreground hover:text-foreground")}>{t.label}</Link>
        ))}
      </nav>
      {tab === "today" ? <Card><CardContent className="pt-5 sm:pt-6"><TodaySends back="/dashboard/outreach" /></CardContent></Card> : null}
      {tab === "replies" ? <Replies /> : null}
      {tab === "templates" ? <Templates /> : null}
      {tab === "sequences" ? <Sequences /> : null}
      {tab === "dnc" ? <Dnc /> : null}
    </>
  );
}

async function Replies() {
  const [leads, recent] = await Promise.all([
    db.select({ id: schema.leads.id, name: schema.leads.businessName }).from(schema.leads).where(and(inArray(schema.leads.stage, ["contacted", "replied", "call_booked", "proposal_sent", "nurture"]), eq(schema.leads.doNotContact, false))).orderBy(asc(schema.leads.businessName)),
    db.select({ a: schema.activities, lead: schema.leads.businessName }).from(schema.activities).innerJoin(schema.leads, eq(schema.leads.id, schema.activities.leadId)).where(eq(schema.activities.type, "reply")).orderBy(desc(schema.activities.occurredAt)).limit(30),
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="glass-strong">
        <CardHeader><CardTitle>Paste a reply</CardTitle><CardDescription>It stops that lead&apos;s sequence, gets classified (interested, question, not now, no, stop) and a response is drafted for your approval. “Stop” puts them on do-not-contact.</CardDescription></CardHeader>
        <CardContent>
          <form action={recordReplyAction} className="space-y-3">
            <input type="hidden" name="back" value="/dashboard/outreach?tab=replies" />
            <Field label="From">
              <select name="leadId" required className={select}>{leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            </Field>
            <Field label="What they said"><Textarea name="reply" rows={4} required /></Field>
            <Button type="submit">Log reply</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recent replies</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y divide-[var(--line)]">
            {recent.map(({ a, lead }) => (
              <li key={a.id} className="py-3">
                <div className="flex items-center gap-2"><Link href={`/dashboard/leads/${a.leadId}`} className="text-sm font-medium hover:text-brand-cyan">{lead}</Link><Badge variant="muted">{String(a.metadata?.classification ?? "").replace("_", " ")}</Badge><span className="ml-auto text-xs text-[#5f6f92]">{formatAst(a.occurredAt, "d MMM")}</span></div>
                <p className="mt-1 text-sm text-[#c2d1ef]">{a.body}</p>
              </li>
            ))}
            {recent.length === 0 ? <li className="py-4 text-sm text-muted-foreground">No replies yet.</li> : null}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

async function Templates() {
  const rows = await db.select({ t: schema.messageTemplates, niche: schema.niches.name }).from(schema.messageTemplates).leftJoin(schema.niches, eq(schema.niches.id, schema.messageTemplates.nicheId)).orderBy(asc(schema.niches.name), asc(schema.messageTemplates.purpose));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {rows.map(({ t, niche }) => {
        const rate = t.sentCount ? Math.round((t.replyCount / t.sentCount) * 100) : null;
        return (
          <Card key={t.id} className={t.active ? "" : "opacity-60"}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>{t.name}</CardTitle>
                <CardDescription>{niche ?? "All niches"} · {t.purpose.replace(/_/g, " ")} · {t.channel}</CardDescription>
              </div>
              <div className="text-right">
                <p className="gradient-text font-display text-2xl font-semibold">{rate == null ? "—" : `${rate}%`}</p>
                <p className="text-[11px] text-[#5f6f92]">{t.replyCount} replies / {t.sentCount} sent</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <form action={updateTemplateAction} className="space-y-2">
                <input type="hidden" name="id" value={t.id} />
                <Textarea name="body" rows={4} defaultValue={t.body} />
                <p className="text-xs text-[#5f6f92]">Placeholders like {"{{contact_first_name}}"} are filled from real lead facts only. With AI on, templates are style examples.</p>
                <Button size="xs" type="submit" variant="secondary">Save template</Button>
              </form>
              <form action={toggleTemplateAction} className="flex items-center gap-2 text-sm">
                <input type="hidden" name="id" value={t.id} />
                <Switch name="active" defaultChecked={t.active} /> Active <Button size="xs" variant="ghost">Save</Button>
              </form>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

async function Sequences() {
  const seqs = await db.select({ s: schema.sequences, niche: schema.niches.name }).from(schema.sequences).leftJoin(schema.niches, eq(schema.niches.id, schema.sequences.nicheId));
  const steps = await db.select({ step: schema.sequenceSteps, template: schema.messageTemplates.name }).from(schema.sequenceSteps).leftJoin(schema.messageTemplates, eq(schema.messageTemplates.id, schema.sequenceSteps.templateId)).orderBy(asc(schema.sequenceSteps.stepOrder));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {seqs.map(({ s, niche }) => (
        <Card key={s.id}>
          <CardHeader><CardTitle>{s.name}</CardTitle><CardDescription>{niche} · a reply, a booked call, Won, Lost or do-not-contact stops it</CardDescription></CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {steps.filter((x) => x.step.sequenceId === s.id).map(({ step, template }) => (
                <li key={step.id} className="flex items-center gap-3">
                  <span className="btn-grad grid h-9 w-14 shrink-0 place-items-center rounded-full text-xs font-semibold">Day {step.dayOffset}</span>
                  <div><p className="text-sm font-medium">{step.purpose === "outreach_opener" ? "Opener" : step.purpose === "followup_day3" ? "Follow-up" : "Last nudge"} · {step.channel}</p><p className="text-xs text-[#5f6f92]">{template ?? "No template"}{step.purpose !== "outreach_opener" ? " · can be auto-approved in Settings" : " · always needs you"}</p></div>
                </li>
              ))}
              <li className="flex items-center gap-3"><span className="btn-ghost-line grid h-9 w-14 shrink-0 place-items-center rounded-full text-xs">then</span><p className="text-sm text-muted-foreground">Nurture (check in after 60 days)</p></li>
            </ol>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function Dnc() {
  const rows = await db.select().from(schema.leads).where(eq(schema.leads.doNotContact, true)).orderBy(asc(schema.leads.businessName));
  return (
    <Card>
      <CardHeader><CardTitle>Do-not-contact list</CardTitle><CardDescription>Enforced everywhere: no drafts, no batch picks, Mark sent is blocked.</CardDescription></CardHeader>
      <CardContent>
        <ul className="divide-y divide-[var(--line)]">
          {rows.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2.5">
              <Link href={`/dashboard/leads/${l.id}`} className="flex-1 text-sm hover:text-brand-cyan">{l.businessName}</Link>
              <span className="text-xs text-[#5f6f92]">{l.lostReason ?? ""}</span>
              <form action={dncAction}>
                <input type="hidden" name="id" value={l.id} />
                <input type="hidden" name="back" value="/dashboard/outreach?tab=dnc" />
                <Button size="xs" variant="ghost">Remove</Button>
              </form>
            </li>
          ))}
          {rows.length === 0 ? <li className="py-4 text-sm text-muted-foreground">Nobody on the list.</li> : null}
        </ul>
      </CardContent>
    </Card>
  );
}
