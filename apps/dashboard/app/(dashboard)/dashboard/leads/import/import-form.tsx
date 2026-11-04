"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Upload } from "lucide-react";
import { autoMapColumns, LEAD_IMPORT_FIELDS, parseCsv, type LeadImportField } from "@/lib/csv";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Notice } from "@/components/page-header";
import { importLeadsAction } from "../../sell-actions";

const select = "h-9 w-full rounded-xl border border-[var(--line)] bg-[rgba(8,16,31,0.6)] px-3 text-sm text-foreground";
const FIELD_LABEL: Record<LeadImportField, string> = {
  business_name: "Business name *", contact_name: "Contact name", phone: "Phone", whatsapp: "WhatsApp", email: "Email", area: "Area",
  facebook_url: "Facebook URL", instagram_url: "Instagram URL", website: "Website", maps_url: "Google Maps URL", niche: "Niche", notes: "Notes",
};

export function ImportForm({ niches }: { niches: { id: string; name: string }[] }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<LeadImportField, number>>>({});
  const [nicheId, setNicheId] = useState(niches[0]?.id ?? "");
  const [result, setResult] = useState<Awaited<ReturnType<typeof importLeadsAction>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onFile(file: File) {
    setResult(null);
    setError(null);
    if (file.size > 5_000_000) return setError("File is over 5 MB. Split it into smaller files.");
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) return setError("That file has no data rows.");
    if (parsed.length > 2001) return setError("Up to 2,000 rows per import, please.");
    setRows(parsed);
    setMapping(autoMapColumns(parsed[0]!));
  }

  const headers = rows?.[0] ?? [];
  const data = rows?.slice(1) ?? [];
  const mapped = () =>
    data.map((r) => Object.fromEntries(Object.entries(mapping).filter(([, i]) => i != null && i >= 0).map(([f, i]) => [f, r[i!]?.trim() || undefined])));

  function submit() {
    if (mapping.business_name == null) return setError("Match a column to Business name.");
    setError(null);
    start(async () => {
      try {
        setResult(await importLeadsAction({ nicheId: nicheId || null, rows: mapped() }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed");
      }
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>1. Choose a CSV file</CardTitle>
          <CardDescription>First row must be headers. Phones can be local (765-4321) or +1868 format.</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="btn-ghost-line inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold">
            <Upload className="h-4 w-4" /> Select file
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          {rows ? <p className="mt-2 text-sm text-muted-foreground">{data.length} row(s), {headers.length} column(s).</p> : null}
        </CardContent>
      </Card>

      {rows ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Match columns</CardTitle>
            <CardDescription>We guessed from the headers — check them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(LEAD_IMPORT_FIELDS) as LeadImportField[]).map((f) => (
                <Field key={f} label={FIELD_LABEL[f]}>
                  <select className={select} value={mapping[f] ?? -1} onChange={(e) => setMapping((m) => ({ ...m, [f]: Number(e.target.value) < 0 ? undefined : Number(e.target.value) }))}>
                    <option value={-1}>— not imported —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </Field>
              ))}
              <Field label="Niche for rows without one">
                <select className={select} value={nicheId} onChange={(e) => setNicheId(e.target.value)}>
                  <option value="">None</option>
                  {niches.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[#5f6f92]">{Object.entries(mapping).filter(([, i]) => i != null).map(([f]) => <th key={f} className="px-3 py-2 font-medium">{FIELD_LABEL[f as LeadImportField].replace(" *", "")}</th>)}</tr>
                </thead>
                <tbody>
                  {mapped().slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t border-[var(--line)]">{Object.keys(mapping).filter((f) => mapping[f as LeadImportField] != null).map((f) => <td key={f} className="px-3 py-2 text-[#c2d1ef]">{r[f] ?? ""}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button onClick={submit} disabled={pending}>{pending ? "Importing…" : `Import ${data.length} row(s)`}</Button>
          </CardContent>
        </Card>
      ) : error ? <Notice tone="error">{error}</Notice> : null}

      {result ? (
        <Card className="glass-strong">
          <CardHeader><CardTitle>Done</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="gradient-text font-display text-2xl font-semibold">{result.created}</span> new lead(s) · {result.duplicates} duplicate(s) skipped · {result.invalid} row(s) without a business name</p>
            {result.duplicateNames.length ? <p className="text-muted-foreground">Duplicates: {result.duplicateNames.join(", ")}{result.duplicates > result.duplicateNames.length ? "…" : ""}</p> : null}
            <Button asChild size="sm" variant="outline"><Link href="/dashboard/leads?sort=recent">See leads</Link></Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
