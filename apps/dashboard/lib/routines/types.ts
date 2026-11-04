import type { schema } from "@/lib/db";

export type Routine = typeof schema.routines.$inferSelect;
export type RoutineRun = typeof schema.routineRuns.$inferSelect;

export type RoutineContext = {
  routine: Routine;
  run: RoutineRun;
  now: Date;
  /** ms epoch by which the handler should stop starting new work (split long work into jobs instead). */
  deadline: number;
};

export type RoutineResult = {
  status?: "succeeded" | "skipped";
  /** One line for the daily digest */
  digest: string;
  output?: Record<string, unknown>;
};

export type RoutineHandler = (ctx: RoutineContext) => Promise<RoutineResult>;
