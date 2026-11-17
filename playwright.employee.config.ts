import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3102";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "employee.spec.ts",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: { baseURL, trace: "on-first-retry" },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm dev --port 3102",
        url: baseURL,
        reuseExistingServer: false,
        env: {
          DATA_BACKEND: "fixture",
          AUTH_BYPASS: "true",
          DEMO_USER_EMAIL: "employee@thelatincenter.org",
          NEXT_DIST_DIR: ".next-e2e-employee",
          PORT: "3102",
        },
      },
  projects: [
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
