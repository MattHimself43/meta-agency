import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, Play } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import { nextOccurrences } from "@/lib/routines/schedule";
import { describeCron } from "@/lib/routines/describe";
import { formatAst } from "@/lib/time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Notice, PageHeader } from "@/components/page-header";
import { RunStatusBadge } from "@/components/routines/status-badge";
import { RoutineToggle } from "@/components/routines/toggle";
import { runRoutineNowAction, updateRoutineScheduleAction } from "../../actions";

export default async function RoutineDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const actor = await requireStaffPage();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [routine] = await db.select().from(schema.routines).where(eq(schema.routines.id, id));
  if (!routine) notFound();
  const runs = await db.select().from(schema.routineRuns).where(eq(schema.routineRuns.routineId, id)).orderBy(desc(schema.routineRuns.startedAt)).limit(50);
  const upcoming = nextOccurrences(routine, new Date(), 5);
  const isOwner = actor.role === "owner";

  return (
    <>
      <Link href="/dashboard/routines" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand-cyan">
        <ArrowLeft className="h-4 w-4" /> Routines
      </Link>
      <PageHeader
        title={routine.name}
        description={routine.description ?? undefined}
        actions={
          <div className="flex items-center gap-3">
            <RoutineToggle id={routine.id} enabled={routine.enabled} disabled={!isOwner} label="Enabled" />
            <form action={runRoutineNowAction}>
              <input type="hidden" name="id" value={routine.id} />
              <Button size="sm">
                <Play /> Run now
              </Button>
            </form>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>{describeCron(routine.cron, routine.everyNWeeks)}</CardDescription>
          </CardHeader>
          <CardContent>
            {sp.error ? <Notice tone="error">{sp.error}</Notice> : null}
            {sp.saved ? <Notice>Saved.</Notice> : null}
            <form action={updateRoutineScheduleAction} className="space-y-3">
              <input type="hidden" name="id" value={routine.id} />
              <Field label="Cron (AST)" hint="minute hour day-of-month month day-of-week — e.g. 0 7 * * * = daily 07:00">
                <Input name="cron" defaultValue={routine.cron} disabled={!isOwner} className="font-mono" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Every N weeks">
                  <Input name="everyNWeeks" type="number" min={1} max={8} defaultValue={routine.everyNWeeks} disabled={!isOwner} />
                </Field>
                <Field label="Anchor date">
                  <Input name="anchorDate" type="date" defaultValue={routine.anchorDate ?? ""} disabled={!isOwner} />
                </Field>
              </div>
              {isOwner ? <Button size="sm" type="submit">Save schedule</Button> : null}
            </form>
            <div className="mt-5">
              <p className="kicker mb-2">Next runs (AST)</p>
              <ul className="space-y-0.5 text-sm">
                {upcoming.map((d) => (
                  <li key={d.toISOString()} className="flex items-center gap-2 text-[#c2d1ef]"><span className="glow-dot" />{formatAst(d, "EEE d MMM yyyy, h:mm a")}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Run log</CardTitle>
            <CardDescription>Failed runs retry once automatically, then raise an alert.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 sm:px-0">
            <Table>
              <THead>
                <TR>
                  <TH>Started (AST)</TH>
                  <TH>Trigger</TH>
                  <TH>Status</TH>
                  <TH>Duration</TH>
                  <TH>Result</TH>
                </TR>
              </THead>
              <TBody>
                {runs.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap">{formatAst(r.startedAt, "d MMM, h:mm:ss a")}</TD>
                    <TD>
                      {r.trigger}
                      {r.attempt > 1 ? ` #${r.attempt}` : ""}
                    </TD>
                    <TD>
                      <RunStatusBadge status={r.status} />
                    </TD>
                    <TD className="whitespace-nowrap">{r.durationMs != null ? `${r.durationMs} ms` : "—"}</TD>
                    <TD className="max-w-xs">
                      <span className={r.error ? "text-red-300" : "text-[#c2d1ef]"}>{r.error ?? r.digestLine ?? "—"}</span>
                    </TD>
                  </TR>
                ))}
                {runs.length === 0 ? (
                  <TR>
                    <TD colSpan={5} className="text-center text-muted-foreground">
                      No runs yet.
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
