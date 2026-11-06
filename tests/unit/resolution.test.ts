import { describe, expect, it } from "vitest";
import { isTicketResolved } from "@/lib/domain/resolution";
import type { Ticket } from "@/lib/domain/models";

const ticket = (overrides: Partial<Pick<Ticket, "status" | "sourceSolvedValue" | "sourceSolvedDate" | "completionTimestamp" | "historicalStaff">> = {}): Pick<Ticket, "status" | "sourceSolvedValue" | "sourceSolvedDate" | "completionTimestamp" | "historicalStaff"> => ({ status: "NEW", sourceSolvedValue: "", sourceSolvedDate: "", completionTimestamp: "", historicalStaff: "", ...overrides });

describe("Google Sheet historical completion signals", () => {
  it.each(["Yes", "TRUE", " checked ", "Solved", "Done"])("resolves completion value %s", (value) => expect(isTicketResolved(ticket({ sourceSolvedValue: value }))).toBe(true));
  it("resolves an unchecked/blank checkbox when historical staff is present", () => expect(isTicketResolved(ticket({ historicalStaff: " Dominic " }))).toBe(true));
  it("resolves a valid completion date without a technician", () => expect(isTicketResolved(ticket({ sourceSolvedDate: "2026-09-15T14:00:00Z" }))).toBe(true));
  it("keeps a genuinely untouched ticket active", () => expect(isTicketResolved(ticket())).toBe(false));
  it("ignores whitespace and placeholder staff values", () => expect(isTicketResolved(ticket({ historicalStaff: "  N/A  " }))).toBe(false));
});
