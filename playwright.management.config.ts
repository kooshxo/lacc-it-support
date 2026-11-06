import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://localhost:3101";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "ticket-management.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL, trace: "on-first-retry" },
  webServer: {
    command: "pnpm dev --port 3101",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: {
      DATA_BACKEND: "sql",
      APP_DATABASE_URL: process.env.TEST_TICKETS_DATABASE_URL ?? "",
      AUTH_BYPASS: "true",
      AUTH_SECRET: "local-ticket-management-test-secret",
      DEMO_USER_EMAIL: "agent@thelatincenter.org",
      PORT: "3101",
    },
  },
  projects: [
    { name: "desktop-safari", use: { ...devices["Desktop Safari"], browserName: "webkit", viewport: { width: 1440, height: 900 } } },
    { name: "mobile-safari", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
});
