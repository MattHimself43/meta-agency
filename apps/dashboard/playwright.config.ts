import { defineConfig } from "@playwright/test";

// Smoke tests against a running app: BASE_URL=http://localhost:3000 npm run test:e2e
// In the Claude Code cloud container, set PW_CHROMIUM=/opt/pw-browsers/chromium.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
