import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/employee.spec.ts", "**/ticket-management.spec.ts"],
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3103", trace: "on-first-retry" },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : { command: "pnpm dev --port 3103", url: "http://localhost:3103", reuseExistingServer: false, env: { DATA_BACKEND: "fixture", AUTH_BYPASS: "true", DEMO_USER_EMAIL: "agent@thelatincenter.org", NEXT_DIST_DIR: ".next-e2e-staff", PORT: "3103" } },
  projects: [
    // Emulate a mobile viewport in Chromium so the same engine is exercised
    // across CI and local runs; this keeps the test deterministic while still
    // covering the mobile-first layout and navigation.
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
