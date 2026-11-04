import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import type { ReportContent } from "@/lib/reports/service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireStaffPage();
  const rows = await db.select({ r: schema.reports, client: schema.clients.name }).from(schema.reports).innerJoin(schema.clients, eq(schema.clients.id, schema.reports.clientId)).orderBy(desc(schema.reports.periodStart)).limit(200);
  return (
    <>
      <PageHeader kicker="Deliver" title="Reports" description="Weekly reports every Monday 09:00 and monthly reviews on the 1st, drafted for your approval." />
      <Card>
        <Table>
          <THead><TR><TH>Client</TH><TH>Report</TH><TH>Period</TH><TH>Status</TH><TH className="hidden lg:table-cell">Headline</TH></TR></THead>
          <TBody>
            {rows.map(({ r, client }) => (
              <TR key={r.id}>
                <TD className="text-sm">{client}</TD>
                <TD><Link href={`/dashboard/reports/${r.id}`} className="font-medium hover:text-brand-cyan">{r.type === "weekly" ? "Weekly report" : "Monthly review"}</Link></TD>
                <TD className="text-sm">{(r.content as ReportContent).periodLabel}</TD>
                <TD><Badge variant={r.status === "approved" ? "low" : r.status === "archived" ? "muted" : "medium"}>{r.status === "draft" ? "waiting for approval" : r.status}</Badge></TD>
                <TD className="hidden lg:table-cell max-w-md truncate text-sm text-[#c2d1ef]">{(r.content as ReportContent).headline}</TD>
              </TR>
            ))}
            {rows.length === 0 ? <TR><TD colSpan={5} className="py-10 text-center text-muted-foreground">No reports yet — they need imported results (client → Performance).</TD></TR> : null}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
