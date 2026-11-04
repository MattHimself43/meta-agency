import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { resolveShare } from "@/lib/share";
import { loadDoc } from "@/lib/docs/load";
import type { DocKind } from "@/lib/docs/sections";
import { Ambient } from "@/components/ambient";
import { Button } from "@/components/ui/button";
import { DocView } from "@/components/docs/doc-view";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function SharePage({ params }: { params: Promise<{ kind: string; token: string }> }) {
  const { kind, token } = await params;
  const r = await resolveShare(kind, token);
  if (r.status === "rate_limited") return <p className="p-10 text-center text-muted-foreground">Too many requests — please try again in a few minutes.</p>;
  if (r.status !== "ok") notFound();
  const d = (await loadDoc(kind as DocKind, r.row.id))!;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <Ambient />
      <p className="kicker">{d.agencyName}</p>
      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">{d.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{d.subtitle}</p>
      <div className="mt-4">
        <Button asChild size="sm" variant="outline"><a href={`/share/${kind}/${token}/pdf`}><Download /> Download PDF</a></Button>
      </div>
      <div className="glass mt-8 rounded-[22px] p-5 sm:p-8">
        <DocView kind={kind as DocKind} content={d.content} pkg={d.pkg} setupWaived={d.setupWaived} />
      </div>
    </main>
  );
}
