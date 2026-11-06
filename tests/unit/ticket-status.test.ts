import { describe, expect, it } from "vitest";
import { ticketStatuses } from "@/lib/domain/models";
import { canonicalTicketStatus, ticketStatusLabel } from "@/lib/domain/ticket-status";

describe("simplified ticket statuses", () => {
  it("exposes only the three staff-selectable statuses", () => {
    expect(ticketStatuses).toEqual(["NEW", "IN_PROGRESS", "RESOLVED"]);
  });

  it.each([
    ["NEW", "NEW"],
    ["ASSIGNED", "IN_PROGRESS"],
    ["WAITING_ON_USER", "IN_PROGRESS"],
    ["WAITING_ON_VENDOR", "IN_PROGRESS"],
    ["CLOSED", "RESOLVED"],
  ])("maps legacy %s to %s without rewriting it", (legacy, expected) => {
    expect(canonicalTicketStatus(legacy)).toBe(expected);
  });

  it("uses plain user-facing labels", () => {
    expect(["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"].map(ticketStatusLabel)).toEqual(["Received", "In Progress", "Solved", "Solved"]);
  });
});
