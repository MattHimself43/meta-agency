import Link from "next/link";
import { desc, ne } from "drizzle-orm";
import { CheckCheck } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import { getPendingApprovals } from "@/lib/queries/home";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApprovalList } from "@/components/approvals/approval-list";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { approveAllLowRiskAction } from "../actions";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const actor = await requireStaffPage();
  const view = (await searchParams).view === "decided" ? "decided" : "pending";
  const items =
    view === "pending"
      ? await getPendingApprovals(200)
      : await db.select().from(schema.approvals).where(ne(schema.approvals.status, "pending")).orderBy(desc(schema.approvals.decidedAt)).limit(100);
  const lowRisk = view === "pending" ? items.filter((i) => i.riskLevel === "low").length : 0;

  return (
    <>
      <PageHeader
        kicker="Today"
        title="Approvals"
        description="The AI prepares, you approve. Every decision is written to the audit log."
        actions={
          lowRisk > 0 ? (
            <form action={approveAllLowRiskAction}>
              <Button size="sm" variant="secondary">
                <CheckCheck /> Approve all low risk ({lowRisk})
              </Button>
            </form>
          ) : null
        }
      />
      <div className="mb-4 flex gap-2 text-sm">
        {(["pending", "decided"] as const).map((v) => (
          <Link key={v} href={`/dashboard/approvals?view=${v}`} className={cn("rounded-full px-4 py-1.5 capitalize transition-all", view === v ? "btn-grad font-semibold" : "btn-ghost-line text-muted-foreground hover:text-foreground")}>
            {v}
          </Link>
        ))}
      </div>
      <Card>
        <CardContent className="pt-2 sm:pt-2">
          <ApprovalList items={items} role={actor.role} empty={view === "pending" ? "Nothing waiting. Nice." : "No decisions yet."} />
        </CardContent>
      </Card>
    </>
  );
}
