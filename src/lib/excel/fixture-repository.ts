import { randomUUID } from "node:crypto";
import type { AttachmentRecord, Employee, HealthCheck, Ticket, TicketEvent, TicketMessage } from "@/lib/domain/models";
import { canCreateMessage, canManageTickets, canReadTicket, employeeVisibleMessages, suggestedPriority } from "@/lib/domain/policy";
import type { MessageCreateInput, TicketCreateInput, TicketUpdateInput } from "@/lib/domain/schemas";
import { ticketNumberFromUid } from "@/lib/domain/ticket-number";
import { canonicalTicketStatus } from "@/lib/domain/ticket-status";
import { isTicketResolved } from "@/lib/domain/resolution";
import { AuthorizationError, ConflictError, NotFoundError, type TicketFilter, type TicketRepository } from "./repository";

const people: Employee[] = [
  { employeeUid: "emp-demo", email: "employee@thelatincenter.org", displayName: "María Rivera", departmentUid: "Family Services", locationUid: "Main Building", role: "EMPLOYEE", active: true },
  { employeeUid: "agent-demo", email: "agent@thelatincenter.org", displayName: "Daniel Ortiz", departmentUid: "IT", locationUid: "Main Building", role: "IT_AGENT", active: true },
  { employeeUid: "admin-demo", email: "admin@thelatincenter.org", displayName: "Alex Morgan", departmentUid: "IT", locationUid: "Main Building", role: "ADMIN", active: true },
];
const now = new Date();
const tickets: Ticket[] = [
  { ticketUid: "ticket-demo-1", ticketNumber: "LACC-2026-8F2A7C", operationUid: "00000000-0000-4000-8000-000000000001", requesterUid: "emp-demo", requesterEmail: people[0].email, requesterName: people[0].displayName, subject: "Laptop cannot connect to Wi-Fi", description: "The laptop disconnects from the staff Wi-Fi every few minutes and I cannot finish client notes.", category: "Internet / Wi-Fi", priority: "P2", status: "IN_PROGRESS", assigneeUid: "agent-demo", departmentUid: "Family Services", locationUid: "Main Building", assetUid: "LACC-LT-104", impact: "ONE", workBlocked: true, workaroundAvailable: false, createdAt: new Date(now.getTime() - 36e5 * 4).toISOString(), updatedAt: new Date(now.getTime() - 36e5).toISOString(), resolvedAt: "", version: 2 },
  { ticketUid: "ticket-demo-2", ticketNumber: "LACC-2026-3D91B4", operationUid: "00000000-0000-4000-8000-000000000002", requesterUid: "another-employee", requesterEmail: "other@thelatincenter.org", requesterName: "Another Employee", subject: "Printer queue is paused", description: "Second floor printer queue shows paused for several staff members.", category: "Printer / Scanner", priority: "P2", status: "NEW", assigneeUid: "", departmentUid: "Education", locationUid: "Main Building", assetUid: "PRN-2F-01", impact: "SEVERAL", workBlocked: false, workaroundAvailable: true, createdAt: new Date(now.getTime() - 36e5 * 2).toISOString(), updatedAt: new Date(now.getTime() - 36e5 * 2).toISOString(), resolvedAt: "", version: 1 },
];
const messages: TicketMessage[] = [
  { messageUid: "msg-demo-public", operationUid: "00000000-0000-4000-8000-000000000010", ticketUid: "ticket-demo-1", authorUid: "agent-demo", authorName: "Daniel Ortiz", type: "PUBLIC_REPLY", body: "I’m checking the wireless profile. Please keep the laptop powered on.", createdAt: new Date(now.getTime() - 36e5).toISOString() },
  { messageUid: "msg-demo-internal", operationUid: "00000000-0000-4000-8000-000000000011", ticketUid: "ticket-demo-1", authorUid: "agent-demo", authorName: "Daniel Ortiz", type: "INTERNAL_NOTE", body: "Device may still have the retired SSID profile.", createdAt: new Date(now.getTime() - 30e5).toISOString() },
];
const events: TicketEvent[] = [];

export class FixtureTicketRepository implements TicketRepository {
  readonly legacyCompletions = new Map<string, { solved: "Yes"; completedAt: string; staff: string }>();
  async getEmployeeByEmail(email: string) { return people.find((person) => person.email === email.toLowerCase() && person.active) ?? null; }
  async listTickets(filter: TicketFilter = {}) { const q = filter.query?.toLowerCase(); return tickets.filter((t) => (!filter.requesterUid || t.requesterUid === filter.requesterUid) && (!filter.status || t.status === filter.status) && (!filter.assigneeUid || t.assigneeUid === filter.assigneeUid) && (!q || [t.ticketNumber, t.subject, t.description, t.requesterName, t.category].some((v) => v.toLowerCase().includes(q)))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async getTicketByNumber(ticketNumber: string, actor: Employee) { const ticket = tickets.find((t) => t.ticketNumber === ticketNumber); if (!ticket) return null; if (!canReadTicket(actor, ticket)) throw new AuthorizationError(); const visible = messages.filter((m) => m.ticketUid === ticket.ticketUid); return { ticket, messages: actor.role === "EMPLOYEE" ? employeeVisibleMessages(visible) : visible, events: events.filter((e) => e.ticketUid === ticket.ticketUid), attachments: [] }; }
  async createTicket(input: TicketCreateInput, requester: Employee) { const replay = tickets.find((t) => t.operationUid === input.operationUid); if (replay) return replay; const ticketUid = randomUUID(); const createdAt = new Date().toISOString(); const ticket: Ticket = { ticketUid, ticketNumber: ticketNumberFromUid(ticketUid), operationUid: input.operationUid, requesterUid: requester.employeeUid, requesterEmail: requester.email, requesterName: requester.displayName, subject: input.subject, description: input.description, category: input.category, priority: suggestedPriority(input), status: "NEW", assigneeUid: "", departmentUid: requester.departmentUid, locationUid: input.locationUid || requester.locationUid, assetUid: input.assetUid, impact: input.impact, workBlocked: input.workBlocked, workaroundAvailable: input.workaroundAvailable, createdAt, updatedAt: createdAt, resolvedAt: "", version: 1 }; tickets.push(ticket); return ticket; }
  async updateTicket(ticketUid: string, input: TicketUpdateInput, actor: Employee) {
    if (!canManageTickets(actor)) throw new AuthorizationError();
    const index = tickets.findIndex((ticket) => ticket.ticketUid === ticketUid);
    if (index < 0) throw new NotFoundError();
    const current = tickets[index];
    if (current.version !== input.expectedVersion) throw new ConflictError();
    const currentStatus = canonicalTicketStatus(current.status);
    const nextStatus = input.status ? canonicalTicketStatus(input.status) : currentStatus;
    const updated: Ticket = { ...current };
    if (input.status && nextStatus !== currentStatus) {
      updated.status = nextStatus;
      if (nextStatus === "RESOLVED") {
        updated.resolvedAt = new Date().toISOString();
        updated.reopenedAt = "";
        updated.completedBy = input.completedBy?.trim() ?? "";
        this.legacyCompletions.set(current.ticketNumber, { solved: "Yes", completedAt: updated.resolvedAt, staff: updated.completedBy });
      } else {
        if (isTicketResolved(current)) updated.reopenedAt = new Date().toISOString();
        updated.resolvedAt = "";
        updated.completedBy = "";
      }
    }
    if (input.priority !== undefined) updated.priority = input.priority;
    if (input.category !== undefined) updated.category = input.category;
    if (input.completedBy !== undefined) updated.completedBy = input.completedBy;
    if (input.resolutionNotes !== undefined) updated.resolutionNotes = input.resolutionNotes;
    const changed = ["status", "priority", "completedBy", "resolutionNotes"].some((key) => current[key as keyof Ticket] !== updated[key as keyof Ticket]);
    if (input.internalNote?.trim()) {
      messages.push({ messageUid: randomUUID(), operationUid: input.operationUid, ticketUid, authorUid: actor.employeeUid, authorName: actor.displayName, type: "INTERNAL_NOTE", body: input.internalNote.trim(), createdAt: new Date().toISOString() });
    }
    if (changed || input.internalNote?.trim()) {
      updated.updatedAt = new Date().toISOString();
      updated.version = current.version + 1;
      if (changed) {
        const fields = ["status", "priority", "completedBy", "resolutionNotes"].filter((key) => current[key as keyof Ticket] !== updated[key as keyof Ticket]);
        events.push({ eventUid: randomUUID(), operationUid: input.operationUid, ticketUid, actorUid: actor.employeeUid, eventType: "UPDATED", field: fields.join(","), oldValue: JSON.stringify(Object.fromEntries(fields.map((key) => [key, current[key as keyof Ticket] ?? ""]))), newValue: JSON.stringify(Object.fromEntries(fields.map((key) => [key, updated[key as keyof Ticket] ?? ""]))), createdAt: updated.updatedAt });
      }
      tickets[index] = updated;
    }
    return updated;
  }
  async addMessage(ticketUid: string, input: MessageCreateInput, actor: Employee) { const ticket = tickets.find((t) => t.ticketUid === ticketUid); if (!ticket) throw new NotFoundError(); if (!canCreateMessage(actor, ticket, input.type)) throw new AuthorizationError(); const replay = messages.find((m) => m.operationUid === input.operationUid); if (replay) return replay; const message = { messageUid: randomUUID(), operationUid: input.operationUid, ticketUid, authorUid: actor.employeeUid, authorName: actor.displayName, type: input.type, body: input.body, createdAt: new Date().toISOString() }; messages.push(message); return message; }
  async addAttachment(record: AttachmentRecord, actor: Employee) { void record; void actor; }
  async listEvents(ticketUid: string) { return events.filter((event) => event.ticketUid === ticketUid); }
  async healthCheck(): Promise<HealthCheck> { return { status: "healthy", backend: "fixture", workbookReadable: true, workbookWritable: true, schemaVersion: "1.0.0-demo", missingTables: [], problems: ["Fixture backend is for local testing only and is blocked in production."], checkedAt: new Date().toISOString(), latencyMs: 0 }; }
}
