import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { agreementFor } from "@/lib/clients/onboarding";
import { formatAst } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { SignaturePad } from "@/components/portal/signature-pad";
import { PortalShell, portalClient } from "../shell";
import { signAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agreement", robots: { index: false, follow: false } };

export default async function AgreementPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const client = await portalClient(token);
  const sections = await agreementFor(client.id);
  const [signed] = await db.select().from(schema.agreements).where(eq(schema.agreements.clientId, client.id)).orderBy(desc(schema.agreements.createdAt)).limit(1);

  return (
    <PortalShell token={token} kicker="Step 1" title="Service agreement" error={sp.error}>
      <article className="glass max-h-[55vh] space-y-4 overflow-y-auto rounded-[22px] p-5 text-sm leading-relaxed" tabIndex={0} aria-label="Agreement text">
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="font-display font-semibold">{s.title}</h2>
            <p className="mt-1 text-[#c2d1ef]">{s.body}</p>
          </section>
        ))}
      </article>
      {signed?.signedAt ? (
        <p className="rounded-2xl border border-[rgba(60,220,160,0.25)] bg-[rgba(60,220,160,0.08)] p-4 text-sm text-[#7cf5c4]">
          Signed by {signed.signatureName} on {formatAst(signed.signedAt, "d MMMM yyyy, h:mm a")}. You can sign again if anything changed.
        </p>
      ) : null}
      <form action={signAction} className="glass-strong space-y-4 rounded-[22px] p-5">
        <input type="hidden" name="token" value={token} />
        <Field label="Your full name"><Input name="name" required autoComplete="name" defaultValue={client.contactName ?? ""} /></Field>
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-[#c2d1ef]">Your signature</p>
          <SignaturePad name="signature" />
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="agree" className="mt-1 h-4 w-4 accent-[#5fe3ff]" required />
          <span>I&apos;ve read this agreement and agree to it on behalf of {client.name.replace(/^Demo — /, "").replace(/ \(fictional\)$/, "")}. I understand my typed name and drawn signature count as my signature.</span>
        </label>
        <Button type="submit" size="lg" className="w-full">Sign agreement</Button>
        <p className="text-xs text-[#5f6f92]">We store your name, signature, the time and your IP address with a signed PDF copy.</p>
      </form>
    </PortalShell>
  );
}
