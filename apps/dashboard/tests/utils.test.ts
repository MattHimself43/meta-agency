import { describe, expect, it } from "vitest";
import { normalizeTtPhone, waLink, formatTtPhone } from "@/lib/phone";
import { formatMoney, formatUsdWithTtd, usdToTtdCents, vatCents } from "@/lib/money";
import { decryptSecret, encryptSecret, generateToken, hashToken } from "@/lib/crypto";
import { toCsv } from "@/lib/export";
import { formatAst } from "@/lib/time";

describe("T&T phones and wa.me links", () => {
  it("normalises local formats to +1868", () => {
    expect(normalizeTtPhone("765-4321")).toBe("+18687654321");
    expect(normalizeTtPhone("(868) 765-4321")).toBe("+18687654321");
    expect(normalizeTtPhone("1 868 765 4321")).toBe("+18687654321");
    expect(normalizeTtPhone("+1-868-765-4321")).toBe("+18687654321");
    expect(normalizeTtPhone("12345")).toBeNull();
  });
  it("builds a correctly encoded wa.me link", () => {
    const link = waLink("+1 (868) 555-0101", "Hi Ravi, saw the $20k down Tiida & more? 👍");
    expect(link).toBe("https://wa.me/18685550101?text=Hi%20Ravi%2C%20saw%20the%20%2420k%20down%20Tiida%20%26%20more%3F%20%F0%9F%91%8D");
    expect(decodeURIComponent(new URL(link).searchParams.get("text")!)).toBe("Hi Ravi, saw the $20k down Tiida & more? 👍");
  });
  it("formats for display", () => {
    expect(formatTtPhone("+18685550101")).toBe("+1 (868) 555-0101");
  });
});

describe("money", () => {
  it("formats TT$ and US$", () => {
    expect(formatMoney(250000, "TTD")).toBe("TT$2,500.00");
    expect(formatMoney(150000, "TTD", { decimals: false })).toBe("TT$1,500");
    expect(formatMoney(-1999, "USD")).toBe("-US$19.99");
  });
  it("converts with the editable rate (default 6.80)", () => {
    expect(usdToTtdCents(10000)).toBe(68000);
    expect(usdToTtdCents(10000, "6.7500")).toBe(67500);
    expect(formatUsdWithTtd(12000, 6.8)).toBe("US$120.00 (≈ TT$816.00)");
  });
  it("VAT 12.5%", () => {
    expect(vatCents(400000, 1250)).toBe(50000);
  });
});

describe("crypto", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  it("AES-256-GCM round-trips and detects tampering", () => {
    const c = encryptSecret("EAAB-meta-token", key);
    expect(c).not.toContain("EAAB");
    expect(decryptSecret(c, key)).toBe("EAAB-meta-token");
    const [iv, tag, data] = c.split(".");
    const flipped = Buffer.from(data!, "base64");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => decryptSecret([iv, tag, flipped.toString("base64")].join("."), key)).toThrow();
  });
  it("tokens are >= 32 random bytes and stored hashed", () => {
    const t = generateToken();
    expect(Buffer.from(t, "base64url").length).toBe(32);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(() => generateToken(16)).toThrow();
  });
});

describe("csv export", () => {
  it("quotes and neutralises formula injection", () => {
    const csv = toCsv([{ a: "x,y", b: "=HYPERLINK(1)", c: null, d: { k: 1 } }]);
    expect(csv).toBe('a,b,c,d\n"x,y",\"\'=HYPERLINK(1)\",,"{""k"":1}"');
  });
});

describe("time", () => {
  it("displays in AST", () => {
    expect(formatAst(new Date("2026-11-03T11:00:00Z"), "yyyy-MM-dd HH:mm")).toBe("2026-11-03 07:00");
  });
});
