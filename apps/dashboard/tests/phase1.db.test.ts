/**
 * Phase 1 acceptance against a real Postgres (TEST_DATABASE_URL), migrated + seeded. No ANTHROPIC_API_KEY,
 * so drafts come from templates — the flow is identical with AI on.
 *   - the outreach routine produces 10 drafts, and a rerun adds none
 *   - "Open in WhatsApp" builds a correctly encoded wa.me link for a +1868 number
 *   - marking sent schedules the day-3 follow-up
 *   - a reply stops the sequence; "stop" sets do-not-contact
 *   - moving a lead to Won creates a client (and onboarding, and the setup invoice draft)
 *   - /book creates a booking, moves the lead to Call booked and refuses a double booking
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
delete process.env.ANTHROPIC_API_KEY;

const PREFIX = "TEST1 ";
const phone = (n: number) => `+1868555${String(1500 + n).padStart(4, "0")}`;

describe.skipIf(!url)("Phase 1 acceptance (database)", () => {
  let m: Awaited<ReturnType<typeof load>>;
  async function load() {
    const dbm = await import("@/lib/db");
    return {
      ...dbm,
      orm: await import("drizzle-orm"),
      seq: await import("@/lib/outreach/sequences"),
      batch: await import("@/lib/outreach/batch"),
      jobs: await import("@/lib/jobs"),
      handlers: await import("@/lib/job-handlers"),
      approvals: await import("@/lib/approvals"),
      leads: await import("@/lib/leads/service"),
      phone: await import("@/lib/phone"),
      booking: await import("@/lib/booking"),
    };
  }
  const owner = { userId: "11111111-1111-4111-8111-111111111111", email: "owner@test", role: "owner" as const, name: "Owner" };
  const leadIds: string[] = [];
  let savedSettings: Record<string, unknown> | null = null;

  async function cleanup() {
    const { db, orm } = m;
    const { sql } = orm;
    await db.execute(sql`DELETE FROM approvals WHERE subject_id IN (SELECT id FROM messages WHERE lead_id IN (SELECT id FROM leads WHERE business_name LIKE ${PREFIX + "%"}))`);
    await db.execute(sql`DELETE FROM approvals WHERE subject_id IN (SELECT i.id FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.name LIKE ${PREFIX + "%"})`);
    await db.execute(sql`DELETE FROM invoices WHERE client_id IN (SELECT id FROM clients WHERE name LIKE ${PREFIX + "%"})`);
    await db.execute(sql`DELETE FROM clients WHERE name LIKE ${PREFIX + "%"}`);
    await db.execute(sql`DELETE FROM bookings WHERE business_name LIKE ${PREFIX + "%"}`);
    await db.execute(sql`DELETE FROM jobs WHERE payload->>'leadId' IN (SELECT id::text FROM leads WHERE business_name LIKE ${PREFIX + "%"}) OR type IN ('draft_opener','draft_followup','call_brief')`);
    await db.execute(sql`DELETE FROM leads WHERE business_name LIKE ${PREFIX + "%"}`);
  }

  beforeAll(async () => {
    m = await load();
    m.handlers.registerJobHandlers();
    await cleanup();
    const { db, schema, orm } = m;
    // Only our test leads are "new" candidates, so the batch picks exactly these.
    await db.execute(orm.sql`UPDATE leads SET stage = 'nurture' WHERE stage = 'new' AND business_name NOT LIKE ${PREFIX + "%"}`);
    // The daily cap counts openers already drafted today; leave room for exactly 10 more.
    const [{ n: draftedToday }] = (await db.execute(orm.sql`SELECT count(*)::int AS n FROM messages WHERE purpose = 'outreach_opener' AND created_at >= ${m.seq.startOfAstDay(new Date()).toISOString()}::timestamptz`)) as unknown as [{ n: number }];
    const [before] = await db.select().from(schema.settings);
    savedSettings = { sendLimits: before!.sendLimits, autoApproveRules: before!.autoApproveRules, foundingOfferEnabled: before!.foundingOfferEnabled };
    await db.update(schema.settings).set({ sendLimits: { whatsapp: 10 + draftedToday, email: 20, dm: 10 }, autoApproveRules: {}, foundingOfferEnabled: false });
    const [dealers] = await db.select().from(schema.niches).where(orm.eq(schema.niches.slug, "car_dealers"));
    for (let i = 0; i < 12; i++) {
      const r = await m.leads.createLead(
        { businessName: `${PREFIX}Dealer ${i}`, nicheId: dealers!.id, contactName: `Pat ${i}`, phone: phone(i), area: "Chaguanas", signals: { ad_activity: (i % 10) / 10, inventory_size: 0.6 }, adNotes: "Boosted posts only" },
        { type: "system" },
      );
      leadIds.push(r.lead.id);
    }
  });
  afterAll(async () => {
    await cleanup();
    if (savedSettings) await m.db.update(m.schema.settings).set(savedSettings);
  });

  it("outreach routine produces 10 drafts, highest score first, and reruns add none", async () => {
    const now = new Date();
    const plan = await m.batch.planOutreachBatch(now);
    expect(plan.openers).toBe(10);
    await m.jobs.processJobs(Date.now() + 60_000);
    const { db, schema, orm } = m;
    const drafts = await db
      .select()
      .from(schema.messages)
      .where(orm.and(orm.inArray(schema.messages.leadId, leadIds), orm.eq(schema.messages.purpose, "outreach_opener")));
    expect(drafts).toHaveLength(10);
    expect(drafts.every((d) => d.status === "draft" && d.body && (d.variants as string[]).length === 2)).toBe(true);
    const queued = await db.select().from(schema.approvals).where(orm.and(orm.inArray(schema.approvals.subjectId, drafts.map((d) => d.id)), orm.eq(schema.approvals.status, "pending")));
    expect(queued).toHaveLength(10);
    expect(queued.every((q) => q.itemType === "outreach_opener")).toBe(true);

    // The two lowest-scored leads were not picked.
    const draftedLeads = new Set(drafts.map((d) => d.leadId));
    const unpicked = leadIds.filter((id) => !draftedLeads.has(id));
    expect(unpicked).toHaveLength(2);

    // Rerun the same day: nothing new.
    const again = await m.batch.planOutreachBatch(now);
    expect(again.openers).toBe(0);
  });

  it("approve → Open in WhatsApp link is correct → mark sent schedules day 3", async () => {
    const { db, schema, orm } = m;
    const [msg] = await db
      .select()
      .from(schema.messages)
      .where(orm.and(orm.inArray(schema.messages.leadId, leadIds), orm.eq(schema.messages.purpose, "outreach_opener")))
      .limit(1);
    const [approval] = await db.select().from(schema.approvals).where(orm.eq(schema.approvals.subjectId, msg!.id));
    await m.approvals.decideApproval(approval!.id, "approve", owner);

    const today = await m.seq.todaysSends();
    const row = today.find((t) => t.message.id === msg!.id)!;
    expect(row).toBeTruthy();
    const link = m.phone.waLink(row.lead.whatsapp!, row.message.body!);
    expect(link.startsWith(`https://wa.me/1868555`)).toBe(true);
    expect(new URL(link).searchParams.get("text")).toBe(row.message.body);
    expect(link).not.toContain(" ");

    const sentAt = new Date();
    const { next } = await m.seq.markSent(msg!.id, owner.userId, sentAt);
    expect(next).toBeTruthy();
    expect(next!.purpose).toBe("followup_day3");
    expect(next!.stepOrder).toBe(2);
    expect(Math.round((next!.dueAt!.getTime() - sentAt.getTime()) / 86400_000)).toBe(3);
    const lead = await m.leads.getLead(msg!.leadId!);
    expect(lead!.stage).toBe("contacted");
    expect(lead!.nextAction).toBe("Day-3 follow-up");

    // On day 3 the batch writes the follow-up and queues it for approval.
    const day3 = new Date(sentAt.getTime() + 3 * 86400_000 + 60_000);
    const plan = await m.batch.planOutreachBatch(day3);
    expect(plan.followups).toBeGreaterThanOrEqual(1);
    await m.jobs.processJobs(Date.now() + 60_000);
    const [written] = await db.select().from(schema.messages).where(orm.eq(schema.messages.id, next!.id));
    expect(written!.body).toBeTruthy();
    const [fuApproval] = await db.select().from(schema.approvals).where(orm.eq(schema.approvals.subjectId, next!.id));
    expect(fuApproval!.itemType).toBe("followup_day3");
    expect(fuApproval!.riskLevel).toBe("low");
  });

  it("a reply stops the sequence", async () => {
    const { db, schema, orm } = m;
    const [sent] = await db.select().from(schema.messages).where(orm.and(orm.inArray(schema.messages.leadId, leadIds), orm.eq(schema.messages.status, "sent")));
    const leadId = sent!.leadId!;
    const r = await m.seq.recordReply(leadId, "Sure, send it through", owner.userId);
    expect(r.classification).toBe("interested");
    expect(r.cancelledDrafts).toBeGreaterThanOrEqual(1);
    const pending = await db.select().from(schema.messages).where(orm.and(orm.eq(schema.messages.leadId, leadId), orm.inArray(schema.messages.status, ["draft", "approved"]), orm.isNotNull(schema.messages.sequenceStepId)));
    expect(pending).toHaveLength(0);
    const lead = await m.leads.getLead(leadId);
    expect(lead!.stage).toBe("replied");
    expect(lead!.sequenceStopReason).toBe("replied");
    const replyDraft = await db.select().from(schema.approvals).where(orm.and(orm.eq(schema.approvals.itemType, "reply_draft"), orm.eq(schema.approvals.subjectId, r.message!.id)));
    expect(replyDraft).toHaveLength(1);
    // Stopped sequences don't come back in the next batch.
    const plan = await m.batch.planOutreachBatch(new Date(Date.now() + 10 * 86400_000));
    expect(plan.followups).toBe(0);
  });

  it("'stop' sets do-not-contact and blocks sending", async () => {
    const leadId = leadIds[11]!;
    const r = await m.seq.recordReply(leadId, "Please stop messaging me", owner.userId);
    expect(r.classification).toBe("stop");
    const lead = await m.leads.getLead(leadId);
    expect(lead!.doNotContact).toBe(true);
    expect(lead!.stage).toBe("lost");
    expect(r.message).toBeNull();
    const res = await m.seq.draftOpener(leadId, "test");
    expect(res.status).toBe("skipped");
  });

  it("Lost needs a reason; Won creates the client, onboarding and setup invoice (numbered on approval)", async () => {
    const { db, schema, orm } = m;
    await expect(m.leads.moveStage(leadIds[1]!, "lost", owner.userId)).rejects.toThrow(/reason/);

    const leadId = leadIds[2]!;
    const res = await m.leads.moveStage(leadId, "won", owner.userId);
    expect(res.client).toBeTruthy();
    expect(res.client!.leadId).toBe(leadId);
    expect(res.client!.status).toBe("onboarding");
    expect(res.portalToken!.length).toBeGreaterThanOrEqual(43);
    const steps = await db.select().from(schema.onboardingSteps).where(orm.eq(schema.onboardingSteps.clientId, res.client!.id));
    expect(steps).toHaveLength(6);

    const [inv] = await db.select().from(schema.invoices).where(orm.eq(schema.invoices.clientId, res.client!.id));
    expect(inv!.kind).toBe("setup");
    expect(inv!.number).toBeNull();
    const [invApproval] = await db.select().from(schema.approvals).where(orm.eq(schema.approvals.subjectId, inv!.id));
    expect(invApproval!.riskLevel).toBe("high");
    const [before] = await db.select().from(schema.settings);
    await m.approvals.decideApproval(invApproval!.id, "approve", owner);
    const [numbered] = await db.select().from(schema.invoices).where(orm.eq(schema.invoices.id, inv!.id));
    expect(numbered!.number).toBe(`${before!.invoicePrefix}${String(before!.nextInvoiceNumber).padStart(4, "0")}`);
    expect(numbered!.status).toBe("approved");

    // Idempotent: the client isn't duplicated.
    await m.leads.moveStage(leadId, "nurture", owner.userId);
    const again = await m.leads.moveStage(leadId, "won", owner.userId);
    expect(again.client!.id).toBe(res.client!.id);
    const clients = await db.select().from(schema.clients).where(orm.eq(schema.clients.leadId, leadId));
    expect(clients).toHaveLength(1);
  });

  it("booking page books a slot, moves the lead to Call booked and refuses a double booking", async () => {
    const slots = await m.booking.availableSlots();
    expect(slots.length).toBeGreaterThan(0);
    const b = await m.booking.createBooking({ name: "Pat 5", businessName: `${PREFIX}Dealer 5`, phone: phone(5), startsAt: slots[0]! }, "127.0.0.1");
    expect(b.leadId).toBe(leadIds[5]);
    const lead = await m.leads.getLead(leadIds[5]!);
    expect(lead!.stage).toBe("call_booked");
    await expect(m.booking.createBooking({ name: "X", businessName: `${PREFIX}Other`, phone: phone(40), startsAt: slots[0]! }, null)).rejects.toThrow(/no longer available|just taken/);
    const { db, schema, orm } = m;
    const jobs = await db.select().from(schema.jobs).where(orm.eq(schema.jobs.dedupeKey, `call_brief:${b.id}`));
    expect(jobs).toHaveLength(1);
  });
});
