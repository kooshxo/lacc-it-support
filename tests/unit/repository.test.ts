import { describe, expect, it } from "vitest";
import { FixtureTicketRepository } from "@/lib/excel/fixture-repository";
import { AuthorizationError, ConflictError } from "@/lib/excel/repository";

describe("ticket repository guarantees",()=>{
  it("deduplicates a retried ticket operation",async()=>{const repo=new FixtureTicketRepository();const user=await repo.getEmployeeByEmail("employee@thelatincenter.org");expect(user).not.toBeNull();const input={operationUid:"10000000-0000-4000-8000-000000000001",subject:"Cannot open Outlook",description:"Outlook closes immediately after I open it.",category:"Email",impact:"ONE" as const,workBlocked:false,workaroundAvailable:true,locationUid:"",assetUid:""};const first=await repo.createTicket(input,user!);const second=await repo.createTicket(input,user!);expect(second.ticketUid).toBe(first.ticketUid);});
  it("rejects stale writes",async()=>{const repo=new FixtureTicketRepository();const agent=await repo.getEmployeeByEmail("agent@thelatincenter.org");const list=await repo.listTickets();await expect(repo.updateTicket(list[0].ticketUid,{operationUid:"10000000-0000-4000-8000-000000000002",expectedVersion:999,status:"RESOLVED"},agent!)).rejects.toBeInstanceOf(ConflictError);});
  it("does not return another employee ticket",async()=>{const repo=new FixtureTicketRepository();const user=await repo.getEmployeeByEmail("employee@thelatincenter.org");await expect(repo.getTicketByNumber("LACC-2026-3D91B4",user!)).rejects.toBeInstanceOf(AuthorizationError);});
  it("records the explicitly entered technician rather than the shared login name",async()=>{const repo=new FixtureTicketRepository();const agent=await repo.getEmployeeByEmail("agent@thelatincenter.org");const ticket=(await repo.listTickets())[0];await repo.updateTicket(ticket.ticketUid,{operationUid:"10000000-0000-0000-0000-000000000003",expectedVersion:ticket.version,status:"RESOLVED",completedBy:"Technician One"},agent!);const completion=repo.legacyCompletions.get(ticket.ticketNumber);expect(completion?.solved).toBe("Yes");expect(completion?.staff).toBe("Technician One");expect(completion?.completedAt).toBeTruthy();});
  it("persists independent edits and reloadable fields across solve, priority edit, and reopen",async()=>{
    const repo=new FixtureTicketRepository();const requester=await repo.getEmployeeByEmail("employee@thelatincenter.org");const agent=await repo.getEmployeeByEmail("agent@thelatincenter.org");
    const ticket=await repo.createTicket({operationUid:"20000000-0000-0000-0000-000000000001",subject:"VPN profile stops working",description:"The VPN profile disconnects and blocks access to the case management system.",category:"Network",impact:"ONE",workBlocked:true,workaroundAvailable:false,locationUid:"Main Building",assetUid:""},requester!);
    const first=await repo.updateTicket(ticket.ticketUid,{operationUid:"20000000-0000-0000-0000-000000000002",expectedVersion:1,status:"NEW",priority:"P1"},agent!);
    expect(first).toMatchObject({status:"NEW",priority:"P1",resolvedAt:""});
    const second=await repo.updateTicket(ticket.ticketUid,{operationUid:"20000000-0000-0000-0000-000000000003",expectedVersion:2,status:"IN_PROGRESS",resolutionNotes:"Checking the VPN configuration"},agent!);
    expect(second).toMatchObject({status:"IN_PROGRESS",priority:"P1",resolutionNotes:"Checking the VPN configuration"});
    const solved=await repo.updateTicket(ticket.ticketUid,{operationUid:"20000000-0000-0000-0000-000000000004",expectedVersion:3,status:"RESOLVED",completedBy:"Tech A",resolutionNotes:"Reinstalled the VPN profile"},agent!);
    expect(solved).toMatchObject({status:"RESOLVED",priority:"P1",completedBy:"Tech A",resolutionNotes:"Reinstalled the VPN profile"});
    expect(new Date(solved.resolvedAt).toString()).not.toBe("Invalid Date");
    const priorityOnly=await repo.updateTicket(ticket.ticketUid,{operationUid:"20000000-0000-0000-0000-000000000005",expectedVersion:4,status:"RESOLVED",priority:"P2",completedBy:"Tech A",resolutionNotes:"Reinstalled the VPN profile"},agent!);
    expect(priorityOnly.resolvedAt).toBe(solved.resolvedAt);
    expect(priorityOnly.completedBy).toBe("Tech A");
    const reloaded=await repo.getTicketByNumber(ticket.ticketNumber,agent!);
    expect(reloaded?.ticket).toMatchObject({status:"RESOLVED",priority:"P2",completedBy:"Tech A",resolutionNotes:"Reinstalled the VPN profile"});
    const reopened=await repo.updateTicket(ticket.ticketUid,{operationUid:"20000000-0000-0000-0000-000000000006",expectedVersion:5,status:"IN_PROGRESS"},agent!);
    expect(reopened).toMatchObject({status:"IN_PROGRESS",priority:"P2",completedBy:"",resolvedAt:""});
  });
});
