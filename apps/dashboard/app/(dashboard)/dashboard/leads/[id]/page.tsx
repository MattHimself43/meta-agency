import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { ArrowLeft, ExternalLink, FileText, Mic, PenLine, Radar, Send } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import { aiAvailable } from "@/lib/ai/client";
import { STAGES } from "@/lib/leads/service";
import { formatAst } from "@/lib/time";
import { formatTtPhone, waLink } from "@/lib/phone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Notice, PageHeader, SectionLabel } from "@/components/page-header";
import { Flash } from "@/components/sell/flash";
import { ScoreBadge, StageBadge } from "@/components/sell/badges";
import { SendActions } from "@/components/sell/send-actions";
import { bookCallAction, adCheckAction, dncAction, draftOpenerAction, generateDocAction, markSentAction, moveStageAction, noteAction, recordReplyAction, updateLeadAction } from "../../sell-actions";

const select = "h-10 w-full rounded-xl border border-[var(--line)] bg-[rgba(8,16,31,0.6)] px-3 text-sm text-foreground";
const ACT_ICON: Record<string, string> = { message_draft: "✎", message_sent: "↗", reply: "↙", call: "☎", note: "•", file: "▤", stage_change: "→" };

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string; portal?: string }> }) {
  await requireStaffPage();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
  if (!lead) notFound();

  const [niches, activities, messages, audits, briefs, proposals, client, bookings] = await Promise.all([
    db.select().from(schema.niches).orderBy(asc(schema.niches.name)),
    db.select().from(schema.activities).where(eq(schema.activities.leadId, id)).orderBy(desc(schema.activities.occurredAt)).limit(100),
    db.select().from(schema.messages).where(and(eq(schema.messages.leadId, id), inArray(schema.messages.status, ["draft", "approved"]))).orderBy(asc(schema.messages.dueAt)),
    db.select({ id: schema.audits.id, status: schema.audits.status, createdAt: schema.audits.createdAt }).from(schema.audits).where(eq(schema.audits.leadId, id)).orderBy(desc(schema.audits.createdAt)),
    db.select({ id: schema.callBriefs.id, status: schema.callBriefs.status, createdAt: schema.callBriefs.createdAt }).from(schema.callBriefs).where(eq(schema.callBriefs.leadId, id)).orderBy(desc(schema.callBriefs.createdAt)),
    db.select({ id: schema.proposals.id, status: schema.proposals.status, createdAt: schema.proposals.createdAt }).from(schema.proposals).where(eq(schema.proposals.leadId, id)).orderBy(desc(schema.proposals.createdAt)),
    db.select().from(schema.clients).where(eq(schema.clients.leadId, id)).limit(1),
    db.select().from(schema.bookings).where(and(eq(schema.bookings.leadId, id), eq(schema.bookings.status, "booked"))).orderBy(asc(schema.bookings.startsAt)),
  ]);
  const niche = niches.find((n) => n.id === lead.nicheId);
  const ai = aiAvailable();
  const docs = [
    ...audits.map((d) => ({ ...d, kind: "audit" as const, label: "Ads audit" })),
    ...briefs.map((d) => ({ ...d, kind: "call_brief" as const, label: "Call brief" })),
    ...proposals.map((d) => ({ ...d, kind: "proposal" as const, label: "Proposal" })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const sources = lead.sourceUrls as { fact: string; url: string }[];

  return (
    <>
      <Link href="/dashboard/leads" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand-cyan">
        <ArrowLeft className="h-4 w-4" /> Leads
      </Link>
      <PageHeader
        kicker={niche?.name ?? "Lead"}
        title={lead.businessName}
        description={[lead.contactName, lead.area, formatTtPhone(lead.phone)].filter((x) => x && x !== "—").join(" · ") || undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge stage={lead.stage} />
            <ScoreBadge score={lead.fitScore} override={lead.fitScoreOverride} />
            {lead.doNotContact ? <Badge variant="high">do not contact</Badge> : null}
            {client[0] ? <Badge variant="low">client</Badge> : null}
          </div>
        }
      />
      <Flash notice={sp.notice} error={sp.error} />
      {sp.portal ? (
        <Notice>
          Client portal link (shown once — copy it now; you can create a new one from the client page later):{" "}
          <span className="break-all font-mono text-xs">{`${process.env.APP_URL ?? ""}/portal/${sp.portal}`}</span>
        </Notice>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          {/* Quick actions */}
          <Card className="glass-strong">
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
              <CardDescription>{ai ? "Drafts are written by Claude and wait for your approval." : "AI isn't configured: messages are drafted from templates and documents start as skeletons."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <form action={draftOpenerAction}><input type="hidden" name="id" value={id} /><Button size="sm" disabled={lead.doNotContact}><Send /> Draft first message</Button></form>
                <form action={generateDocAction}><input type="hidden" name="leadId" value={id} /><input type="hidden" name="kind" value="audit" /><Button size="sm" variant="outline"><FileText /> Generate audit</Button></form>
                <form action={generateDocAction}><input type="hidden" name="leadId" value={id} /><input type="hidden" name="kind" value="call_brief" /><Button size="sm" variant="outline"><Mic /> Write call brief</Button></form>
                <form action={adCheckAction}><input type="hidden" name="id" value={id} /><Button size="sm" variant="outline" disabled={!ai}><Radar /> Check Meta ads</Button></form>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <details className="rounded-2xl border border-[var(--line)] p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Paste a reply</summary>
                  <form action={recordReplyAction} className="mt-3 space-y-2">
                    <input type="hidden" name="leadId" value={id} />
                    <Textarea name="reply" rows={3} placeholder="Paste what they said…" required />
                    <Button size="sm" type="submit">Log reply</Button>
                    <p className="text-xs text-muted-foreground">Stops the sequence, classifies the reply and drafts a response.</p>
                  </form>
                </details>
                <details className="rounded-2xl border border-[var(--line)] p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Write a proposal</summary>
                  <form action={generateDocAction} className="mt-3 space-y-2">
                    <input type="hidden" name="leadId" value={id} />
                    <input type="hidden" name="kind" value="proposal" />
                    <Textarea name="notes" rows={4} placeholder="Paste your call notes…" required />
                    <Button size="sm" type="submit"><PenLine /> Draft proposal</Button>
                  </form>
                </details>
                <details className="rounded-2xl border border-[var(--line)] p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Book a call</summary>
                  <form action={bookCallAction} className="mt-3 space-y-2">
                    <input type="hidden" name="id" value={id} />
                    <Field label="Date & time (AST)"><Input name="startsAt" type="datetime-local" required /></Field>
                    <Button size="sm" type="submit">Book 20-min call</Button>
                    <p className="text-xs text-muted-foreground">Or send them <span className="font-mono">{process.env.APP_URL ?? ""}/book</span></p>
                  </form>
                </details>
                <details className="rounded-2xl border border-[var(--line)] p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Add a note / call log</summary>
                  <form action={noteAction} className="mt-3 space-y-2">
                    <input type="hidden" name="id" value={id} />
                    <Textarea name="body" rows={3} required />
                    <div className="flex gap-2">
                      <Button size="sm" type="submit" name="type" value="note">Add note</Button>
                      <Button size="sm" type="submit" name="type" value="call" variant="outline">Log call</Button>
                    </div>
                  </form>
                </details>
              </div>
              <form action={moveStageAction} className="flex flex-wrap items-end gap-2 border-t border-[var(--line)] pt-4">
                <input type="hidden" name="id" value={id} />
                <Field label="Move to stage">
                  <select name="stage" defaultValue={lead.stage} className={`${select} w-44`}>
                    {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </Field>
                <div className="min-w-[12rem] flex-1"><Field label="Lost reason (if Lost)"><Input name="lostReason" defaultValue={lead.lostReason ?? ""} /></Field></div>
                <Button size="sm" type="submit" variant="secondary">Move</Button>
              </form>
            </CardContent>
          </Card>

          {/* Messages in flight */}
          {messages.length ? (
            <Card>
              <CardHeader><CardTitle>Messages in progress</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id} className="rounded-2xl border border-[var(--line)] p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant={msg.status === "approved" ? "low" : "muted"}>{msg.status === "approved" ? "approved — ready to send" : msg.body ? "waiting for approval" : "scheduled"}</Badge>
                      <span className="text-[#5f6f92]">{msg.purpose.replace(/_/g, " ")} · {msg.channel} · due {formatAst(msg.dueAt, "EEE d MMM")}</span>
                    </div>
                    {msg.body ? <p className="whitespace-pre-wrap text-sm text-[#c2d1ef]">{msg.body}</p> : <p className="text-sm text-muted-foreground">Written by the outreach batch on the day it&apos;s due.</p>}
                    {msg.status === "approved" && msg.body ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <SendActions channel={msg.channel} waHref={lead.whatsapp ? waLink(lead.whatsapp, msg.body) : null} email={lead.email} body={msg.body} pageUrl={lead.facebookUrl ?? lead.instagramUrl} />
                        <form action={markSentAction}>
                          <input type="hidden" name="id" value={msg.id} />
                          <input type="hidden" name="back" value={`/dashboard/leads/${id}`} />
                          <Button size="sm" variant="secondary">Mark sent</Button>
                        </form>
                      </div>
                    ) : msg.body ? (
                      <Link href="/dashboard/approvals" className="mt-2 inline-block text-xs text-brand-cyan hover:underline">Approve in the queue →</Link>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {/* Documents */}
          <Card>
            <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
            <CardContent>
              {docs.length ? (
                <ul className="divide-y divide-[var(--line)]">
                  {docs.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 py-2.5">
                      <FileText className="h-4 w-4 text-brand-cyan" />
                      <Link href={`/dashboard/leads/${id}/docs/${d.kind}/${d.id}`} className="flex-1 text-sm hover:text-brand-cyan">{d.label}</Link>
                      <Badge variant={d.status === "approved" ? "low" : "muted"}>{d.status === "approved" ? "approved · shared" : d.status}</Badge>
                      <span className="text-xs text-[#5f6f92]">{formatAst(d.createdAt, "d MMM")}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">No audit, brief or proposal yet.</p>}
              {bookings.length ? (
                <div className="mt-4 border-t border-[var(--line)] pt-3 text-sm">
                  {bookings.map((b) => <p key={b.id} className="text-[#c2d1ef]">☎ Call {formatAst(b.startsAt, "EEE d MMM, h:mm a")} AST ({b.source === "manual" ? "booked by you" : "via /book"})</p>)}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l border-[var(--line-strong)] pl-5">
                {activities.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[27px] top-0.5 grid h-4 w-4 place-items-center rounded-full border border-[var(--line-strong)] bg-background text-[9px] text-brand-cyan">{ACT_ICON[a.type] ?? "•"}</span>
                    <p className="text-xs text-[#5f6f92]">{a.type.replace(/_/g, " ")}{a.channel ? ` · ${a.channel}` : ""} · {formatAst(a.occurredAt, "d MMM yyyy, h:mm a")}</p>
                    {a.body ? <p className="mt-0.5 whitespace-pre-wrap text-sm text-[#c2d1ef]">{a.body}</p> : null}
                  </li>
                ))}
                {activities.length === 0 ? <li className="text-sm text-muted-foreground">Nothing yet.</li> : null}
              </ol>
            </CardContent>
          </Card>
        </div>

        {/* Details */}
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent>
              <form action={updateLeadAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <Field label="Business name"><Input name="businessName" defaultValue={lead.businessName} required /></Field>
                <Field label="Niche">
                  <select name="nicheId" defaultValue={lead.nicheId ?? ""} className={select}>
                    <option value="">None</option>
                    {niches.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Contact"><Input name="contactName" defaultValue={lead.contactName ?? ""} /></Field>
                  <Field label="Area"><Input name="area" defaultValue={lead.area ?? ""} /></Field>
                  <Field label="Phone"><Input name="phone" defaultValue={lead.phone ?? ""} /></Field>
                  <Field label="WhatsApp"><Input name="whatsapp" defaultValue={lead.whatsapp ?? ""} /></Field>
                </div>
                <Field label="Email"><Input name="email" type="email" defaultValue={lead.email ?? ""} /></Field>
                <Field label="Facebook"><Input name="facebookUrl" defaultValue={lead.facebookUrl ?? ""} /></Field>
                <Field label="Instagram"><Input name="instagramUrl" defaultValue={lead.instagramUrl ?? ""} /></Field>
                <Field label="Website"><Input name="website" defaultValue={lead.website ?? ""} /></Field>
                <Field label="Google Maps"><Input name="mapsUrl" defaultValue={lead.mapsUrl ?? ""} /></Field>
                <SectionLabel>Score &amp; next step</SectionLabel>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={`Score override (computed ${lead.fitScore ?? "—"})`} hint="Blank = use computed">
                    <Input name="fitScoreOverride" type="number" min={1} max={10} defaultValue={lead.fitScoreOverride ?? ""} />
                  </Field>
                  <Field label="Next action due">
                    <Input name="nextActionDue" type="date" defaultValue={lead.nextActionDue ? formatAst(lead.nextActionDue, "yyyy-MM-dd") : ""} />
                  </Field>
                </div>
                <Field label="Next action"><Input name="nextAction" defaultValue={lead.nextAction ?? ""} /></Field>
                <Button type="submit" size="sm">Save details</Button>
              </form>
              <form action={dncAction} className="mt-4 flex items-center gap-3 border-t border-[var(--line)] pt-4 text-sm">
                <input type="hidden" name="id" value={id} />
                <Switch name="value" defaultChecked={lead.doNotContact} />
                <span className="flex-1">Do not contact</span>
                <Button size="xs" variant="outline">Save</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Why this score</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ul className="space-y-1">{(lead.scoreReasons as string[]).map((r, i) => <li key={i} className="text-[#c2d1ef]">{r}</li>)}</ul>
              <SectionLabel>Meta ads</SectionLabel>
              <p className="text-[#c2d1ef]">{lead.runsMetaAds == null ? "Not checked yet." : lead.runsMetaAds ? `Running ${lead.adCount ?? "some"} ad(s).` : "No ads found."} {lead.adNotes}</p>
              {lead.adLinks.length ? <ul className="space-y-1">{lead.adLinks.map((l) => <li key={l}><a href={l} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-xs text-brand-cyan hover:underline"><ExternalLink className="h-3 w-3" />{l}</a></li>)}</ul> : null}
              {lead.facts.length ? (<><SectionLabel>Facts for openers</SectionLabel><ul className="space-y-1">{lead.facts.map((f, i) => <li key={i} className="text-[#c2d1ef]">{f.fact}{f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-xs text-brand-cyan">source</a> : null}</li>)}</ul></>) : null}
              {sources.length ? (<><SectionLabel>Sources</SectionLabel><ul className="space-y-1">{sources.map((s, i) => <li key={i} className="text-xs text-muted-foreground">{s.fact}: <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-all text-brand-cyan">{s.url}</a></li>)}</ul></>) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
