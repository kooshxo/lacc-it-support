import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000", trace: "on-first-retry" },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : { command: "pnpm dev", url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI, env: { DATA_BACKEND: "fixture", AUTH_BYPASS: "true" } },
  projects: [
    // Emulate a mobile viewport in Chromium so the same engine is exercised
    // across CI and local runs; this keeps the test deterministic while still
    // covering the mobile-first layout and navigation.
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
