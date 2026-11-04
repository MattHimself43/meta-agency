import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { Download } from "lucide-react";
import { db, schema } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { findSharedReport, type ReportContent } from "@/lib/reports/service";
import { getSettings } from "@/lib/settings";
import { Ambient } from "@/components/ambient";
import { Button } from "@/components/ui/button";
import { ReportView } from "@/components/reports/report-view";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function SharedReport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43,}$/.test(token)) notFound();
  if (!(await rateLimit(`share:${clientIp(await headers())}`, 60, 600)).ok) return <p className="p-10 text-center text-muted-foreground">Too many requests — try again in a few minutes.</p>;
  const r = await findSharedReport(token);
  if (!r) notFound();
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, r.clientId));
  const settings = await getSettings();
  const c = r.content as ReportContent;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <Ambient />
      <p className="kicker">{settings.agencyName.startsWith("[") ? c.periodLabel : `${settings.agencyName} · ${c.periodLabel}`}</p>
      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-[-0.03em]">{c.title} — {client?.name}</h1>
      <div className="mt-4"><Button asChild size="sm" variant="outline"><a href={`/share/report/${token}/pdf`}><Download /> Download PDF</a></Button></div>
      <div className="glass mt-8 rounded-[22px] p-5 sm:p-8"><ReportView r={c} /></div>
    </main>
  );
}
