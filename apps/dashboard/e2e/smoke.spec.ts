import { expect, test } from "@playwright/test";

test("dashboard requires sign-in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Two-factor is required")).toBeVisible();
});

test("login fits a phone screen", async ({ page }) => {
  await page.goto("/login");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("cron dispatcher rejects a missing or wrong secret", async ({ request }) => {
  expect((await request.get("/api/cron/dispatch")).status()).toBe(401);
  expect((await request.get("/api/cron/dispatch", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
});

test("CSV export is owner-only", async ({ request }) => {
  expect((await request.get("/api/export/leads")).status()).toBe(401);
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/login");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
});

test("public booking page lists times in Trinidad time", async ({ page }) => {
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: /Book a 20-minute call/ })).toBeVisible();
  await expect(page.getByText("All times are Trinidad time.")).toBeVisible();
});

test("share links with a bad token are 404", async ({ request }) => {
  expect((await request.get(`/share/audit/${"x".repeat(43)}`)).status()).toBe(404);
  expect((await request.get(`/share/proposal/short`)).status()).toBe(404);
});

test("PDF route is staff-only", async ({ request }) => {
  expect((await request.get("/api/pdf/audit/00000000-0000-4000-8000-000000000000")).status()).toBe(401);
});
