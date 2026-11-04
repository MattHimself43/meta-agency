/**
 * Phase 3 acceptance against a real Postgres (TEST_DATABASE_URL), migrated + seeded.
 *
 * Meta: a local stand-in for graph.facebook.com records every call (no real ad account is reachable from CI).
 *   - with `meta_api` on and a token, an approved plan builds campaign → ad set → creative → ad, all PAUSED
 *   - the AI path (and routines, staff, forged grants) can never set ACTIVE — refused before any request
 *   - only the owner's Launch (spending limit confirmed) sends ACTIVE; budget raises still need approval
 *   - insights land in performance_daily; the access check finds the Page/pixel and ticks onboarding
 * WiPay: a local stand-in that follows the documented request/redirect contract
 *   - with `wipay` on (sandbox), a checkout is created and a correctly hashed response marks the invoice paid
 *   - replays don't double-pay; tampered or fee-inclusive hashes are rejected
 * The real WiPay sandbox run is a manual step on the deployed app (see README → WiPay).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { deflateSync } from "node:zlib";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.WIPAY_ACCOUNT_NUMBER;
delete process.env.WIPAY_API_KEY;
process.env.WIPAY_ENVIRONMENT = "sandbox";
process.env.TOKEN_ENCRYPTION_KEY ||= randomBytes(32).toString("base64");
process.env.APP_URL = "https://app.test";

const PREFIX = "TEST3 ";
type Call = { method: string; path: string; params: Record<string, string> };

function png() {
  const t = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = t[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (ty: string, d: Buffer) => {
    const l = Buffer.alloc(4);
    l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(ty), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([l, td, c]);
  };
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(8, 0);
  ih.writeUInt32BE(8, 4);
  ih[8] = 8;
  ih[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ih), chunk("IDAT", deflateSync(Buffer.alloc(8 * 25))), chunk("IEND", Buffer.alloc(0))]);
}

async function body(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** Minimal graph.facebook.com stand-in: records calls, returns ids. */
function graphMock(calls: Call[]) {
  let n = 1000;
  return createServer(async (req, res) => {
    const u = new URL(req.url!, "http://x");
    const params = Object.fromEntries(req.method === "POST" ? new URLSearchParams(await body(req)) : u.searchParams);
    const path = u.pathname.replace(/^\/v\d+\.\d+/, "");
    const call = { method: req.method!, path, params };
    calls.push(call);
    const send = (o: unknown, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(o));
    };
    if (!params.access_token) return send({ error: { message: "no token", code: 190 } }, 400);
    if (req.method === "GET") {
      if (path === "/me") return send({ id: "sysuser1", name: "AgencyOS System User" });
      if (path === "/act_5550001") return send({ id: "act_5550001", name: "Test Dealer Ads", account_status: 1, currency: "USD", spend_cap: "50000", amount_spent: "0" });
      if (path === "/act_5550001/promote_pages") return send({ data: [{ id: "777001", name: "Test Dealer", link: "https://www.facebook.com/test-dealer" }] });
      if (path === "/act_5550001/adspixels") return send({ data: [{ id: "888001", name: "Pixel", last_fired_time: new Date().toISOString() }] });
      if (path === "/search") return send({ data: params.q === "Cars" ? [{ id: "6003", name: "Cars" }] : [] });
      if (path === "/act_5550001/insights")
        return send({ data: [{ date_start: "2026-11-02", campaign_name: "TEST3 CTWA", adset_name: "S", ad_name: "A", spend: "18.50", impressions: "2400", reach: "1900", frequency: "1.26", inline_link_clicks: "31", inline_link_click_ctr: "1.29", actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "6" }] }] });
      return send({ error: { message: `unknown GET ${path}`, code: 100 } }, 400);
    }
    if (path === "/act_5550001/adimages") return send({ images: { "photo.png": { hash: "hash123" } } });
    if (/^\/act_5550001\/(campaigns|adsets|adcreatives|ads)$/.test(path)) return send({ id: String(n++) });
    if (/^\/\d+$/.test(path)) return send({ success: true });
    return send({ error: { message: `unknown POST ${path}`, code: 100 } }, 400);
  });
}

/** WiPay Payments API stand-in (documented contract): POST /plugins/payments/request → { url, message, transaction_id }. */
function wipayMock(calls: Call[]) {
  return createServer(async (req, res) => {
    const u = new URL(req.url!, "http://x");
    const params = Object.fromEntries(new URLSearchParams(await body(req)));
    calls.push({ method: req.method!, path: u.pathname, params });
    res.writeHead(200, { "Content-Type": "application/json" });
    if (u.pathname !== "/plugins/payments/request" || req.headers.accept !== "application/json") return res.end(JSON.stringify({ url: "", message: "bad request", transaction_id: "" }));
    if (!params.account_number || !params.total || !params.order_id || !params.response_url) return res.end(JSON.stringify({ url: "", message: "The total field is required.", transaction_id: "" }));
    res.end(JSON.stringify({ url: `https://ttsb.example/checkout/${params.order_id}`, message: "OK", transaction_id: `SB-12-1-${params.order_id}-20261104120000` }));
  });
}

const listen = (s: Server) => new Promise<string>((r) => s.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(s.address() as { port: number }).port}`)));

describe.skipIf(!url)("Phase 3 acceptance (database)", () => {
  const graphCalls: Call[] = [];
  const wipayCalls: Call[] = [];
  const graph = graphMock(graphCalls);
  const wipay = wipayMock(wipayCalls);
  const owner = { userId: "11111111-1111-4111-8111-111111111111", email: "owner@test", role: "owner" as const, name: "Owner" };
  let m: Awaited<ReturnType<typeof load>>;
  let clientId = "";
  let planId = "";
  let flagsBefore: unknown;
  let hadMeta = false;

  async function load() {
    return {
      ...(await import("@/lib/db")),
      orm: await import("drizzle-orm"),
      leads: await import("@/lib/leads/service"),
      store: await import("@/lib/integrations/store"),
      storage: await import("@/lib/storage"),
      meta: await import("@/lib/meta/service"),
      build: await import("@/lib/meta/build"),
      client: await import("@/lib/meta/client"),
      guard: await import("@/lib/meta/guard"),
      campaigns: await import("@/lib/campaigns/service"),
      approvals: await import("@/lib/approvals"),
      billing: await import("@/lib/billing/service"),
      payments: await import("@/lib/payments"),
      wipay: await import("@/lib/payments/wipay"),
      core: await import("@/lib/payments/wipay-core"),
    };
  }

  async function cleanup() {
    const { db, orm } = m;
    const { sql } = orm;
    const ids = sql`(SELECT id FROM clients WHERE name LIKE ${PREFIX + "%"})`;
    await db.execute(sql`DELETE FROM approvals WHERE subject_id IN (SELECT id FROM invoices WHERE client_id IN ${ids}) OR subject_id IN ${ids} OR subject_id IN (SELECT b.id FROM budget_changes b JOIN campaign_plans p ON p.id = b.campaign_plan_id WHERE p.client_id IN ${ids})`);
    await db.execute(sql`DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE client_id IN ${ids})`);
    await db.execute(sql`DELETE FROM invoices WHERE client_id IN ${ids}`);
    await db.execute(sql`DELETE FROM stored_files WHERE path LIKE 'clients/%' AND split_part(path, '/', 2)::uuid IN ${ids}`);
    await db.execute(sql`DELETE FROM clients WHERE name LIKE ${PREFIX + "%"}`);
    await db.execute(sql`DELETE FROM leads WHERE business_name LIKE ${PREFIX + "%"}`);
  }

  beforeAll(async () => {
    process.env.META_GRAPH_URL = await listen(graph);
    process.env.WIPAY_BASE_URL = await listen(wipay);
    m = await load();
    await cleanup();
    const [s] = await m.db.select().from(m.schema.settings);
    flagsBefore = s!.featureFlags;
    hadMeta = (await m.store.getIntegration("meta")).hasSecret;
    await m.db.update(m.schema.settings).set({ featureFlags: { ...(s!.featureFlags as never as Record<string, boolean>), meta_api: true, wipay: true } as never, foundingOfferEnabled: false });
    await m.store.saveSecret("meta", "EAAtest" + "x".repeat(60), { label: "test", actorId: null });

    const [dealers] = await m.db.select().from(m.schema.niches).where(m.orm.eq(m.schema.niches.slug, "car_dealers"));
    const lead = await m.leads.createLead({ businessName: `${PREFIX}Couva Cars`, nicheId: dealers!.id, contactName: "Dev Test", phone: "+18685552999" }, { type: "system" });
    const won = await m.leads.moveStage(lead.lead.id, "won", owner.userId);
    clientId = won.client!.id;
    await m.db.update(m.schema.clients).set({ adAccountId: "5550001", pageUrl: "https://www.facebook.com/test-dealer", email: "dev@example.tt" }).where(m.orm.eq(m.schema.clients.id, clientId));

    const path = `clients/${clientId}/creative/photo.png`;
    await m.storage.putObject(path, png(), "image/png");
    const [creative] = await m.db.insert(m.schema.creatives).values({ clientId, format: "4:5", primaryText: "$20k down, drive today.", headline: "Drive today", cta: "Send WhatsApp message", mediaPath: path, status: "approved" }).returning();
    const [plan] = await m.db
      .insert(m.schema.campaignPlans)
      .values({
        clientId,
        name: `${PREFIX}CTWA`,
        template: "ctwa",
        objective: "OUTCOME_ENGAGEMENT",
        audiences: [{ name: "Broad", type: "broad", ageMin: 25, ageMax: 60, genders: "all", interests: ["Cars"] }],
        locations: [{ name: "Couva", radiusKm: 20 }],
        placements: { mode: "advantage", list: [] },
        budgetType: "daily",
        budgetUsdCents: 2500,
        schedule: { start: "2026-11-10", end: null },
        ads: [{ creativeId: creative!.id, name: "Tiida", format: "4:5", primaryText: "$20k down, drive today.", headline: "Drive today", cta: "Send WhatsApp message", mediaNote: "" }],
        status: "approved",
      })
      .returning();
    planId = plan!.id;
  });

  afterAll(async () => {
    await cleanup();
    await m.db.update(m.schema.settings).set({ featureFlags: flagsBefore as never });
    if (!hadMeta) await m.db.delete(m.schema.integrations).where(m.orm.eq(m.schema.integrations.provider, "meta"));
    graph.close();
    wipay.close();
  });

  it("API mode is on only with the flag and a token", async () => {
    expect(await m.client.metaMode()).toBe("api");
    expect((await m.meta.testMetaToken()).label).toMatch(/System User/);
    // The stored token is encrypted at rest.
    const [row] = await m.db.select().from(m.schema.integrations).where(m.orm.eq(m.schema.integrations.provider, "meta"));
    expect(row!.encryptedToken).not.toContain("EAAtest");
  });

  it("access check finds the Page and pixel and ticks both owner onboarding steps", async () => {
    const r = await m.meta.verifyClientAccess(clientId, owner.userId);
    expect(r.problems).toEqual([]);
    const [c] = await m.db.select().from(m.schema.clients).where(m.orm.eq(m.schema.clients.id, clientId));
    expect(c).toMatchObject({ pageId: "777001", pixelId: "888001" });
    const steps = await m.db.select().from(m.schema.onboardingSteps).where(m.orm.eq(m.schema.onboardingSteps.clientId, clientId));
    expect(steps.find((s) => s.stepKey === "access_check")?.status).toBe("done");
    expect(steps.find((s) => s.stepKey === "spending_limit")?.status).toBe("done");
  });

  it("an approved plan builds a PAUSED campaign, ad set, creative and ad", async () => {
    graphCalls.length = 0;
    const ids = await m.build.buildPlanViaApi(planId, owner);
    const writes = graphCalls.filter((c) => c.method === "POST");
    expect(writes.map((c) => c.path)).toEqual(["/act_5550001/adimages", "/act_5550001/campaigns", "/act_5550001/adsets", "/act_5550001/adcreatives", "/act_5550001/ads"]);
    for (const w of writes.filter((c) => /campaigns|adsets|\/ads$/.test(c.path))) expect(w.params.status).toBe("PAUSED");
    expect(JSON.stringify(writes)).not.toMatch(/ACTIVE/);
    const adset = writes.find((c) => c.path.endsWith("/adsets"))!.params;
    expect(JSON.parse(adset.targeting!)).toMatchObject({ geo_locations: { custom_locations: [{ radius: 20 }] }, flexible_spec: [{ interests: [{ id: "6003" }] }] });
    expect(adset).toMatchObject({ destination_type: "WHATSAPP", daily_budget: "2500", campaign_id: ids.campaignId });
    const [plan] = await m.db.select().from(m.schema.campaignPlans).where(m.orm.eq(m.schema.campaignPlans.id, planId));
    expect(plan!.status).toBe("built_paused");
    expect(plan!.metaCampaignId).toBe(ids.campaignId);
  });

  it("the server refuses any attempt by the AI path to set ACTIVE (nothing reaches Meta)", async () => {
    const ids = (await m.db.select().from(m.schema.campaignPlans).where(m.orm.eq(m.schema.campaignPlans.id, planId)))[0]!.metaIds as { campaignId: string; adIds: string[] };
    graphCalls.length = 0;
    await expect(m.client.metaPost(`/${ids.campaignId}`, { status: "ACTIVE" }, { origin: "ai", planId })).rejects.toThrow(/never set a Meta object ACTIVE/);
    await expect(m.client.metaPost(`/${ids.adIds[0]}`, { configured_status: "ACTIVE" }, { origin: "routine", planId })).rejects.toThrow(m.guard.MetaGuardError);
    await expect(m.client.metaPost(`/act_5550001/ads`, { name: "x", status: "ACTIVE" }, { origin: "ai", planId })).rejects.toThrow(m.guard.MetaGuardError);
    // Pretending to be the owner without the real grant doesn't work either.
    const forged = { planId, ownerId: owner.userId, expiresAt: Date.now() + 60_000 };
    await expect(m.client.metaPost(`/${ids.campaignId}`, { status: "ACTIVE" }, { origin: "owner", planId, grant: forged })).rejects.toThrow(/Launch/);
    expect(graphCalls).toHaveLength(0);
    const refused = await m.db.select().from(m.schema.auditLog).where(m.orm.and(m.orm.eq(m.schema.auditLog.action, "meta.write_refused"), m.orm.eq(m.schema.auditLog.entityId, planId)));
    expect(refused.length).toBeGreaterThanOrEqual(4);
    // A non-owner can't launch at all.
    await expect(m.campaigns.launchPlan(planId, { ...owner, role: "account_manager" })).rejects.toThrow(/owner/);
  });

  it("budget raises from the AI wait for approval; approval pushes the budget with the change id", async () => {
    graphCalls.length = 0;
    const r = await m.campaigns.requestBudgetChange(planId, 5000, { by: "ai", actorId: null, reason: "CPR well under target" });
    expect(r.pending).toBe(true);
    expect(graphCalls).toHaveLength(0);
    const [change] = await m.db.select().from(m.schema.budgetChanges).where(m.orm.eq(m.schema.budgetChanges.campaignPlanId, planId));
    // Bypassing the guardrail with a direct budget write is refused.
    const ids = (await m.db.select().from(m.schema.campaignPlans).where(m.orm.eq(m.schema.campaignPlans.id, planId)))[0]!.metaIds as { adSetIds: string[] };
    await expect(m.client.metaPost(`/${ids.adSetIds[0]}`, { daily_budget: 9000 }, { origin: "ai", planId })).rejects.toThrow(/guardrail/);
    await m.approvals.decideApproval(change!.approvalId!, "approve", owner);
    const push = graphCalls.find((c) => c.method === "POST" && c.path === `/${ids.adSetIds[0]}`);
    expect(push?.params.daily_budget).toBe("5000");
  });

  it("only the owner's Launch sends ACTIVE, then the plan is live", async () => {
    graphCalls.length = 0;
    await m.campaigns.launchPlan(planId, owner);
    const actives = graphCalls.filter((c) => c.method === "POST" && c.params.status === "ACTIVE");
    expect(actives).toHaveLength(3); // ad, ad set, campaign
    const [plan] = await m.db.select().from(m.schema.campaignPlans).where(m.orm.eq(m.schema.campaignPlans.id, planId));
    expect(plan!.status).toBe("live");
    graphCalls.length = 0;
    await m.campaigns.pausePlan(planId, owner);
    expect(graphCalls.find((c) => c.method === "POST")?.params.status).toBe("PAUSED");
  });

  it("insights pull fills performance_daily (source api)", async () => {
    const r = await m.meta.pullInsights(clientId, "2026-10-27", "2026-11-02");
    expect(r.rows).toBe(1);
    const rows = await m.db.select().from(m.schema.performanceDaily).where(m.orm.eq(m.schema.performanceDaily.clientId, clientId));
    expect(rows[0]).toMatchObject({ source: "api", spendUsdCents: 1850, whatsappConversations: 6 });
    await m.meta.pullInsights(clientId, "2026-10-27", "2026-11-02");
    expect(await m.db.select().from(m.schema.performanceDaily).where(m.orm.eq(m.schema.performanceDaily.clientId, clientId))).toHaveLength(1);
  });

  it("WiPay sandbox: checkout + correctly hashed response marks the invoice paid, once", async () => {
    const [inv] = await m.db.select().from(m.schema.invoices).where(m.orm.eq(m.schema.invoices.clientId, clientId));
    expect(inv).toBeTruthy();
    await m.db.update(m.schema.invoices).set({ number: `${PREFIX.trim()}-0001`, status: "approved", dueDate: "2026-11-11" }).where(m.orm.eq(m.schema.invoices.id, inv!.id));
    await m.billing.markInvoiceSent(inv!.id, owner.userId);
    const [sent] = await m.db.select().from(m.schema.invoices).where(m.orm.eq(m.schema.invoices.id, inv!.id));
    expect(sent!.paymentLink).toMatch(/^https:\/\/app\.test\/pay\/[A-Za-z0-9_-]{43}$/);
    const token = sent!.paymentLink!.split("/").pop()!;
    expect((await m.payments.resolvePayToken(token, "203.0.113.9"))?.id).toBe(inv!.id);

    const provider = (await m.payments.activeProvider())!;
    const { url: checkout, orderId } = await provider.startCheckout(inv!.id);
    expect(checkout).toContain(orderId);
    const req = wipayCalls.at(-1)!;
    expect(req.params).toMatchObject({ account_number: "1234567890", environment: "sandbox", country_code: "TT", currency: "TTD", total: (inv!.totalCents / 100).toFixed(2), response_url: "https://app.test/api/payments/wipay/response", method: "credit_card_co" });

    const tx = `SB-12-1-${orderId}-20261104120000`;
    const total = req.params.total!;
    // Tampered: hash over the fee-inclusive total → rejected, invoice untouched.
    const bad = await m.wipay.handleWipayResponse({ status: "success", order_id: orderId, transaction_id: tx, total: (Number(total) * 1.035).toFixed(2), hash: m.core.expectedHash(tx, (Number(total) * 1.035).toFixed(2), "123") });
    expect(bad.result).toBe("rejected");
    expect((await m.db.select().from(m.schema.invoices).where(m.orm.eq(m.schema.invoices.id, inv!.id)))[0]!.status).not.toBe("paid");

    const { orderId: orderId2 } = await provider.startCheckout(inv!.id);
    const tx2 = `SB-40-1-${orderId2}-20261104121500`;
    const ok = await m.wipay.handleWipayResponse({ status: "success", order_id: orderId2, transaction_id: tx2, total: (Number(total) * 1.035).toFixed(2), hash: m.core.expectedHash(tx2, total, "123"), message: "[1-R00]: Approved" });
    expect(ok.result).toBe("paid");
    const [paid] = await m.db.select().from(m.schema.invoices).where(m.orm.eq(m.schema.invoices.id, inv!.id));
    expect(paid!.status).toBe("paid");
    // Replay of the same redirect doesn't create a second payment.
    const again = await m.wipay.handleWipayResponse({ status: "success", order_id: orderId2, transaction_id: tx2, total, hash: m.core.expectedHash(tx2, total, "123") });
    expect(again.result).toBe("already_paid");
    const pays = await m.db.select().from(m.schema.payments).where(m.orm.eq(m.schema.payments.invoiceId, inv!.id));
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ method: "wipay", reference: tx2, amountCents: inv!.totalCents });
    await expect(provider.startCheckout(inv!.id)).rejects.toThrow(/already paid/);
  });
});
