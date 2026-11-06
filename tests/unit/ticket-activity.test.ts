import { describe, expect, it } from "vitest";
import { describeTicketEvent, ticketEventActor } from "@/lib/domain/ticket-activity";
import type { TicketEvent } from "@/lib/domain/models";

const event = (overrides: Partial<TicketEvent> = {}): TicketEvent => ({ eventUid:"e",operationUid:"o",ticketUid:"t",actorUid:"shared-it",eventType:"UPDATED",field:"",oldValue:"{}",newValue:"{}",createdAt:"2026-11-06T12:00:00.000Z",...overrides });

describe("human-readable ticket activity", () => {
  it("describes status and priority changes instead of showing JSON", () => {
    const update = event({ field:"status,priority",oldValue:JSON.stringify({status:"NEW",priority:"P3"}),newValue:JSON.stringify({status:"IN_PROGRESS",priority:"P2"}) });
    expect(describeTicketEvent(update)).toEqual(["Status changed from Received to In Progress","Priority changed from Normal to High"]);
  });
  it("summarizes completion and resolution changes", () => {
    const update = event({ field:"status,completedBy,resolutionNotes",oldValue:JSON.stringify({status:"IN_PROGRESS",completedBy:"",resolutionNotes:""}),newValue:JSON.stringify({status:"RESOLVED",completedBy:"Duane",resolutionNotes:"Replaced the cable"}) });
    expect(describeTicketEvent(update)).toEqual(["Ticket marked as Solved","Completed by: Duane","Resolution details updated"]);
  });
  it("uses generic attribution for a shared account and hides opaque identifiers", () => {
    expect(ticketEventActor(event())).toBe("IT staff (shared account)");
    expect(ticketEventActor(event({actorUid:"entra:tenant-guid:object-guid"}))).toBeNull();
    expect(ticketEventActor(event({actorUid:"person@thelatincenter.org"}))).toBe("person@thelatincenter.org");
  });
});
