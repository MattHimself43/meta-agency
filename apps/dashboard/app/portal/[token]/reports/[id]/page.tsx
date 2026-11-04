import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { ReportContent } from "@/lib/reports/service";
import { ReportView } from "@/components/reports/report-view";
import { PortalShell, portalClient } from "../../shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Report", robots: { index: false, follow: false } };

export default async function PortalReport({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const client = await portalClient(token);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [r] = await db.select().from(schema.reports).where(and(eq(schema.reports.id, id), eq(schema.reports.clientId, client.id), eq(schema.reports.status, "approved")));
  if (!r) notFound();
  const c = r.content as ReportContent;
  return (
    <PortalShell token={token} kicker={c.periodLabel} title={c.title}>
      <div className="glass rounded-[22px] p-5"><ReportView r={c} /></div>
    </PortalShell>
  );
}
