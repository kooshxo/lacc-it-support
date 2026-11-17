import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { assertSafeSpreadsheetConfiguration, assertSafeSqlConfiguration } from "@/lib/config/runtime-safety";

const original = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
});

describe("runtime storage safety", () => {
  it("allows only the synthetic spreadsheet in Preview", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "18YbqQZbxXLHm3gI51UH_EphsSW1X7RBueM7YDeOhrfw";
    expect(() => assertSafeSpreadsheetConfiguration()).toThrow(/dedicated synthetic spreadsheet/);
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1tCkw89rBVRJjOjjneDbp2MShq8R_2NYah4imdX6-8Ug";
    expect(() => assertSafeSpreadsheetConfiguration()).not.toThrow();
  });

  it("allows only the approved live spreadsheet in Production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "18YbqQZbxXLHm3gI51UH_EphsSW1X7RBueM7YDeOhrfw";
    expect(() => assertSafeSpreadsheetConfiguration()).not.toThrow();
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1tCkw89rBVRJjOjjneDbp2MShq8R_2NYah4imdX6-8Ug";
    expect(() => assertSafeSpreadsheetConfiguration()).toThrow(/approved live spreadsheet/);
  });

  it("fails closed for unknown environments", () => {
    delete process.env.VERCEL_ENV;
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1tCkw89rBVRJjOjjneDbp2MShq8R_2NYah4imdX6-8Ug";
    expect(() => assertSafeSpreadsheetConfiguration()).toThrow(/explicit Preview or Production/);
  });

  it("permits only loopback SQL endpoints for local development and tests", () => {
    Reflect.set(process.env, "NODE_ENV", "development");
    delete process.env.VERCEL_ENV;
    expect(() => assertSafeSqlConfiguration("postgresql://test@127.0.0.1:5432/lacc_test")).not.toThrow();
    expect(() => assertSafeSqlConfiguration("postgresql://test@db.example.invalid/lacc_test")).toThrow(/explicit Preview or Production/);
    Reflect.set(process.env, "NODE_ENV", "production");
    process.env.VERCEL_ENV = "preview";
    expect(() => assertSafeSqlConfiguration("postgresql://test@127.0.0.1:5432/lacc_test")).toThrow(/approved Neon endpoint/);
  });

  it("rejects a non-Preview Neon host in Preview", () => {
    process.env.VERCEL_ENV = "preview";
    expect(() => assertSafeSqlConfiguration("postgresql://user:pass@production.example/neondb")).toThrow(/approved Neon endpoint/);
    expect(() => assertSafeSqlConfiguration("postgresql://user:pass@ep-shiny-mode-bbsu0bjo-pooler.c-15.us-east-1.aws.neon.tech/neondb")).not.toThrow();
  });

  it("allows only the approved Production Neon endpoint", () => {
    process.env.VERCEL_ENV = "production";
    expect(() => assertSafeSqlConfiguration("postgresql://user:pass@ep-green-meadow-bcqt6qig.c-16.us-east-1.aws.neon.tech/neondb")).not.toThrow();
    expect(() => assertSafeSqlConfiguration("postgresql://user:pass@ep-green-meadow-bcqt6qig-pooler.c-16.us-east-1.aws.neon.tech/neondb")).not.toThrow();
    expect(() => assertSafeSqlConfiguration("postgresql://user:pass@ep-shiny-mode-bbsu0bjo-pooler.c-15.us-east-1.aws.neon.tech/neondb")).toThrow(/approved Neon endpoint/);
  });
});
