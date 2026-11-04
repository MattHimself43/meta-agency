import { describe, expect, it } from "vitest";
import { computeFitScore, effectiveScore } from "@/lib/leads/scoring";
import { normalizeFacebookUrl, firstName } from "@/lib/leads/normalize";
import { autoMapColumns, parseCsv } from "@/lib/csv";
import { fillTemplate, wordCount } from "@/lib/outreach/templates";
import { computeSlots } from "@/lib/booking";
import { classifyReplyFallback, pickChannel } from "@/lib/outreach/sequences";

const RULES = [
  { key: "ad_activity", label: "Runs basic ads", weight: 3 },
  { key: "inventory_size", label: "Inventory", weight: 2 },
  { key: "posting_frequency", label: "Posting", weight: 2 },
  { key: "engagement", label: "Engagement", weight: 2 },
  { key: "reviews", label: "Reviews", weight: 1 },
];

describe("fit score", () => {
  it("strong signals score high, weak score low, unknown lands mid", () => {
    expect(computeFitScore(RULES, { ad_activity: 1, inventory_size: 1, posting_frequency: 1, engagement: 1, reviews: 1 }).score).toBe(10);
    expect(computeFitScore(RULES, { ad_activity: 0, inventory_size: 0, posting_frequency: 0, engagement: 0, reviews: 0 }).score).toBe(1);
    expect(computeFitScore(RULES, {}).score).toBe(6);
  });
  it("explains itself", () => {
    const { reasons } = computeFitScore(RULES, { ad_activity: 0.9, reviews: 0.1 });
    expect(reasons).toContain("✓ Runs basic ads");
    expect(reasons).toContain("✗ Reviews");
    expect(reasons).toContain("Unknown: Inventory");
  });
  it("clamps bad inputs and keeps the override", () => {
    expect(computeFitScore(RULES, { ad_activity: 7 }).score).toBeLessThanOrEqual(10);
    expect(effectiveScore({ fitScore: 4, fitScoreOverride: 9 })).toBe(9);
    expect(effectiveScore({ fitScore: 4, fitScoreOverride: null })).toBe(4);
  });
});

describe("dedupe normalisation", () => {
  it("canonicalises Facebook URLs", () => {
    const c = "https://facebook.com/caroniauto";
    for (const u of ["facebook.com/CaroniAuto", "https://www.facebook.com/caroniauto/", "https://m.facebook.com/caroniauto?ref=bookmarks", "http://web.facebook.com/caroniauto"]) expect(normalizeFacebookUrl(u)).toBe(c);
    expect(normalizeFacebookUrl("https://www.facebook.com/profile.php?id=123&x=1")).toBe("https://facebook.com/profile.php?id=123");
    expect(normalizeFacebookUrl("https://instagram.com/caroni")).toBeNull();
  });
  it("first names", () => {
    expect(firstName("  Ravi  Ramdass ")).toBe("Ravi");
    expect(firstName(null)).toBeNull();
  });
});

describe("CSV", () => {
  it("handles quotes, commas, CRLF, BOM and blank lines", () => {
    const rows = parseCsv('﻿Business,Phone,Notes\r\n"Caroni Auto, Ltd",765-4321,"Said ""call later""\nnext week"\r\n\r\nGulf View,868-555-0102,\n');
    expect(rows).toEqual([
      ["Business", "Phone", "Notes"],
      ["Caroni Auto, Ltd", "765-4321", 'Said "call later"\nnext week'],
      ["Gulf View", "868-555-0102", ""],
    ]);
  });
  it("auto-maps common headers", () => {
    expect(autoMapColumns(["Company", "Owner", "Mobile", "FB Page", "Town", "Random"])).toEqual({ business_name: 0, contact_name: 1, phone: 2, facebook_url: 3, area: 4 });
  });
});

describe("template drafts never invent facts", () => {
  const body = "Hi {{contact_first_name}}, Matthias here. Saw the {{specific_vehicle}} on your page — nice unit. Mind if I send a quick idea?";
  it("fills from real facts", () => {
    const r = fillTemplate(body, { businessName: "Caroni Auto", contactName: "Ravi R", area: null, adNotes: null, facts: [{ fact: "2019 Tiida at $89k" }] });
    expect(r.text).toBe("Hi Ravi, Matthias here. Saw the 2019 Tiida at $89k on your page — nice unit. Mind if I send a quick idea?");
    expect(r.missing).toEqual([]);
  });
  it("falls back to generic wording and reports what's missing", () => {
    const r = fillTemplate(body, { businessName: "Caroni Auto", contactName: null, area: null, adNotes: null, facts: [] });
    expect(r.text).toBe("Hi there, Matthias here. Saw your page — nice stock. Mind if I send a quick idea?");
    expect(r.text).not.toContain("{{");
    expect(r.missing.sort()).toEqual(["contact_first_name", "specific_vehicle"]);
    expect(wordCount(r.text)).toBeLessThan(60);
  });
});

describe("booking slots (AST)", () => {
  const availability = { "3": [{ start: "10:00", end: "11:00" }] }; // Wednesdays 10-11 AST
  it("makes 20-minute slots in Trinidad time and skips taken ones", () => {
    const now = new Date("2026-11-03T12:00:00Z"); // Tue 08:00 AST
    const taken = [new Date("2026-11-04T14:20:00Z")]; // Wed 10:20 AST
    const slots = computeSlots(availability, taken, now, 7).map((d) => d.toISOString());
    expect(slots).toEqual(["2026-11-04T14:00:00.000Z", "2026-11-04T14:40:00.000Z"]);
  });
  it("needs 2 hours' notice", () => {
    const now = new Date("2026-11-04T12:30:00Z"); // Wed 08:30 AST → first bookable is 10:40 AST
    expect(computeSlots(availability, [], now, 1).map((d) => d.toISOString())).toEqual(["2026-11-04T14:40:00.000Z"]);
  });
});

describe("replies & channels", () => {
  it("classifies without AI, erring towards a human read", () => {
    expect(classifyReplyFallback("Please STOP messaging me")).toBe("stop");
    expect(classifyReplyFallback("not interested thanks")).toBe("no");
    expect(classifyReplyFallback("Busy now, maybe next month")).toBe("not_now");
    expect(classifyReplyFallback("Yes send it")).toBe("interested");
    expect(classifyReplyFallback("How much does it cost?")).toBe("question");
  });
  it("picks a channel the lead can be reached on", () => {
    expect(pickChannel("whatsapp", { whatsapp: "+18685550101", phone: null, email: null, facebookUrl: null, instagramUrl: null })).toBe("whatsapp");
    expect(pickChannel("whatsapp", { whatsapp: null, phone: null, email: "a@b.tt", facebookUrl: null, instagramUrl: null })).toBe("email");
    expect(pickChannel("whatsapp", { whatsapp: null, phone: null, email: null, facebookUrl: "https://facebook.com/x", instagramUrl: null })).toBe("dm");
    expect(pickChannel("whatsapp", { whatsapp: null, phone: null, email: null, facebookUrl: null, instagramUrl: null })).toBeNull();
  });
});
