import { clientContext } from "@/lib/clients/onboarding";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { PortalShell, portalClient } from "../shell";
import { intakeAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "About your business", robots: { index: false, follow: false } };

export default async function IntakePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const client = await portalClient(token);
  const { intakeSchema } = await clientContext(client.id);
  const select = "h-10 w-full rounded-xl border border-[var(--line)] bg-[rgba(8,16,31,0.6)] px-3 text-sm text-foreground";

  return (
    <PortalShell token={token} kicker="Step 2" title="About your business" error={sp.error}>
      <p className="text-sm text-muted-foreground">We only put facts from this form in your ads — prices, deposits and financing exactly as you write them here. You can save and come back.</p>
      <form action={intakeAction} className="glass space-y-4 rounded-[22px] p-5">
        <input type="hidden" name="token" value={token} />
        {intakeSchema.map((f) => (
          <Field key={f.key} label={`${f.label}${f.required ? "" : " (optional)"}`} hint={f.hint ?? (f.type === "file_or_url" ? "Paste a link (Google Drive, website, Facebook album) — or upload files in the next step" : undefined)}>
            {f.type === "textarea" ? (
              <Textarea name={`q:${f.key}`} rows={3} defaultValue={client.intake[f.key] ?? ""} />
            ) : f.type === "select" ? (
              <select name={`q:${f.key}`} defaultValue={client.intake[f.key] ?? ""} className={select}>
                <option value="">Choose…</option>
                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <Input name={`q:${f.key}`} defaultValue={client.intake[f.key] ?? ""} inputMode={f.type === "phone" ? "tel" : f.type === "file_or_url" ? "url" : undefined} />
            )}
          </Field>
        ))}
        <Button type="submit" size="lg" className="w-full">Save</Button>
      </form>
    </PortalShell>
  );
}
