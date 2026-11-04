import { describe, expect, it } from "vitest";
import { containsActivation, guardWrite, issueLaunchGrant, MetaGuardError, spendGrant } from "@/lib/meta/guard";
import { planToMetaSpecs, targetingFor } from "@/lib/meta/specs";
import { mapInsights } from "@/lib/meta/insights";
import { buildRequest, expectedHash, formatTotal, orderIdFor, verifyResponse, wipayConfig } from "@/lib/payments/wipay-core";
import { buildRawEmail, emailFromHeader, filterBusy, newReplyText } from "@/lib/google/mime";

const owner = { userId: "11111111-1111-4111-8111-111111111111", role: "owner" };

describe("Meta guard: nothing goes ACTIVE without the owner's launch", () => {
  it("finds ACTIVE anywhere a status can hide", () => {
    expect(containsActivation({ status: "ACTIVE" })).toBe(true);
    expect(containsActivation({ status: "active " })).toBe(true);
    expect(containsActivation({ configured_status: "ACTIVE" })).toBe(true);
    expect(containsActivation({ ad_specs: JSON.stringify([{ name: "x", status: "ACTIVE" }]) })).toBe(true);
    expect(containsActivation({ nested: { deeper: [{ status_option: "ACTIVE" }] } })).toBe(true);
    expect(containsActivation({ status: "PAUSED", name: "ACTIVE wear promo" })).toBe(false);
  });

  it("refuses the AI, routine and staff paths outright", () => {
    for (const origin of ["ai", "routine", "staff"] as const) {
      expect(() => guardWrite("/123", { status: "ACTIVE" }, { origin, planId: "p" })).toThrow(MetaGuardError);
    }
  });

  it("refuses an owner-origin call without a real grant (forged object, wrong plan, spent)", () => {
    const forged = { planId: "p", ownerId: owner.userId, expiresAt: Date.now() + 60_000 };
    expect(() => guardWrite("/123", { status: "ACTIVE" }, { origin: "owner", planId: "p", grant: forged })).toThrow(/Launch/);
    const g = issueLaunchGrant(owner, "p");
    expect(() => guardWrite("/123", { status: "ACTIVE" }, { origin: "owner", planId: "other", grant: g })).toThrow(/different campaign/);
    expect(guardWrite("/123", { status: "ACTIVE" }, { origin: "owner", planId: "p", grant: g })).toEqual({ status: "ACTIVE" });
    spendGrant(g);
    expect(() => guardWrite("/123", { status: "ACTIVE" }, { origin: "owner", planId: "p", grant: g })).toThrow(MetaGuardError);
  });

  it("only an owner can get a grant", () => {
    expect(() => issueLaunchGrant({ userId: "x", role: "account_manager" }, "p")).toThrow(/owner/);
    expect(() => issueLaunchGrant(null, "p")).toThrow(/owner/);
  });

  it("forces PAUSED on creates that forgot a status", () => {
    expect(guardWrite("/act_1/campaigns", { name: "x" }, { origin: "staff" })).toMatchObject({ status: "PAUSED" });
    expect(guardWrite("/act_1/adsets", { name: "x" }, { origin: "routine" })).toMatchObject({ status: "PAUSED" });
    expect(guardWrite("/act_1/adcreatives", { name: "x" }, { origin: "staff" })).not.toHaveProperty("status");
  });
});

const ad = { creativeId: "c1", name: "Tiida", format: "4:5" as const, primaryText: "$20k down, drive today.", headline: "Drive today", cta: "Send WhatsApp message", mediaNote: "" };
const basePlan = {
  id: "p",
  name: "Demo CTWA",
  objective: "OUTCOME_ENGAGEMENT",
  template: "ctwa",
  budgetType: "daily" as const,
  budgetUsdCents: 2500,
  audiences: [{ name: "Broad", type: "broad" as const, ageMin: 25, ageMax: 55, genders: "men" as const, interests: ["Cars"] }],
  locations: [{ name: "Chaguanas", radiusKm: 10 }],
  placements: { mode: "advantage" as const, list: [] },
  schedule: { start: "2026-11-10", end: null },
  specialAdCategory: null,
  ads: [ad],
};

describe("plan → Marketing API specs", () => {
  it("creates everything PAUSED with WhatsApp destination and TT radius targeting", () => {
    const s = planToMetaSpecs({ plan: basePlan, template: { key: "ctwa", name: "CTWA", objective: "OUTCOME_ENGAGEMENT", destination: "WHATSAPP", specialAdCategory: null }, pageId: "999", imageHashes: { c1: "abc" }, interestIds: { Cars: "6003" } });
    expect(s.campaign).toMatchObject({ status: "PAUSED", special_ad_categories: [], objective: "OUTCOME_ENGAGEMENT" });
    expect(s.adSets[0]).toMatchObject({ status: "PAUSED", destination_type: "WHATSAPP", optimization_goal: "CONVERSATIONS", daily_budget: 2500, start_time: "2026-11-10T00:00:00-0400", promoted_object: { page_id: "999" } });
    const t = s.adSets[0]!.targeting as Record<string, unknown>;
    expect(t.genders).toEqual([1]);
    expect(t.flexible_spec).toEqual([{ interests: [{ name: "Cars", id: "6003" }] }]);
    expect((t.geo_locations as { custom_locations: { radius: number }[] }).custom_locations[0]!.radius).toBe(10);
    const cta = ((s.creatives[0]!.object_story_spec as { link_data: { call_to_action: unknown } }).link_data.call_to_action);
    expect(cta).toEqual({ type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } });
    expect(JSON.stringify(s)).not.toMatch(/"ACTIVE"/);
  });

  it("special ad categories: declared with TT, all ages/genders, no interests, ≥25 km radius", () => {
    const s = planToMetaSpecs({ plan: { ...basePlan, specialAdCategory: "FINANCIAL_PRODUCTS_SERVICES" }, template: null, pageId: "999", imageHashes: { c1: "abc" }, interestIds: { Cars: "6003" } });
    expect(s.campaign).toMatchObject({ special_ad_categories: ["FINANCIAL_PRODUCTS_SERVICES"], special_ad_category_country: ["TT"] });
    const t = s.adSets[0]!.targeting as Record<string, unknown>;
    expect(t).toMatchObject({ age_min: 18, age_max: 65 });
    expect(t.genders).toBeUndefined();
    expect(t.flexible_spec).toBeUndefined();
    expect((t.geo_locations as { custom_locations: { radius: number }[] }).custom_locations[0]!.radius).toBe(25);
  });

  it("refuses to build an ad without an image, or a lead form without its form ID", () => {
    expect(() => planToMetaSpecs({ plan: basePlan, template: null, pageId: "1", imageHashes: {}, interestIds: {} })).toThrow(/needs an image/);
    expect(() => planToMetaSpecs({ plan: basePlan, template: { key: "f", name: "F", objective: "OUTCOME_LEADS", destination: "ON_AD", specialAdCategory: null }, pageId: "1", imageHashes: { c1: "h" }, interestIds: {} })).toThrow(/instant form/);
  });

  it("manual placements map to Meta positions", () => {
    const t = targetingFor(basePlan.audiences[0]!, [], { mode: "manual", list: ["Instagram Reels", "Facebook Feed"] }, {}, false, []);
    expect(t).toMatchObject({ publisher_platforms: ["instagram", "facebook"], instagram_positions: ["reels"], facebook_positions: ["feed"], geo_locations: { countries: ["TT"] } });
  });
});

describe("insights → performance rows", () => {
  it("maps spend, chats, leads and CTR", () => {
    const [r] = mapInsights([{ date_start: "2026-11-03", campaign_name: "C", adset_name: "S", ad_name: "A", spend: "12.34", impressions: "1000", reach: "800", frequency: "1.25", inline_link_clicks: "20", inline_link_click_ctr: "2.0", actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "4" }, { action_type: "lead", value: "1" }] }]);
    expect(r).toMatchObject({ date: "2026-11-03", spendUsdCents: 1234, impressions: 1000, whatsappConversations: 4, leads: 1, clicks: 20, ctr: 2, costPerResultUsdCents: 309 });
  });
});

describe("WiPay (contract from docs.wipayfinancial.com)", () => {
  const cfg = wipayConfig({ WIPAY_ENVIRONMENT: "sandbox" });
  it("sandbox defaults to the public test account; live needs real credentials", () => {
    expect(cfg).toMatchObject({ environment: "sandbox", accountNumber: "1234567890", apiKey: "123", baseUrl: "https://ttsb.wipayfinancial.com" });
    expect(() => wipayConfig({ WIPAY_ENVIRONMENT: "live" })).toThrow(/WIPAY_ACCOUNT_NUMBER/);
    expect(wipayConfig({ WIPAY_ENVIRONMENT: "live", WIPAY_ACCOUNT_NUMBER: "9", WIPAY_API_KEY: "k" }).baseUrl).toBe("https://tt.wipayfinancial.com");
  });
  it("builds the documented request with a 2-dp total and a valid order id", () => {
    const id = orderIdFor("INV-0012");
    expect(id).toMatch(/^(?![_-])[A-Za-z0-9_-]+(?<![_-])$/);
    expect(id.length).toBeLessThanOrEqual(16);
    const r = buildRequest(cfg, { orderId: id, totalCents: 250000, currency: "TTD", responseUrl: "https://app.example/api/payments/wipay/response", invoiceId: "i1", email: "a@b.tt", name: "Alicia Demo" });
    expect(r.url).toBe("https://ttsb.wipayfinancial.com/plugins/payments/request");
    expect(r.fields).toMatchObject({ account_number: "1234567890", country_code: "TT", currency: "TTD", environment: "sandbox", method: "credit_card_co", total: "2500.00", fname: "Alicia", lname: "Demo" });
    expect(formatTotal(5)).toBe("0.05");
  });
  it("only a correct hash over OUR total marks success", () => {
    const attempt = { orderId: "INV0012-ab12cd", totalSent: "2500.00" };
    const tx = "SB-12-1-INV0012-ab12cd-20261104120000";
    const good = { status: "success", order_id: attempt.orderId, transaction_id: tx, total: "2575.00", hash: expectedHash(tx, "2500.00", "123") };
    expect(verifyResponse(good, attempt, "123")).toEqual({ ok: true, transactionId: tx });
    // Hash computed over the customer-facing total (incl. fee) is not accepted.
    expect(verifyResponse({ ...good, hash: expectedHash(tx, "2575.00", "123") }, attempt, "123")).toMatchObject({ ok: false, status: "rejected" });
    expect(verifyResponse({ ...good, hash: "0".repeat(32) }, attempt, "123")).toMatchObject({ ok: false, reason: "hash mismatch" });
    expect(verifyResponse({ ...good, order_id: "OTHER-1" }, attempt, "123")).toMatchObject({ ok: false, status: "rejected" });
    const otherTx = "SB-12-1-OTHER-1-20261104120000";
    expect(verifyResponse({ ...good, transaction_id: otherTx, hash: expectedHash(otherTx, "2500.00", "123") }, attempt, "123")).toMatchObject({ ok: false, reason: /belong/ });
    expect(verifyResponse({ status: "failed", order_id: attempt.orderId, transaction_id: tx, message: "[2-R211]: CVN is invalid." }, attempt, "123")).toMatchObject({ ok: false, status: "failed", reason: "[2-R211]: CVN is invalid." });
  });
});

describe("Gmail + Calendar helpers", () => {
  it("builds a base64url RFC 2822 message and blocks header injection", () => {
    const raw = buildRawEmail({ to: "lead@example.tt", from: "me@example.com", subject: "Quick idea — Tiida ads\r\nBcc: evil@x.com", body: "Hi!\nLine 2" });
    const text = Buffer.from(raw, "base64url").toString("utf8");
    expect(text).toMatch(/^To: lead@example.tt\r\nFrom: me@example.com\r\nSubject: =\?UTF-8\?B\?/);
    expect(text).not.toMatch(/\r\nBcc:/);
    const body = text.split("\r\n\r\n")[1]!.replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toBe("Hi!\r\nLine 2");
    expect(() => buildRawEmail({ to: "not an email", subject: "s", body: "b" })).toThrow();
  });
  it("parses senders and strips quoted history", () => {
    expect(emailFromHeader("Alicia <Alicia@Example.TT>")).toBe("alicia@example.tt");
    expect(newReplyText("Yes, call me Tuesday\n\nOn Mon, 3 Nov 2026, Matthias wrote:\n> old")).toBe("Yes, call me Tuesday");
  });
  it("drops booking slots that clash with calendar busy times", () => {
    const slots = [new Date("2026-11-05T13:00:00Z"), new Date("2026-11-05T13:20:00Z"), new Date("2026-11-05T13:40:00Z")];
    const left = filterBusy(slots, [{ start: "2026-11-05T13:30:00Z", end: "2026-11-05T14:00:00Z" }], 20);
    expect(left.map((d) => d.toISOString())).toEqual(["2026-11-05T13:00:00.000Z"]);
  });
});
