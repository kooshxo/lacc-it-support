import { describe, expect, it } from "vitest";
import { countTicketsSolvedWithin, isTicketResolved, ticketResolutionTimestamp } from "@/lib/domain/resolution";
import type { Ticket } from "@/lib/domain/models";

const ticket = (overrides: Partial<Ticket> = {}): Ticket => ({ ticketUid:"t",ticketNumber:"T-1",operationUid:"o",requesterUid:"r",requesterEmail:"r@example.org",requesterName:"Requester",subject:"Subject",description:"Description",category:"Other",priority:"P3",status:"NEW",assigneeUid:"",departmentUid:"",locationUid:"",assetUid:"",impact:"ONE",workBlocked:false,workaroundAvailable:true,createdAt:"2026-10-01T12:00:00.000Z",updatedAt:"2026-10-01T12:00:00.000Z",resolvedAt:"",version:1,sourceSolvedValue:"",sourceSolvedDate:"",completionTimestamp:"",historicalStaff:"",...overrides });

describe("Google Sheet historical completion signals", () => {
  it.each(["Yes", "TRUE", " checked ", "Solved", "Done"])("resolves completion value %s", (value) => expect(isTicketResolved(ticket({ sourceSolvedValue: value }))).toBe(true));
  it("resolves an unchecked/blank checkbox when historical staff is present", () => expect(isTicketResolved(ticket({ historicalStaff: " Dominic " }))).toBe(true));
  it("resolves a valid completion date without a technician", () => expect(isTicketResolved(ticket({ sourceSolvedDate: "2026-09-15T14:00:00Z" }))).toBe(true));
  it("keeps a genuinely untouched ticket active", () => expect(isTicketResolved(ticket())).toBe(false));
  it("ignores whitespace and placeholder staff values", () => expect(isTicketResolved(ticket({ historicalStaff: "  N/A  " }))).toBe(false));
  it("treats explicit reopen state as active while preserving legacy completion fields", () => expect(isTicketResolved(ticket({ status:"IN_PROGRESS",sourceSolvedValue:"Yes",historicalStaff:"Previous technician",reopenedAt:"2026-11-01T12:00:00.000Z",resolvedAt:"" }))).toBe(false));
});

describe("rolling solved metrics", () => {
  const now = new Date("2026-11-06T12:00:00.000Z").getTime();
  it("counts recent resolution timestamps even when the request itself is old", () => {
    const item = ticket({ status:"RESOLVED",createdAt:"2026-08-01T12:00:00.000Z",resolvedAt:"2026-11-02T10:00:00.000Z" });
    expect(countTicketsSolvedWithin([item], now)).toBe(1);
  });
  it("excludes older resolutions and tickets reopened after resolution", () => {
    const older = ticket({ status:"RESOLVED",resolvedAt:"2026-10-20T12:00:00.000Z" });
    const reopened = ticket({ status:"IN_PROGRESS",sourceSolvedValue:"Yes",sourceSolvedDate:"2026-11-02",resolvedAt:"",reopenedAt:"2026-11-04T09:00:00.000Z" });
    expect(countTicketsSolvedWithin([older,reopened], now)).toBe(0);
  });
  it("uses historical completion dates but excludes imported submission-date fallbacks", () => {
    const dated = ticket({ status:"RESOLVED",sourceSpreadsheetRow:42,createdAt:"2026-08-01T12:00:00.000Z",resolvedAt:"2026-08-01T12:00:00.000Z",sourceSolvedDate:"2026-11-03" });
    const ambiguous = ticket({ status:"RESOLVED",sourceSpreadsheetRow:43,createdAt:"2026-11-03T12:00:00.000Z",resolvedAt:"2026-11-03T12:00:00.000Z",sourceSolvedValue:"Yes" });
    expect(ticketResolutionTimestamp(dated)).not.toBeNull();
    expect(ticketResolutionTimestamp(ambiguous)).toBeNull();
    expect(countTicketsSolvedWithin([dated,ambiguous], now)).toBe(1);
  });
});
