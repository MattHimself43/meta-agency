import { describe, expect, it } from "vitest";
import { checkHonesty, extractClaims } from "@/lib/creatives/honesty";
import { detectFatigue } from "@/lib/performance/fatigue";
import { detectSpecialCategory } from "@/lib/campaigns/special-category";
import { budgetChangeNeedsApproval } from "@/lib/campaigns/guardrails";
import { buildChecklist } from "@/lib/campaigns/plan";
import { mapAdsManagerCsv, normalizeDate } from "@/lib/performance/ads-csv";
import { periodSummary, snapshot, type Row } from "@/lib/performance/metrics";
import { agreementSections } from "@/lib/clients/agreement";

describe("honesty check", () => {
  const intake = { deposit_offers: "$20k down, drive today on selected units", financing_partners: "Republic Bank 7.5% over 72 months", price_range: "TT$95,000 – TT$180,000" };
  it("extracts money, percentages and terms", () => {
    const c = extractClaims("Only $20k down! TT$95,000 Tiida, 7.5% over 6 years");
    expect(c.map((x) => `${x.kind}:${x.value}`).sort()).toEqual(["money:20000", "money:95000", "percent:7.5", "term:72"].sort());
  });
  it("passes copy that only uses intake facts (in any format)", () => {
    const r = checkHonesty({ hook: "$20,000 down, drive today", primaryText: "From TT$95k. 7.5% over 72 months with Republic Bank." }, intake);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(4);
  });
  it("blocks invented prices and terms", () => {
    const r = checkHonesty({ hook: "$15k down!", primaryText: "Rates from 4.9% over 84 months" }, intake);
    expect(r.ok).toBe(false);
    expect(r.mismatches.map((m) => m.claim)).toEqual(["$15k", "4.9%", "84 months"]);
  });
  it("copy with no numbers is fine", () => {
    expect(checkHonesty({ hook: "What's your home worth?" }, {}).ok).toBe(true);
  });
});

describe("fatigue", () => {
  const days = (ad: string, ctrs: number[], freqLast = 2) =>
    ctrs.map((ctr, i) => ({ adName: ad, date: `2026-10-${String(i + 1).padStart(2, "0")}`, impressions: 1000, clicks: Math.round(ctr * 10), frequency: i === ctrs.length - 1 ? freqLast : 1.5, ctr }));
  it("flags frequency over 3", () => {
    expect(detectFatigue(days("A", [1.5, 1.5, 1.5], 3.4))[0]!.reasons[0]).toMatch(/Frequency 3.4/);
  });
  it("flags CTR 30% below the first week", () => {
    const f = detectFatigue(days("B", [2, 2, 2, 2, 2, 2, 2, 1.8, 1.4, 1.2, 1.3]));
    expect(f).toHaveLength(1);
    expect(f[0]!.reasons[0]).toMatch(/CTR 1.30% vs 2.00%/);
  });
  it("leaves healthy ads alone", () => {
    expect(detectFatigue(days("C", [2, 2, 2, 2, 2, 2, 2, 1.9, 1.9, 2]))).toEqual([]);
  });
});

describe("special ad categories", () => {
  it("real estate is Housing", () => {
    expect(detectSpecialCategory({ nicheSlug: "real_estate", texts: ["What's your home worth?"] }).category).toBe("HOUSING");
  });
  it("dealer finance offers are credit", () => {
    expect(detectSpecialCategory({ nicheSlug: "car_dealers", texts: ["$20k down, drive today"] }).category).toBe("FINANCIAL_PRODUCTS_SERVICES");
    expect(detectSpecialCategory({ nicheSlug: "car_dealers", texts: ["Financing available"] }).category).toBe("FINANCIAL_PRODUCTS_SERVICES");
  });
  it("plain stock ads need nothing", () => {
    expect(detectSpecialCategory({ nicheSlug: "car_dealers", texts: ["2019 Tiida, low mileage, WhatsApp us"] }).category).toBeNull();
  });
});

describe("budget guardrail", () => {
  const base = { currentCents: 3000, recentBudgetsCents: [3000], ownerLimitCents: 2000 };
  it("owner can make a small raise", () => {
    expect(budgetChangeNeedsApproval({ ...base, newCents: 3500, requestedBy: "owner" }).needsApproval).toBe(false);
  });
  it("over 20% in 7 days needs approval, even across several small steps", () => {
    expect(budgetChangeNeedsApproval({ ...base, newCents: 3700, requestedBy: "owner" }).needsApproval).toBe(true);
    const stepped = budgetChangeNeedsApproval({ currentCents: 3500, newCents: 3800, recentBudgetsCents: [3000, 3500], ownerLimitCents: 2000, requestedBy: "owner" });
    expect(stepped.needsApproval).toBe(true);
  });
  it("any AI increase needs approval; decreases are fine", () => {
    expect(budgetChangeNeedsApproval({ ...base, newCents: 3100, requestedBy: "ai" }).needsApproval).toBe(true);
    expect(budgetChangeNeedsApproval({ ...base, newCents: 2500, requestedBy: "ai" }).needsApproval).toBe(false);
  });
  it("changes above the owner's limit need approval", () => {
    expect(budgetChangeNeedsApproval({ ...base, newCents: 500, requestedBy: "owner" }).needsApproval).toBe(true);
  });
});

describe("Ads Manager checklist", () => {
  const steps = buildChecklist({
    plan: {
      name: "Princes Town — Click-to-WhatsApp",
      objective: "OUTCOME_ENGAGEMENT",
      budgetType: "daily",
      budgetUsdCents: 2500,
      audiences: [{ name: "T&T broad", type: "broad", ageMin: 25, ageMax: 65, genders: "all", interests: [] }],
      locations: [{ name: "Trinidad and Tobago (whole country)", radiusKm: null }],
      placements: { mode: "advantage", list: [] },
      schedule: { start: "2026-11-10", end: null },
      specialAdCategory: "FINANCIAL_PRODUCTS_SERVICES",
      ads: [{ creativeId: null, name: "$20k down Tiida", format: "4:5", primaryText: "$20k down, drive today.", headline: "Drive today", cta: "Send WhatsApp message", mediaNote: "Tiida photo" }],
    },
    template: { key: "ctwa", name: "Click-to-WhatsApp", objective: "OUTCOME_ENGAGEMENT", destination: "WHATSAPP", specialAdCategory: null },
    client: { name: "Princes Town Auto Hub", adAccountId: "act_123456", pageUrl: "https://facebook.com/pta", instagramHandle: "pta", leadWhatsapp: "+18685550121" },
  });
  const all = steps.flatMap((s) => [s.title, ...s.items]).join("\n");
  it("is numbered and covers every setting", () => {
    expect(steps.map((s) => s.n)).toEqual(steps.map((_, i) => i + 1));
    for (const needle of ["act=123456", "spending limit", "Objective: Engagement", "Financial products and services", "Daily US$25.00", "WhatsApp · number +18685550121", "start 2026-11-10", "age 25–65+", "Advantage+ placements", "Primary text: $20k down", "Headline: Drive today", "Call to action: Send WhatsApp message", "toggle OFF"]) {
      expect(all).toContain(needle);
    }
    expect(all).toMatch(/Restricted: No gender targeting/);
  });
  it("warns when the ad account is missing", () => {
    const s = buildChecklist({ plan: { name: "x", objective: "OUTCOME_LEADS", budgetType: "daily", budgetUsdCents: 1000, audiences: [], locations: [], placements: { mode: "manual", list: ["Instagram Reels"] }, schedule: { start: null, end: null }, specialAdCategory: null, ads: [] }, template: null, client: { name: "C", adAccountId: null, pageUrl: null, instagramHandle: null, leadWhatsapp: null } });
    expect(s[0]!.warning).toMatch(/No ad account/);
    expect(s.some((x) => x.warning === "Plan has no ads")).toBe(true);
  });
});

describe("Ads Manager CSV import", () => {
  const csv = [
    "Day,Campaign name,Ad set name,Ad name,Amount spent (USD),Impressions,Reach,Frequency,Link clicks,CTR (link click-through rate),Results,Result indicator,Cost per result",
    "2026-11-02,CTWA,T&T 25-55,$20k down Tiida,24.50,9100,6200,1.47,131,1.44,6,actions:onsite_conversion.messaging_conversation_started_7d,4.08",
    '11/3/2026,CTWA,T&T 25-55,Weekend reel,"1,002.10",9300,6300,1.5,140,1.51,0,,',
    ",,,,,,,,,,,,",
  ].join("\n");
  it("maps aliases, result types, US dates and thousands separators", () => {
    const r = mapAdsManagerCsv(csv);
    expect(r.missing).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ date: "2026-11-02", adName: "$20k down Tiida", spendUsdCents: 2450, whatsappConversations: 6, leads: 0, costPerResultUsdCents: 408 });
    expect(r.rows[1]).toMatchObject({ date: "2026-11-03", spendUsdCents: 100210, whatsappConversations: 0 });
  });
  it("reports missing required columns", () => {
    expect(mapAdsManagerCsv("Campaign name,Impressions\nx,1").missing).toEqual(["date", "spend"]);
  });
  it("dates", () => {
    expect(normalizeDate("2026-11-02")).toBe("2026-11-02");
    expect(normalizeDate("13/11/2026")).toBe("2026-11-13");
    expect(normalizeDate("nonsense")).toBeNull();
  });
});

describe("morning snapshot & recommendations", () => {
  const row = (date: string, ad: string, spend: number, chats: number, extra: Partial<Row> = {}): Row => ({ date, adName: ad, campaignName: "C", spendUsdCents: spend, impressions: 5000, clicks: 70, frequency: 1.5, ctr: 1.4, leads: 0, whatsappConversations: chats, ...extra });
  const days = ["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"];
  it("computes yesterday / 3 / 7 days vs target", () => {
    const rows = days.flatMap((d) => [row(d, "Good", 1200, 4), row(d, "Bad", 1200, 0)]);
    const s = snapshot(rows, { yesterday: "2026-11-02", targetCpr: 588, dailyBudgetCents: 2500, live: true });
    expect(s.yesterday).toMatchObject({ spend: 2400, results: 4, cpr: 600 });
    expect(s.last7.results).toBe(28);
    expect(s.recommendations.map((r) => r.type)).toContain("pause_ad");
    expect(s.recommendations.find((r) => r.type === "pause_ad")!.payload).toEqual({ adName: "Bad" });
  });
  it("suggests a raise when cost per result is well under target", () => {
    const rows = days.map((d) => row(d, "Star", 2500, 10));
    const s = snapshot(rows, { yesterday: "2026-11-02", targetCpr: 588, dailyBudgetCents: 2500, live: true });
    expect(s.status).toBe("good");
    expect(s.recommendations[0]).toMatchObject({ type: "raise_budget", payload: { fromCents: 2500, toCents: 2875 } });
  });
  it("flags no spend and no data", () => {
    const s = snapshot([row("2026-10-30", "A", 1000, 2)], { yesterday: "2026-11-02", targetCpr: 588, dailyBudgetCents: 2500, live: true });
    expect(s.flags).toContain("No spend yesterday — check the campaign is on and the card works");
    expect(snapshot([], { yesterday: "2026-11-02", targetCpr: 588, dailyBudgetCents: 2500, live: true }).status).toBe("no_data");
  });
  it("period summary picks best and worst ads", () => {
    const rows = days.flatMap((d) => [row(d, "Good", 1000, 4), row(d, "Meh", 1000, 1)]);
    const p = periodSummary(rows, "2026-10-27", "2026-11-02", "2026-10-20", "2026-10-26");
    expect(p.best!.adName).toBe("Good");
    expect(p.worst!.adName).toBe("Meh");
    expect(p.current.results).toBe(35);
    expect(p.previous.results).toBe(0);
  });
});

describe("agreement", () => {
  it("states fees in TT$, the 3-month term, and that the client pays Meta", () => {
    const text = agreementSections({ agencyName: "Scalora", agencyAddress: ["Port of Spain"], registrationNumber: "pending", clientName: "PTA Hub", contactName: "Darren", packageName: "Growth", setupFeeTtd: 1500, setupWaived: false, monthlyFeeTtd: 4000, includes: ["Weekly report"], recommendedSpend: "US$500–1,500/month", dueDays: 7, vatEnabled: false, vatRatePct: 12.5 })
      .map((s) => s.body)
      .join("\n");
    expect(text).toContain("TT$4,000.00");
    expect(text).toContain("minimum term is 3 months");
    expect(text).toContain("pays Meta directly");
    expect(text).toContain("no specific number of leads");
  });
});
