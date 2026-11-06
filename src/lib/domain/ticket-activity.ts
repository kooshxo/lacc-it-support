import type { TicketEvent } from "./models";
import { ticketStatusLabel } from "./ticket-status";

type EventValues = Record<string, unknown>;

function parseValue(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { return value; }
}

function fieldValue(value: unknown, key: string): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) return (value as EventValues)[key];
  return value;
}

function asText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function priorityLabel(value: unknown): string {
  const labels: Record<string, string> = { P1: "Critical", P2: "High", P3: "Normal", P4: "Low" };
  const key = asText(value).toUpperCase();
  return labels[key] ?? asText(value);
}

export function describeTicketEvent(event: TicketEvent): string[] {
  if (event.eventType === "CREATED") return ["Ticket received"];
  const before = parseValue(event.oldValue);
  const after = parseValue(event.newValue);
  const descriptions: string[] = [];
  for (const field of event.field.split(",").map((name) => name.trim()).filter(Boolean)) {
    const oldValue = fieldValue(before, field);
    const newValue = fieldValue(after, field);
    if (field === "status") {
      if (asText(oldValue) === asText(newValue)) continue;
      if (["RESOLVED", "CLOSED", "SOLVED"].includes(asText(newValue).toUpperCase())) descriptions.push("Ticket marked as Solved");
      else descriptions.push(`Status changed from ${ticketStatusLabel(asText(oldValue))} to ${ticketStatusLabel(asText(newValue))}`);
    } else if (field === "priority") {
      if (asText(oldValue) !== asText(newValue)) descriptions.push(`Priority changed from ${priorityLabel(oldValue)} to ${priorityLabel(newValue)}`);
    } else if (field === "completedBy" || field === "historicalStaff") {
      if (asText(oldValue) !== asText(newValue)) descriptions.push(asText(newValue) ? `Completed by: ${asText(newValue)}` : "Completed By cleared");
    } else if (field === "resolutionNotes") {
      if (asText(oldValue) !== asText(newValue)) descriptions.push(asText(newValue) ? "Resolution details updated" : "Resolution details cleared");
    } else if (field === "internalNote") {
      descriptions.push("Internal IT note added");
    }
  }
  return descriptions.length ? descriptions : ["Ticket updated"];
}

/** Only display attribution that the event actually records; shared login IDs stay generic. */
export function ticketEventActor(event: TicketEvent): string | null {
  if (event.actorUid === "shared-it") return "IT staff (shared account)";
  if (/^[^\s@]+@[^\s@]+$/.test(event.actorUid)) return event.actorUid;
  return null;
}
