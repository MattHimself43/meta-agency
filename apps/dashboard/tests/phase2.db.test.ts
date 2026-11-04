/**
 * Phase 2 acceptance against a real Postgres (TEST_DATABASE_URL), migrated + seeded. No AI key.
 *   - a client can finish every portal step (agreement e-signature with signed PDF, intake, uploads, Meta access)
 *   - a campaign plan produces a complete Ads Manager checklist; launch needs the spending-limit step;
 *     budget raises over 20% need approval
 *   - an imported Ads Manager CSV drives the morning brief and a weekly report PDF
 *   - the 1st-of-month run drafts one invoice per active client, with no duplicates on rerun
 *   - overdue reminders are drafted once per step
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { addDays, format } from "date-fns";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const PREFIX = "TEST2 ";

/** A real (noisy) PNG so react-pdf can embed it like a drawn signature. */
function pngDataUrl(w = 240, h = 80) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = (x * 7 + y * 13 + ((x * y) % 17)) & 0xff;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

describe.skipIf(!url)("Phase 2 acceptance (database)", () => {
  let m: Awaited<ReturnType<typeof load>>;
  async function load() {
    const dbm = await import("@/lib/db");
    return {
      ...dbm,
      orm: await import("drizzle-orm"),
      leads: await import("@/lib/leads/service"),
      onboarding: await import("@/lib/clients/onboarding"),
      assets: await import("@/lib/assets"),
      campaigns: await import("@/lib/campaigns/service"),
      perf: await import("@/lib/performance/service"),
      reports: await import("@/lib/reports/service"),
      billing: await import("@/lib/billing/service"),
      approvals: await import("@/lib/approvals"),
      creatives: await import("@/lib/creatives/service"),
    };
  }
  const owner = { userId: "11111111-1111-4111-8111-111111111111", email: "owner@test", role: "owner" as const, name: "Owner" };
  let clientId = "";
  let planId = "";

  async function cleanup() {
    const { db, orm } = m;
    const { sql } = orm;
    const ids = sql`(SELECT id FROM clients WHERE name LIKE ${PREFIX + "%"})`;
    await db.execute(sql`DELETE FROM approvals WHERE subject_id IN (SELECT id FROM invoices WHERE client_id IN ${ids}) OR subject_id IN (SELECT id FROM messages WHERE client_id IN ${ids}) OR subject_id IN (SELECT id FROM reports WHERE client_id IN ${ids}) OR subject_id IN (SELECT id FROM recommendations WHERE client_id IN ${ids}) OR subject_id IN ${ids} OR subject_id IN (SELECT b.id FROM budget_changes b JOIN campaign_plans p ON p.id = b.campaign_plan_id WHERE p.client_id IN ${ids})`);
    await db.execute(sql`DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE client_id IN ${ids})`);
    await db.execute(sql`DELETE FROM invoices WHERE client_id IN ${ids}`);
    await db.execute(sql`DELETE FROM stored_files WHERE path LIKE 'clients/' || '%' AND split_part(path, '/', 2)::uuid IN ${ids}`);
    await db.execute(sql`DELETE FROM clients WHERE name LIKE ${PREFIX + "%"}`);
    await db.execute(sql`DELETE FROM leads WHERE business_name LIKE ${PREFIX + "%"}`);
    await db.execute(sql`DELETE FROM alerts WHERE title LIKE ${"%" + PREFIX + "%"}`);
  }

  beforeAll(async () => {
    m = await load();
    await cleanup();
    await m.db.update(m.schema.settings).set({ foundingOfferEnabled: false });
    const [dealers] = await m.db.select().from(m.schema.niches).where(m.orm.eq(m.schema.niches.slug, "car_dealers"));
    const lead = await m.leads.createLead({ businessName: `${PREFIX}Penal Auto World`, nicheId: dealers!.id, contactName: "Rhea Test", phone: "+18685551999" }, { type: "system" });
    const won = await m.leads.moveStage(lead.lead.id, "won", owner.userId);
    clientId = won.client!.id;
    await m.db.update(m.schema.clients).set({ monthlyBudgetUsdCents: 75000 }).where(m.orm.eq(m.schema.clients.id, clientId));
  });
  afterAll(async () => {
    await cleanup();
  });

  it("client finishes the portal: agreement (signed PDF), intake, uploads, Meta access", async () => {
    await expect(m.onboarding.signAgreement(clientId, { name: "Rh", signaturePng: pngDataUrl(), ip: null, userAgent: null })).rejects.toThrow(/full name/);
    await expect(m.onboarding.signAgreement(clientId, { name: "Rhea Test", signaturePng: "data:image/png;base64,AAAA", ip: null, userAgent: null })).rejects.toThrow(/draw/);

    const agreement = await m.onboarding.signAgreement(clientId, { name: "Rhea Test", signaturePng: pngDataUrl(), ip: "190.58.1.2", userAgent: "iPhone" });
    expect(agreement.signedAt).toBeTruthy();
    const { db, schema, orm } = m;
    const [pdf] = await db.select().from(schema.storedFiles).where(orm.eq(schema.storedFiles.path, agreement.signedPdfPath!));
    expect(Buffer.from(pdf!.data, "base64").subarray(0, 4).toString()).toBe("%PDF");
    expect(String(agreement.signedIp)).toBe("190.58.1.2");

    const partial = await m.onboarding.saveIntake(clientId, { price_range: "TT$85,000 – TT$160,000" }, { type: "portal", id: null });
    expect(partial.done).toBe(false);
    expect(partial.missing.length).toBeGreaterThan(0);
    const full = await m.onboarding.saveIntake(
      clientId,
      { stock_list: "https://example.com/stock", price_range: "TT$85,000 – TT$160,000", financing_partners: "First Citizens 7.5% over 72 months", deposit_offers: "$20k down, drive today", best_sellers: "Nissan Tiida, Toyota Aqua", locations: "SS Erin Rd, Penal", opening_hours: "Mon-Sat 8-5", lead_whatsapp: "+18685551999" },
      { type: "portal", id: null },
    );
    expect(full.done).toBe(true);

    await expect(m.onboarding.saveBrand(clientId, ["#2E6BFF"], { type: "portal", id: null }, true)).rejects.toThrow(/Upload at least one/);
    await m.assets.recordAsset({ clientId, path: `clients/${clientId}/logo/x-logo.png`, type: "logo", mimeType: "image/png", tags: ["logo"], via: "portal", actorId: null });
    await m.onboarding.saveBrand(clientId, ["#2E6BFF", "nope"], { type: "portal", id: null }, true);

    await expect(m.onboarding.saveMetaAccess(clientId, { adAccountId: "123", pageUrl: "https://facebook.com/penal", partnerAccessGiven: true, cardAdded: true }, { type: "portal", id: null })).rejects.toThrow(/ad account/);
    await m.onboarding.saveMetaAccess(clientId, { adAccountId: "act_1234567890", pageUrl: "https://facebook.com/penal-auto", instagram: "@penalauto", partnerAccessGiven: true, cardAdded: true }, { type: "portal", id: null });

    const steps = await m.onboarding.steps(clientId);
    expect(steps.filter((s) => !s.ownerOnly).every((s) => s.status === "done")).toBe(true);
    const [c] = await db.select().from(schema.clients).where(orm.eq(schema.clients.id, clientId));
    expect(c!.status).toBe("onboarding"); // owner checks still to do
    expect(c!.brandColours).toEqual(["#2E6BFF"]);
    expect(c!.adAccountId).toBe("act_1234567890");
  });

  it("campaign plan → complete checklist; launch needs the spending limit; budget guardrail", async () => {
    const plan = await m.campaigns.createPlan(clientId, "ctwa", owner.userId);
    planId = plan.id;
    expect(plan.budgetUsdCents).toBe(2500);
    const edit = { name: plan.name, objective: plan.objective, audiences: plan.audiences as never, locations: plan.locations as never, placements: plan.placements as never, schedule: { start: format(addDays(new Date(), 2), "yyyy-MM-dd"), end: null }, ads: [{ creativeId: null, name: "Tiida offer", format: "4:5" as const, primaryText: "$20k down, drive today. Nissan Tiida in stock in Penal.", headline: "Drive today", cta: "Send WhatsApp message", mediaNote: "Tiida photo" }], specialAdCategoryConfirmed: false, notes: null };
    const r = await m.campaigns.updatePlan(plan.id, edit, owner.userId);
    expect(r.special.category).toBe("FINANCIAL_PRODUCTS_SERVICES");
    await expect(m.campaigns.approvePlan(plan.id, owner)).rejects.toThrow(/special ad category/);
    await m.campaigns.updatePlan(plan.id, { ...edit, specialAdCategoryConfirmed: true }, owner.userId);
    await m.campaigns.approvePlan(plan.id, owner);

    const [fresh] = await m.db.select().from(m.schema.campaignPlans).where(m.orm.eq(m.schema.campaignPlans.id, plan.id));
    const steps = await m.campaigns.checklistFor(fresh!);
    const text = steps.flatMap((s) => [s.title, ...s.items]).join("\n");
    for (const needle of ["act=1234567890", "spending limit", "Objective: Engagement", "Financial products and services", "Daily US$25.00", "+18685551999", "Primary text: $20k down", "toggle OFF"]) expect(text).toContain(needle);
    expect(steps.every((s, i) => s.n === i + 1)).toBe(true);
    expect(steps.filter((s) => s.warning)).toHaveLength(1); // only the special-category note

    await m.campaigns.markBuilt(plan.id, "120200000000001", owner);
    await expect(m.campaigns.launchPlan(plan.id, owner)).rejects.toThrow(/spending limit/);
    await expect(m.campaigns.launchPlan(plan.id, { ...owner, role: "account_manager" })).rejects.toThrow(/owner/);

    const small = await m.campaigns.requestBudgetChange(plan.id, 2700, { by: "owner", actorId: owner.userId });
    expect(small.applied).toBe(true);
    const big = await m.campaigns.requestBudgetChange(plan.id, 4000, { by: "owner", actorId: owner.userId });
    expect(big.pending).toBe(true);
    const ai = await m.campaigns.requestBudgetChange(plan.id, 2800, { by: "ai", actorId: null });
    expect(ai.pending).toBe(true);
    const [pendingChange] = await m.db.select().from(m.schema.budgetChanges).where(m.orm.and(m.orm.eq(m.schema.budgetChanges.campaignPlanId, plan.id), m.orm.eq(m.schema.budgetChanges.newBudgetUsdCents, 4000)));
    await m.approvals.decideApproval(pendingChange!.approvalId!, "approve", owner);
    const [afterApprove] = await m.db.select().from(m.schema.campaignPlans).where(m.orm.eq(m.schema.campaignPlans.id, plan.id));
    expect(afterApprove!.budgetUsdCents).toBe(4000);
  });

  it("owner checks finish onboarding → active + kickoff plan; launch now allowed", async () => {
    await m.onboarding.completeStep(clientId, "access_check", { page: true, adAccount: true, pixel: true }, { type: "user", id: owner.userId });
    await m.onboarding.completeStep(clientId, "spending_limit", { confirmed: true }, { type: "user", id: owner.userId });
    const [c] = await m.db.select().from(m.schema.clients).where(m.orm.eq(m.schema.clients.id, clientId));
    expect(c!.status).toBe("active");
    const kickoff = await m.db.select().from(m.schema.approvals).where(m.orm.eq(m.schema.approvals.dedupeKey, `kickoff:${clientId}`));
    expect(kickoff).toHaveLength(1);
    await m.campaigns.launchPlan(planId, owner);
    const [p] = await m.db.select().from(m.schema.campaignPlans).where(m.orm.eq(m.schema.campaignPlans.id, planId));
    expect(p!.status).toBe("live");
  });

  it("creative copy uses intake facts only; the honesty check blocks invented numbers", async () => {
    const made = await m.creatives.generateCopy(clientId, { actorId: owner.userId, count: 4 });
    expect(made.length).toBeGreaterThanOrEqual(3);
    expect(made.every((c) => (c.honestyCheck as { ok: boolean }).ok)).toBe(true);
    const bad = made[0]!;
    await m.creatives.updateCopy(bad.id, { hook: "$10k down this weekend only!" }, owner.userId);
    await expect(m.creatives.setCreativeStatus(bad.id, "client_review", { type: "user", id: owner.userId })).rejects.toThrow(/Honesty check failed: \$10k/);
    await m.creatives.overrideHonesty(bad.id, "Client confirmed the weekend offer on WhatsApp", owner.userId);
    await m.creatives.setCreativeStatus(bad.id, "client_review", { type: "user", id: owner.userId });
    await m.creatives.setCreativeStatus(bad.id, "approved", { type: "portal", id: null }, { comment: "Looks good" });
    await expect(m.creatives.setCreativeStatus(made[1]!.id, "approved", { type: "portal", id: null })).rejects.toThrow(/isn't waiting/);
  });

  it("imported CSV drives the morning brief and a weekly report PDF", async () => {
    const today = new Date();
    const header = "Day,Campaign name,Ad set name,Ad name,Amount spent (USD),Impressions,Reach,Frequency,Link clicks,CTR (link click-through rate),Results,Result indicator";
    const lines = [header];
    for (let d = 14; d >= 1; d--) {
      const day = format(addDays(today, -d), "yyyy-MM-dd");
      lines.push(`${day},CTWA,T&T,Tiida offer,15.00,6000,4000,1.6,90,1.5,4,messaging_conversation_started`);
      lines.push(`${day},CTWA,T&T,Weekend reel,12.00,5000,3500,1.4,40,0.8,0,`);
    }
    const imp = await m.perf.importPerformanceCsv(clientId, lines.join("\n"), owner.userId);
    expect(imp.rows).toBe(28);
    const again = await m.perf.importPerformanceCsv(clientId, lines.join("\n"), owner.userId);
    expect(again.rows).toBe(28);
    const count = await m.db.select().from(m.schema.performanceDaily).where(m.orm.eq(m.schema.performanceDaily.clientId, clientId));
    expect(count).toHaveLength(28); // upsert, no duplicates

    const morning = await m.perf.runMorningCheck(today);
    const entry = morning.brief.find((b) => b.clientId === clientId)!;
    expect(entry.snapshot.yesterday).toMatchObject({ spend: 2700, results: 4, chats: 4 });
    expect(entry.snapshot.recommendations.map((r) => r.type)).toContain("pause_ad");
    const recApprovals = await m.db.select().from(m.schema.approvals).where(m.orm.sql`preview->>'clientId' = ${clientId} AND item_type = 'recommendation'`);
    expect(recApprovals.length).toBeGreaterThan(0);
    const rerun = await m.perf.runMorningCheck(today);
    expect(rerun.recommendations).toBe(0); // same day → no duplicates

    const week = m.reports.lastWeekStart(format(today, "yyyy-MM-dd"));
    const r = await m.reports.generateReport(clientId, "weekly", week);
    expect(r.created).toBe(true);
    expect((r.report.content as { headline: string }).headline).toMatch(/leads and chats|spent|No ad spend/);
    expect((await m.reports.generateReport(clientId, "weekly", week)).created).toBe(false);
    const pdf = await m.reports.renderReportPdf(r.report.id);
    expect(pdf!.buf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf!.buf.length).toBeGreaterThan(2000);
  });

  it("1st-of-month run drafts one invoice per active client, no duplicates on rerun", async () => {
    const first = await m.billing.monthlyInvoiceRun(new Date());
    const second = await m.billing.monthlyInvoiceRun(new Date());
    expect(second.created).toBe(0);
    expect(second.existing).toBe(first.created + first.existing);
    const active = await m.db.select().from(m.schema.clients).where(m.orm.and(m.orm.eq(m.schema.clients.status, "active"), m.orm.isNotNull(m.schema.clients.packageId)));
    const inv = await m.db.select().from(m.schema.invoices).where(m.orm.eq(m.schema.invoices.periodKey, first.period));
    expect(inv).toHaveLength(active.length);
    expect(new Set(inv.map((i) => i.clientId)).size).toBe(active.length);
  });

  it("overdue invoices get one reminder per step; mark paid records the payment", async () => {
    const { db, schema, orm } = m;
    const [inv] = await db.select().from(schema.invoices).where(orm.and(orm.eq(schema.invoices.clientId, clientId), orm.eq(schema.invoices.kind, "monthly")));
    const [ap] = await db.select().from(schema.approvals).where(orm.eq(schema.approvals.subjectId, inv!.id));
    await m.approvals.decideApproval(ap!.id, "approve", owner);
    await m.billing.markInvoiceSent(inv!.id, owner.userId);
    await db.update(schema.invoices).set({ dueDate: format(addDays(new Date(), -4), "yyyy-MM-dd") }).where(orm.eq(schema.invoices.id, inv!.id));
    const r1 = await m.billing.chaseOverdue(new Date());
    expect(r1.drafted).toBeGreaterThanOrEqual(1);
    const r2 = await m.billing.chaseOverdue(new Date());
    const [after] = await db.select().from(schema.invoices).where(orm.eq(schema.invoices.id, inv!.id));
    expect(after!.status).toBe("overdue");
    expect(after!.remindersSent["3"]).toBeTruthy();
    expect(r2.drafted).toBe(0);
    const paid = await m.billing.markInvoicePaid(inv!.id, { method: "bank_transfer", reference: "RBL-123" }, { type: "user", id: owner.userId });
    expect(paid.status).toBe("paid");
    const pdf = await m.billing.renderInvoicePdf(inv!.id);
    expect(pdf!.buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
