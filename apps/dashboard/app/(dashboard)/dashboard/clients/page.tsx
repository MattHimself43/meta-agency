import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Clients" };
const STATUS_TONE = { onboarding: "medium", active: "low", paused: "muted", churned: "high" } as const;

export default async function ClientsPage() {
  await requireStaffPage();
  const rows = await db
    .select({
      c: schema.clients,
      pkg: schema.packages.name,
      fee: schema.packages.monthlyFeeCents,
      niche: schema.niches.name,
      done: sql<number>`(select count(*)::int from onboarding_steps s where s.client_id = ${schema.clients.id} and s.status = 'done')`,
      total: sql<number>`(select count(*)::int from onboarding_steps s where s.client_id = ${schema.clients.id})`,
      live: sql<number>`(select count(*)::int from campaign_plans p where p.client_id = ${schema.clients.id} and p.status = 'live')`,
      review: sql<number>`(select count(*)::int from creatives c where c.client_id = ${schema.clients.id} and c.status = 'client_review')`,
    })
    .from(schema.clients)
    .leftJoin(schema.packages, eq(schema.packages.id, schema.clients.packageId))
    .leftJoin(schema.niches, eq(schema.niches.id, schema.clients.nicheId))
    .orderBy(asc(schema.clients.status), asc(schema.clients.name));

  return (
    <>
      <PageHeader kicker="Deliver" title="Clients" description="New clients appear here when a lead moves to Won." />
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Client</TH>
              <TH>Status</TH>
              <TH className="hidden md:table-cell">Package</TH>
              <TH>Onboarding</TH>
              <TH className="hidden lg:table-cell">Campaigns</TH>
              <TH className="hidden lg:table-cell">Health</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map(({ c, pkg, fee, niche, done, total, live, review }) => (
              <TR key={c.id}>
                <TD>
                  <Link href={`/dashboard/clients/${c.id}`} className="font-medium hover:text-brand-cyan">{c.name}</Link>
                  <p className="text-xs text-[#5f6f92]">{niche ?? "—"}{c.contactName ? ` · ${c.contactName}` : ""}</p>
                </TD>
                <TD><Badge variant={STATUS_TONE[c.status]}>{c.status}</Badge></TD>
                <TD className="hidden md:table-cell text-sm text-[#c2d1ef]">{pkg ?? "—"}{fee ? ` · ${formatMoney(fee, "TTD", { decimals: false })}/mo` : ""}</TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[rgba(120,170,255,0.12)]"><div className="h-full bg-[linear-gradient(100deg,#2e6bff,#5fe3ff)]" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
                    <span className="text-xs text-[#5f6f92]">{done}/{total}</span>
                  </div>
                </TD>
                <TD className="hidden lg:table-cell text-sm text-[#c2d1ef]">{live} live{review ? ` · ${review} ad(s) with client` : ""}</TD>
                <TD className="hidden lg:table-cell text-sm">{c.healthScore ?? "—"}</TD>
              </TR>
            ))}
            {rows.length === 0 ? <TR><TD colSpan={6} className="py-10 text-center text-muted-foreground">No clients yet. Move a lead to Won on the Pipeline.</TD></TR> : null}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
