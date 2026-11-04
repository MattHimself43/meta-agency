import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * Small Postgres-backed job queue. Long routines (lead research, many reports) enqueue one job
 * per item; the dispatcher drains the queue in batches within its time budget, so no single
 * Vercel function call runs past its limit.
 */
export type Job = typeof schema.jobs.$inferSelect;
export type JobHandler = (job: Job) => Promise<unknown>;

export const jobHandlers: Record<string, JobHandler> = {
  noop: async (job) => ({ echoed: job.payload }),
};

export async function enqueueJob(type: string, payload: Record<string, unknown>, opts: { dedupeKey?: string; runAfter?: Date; routineRunId?: string } = {}) {
  const [row] = await db
    .insert(schema.jobs)
    .values({ type, payload, dedupeKey: opts.dedupeKey, runAfter: opts.runAfter ?? new Date(), routineRunId: opts.routineRunId })
    .onConflictDoNothing({ target: schema.jobs.dedupeKey })
    .returning();
  return row ?? null;
}

const STALE_LOCK_MINUTES = 10;

async function claimNext(): Promise<Job | null> {
  const rows = await db.execute<Job>(sql`
    UPDATE jobs SET status = 'running', locked_at = now(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM jobs
      WHERE (status = 'queued' AND run_after <= now())
         OR (status = 'running' AND locked_at < now() - make_interval(mins => ${STALE_LOCK_MINUTES}))
      ORDER BY run_after
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, type, payload, attempts, max_attempts AS "maxAttempts"
  `);
  return (rows[0] as unknown as Job) ?? null;
}

/** Drain jobs until the deadline (ms epoch) or the queue is empty. */
export async function processJobs(deadline: number, max = 50) {
  let processed = 0;
  let failed = 0;
  while (processed < max && Date.now() < deadline - 5_000) {
    const job = await claimNext();
    if (!job) break;
    processed++;
    const handler = jobHandlers[job.type];
    try {
      if (!handler) throw new Error(`No handler for job type "${job.type}"`);
      const result = await handler(job);
      await db.execute(sql`UPDATE jobs SET status='succeeded', finished_at=now(), result=${JSON.stringify(result ?? null)}::jsonb, error=null WHERE id=${job.id}`);
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      const retry = job.attempts < job.maxAttempts;
      await db.execute(sql`
        UPDATE jobs SET status = ${retry ? "queued" : "failed"}, error = ${msg},
          run_after = now() + make_interval(mins => ${retry ? 5 : 0}),
          finished_at = ${retry ? null : new Date().toISOString()}::timestamptz
        WHERE id = ${job.id}`);
    }
  }
  return { processed, failed };
}
