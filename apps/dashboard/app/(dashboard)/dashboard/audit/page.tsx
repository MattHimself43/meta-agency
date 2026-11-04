import Link from "next/link";
import { desc, eq, lt, and, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireOwnerPage } from "@/lib/auth";
import { formatAst } from "@/lib/time";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Audit log" };
const PAGE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ before?: string; actor?: string }> }) {
  await requireOwnerPage();
  const sp = await searchParams;
  const conds: SQL[] = [];
  if (sp.before && /^\d+$/.test(sp.before)) conds.push(lt(schema.auditLog.id, Number(sp.before)));
  if (sp.actor && ["user", "routine", "ai", "system", "portal", "webhook"].includes(sp.actor)) conds.push(eq(schema.auditLog.actorType, sp.actor));
  const rows = await db.select().from(schema.auditLog).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.auditLog.id)).limit(PAGE);
  const last = rows.at(-1);

  return (
    <>
      <PageHeader kicker="System" title="Audit log" description="Append-only record of every action: who or what did it, and who approved it." />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {["all", "user", "routine", "ai", "system", "portal"].map((a) => (
          <Link key={a} href={a === "all" ? "/dashboard/audit" : `/dashboard/audit?actor=${a}`} className={`rounded-full px-4 py-1.5 capitalize transition-all ${(sp.actor ?? "all") === a ? "btn-grad font-semibold" : "btn-ghost-line text-muted-foreground hover:text-foreground"}`}>
            {a}
          </Link>
        ))}
      </div>
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>When (AST)</TH>
              <TH>Actor</TH>
              <TH>Action</TH>
              <TH>Entity</TH>
              <TH>Details</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="whitespace-nowrap">{formatAst(r.at, "d MMM, h:mm:ss a")}</TD>
                <TD>
                  <Badge variant="muted">{r.actorType}</Badge> <span className="text-xs text-muted-foreground">{r.actorId?.slice(0, 18)}</span>
                </TD>
                <TD className="font-mono text-xs">{r.action}</TD>
                <TD className="text-xs">{r.entityTable ? `${r.entityTable}${r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}` : "—"}</TD>
                <TD className="max-w-md truncate font-mono text-[11px] text-muted-foreground">{JSON.stringify(r.details)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      {rows.length === PAGE && last ? (
        <Link href={`/dashboard/audit?before=${last.id}${sp.actor ? `&actor=${sp.actor}` : ""}`} className="mt-3 inline-block text-sm text-brand-cyan hover:underline">
          Older →
        </Link>
      ) : null}
    </>
  );
}
