import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  await requireStaffPage();
  const rows = await db.select({ p: schema.campaignPlans, client: schema.clients.name }).from(schema.campaignPlans).innerJoin(schema.clients, eq(schema.clients.id, schema.campaignPlans.clientId)).orderBy(desc(schema.campaignPlans.updatedAt));
  return (
    <>
      <PageHeader kicker="Deliver" title="Campaigns" description="Manual mode: plan here, build in Ads Manager with the checklist, launch only from here. Create plans from a client's Campaigns tab." />
      <Card>
        <Table>
          <THead><TR><TH>Plan</TH><TH>Client</TH><TH>Status</TH><TH>Budget</TH></TR></THead>
          <TBody>
            {rows.map(({ p, client }) => (
              <TR key={p.id}>
                <TD><Link href={`/dashboard/campaigns/${p.id}`} className="font-medium hover:text-brand-cyan">{p.name}</Link>{p.specialAdCategory ? <Badge variant="medium" className="ml-2">{p.specialAdCategory === "HOUSING" ? "Housing" : "Credit"}</Badge> : null}</TD>
                <TD className="text-sm text-[#c2d1ef]">{client}</TD>
                <TD><Badge variant={p.status === "live" ? "low" : p.status === "draft" ? "muted" : "default"}>{p.status.replace("_", " ")}</Badge></TD>
                <TD className="text-sm">US${(p.budgetUsdCents / 100).toFixed(2)}/{p.budgetType === "daily" ? "day" : "total"}</TD>
              </TR>
            ))}
            {rows.length === 0 ? <TR><TD colSpan={4} className="py-10 text-center text-muted-foreground">No campaign plans yet.</TD></TR> : null}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
