import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Share2 } from "lucide-react";
import { requireStaffPage } from "@/lib/auth";
import { loadDoc } from "@/lib/docs/load";
import { listToText, pairsToText, SECTIONS, type DocKind } from "@/lib/docs/sections";
import { DOC_LABEL } from "@/lib/docs/generate";
import { formatAst } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Notice, PageHeader } from "@/components/page-header";
import { DocView } from "@/components/docs/doc-view";
import { saveDocAction, shareDocAction } from "../../../../../sell-actions";

const KINDS = ["audit", "call_brief", "proposal"] as const;

export default async function DocPage({ params, searchParams }: { params: Promise<{ id: string; kind: string; docId: string }>; searchParams: Promise<{ share?: string; notice?: string }> }) {
  await requireStaffPage();
  const { id, kind, docId } = await params;
  const sp = await searchParams;
  if (!KINDS.includes(kind as DocKind) || !/^[0-9a-f-]{36}$/i.test(docId)) notFound();
  const d = await loadDoc(kind as DocKind, docId);
  if (!d || d.row.leadId !== id) notFound();
  const k = kind as DocKind;
  const meta = (d.content._meta ?? {}) as { source?: string; model?: string; version?: string };
  const missing = (d.content.missing_facts as string[] | undefined) ?? [];
  const shareable = k !== "call_brief";
  const shareUrl = sp.share ? `${process.env.APP_URL ?? ""}/share/${k}/${sp.share}` : null;

  return (
    <>
      <Link href={`/dashboard/leads/${id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand-cyan">
        <ArrowLeft className="h-4 w-4" /> {d.lead?.businessName}
      </Link>
      <PageHeader
        kicker={DOC_LABEL[k]}
        title={d.title}
        description={`${meta.source === "ai" ? `Drafted by ${meta.model} (prompt ${meta.version})` : "Skeleton draft — fill in by hand"} · ${formatAst(d.row.createdAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={d.row.status === "approved" ? "low" : "muted"}>{d.row.status}</Badge>
            <Button asChild size="sm" variant="outline"><a href={`/api/pdf/${k}/${docId}`}><Download /> PDF</a></Button>
            {shareable ? (
              <form action={shareDocAction}>
                <input type="hidden" name="kind" value={k} />
                <input type="hidden" name="id" value={docId} />
                <input type="hidden" name="leadId" value={id} />
                <Button size="sm"><Share2 /> {d.row.status === "approved" ? "New share link" : "Approve & create share link"}</Button>
              </form>
            ) : null}
          </div>
        }
      />
      {sp.notice === "saved" ? <Notice>Saved. {shareable ? "Editing takes it back to draft — approve again to share." : ""}</Notice> : null}
      {shareUrl ? (
        <Notice>
          Approved. Share link (shown once — copy it now): <span className="break-all font-mono text-xs">{shareUrl}</span>
        </Notice>
      ) : null}
      {missing.length ? (
        <Notice tone="error">Missing facts (internal — not shown to the prospect): {missing.join(" · ")}</Notice>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardContent className="pt-6 sm:pt-6">
            <DocView kind={k} content={d.content} pkg={d.pkg} setupWaived={d.setupWaived} />
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Edit</CardTitle></CardHeader>
          <CardContent>
            <form action={saveDocAction} className="space-y-3">
              <input type="hidden" name="kind" value={k} />
              <input type="hidden" name="id" value={docId} />
              <input type="hidden" name="leadId" value={id} />
              {SECTIONS[k].map((s) =>
                s.type === "text" ? (
                  <Field key={s.key} label={s.title}>
                    {s.key.endsWith("slug") ? <Input name={`f:${s.key}`} defaultValue={String(d.content[s.key] ?? "")} /> : <Textarea name={`f:${s.key}`} rows={s.key === "headline" || s.key === "title" ? 1 : 3} defaultValue={String(d.content[s.key] ?? "")} />}
                  </Field>
                ) : s.type === "list" ? (
                  <Field key={s.key} label={s.title} hint="One per line"><Textarea name={`f:${s.key}`} rows={4} defaultValue={listToText(d.content[s.key])} /></Field>
                ) : s.type === "pairs" ? (
                  <Field key={s.key} label={s.title} hint={`One per line: ${s.a.replace(/_/g, " ")} :: ${s.b.replace(/_/g, " ")}`}><Textarea name={`f:${s.key}`} rows={4} defaultValue={pairsToText(d.content[s.key], s.a, s.b)} /></Field>
                ) : (
                  <fieldset key={s.key} className="space-y-2 rounded-2xl border border-[var(--line)] p-3">
                    <legend className="px-1 text-[13px] font-medium text-[#c2d1ef]">{s.title}</legend>
                    {s.fields.map((f) => <Field key={f.key} label={f.label}><Input name={`f:${s.key}.${f.key}`} defaultValue={String((d.content[s.key] as Record<string, unknown> | undefined)?.[f.key] ?? "")} /></Field>)}
                  </fieldset>
                ),
              )}
              <Field label="Missing facts (internal)" hint="One per line"><Textarea name="f:missing_facts" rows={2} defaultValue={missing.join("\n")} /></Field>
              <Button type="submit" size="sm">Save changes</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
