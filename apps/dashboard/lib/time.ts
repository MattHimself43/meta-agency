import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

/** All displayed times and schedules use Trinidad & Tobago time (AST, UTC-4, no DST). */
export const TZ = "America/Port_of_Spain";

export function formatAst(date: Date | string | number | null | undefined, fmt = "d MMM yyyy, h:mm a"): string {
  if (date == null) return "—";
  return formatInTimeZone(new Date(date), TZ, fmt);
}

/** Calendar date (yyyy-MM-dd) in AST for an instant. */
export function astDateString(date: Date = new Date()): string {
  return formatInTimeZone(date, TZ, "yyyy-MM-dd");
}

/** Interpret a wall-clock time in AST ("2026-11-03 07:00") as a UTC instant. */
export function astToUtc(wallClock: string | Date): Date {
  return fromZonedTime(wallClock, TZ);
}

export function utcToAst(date: Date): Date {
  return toZonedTime(date, TZ);
}
