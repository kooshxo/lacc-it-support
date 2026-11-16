import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { assertSafeSpreadsheetConfiguration, assertSafeSqlConfiguration } from "@/lib/config/runtime-safety";

const original = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
});

describe("Preview runtime storage safety", () => {
  it("blocks the Production spreadsheet in every environment", () => {
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "18YbqQZbxXLHm3gI51UH_EphsSW1X7RBueM7YDeOhrfw";
    expect(() => assertSafeSpreadsheetConfiguration()).toThrow(/Production Google spreadsheet/);
  });

  it("requires the dedicated synthetic sheet in Preview", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "another-sheet";
    expect(() => assertSafeSpreadsheetConfiguration()).toThrow(/dedicated synthetic spreadsheet/);
  });

  it("rejects a non-Preview Neon host in Preview", () => {
    process.env.VERCEL_ENV = "preview";
    expect(() => assertSafeSqlConfiguration("postgresql://user:pass@production.example/neondb")).toThrow(/isolated Neon Preview endpoint/);
    expect(() => assertSafeSqlConfiguration("postgresql://user:pass@ep-shiny-mode-bbsu0bjo-pooler.c-15.us-east-1.aws.neon.tech/neondb")).not.toThrow();
  });
});
