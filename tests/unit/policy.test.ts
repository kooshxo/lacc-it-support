import { describe, expect, it } from "vitest";
import { canAccessAdmin, canCreateMessage, canReadTicket, employeeVisibleMessages, suggestedPriority } from "@/lib/domain/policy";
import type { Employee, Ticket } from "@/lib/domain/models";

const employee: Employee = { employeeUid:"a",email:"a@thelatincenter.org",displayName:"A",departmentUid:"",locationUid:"",role:"EMPLOYEE",active:true };
const agent: Employee = { ...employee, employeeUid:"it",role:"IT_AGENT" };
const admin: Employee = { ...employee,employeeUid:"admin",role:"ADMIN" };
const ticket: Ticket = { ticketUid:"t",ticketNumber:"LACC-2026-ABC",operationUid:"o",requesterUid:"a",requesterEmail:employee.email,requesterName:"A",subject:"Subject",description:"Description",category:"Other",priority:"P3",status:"NEW",assigneeUid:"",departmentUid:"",locationUid:"",assetUid:"",impact:"ONE",workBlocked:false,workaroundAvailable:true,createdAt:"",updatedAt:"",resolvedAt:"",version:1 };

describe("authorization policy",()=>{
  it("denies horizontal ticket access",()=>expect(canReadTicket({...employee,employeeUid:"b"},ticket)).toBe(false));
  it("allows IT to read tickets but not employee internal notes",()=>{expect(canReadTicket(agent,ticket)).toBe(true);expect(canCreateMessage(employee,ticket,"INTERNAL_NOTE")).toBe(false);expect(employeeVisibleMessages([{type:"PUBLIC_REPLY" as const},{type:"INTERNAL_NOTE" as const}])).toEqual([{type:"PUBLIC_REPLY"}]);});
  it("keeps admin separate from agents",()=>{expect(canAccessAdmin(agent)).toBe(false);expect(canAccessAdmin(admin)).toBe(true);});
});

describe("priority suggestion",()=>{it("reserves P1 for broad blocking outages",()=>{expect(suggestedPriority({impact:"MANY",workBlocked:true,workaroundAvailable:false})).toBe("P1");expect(suggestedPriority({impact:"ONE",workBlocked:true,workaroundAvailable:false})).toBe("P2");});});
