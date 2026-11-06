import type { Ticket } from "./models";

const empty = new Set(["", "n/a", "na", "none", "null", "undefined", "tbd", "-", "—"]);

export function normalizedSourceValue(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function hasRealSourceValue(value: unknown): boolean {
  return !empty.has(normalizedSourceValue(value));
}

export function isCompletionValue(value: unknown): boolean {
  return ["yes", "y", "true", "checked", "solved", "completed", "complete", "done"].includes(normalizedSourceValue(value));
}

export function isValidSourceDate(value: unknown): boolean {
  if (!hasRealSourceValue(value)) return false;
  const parsed = new Date(String(value).trim());
  return !Number.isNaN(parsed.valueOf());
}

/** Historical Sheet semantics: staff name means the request was worked/completed, not assigned. */
export function isTicketResolved(ticket: Pick<Ticket, "status" | "sourceSolvedValue" | "sourceSolvedDate" | "completionTimestamp" | "historicalStaff">): boolean {
  return ticket.status === "RESOLVED" || ticket.status === "CLOSED" || isCompletionValue(ticket.sourceSolvedValue) || isValidSourceDate(ticket.sourceSolvedDate) || isValidSourceDate(ticket.completionTimestamp) || hasRealSourceValue(ticket.historicalStaff);
}
