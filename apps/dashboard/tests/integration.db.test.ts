/**
 * Phase 0 acceptance against a real Postgres (TEST_DATABASE_URL), migrated + seeded.
 *   - the System test routine runs from the dispatcher at the right AST time and lands in the run log
 *   - reruns don't duplicate
 *   - an approval item can be approved and the decision is in the audit log
 *   - auto-approve only works for allowed types; audit log is append-only
 * Skipped when TEST_DATABASE_URL is not set.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("Phase 0 acceptance (database)", () => {
  // Loaded lazily so DATABASE_URL is set first.
  let m: {
    db: typeof import("@/lib/db").db;
    schema: typeof import("@/lib/db").schema;
    eq: typeof import("drizzle-orm").eq;
    and: typeof import("drizzle-orm").and;
    sql: typeof import("drizzle-orm").sql;
    dispatch: typeof import("@/lib/routines/runner").dispatchDueRoutines;
    approvals: typeof import("@/lib/approvals");
  };
  const owner = { userId: "11111111-1111-4111-8111-111111111111", email: "owner@test", role: "owner" as const, name: "Owner" };
  const manager = { ...owner, userId: "22222222-2222-4222-8222-222222222222", role: "account_manager" as const };

  beforeAll(async () => {
    const dbm = await import("@/lib/db");
    const orm = await import("drizzle-orm");
    m = {
      db: dbm.db,
      schema: dbm.schema,
      eq: orm.eq,
      and: orm.and,
      sql: orm.sql,
      dispatch: (await import("@/lib/routines/runner")).dispatchDueRoutines,
      approvals: await import("@/lib/approvals"),
    };
    // Only the System test routine is enabled; last claimed slot = yesterday noon AST.
    await m.db.update(m.schema.routines).set({ enabled: false });
    await m.db
      .update(m.schema.routines)
      .set({ enabled: true, cron: "0 12 * * *", lastScheduledFor: new Date("2026-11-02T16:00:00Z") })
      .where(m.eq(m.schema.routines.key, "system_test"));
    await m.db.delete(m.schema.approvals).where(m.sql`dedupe_key like 'system_test:%'`);
    await m.db.delete(m.schema.routineRuns).where(m.sql`routine_id = (select id from routines where key = 'system_test')`);
  });

  // Leave the database as we found it (apart from the append-only audit log).
  afterAll(async () => {
    await m.db.delete(m.schema.approvals).where(m.sql`dedupe_key like 'test:%' or dedupe_key like 'system_test:%'`);
    await m.db.delete(m.schema.routineRuns).where(m.sql`routine_id = (select id from routines where key = 'system_test')`);
  });

  it("does nothing at 11:59 AST", async () => {
    const res = await m.dispatch(new Date("2026-11-03T15:59:00Z"), Date.now() + 30_000);
    expect(res).toEqual([]);
  });

  it("runs the System test at 12:00 AST (16:00 UTC) and logs the run", async () => {
    const res = await m.dispatch(new Date("2026-11-03T16:07:00Z"), Date.now() + 30_000);
    expect(res).toEqual([{ key: "system_test", status: "succeeded", occurrence: "2026-11-03T16:00:00.000Z" }]);

    const [routine] = await m.db.select().from(m.schema.routines).where(m.eq(m.schema.routines.key, "system_test"));
    const runs = await m.db
      .select()
      .from(m.schema.routineRuns)
      .where(m.and(m.eq(m.schema.routineRuns.routineId, routine!.id), m.eq(m.schema.routineRuns.scheduledFor, new Date("2026-11-03T16:00:00Z"))));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("succeeded");
    expect(runs[0]!.digestLine).toMatch(/System test OK/);
    expect(routine!.lastStatus).toBe("succeeded");
  });

  it("is idempotent: the next 15-minute tick doesn't run it again", async () => {
    const res = await m.dispatch(new Date("2026-11-03T16:22:00Z"), Date.now() + 30_000);
    expect(res).toEqual([]);
    const items = await m.db.select().from(m.schema.approvals).where(m.eq(m.schema.approvals.dedupeKey, "system_test:2026-11-03T16:00:00.000Z"));
    expect(items).toHaveLength(1);
  });

  it("approving the item updates it and writes the audit log", async () => {
    const [item] = await m.db.select().from(m.schema.approvals).where(m.eq(m.schema.approvals.dedupeKey, "system_test:2026-11-03T16:00:00.000Z"));
    expect(item!.status).toBe("pending");
    const decided = await m.approvals.decideApproval(item!.id, "approve", owner, "looks good");
    expect(decided.status).toBe("approved");
    expect(decided.decidedBy).toBe(owner.userId);

    const log = await m.db.select().from(m.schema.auditLog).where(m.and(m.eq(m.schema.auditLog.approvalId, item!.id), m.eq(m.schema.auditLog.action, "approval.approved")));
    expect(log).toHaveLength(1);
    expect(log[0]!.approvedBy).toBe(owner.userId);

    await expect(m.approvals.decideApproval(item!.id, "reject", owner)).rejects.toThrow(/Already approved/);
  });

  it("account managers cannot approve high-risk items", async () => {
    const { approval } = await m.approvals.createApproval({ itemType: "invoice", title: "Test invoice", dedupeKey: `test:inv:${Date.now()}` });
    expect(approval.riskLevel).toBe("high");
    await expect(m.approvals.decideApproval(approval.id, "approve", manager)).rejects.toThrow(/owner/i);
    await m.approvals.decideApproval(approval.id, "reject", owner);
  });

  it("auto-approve applies only to allowed types, even if settings are tampered", async () => {
    await m.db.update(m.schema.settings).set({ autoApproveRules: { followup_day3: true, outreach_opener: true } });
    // getSettings is per-request cached via React cache(); outside a request it reads fresh each call.
    const a = await m.approvals.createApproval({ itemType: "followup_day3", title: "Day 3", dedupeKey: `test:d3:${Date.now()}` });
    const b = await m.approvals.createApproval({ itemType: "outreach_opener", title: "Opener", dedupeKey: `test:op:${Date.now()}` });
    expect(a.approval.status).toBe("auto_approved");
    expect(b.approval.status).toBe("pending");
    await m.db.update(m.schema.settings).set({ autoApproveRules: { followup_day3: false, followup_day7: false } });
  });

  it("same dedupe key never creates a duplicate", async () => {
    const key = `test:dup:${Date.now()}`;
    const first = await m.approvals.createApproval({ itemType: "system_test", title: "A", dedupeKey: key });
    const second = await m.approvals.createApproval({ itemType: "system_test", title: "B", dedupeKey: key });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.approval.id).toBe(first.approval.id);
  });

  it("audit log rejects updates and deletes", async () => {
    // Drizzle wraps the Postgres error; the trigger's message is on .cause.
    const pgMessage = async (q: Promise<unknown>) => {
      try {
        await q;
        return "no error";
      } catch (e) {
        return String((e as { cause?: Error }).cause?.message ?? (e as Error).message);
      }
    };
    expect(await pgMessage(m.db.execute(m.sql`UPDATE audit_log SET action = 'tampered'`))).toMatch(/append-only/);
    expect(await pgMessage(m.db.execute(m.sql`DELETE FROM audit_log`))).toMatch(/append-only/);
  });
});
