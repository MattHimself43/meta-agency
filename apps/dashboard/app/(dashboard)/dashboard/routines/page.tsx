import Link from "next/link";
import { asc } from "drizzle-orm";
import { Play } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import { nextOccurrences } from "@/lib/routines/schedule";
import { ROUTINE_PHASE } from "@/lib/routines/definitions";
import { CURRENT_PHASE } from "@/lib/routines/registry";
import { describeCron } from "@/lib/routines/describe";
import { formatAst } from "@/lib/time";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RoutineToggle } from "@/components/routines/toggle";
import { PageHeader } from "@/components/page-header";
import { RunStatusBadge } from "@/components/routines/status-badge";
import { runRoutineNowAction } from "../actions";

export const metadata = { title: "Routines" };

export default async function RoutinesPage() {
  const actor = await requireStaffPage();
  const routines = await db.select().from(schema.routines).orderBy(asc(schema.routines.name));
  const now = new Date();

  return (
    <>
      <PageHeader kicker="System" title="Routines" description="Scheduled work, in Trinidad time (AST). The dispatcher checks every 15 minutes." />
      <Card className="divide-y divide-[var(--line)] overflow-hidden">
        {routines.map((r) => {
          const phase = ROUTINE_PHASE[r.key] ?? 0;
          const built = phase <= CURRENT_PHASE;
          const next = r.enabled ? nextOccurrences(r, now, 1)[0] : undefined;
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-3 p-4 transition-colors hover:bg-[rgba(46,107,255,0.05)] sm:px-6">
              <RoutineToggle id={r.id} enabled={r.enabled} disabled={actor.role !== "owner"} label={`Enable ${r.name}`} />
              <div className="min-w-0 flex-1">
                <Link href={`/dashboard/routines/${r.id}`} className="font-display font-semibold tracking-tight hover:text-brand-cyan">
                  {r.name}
                </Link>
                {!built ? <Badge variant="muted" className="ml-2">Phase {phase}</Badge> : null}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {describeCron(r.cron, r.everyNWeeks)} · {next ? `next ${formatAst(next, "EEE d MMM, h:mm a")}` : "off"}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RunStatusBadge status={r.lastStatus} />
                {r.lastRunAt ? <span>{formatAst(r.lastRunAt, "d MMM h:mm a")}</span> : null}
              </div>
              <form action={runRoutineNowAction}>
                <input type="hidden" name="id" value={r.id} />
                <Button size="sm" variant="outline">
                  <Play /> Run now
                </Button>
              </form>
            </div>
          );
        })}
        {routines.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No routines yet. Run <code>npm run seed</code>.</p> : null}
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">Switching a routine on starts it from its next scheduled time. Routines tagged with a phase are placeholders until that phase ships.</p>
    </>
  );
}
