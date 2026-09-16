import type { Employee, MessageType, Priority, Ticket } from "./models";

export function canReadTicket(actor: Employee, ticket: Ticket) {
  return actor.role !== "EMPLOYEE" || ticket.requesterUid === actor.employeeUid;
}

export function canManageTickets(actor: Employee) {
  return actor.role === "IT_AGENT" || actor.role === "ADMIN";
}

export function canAccessAdmin(actor: Employee) {
  return actor.role === "ADMIN";
}

export function canCreateMessage(actor: Employee, ticket: Ticket, type: MessageType) {
  if (!canReadTicket(actor, ticket)) return false;
  if (actor.role === "EMPLOYEE") return type === "EMPLOYEE_REPLY";
  return type === "PUBLIC_REPLY" || type === "INTERNAL_NOTE";
}

export function suggestedPriority(input: { impact: "ONE" | "SEVERAL" | "MANY"; workBlocked: boolean; workaroundAvailable: boolean }): Priority {
  if (input.impact === "MANY" && input.workBlocked && !input.workaroundAvailable) return "P1";
  if (input.workBlocked && !input.workaroundAvailable) return "P2";
  if (input.impact !== "ONE" && !input.workaroundAvailable) return "P2";
  if (!input.workBlocked && input.workaroundAvailable) return "P4";
  return "P3";
}

export function employeeVisibleMessages<T extends { type: MessageType }>(messages: T[]) {
  return messages.filter((message) => message.type !== "INTERNAL_NOTE");
}
