import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, Download, Share2 } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import type { ReportContent } from "@/lib/reports/service";
import { waLink } from "@/lib/phone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Notice, PageHeader } from "@/components/page-header";
import { SendActions } from "@/components/sell/send-actions";
import { ReportView } from "@/components/reports/report-view";
import { editReportAction, shareReportAction } from "../../deliver-actions";

export const metadata = { title: "Report" };

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ share?: string; notice?: string }> }) {
  await requireStaffPage();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [r] = await db.select().from(schema.reports).where(eq(schema.reports.id, id));
  if (!r) notFound();
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, r.clientId));
  const c = r.content as ReportContent;
  const link = sp.share ? `${process.env.APP_URL ?? ""}/share/report/${sp.share}` : null;
  const wa = link ? c.whatsappSummary.replace("{link}", link) : null;

  return (
    <>
      <Link href={`/dashboard/clients/${r.clientId}?tab=reports`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand-cyan"><ArrowLeft className="h-4 w-4" /> {client?.name}</Link>
      <PageHeader
        kicker={c.periodLabel}
        title={`${c.title} — ${client?.name ?? ""}`}
        description={c.source === "ai" ? "Narrative drafted by Claude from the imported numbers" : "Template narrative from the imported numbers"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={r.status === "approved" ? "low" : "medium"}>{r.status}</Badge>
            <Button asChild size="sm" variant="outline"><a href={`/api/pdf/report/${id}`}><Download /> PDF</a></Button>
            <form action={shareReportAction}><input type="hidden" name="id" value={id} /><Button size="sm"><Share2 /> {r.status === "approved" ? "New share link" : "Approve & share"}</Button></form>
          </div>
        }
      />
      {sp.notice ? <Notice>Saved. Editing takes it back to draft — approve again to share.</Notice> : null}
      {link && wa ? (
        <Card className="glass-strong mb-6">
          <CardContent className="space-y-3 pt-5 sm:pt-6">
            <p className="text-sm">Share link (shown once): <span className="break-all font-mono text-xs">{link}</span></p>
            <p className="whitespace-pre-wrap rounded-2xl border border-[var(--line)] p-3 text-sm text-[#c2d1ef]">{wa}</p>
            <SendActions channel="whatsapp" waHref={client?.whatsapp ? waLink(client.whatsapp, wa) : null} body={wa} />
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3"><CardContent className="pt-5 sm:pt-6"><ReportView r={c} /></CardContent></Card>
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Edit wording</CardTitle></CardHeader>
          <CardContent>
            <form action={editReportAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <Field label="Headline"><Input name="headline" defaultValue={c.headline} /></Field>
              <Field label="What happened" hint="One per line"><Textarea name="whatHappened" rows={3} defaultValue={c.whatHappened.join("\n")} /></Field>
              <Field label="What worked"><Textarea name="whatWorked" rows={2} defaultValue={c.whatWorked.join("\n")} /></Field>
              <Field label={c.type === "weekly" ? "What changes this week" : "Next month's plan"}><Textarea name="whatChanges" rows={3} defaultValue={c.whatChanges.join("\n")} /></Field>
              {c.type === "monthly" ? <Field label="Upsell (optional)"><Textarea name="upsell" rows={2} defaultValue={c.upsell ?? ""} /></Field> : null}
              <Field label="WhatsApp summary" hint="{link} is replaced with the share link"><Textarea name="whatsappSummary" rows={3} defaultValue={c.whatsappSummary} /></Field>
              <Button type="submit" size="sm">Save</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
