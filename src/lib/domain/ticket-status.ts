import type { EditableTicketStatus, TicketStatus } from "./models";

export function canonicalTicketStatus(status: TicketStatus | string | null | undefined): EditableTicketStatus {
  switch (status) {
    case "IN_PROGRESS":
    case "ASSIGNED":
    case "WAITING_ON_USER":
    case "WAITING_ON_VENDOR":
      return "IN_PROGRESS";
    case "RESOLVED":
    case "CLOSED":
    case "SOLVED":
      return "RESOLVED";
    case "NEW":
    case "RECEIVED":
    default:
      return "NEW";
  }
}

export function ticketStatusLabel(status: TicketStatus | string | null | undefined): string {
  const canonical = canonicalTicketStatus(status);
  return canonical === "NEW" ? "Received" : canonical === "IN_PROGRESS" ? "In Progress" : "Solved";
}

export function isExplicitTicketStatus(status: unknown): status is TicketStatus {
  return ["NEW", "IN_PROGRESS", "RESOLVED", "ASSIGNED", "WAITING_ON_USER", "WAITING_ON_VENDOR", "CLOSED"].includes(String(status));
}
