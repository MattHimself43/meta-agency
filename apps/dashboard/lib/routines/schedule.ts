import { CronExpressionParser } from "cron-parser";
import { formatInTimeZone } from "date-fns-tz";
import { differenceInCalendarDays, parseISO } from "date-fns";

/**
 * Pure scheduling maths for routines. Cron expressions are written in the routine's timezone
 * (America/Port_of_Spain by default) and converted to UTC instants here.
 *
 * The dispatcher runs every 15 minutes. A routine is due when its most recent scheduled
 * occurrence is newer than the one it last claimed, and not older than GRACE (so a dispatcher
 * outage doesn't fire a week of stale runs; it fires at most the latest one, within the window).
 */
export const GRACE_MINUTES = 180;

export type Schedulable = {
  cron: string;
  timezone: string;
  everyNWeeks: number;
  anchorDate: string | null;
  lastScheduledFor: Date | null;
  enabled: boolean;
};

export function validateCron(expr: string): string | null {
  if (expr.trim().split(/\s+/).length !== 5) return "Use 5 fields: minute hour day-of-month month day-of-week";
  try {
    CronExpressionParser.parse(expr, { tz: "America/Port_of_Spain" });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid cron expression";
  }
}

/** Most recent occurrence at or before `now` (UTC instant). */
export function previousOccurrence(cron: string, tz: string, now: Date): Date {
  // +1s so an occurrence exactly at `now` counts as "previous".
  const it = CronExpressionParser.parse(cron, { currentDate: new Date(now.getTime() + 1000), tz });
  return it.prev().toDate();
}

export function nextOccurrences(r: Pick<Schedulable, "cron" | "timezone" | "everyNWeeks" | "anchorDate">, from: Date, count = 3): Date[] {
  const it = CronExpressionParser.parse(r.cron, { currentDate: from, tz: r.timezone });
  const out: Date[] = [];
  for (let guard = 0; out.length < count && guard < 500; guard++) {
    const d = it.next().toDate();
    if (matchesWeekInterval(d, r)) out.push(d);
  }
  return out;
}

/** For "every 2nd Wednesday": keep only weeks that are a multiple of N weeks from the anchor date (in local time). */
export function matchesWeekInterval(occurrence: Date, r: Pick<Schedulable, "timezone" | "everyNWeeks" | "anchorDate">): boolean {
  if (!r.everyNWeeks || r.everyNWeeks <= 1 || !r.anchorDate) return true;
  const localDay = formatInTimeZone(occurrence, r.timezone, "yyyy-MM-dd");
  const days = differenceInCalendarDays(parseISO(localDay), parseISO(r.anchorDate));
  const weeks = Math.floor(days / 7);
  return ((weeks % r.everyNWeeks) + r.everyNWeeks) % r.everyNWeeks === 0;
}

export type DueResult = { due: true; occurrence: Date } | { due: false; reason: string; occurrence?: Date };

export function dueOccurrence(r: Schedulable, now: Date, graceMinutes = GRACE_MINUTES): DueResult {
  if (!r.enabled) return { due: false, reason: "disabled" };
  const occurrence = previousOccurrence(r.cron, r.timezone, now);
  if (!matchesWeekInterval(occurrence, r)) return { due: false, reason: "off-week", occurrence };
  if (r.lastScheduledFor && r.lastScheduledFor.getTime() >= occurrence.getTime()) {
    return { due: false, reason: "already-claimed", occurrence };
  }
  if (now.getTime() - occurrence.getTime() > graceMinutes * 60_000) return { due: false, reason: "outside-grace", occurrence };
  return { due: true, occurrence };
}
