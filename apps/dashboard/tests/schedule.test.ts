import { describe, expect, it } from "vitest";
import { dueOccurrence, matchesWeekInterval, nextOccurrences, previousOccurrence, validateCron } from "@/lib/routines/schedule";
import { describeCron } from "@/lib/routines/describe";

const TZ = "America/Port_of_Spain";
const base = { timezone: TZ, everyNWeeks: 1, anchorDate: null, enabled: true };

describe("AST cron conversion", () => {
  it("07:00 AST is 11:00 UTC (UTC-4, no DST)", () => {
    expect(previousOccurrence("0 7 * * *", TZ, new Date("2026-11-03T11:05:00Z")).toISOString()).toBe("2026-11-03T11:00:00.000Z");
    // Same offset in July — Trinidad has no daylight saving.
    expect(previousOccurrence("0 7 * * *", TZ, new Date("2026-07-15T11:05:00Z")).toISOString()).toBe("2026-07-15T11:00:00.000Z");
  });

  it("Mon-Fri 08:00 skips the weekend", () => {
    const next = nextOccurrences({ cron: "0 8 * * 1-5", ...base }, new Date("2026-11-06T13:00:00Z"), 2); // Fri 09:00 AST
    expect(next.map((d) => d.toISOString())).toEqual(["2026-11-09T12:00:00.000Z", "2026-11-10T12:00:00.000Z"]);
  });

  it("1st of month 08:00 AST", () => {
    expect(nextOccurrences({ cron: "0 8 1 * *", ...base }, new Date("2026-11-03T00:00:00Z"), 1)[0]!.toISOString()).toBe("2026-12-01T12:00:00.000Z");
  });

  it("an occurrence exactly at now counts as previous", () => {
    expect(previousOccurrence("0 12 * * *", TZ, new Date("2026-11-03T16:00:00Z")).toISOString()).toBe("2026-11-03T16:00:00.000Z");
  });
});

describe("every 2nd Wednesday", () => {
  const r = { cron: "0 9 * * 3", timezone: TZ, everyNWeeks: 2, anchorDate: "2026-11-04" };
  it("runs on anchor week and every other week after", () => {
    const next = nextOccurrences(r, new Date("2026-11-01T00:00:00Z"), 3).map((d) => d.toISOString().slice(0, 10));
    expect(next).toEqual(["2026-11-04", "2026-11-18", "2026-12-02"]);
  });
  it("off-weeks don't match", () => {
    expect(matchesWeekInterval(new Date("2026-11-11T13:00:00Z"), r)).toBe(false);
  });
});

describe("dueOccurrence", () => {
  const r = { ...base, cron: "0 12 * * *", lastScheduledFor: new Date("2026-11-02T16:00:00Z") };
  it("not due before 12:00 AST", () => {
    expect(dueOccurrence(r, new Date("2026-11-03T15:59:00Z")).due).toBe(false);
  });
  it("due at 12:00-12:15 AST", () => {
    const d = dueOccurrence(r, new Date("2026-11-03T16:07:00Z"));
    expect(d).toEqual({ due: true, occurrence: new Date("2026-11-03T16:00:00Z") });
  });
  it("not due again once claimed", () => {
    expect(dueOccurrence({ ...r, lastScheduledFor: new Date("2026-11-03T16:00:00Z") }, new Date("2026-11-03T16:22:00Z"))).toMatchObject({ due: false, reason: "already-claimed" });
  });
  it("skips stale occurrences outside the grace window", () => {
    expect(dueOccurrence(r, new Date("2026-11-03T21:00:00Z"))).toMatchObject({ due: false, reason: "outside-grace" });
  });
  it("disabled routines are never due", () => {
    expect(dueOccurrence({ ...r, enabled: false }, new Date("2026-11-03T16:07:00Z")).due).toBe(false);
  });
});

describe("cron validation & description", () => {
  it("rejects bad expressions", () => {
    expect(validateCron("0 7 * *")).toMatch(/5 fields/);
    expect(validateCron("99 7 * * *")).not.toBeNull();
    expect(validateCron("0 7 * * *")).toBeNull();
  });
  it("describes the seeded schedules", () => {
    expect(describeCron("0 7 * * *")).toBe("Daily 7:00 am AST");
    expect(describeCron("0 8 * * 1-5")).toBe("Mon–Fri 8:00 am AST");
    expect(describeCron("0 9 * * 3", 2)).toBe("Every 2nd Wednesday 9:00 am AST");
    expect(describeCron("0 8 1 * *")).toBe("1st of month 8:00 am AST");
    expect(describeCron("0 16 * * 5")).toBe("Fridays 4:00 pm AST");
  });
});
