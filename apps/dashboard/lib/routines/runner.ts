import "server-only";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { raiseAlert } from "@/lib/alerts";
import { sendSystemEmail, escapeHtml } from "@/lib/email";
import { getSettings } from "@/lib/settings";
import { routineHandlers } from "./registry";
import { dueOccurrence } from "./schedule";
import type { Routine, RoutineRun } from "./types";

export type Trigger = "schedule" | "manual" | "retry";

/**
 * Run one routine occurrence. On failure it retries once straight away; if the retry also fails
 * the run is marked failed and an urgent alert is raised (and emailed when Resend is configured).
 */
export async function runRoutine(
  routine: Routine,
  opts: { trigger: Trigger; scheduledFor?: Date | null; deadline: number; actorId?: string },
): Promise<RoutineRun> {
  let last: RoutineRun | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    last = await runAttempt(routine, { ...opts, attempt, trigger: attempt === 1 ? opts.trigger : "retry" });
    if (last.status !== "failed") break;
    if (Date.now() > opts.deadline - 10_000) break; // no time left to retry inside this invocation
  }
  const run = last!;
  await db
    .update(schema.routines)
    .set({ lastRunAt: run.startedAt, lastStatus: run.status })
    .where(eq(schema.routines.id, routine.id));

  if (run.status === "failed") {
    await raiseAlert({
      kind: "routine_failed",
      severity: "urgent",
      title: `Routine failed: ${routine.name}`,
      body: run.error ?? undefined,
      link: `/dashboard/routines/${routine.id}`,
      dedupeKey: `routine_failed:${routine.id}:${run.scheduledFor?.toISOString() ?? run.id}`,
    });
    await emailUrgent(`Routine failed: ${routine.name}`, run.error ?? "Unknown error").catch(() => {});
  }
  return run;
}

async function runAttempt(
  routine: Routine,
  opts: { trigger: Trigger; scheduledFor?: Date | null; deadline: number; attempt: number; actorId?: string },
): Promise<RoutineRun> {
  const started = Date.now();
  const [run] = await db
    .insert(schema.routineRuns)
    .values({
      routineId: routine.id,
      scheduledFor: opts.scheduledFor ?? null,
      trigger: opts.trigger,
      attempt: opts.attempt,
      status: "running",
      createdBy: opts.actorId ?? null,
    })
    // A scheduled occurrence runs at most once per attempt, even if last_scheduled_for is reset.
    .onConflictDoNothing({ target: [schema.routineRuns.routineId, schema.routineRuns.scheduledFor, schema.routineRuns.attempt] })
    .returning();

  if (!run) {
    const [existing] = await db
      .select()
      .from(schema.routineRuns)
      .where(
        and(
          eq(schema.routineRuns.routineId, routine.id),
          eq(schema.routineRuns.scheduledFor, opts.scheduledFor!),
          eq(schema.routineRuns.attempt, opts.attempt),
        ),
      );
    return { ...existing!, status: existing!.status === "failed" ? "skipped" : existing!.status };
  }

  const handler = routineHandlers[routine.key];
  try {
    if (!handler) throw new Error(`No handler registered for routine "${routine.key}"`);
    const result = await handler({ routine, run: run!, now: new Date(), deadline: opts.deadline });
    const [done] = await db
      .update(schema.routineRuns)
      .set({
        status: result.status ?? "succeeded",
        finishedAt: new Date(),
        durationMs: Date.now() - started,
        output: result.output ?? {},
        digestLine: result.digest,
      })
      .where(eq(schema.routineRuns.id, run!.id))
      .returning();
    await logAudit({
      actorType: "routine",
      actorId: routine.key,
      action: `routine.${result.status ?? "succeeded"}`,
      entityTable: "routine_runs",
      entityId: run!.id,
      details: { trigger: opts.trigger, attempt: opts.attempt, digest: result.digest },
    });
    return done!;
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}` : String(e);
    const [failed] = await db
      .update(schema.routineRuns)
      .set({ status: "failed", finishedAt: new Date(), durationMs: Date.now() - started, error: msg.slice(0, 4000) })
      .where(eq(schema.routineRuns.id, run!.id))
      .returning();
    await logAudit({
      actorType: "routine",
      actorId: routine.key,
      action: "routine.failed",
      entityTable: "routine_runs",
      entityId: run!.id,
      details: { trigger: opts.trigger, attempt: opts.attempt, error: msg.slice(0, 500) },
    });
    return failed!;
  }
}

/**
 * Atomically claim an occurrence. Only one dispatcher invocation can move last_scheduled_for
 * forward to this occurrence, which makes overlapping or repeated cron calls safe.
 */
export async function claimOccurrence(routine: Routine, occurrence: Date): Promise<boolean> {
  const rows = await db
    .update(schema.routines)
    .set({ lastScheduledFor: occurrence })
    .where(
      and(
        eq(schema.routines.id, routine.id),
        or(isNull(schema.routines.lastScheduledFor), lt(schema.routines.lastScheduledFor, occurrence)),
      ),
    )
    .returning({ id: schema.routines.id });
  return rows.length === 1;
}

export async function dispatchDueRoutines(now: Date, deadline: number) {
  const all = await db.select().from(schema.routines).where(eq(schema.routines.enabled, true));
  const results: { key: string; status: string; occurrence?: string; reason?: string }[] = [];
  for (const routine of all) {
    if (Date.now() > deadline - 15_000) {
      results.push({ key: routine.key, status: "deferred", reason: "time budget" });
      continue;
    }
    const due = dueOccurrence(routine, now);
    if (!due.due) {
      // Mark long-missed occurrences as claimed so they're not considered again.
      if (due.reason === "outside-grace" && due.occurrence) await claimOccurrence(routine, due.occurrence);
      continue;
    }
    if (!(await claimOccurrence(routine, due.occurrence))) continue;
    try {
      const run = await runRoutine(routine, { trigger: "schedule", scheduledFor: due.occurrence, deadline });
      results.push({ key: routine.key, status: run.status, occurrence: due.occurrence.toISOString() });
    } catch (e) {
      // Never let one routine's infrastructure error stop the others.
      results.push({ key: routine.key, status: "error", reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

async function emailUrgent(subject: string, body: string) {
  const s = await getSettings();
  const to = s.digestEmail ?? s.ownerEmail;
  if (!to) return;
  await sendSystemEmail({ to, subject: `[AgencyOS] ${subject}`, html: `<p>${escapeHtml(body)}</p>` });
}
