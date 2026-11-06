import type { Ticket } from "./models";
import { canonicalTicketStatus, isExplicitTicketStatus } from "./ticket-status";

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

/** Current explicit status wins over source-era completion markers, which may predate a reopen. */
export function isTicketResolved(ticket: Pick<Ticket, "status" | "sourceSolvedValue" | "sourceSolvedDate" | "completionTimestamp" | "historicalStaff" | "reopenedAt">): boolean {
  if (isExplicitTicketStatus(ticket.status)) {
    if (canonicalTicketStatus(ticket.status) === "RESOLVED") return true;
    if (isValidSourceDate(ticket.reopenedAt)) return false;
  }
  return isCompletionValue(ticket.sourceSolvedValue) || isValidSourceDate(ticket.sourceSolvedDate) || isValidSourceDate(ticket.completionTimestamp) || hasRealSourceValue(ticket.historicalStaff);
}

/**
 * Prefer a real source resolution date, then the canonical current resolution time.
 * The legacy importer used createdAt as a fallback when no completion date existed;
 * those ambiguous historical rows are intentionally excluded from rolling metrics.
 */
export function ticketResolutionTimestamp(ticket: Ticket): number | null {
  if (!isTicketResolved(ticket)) return null;
  const candidates = [ticket.sourceSolvedDate, ticket.completionTimestamp, ticket.resolvedAt]
    .filter(isValidSourceDate)
    .map((value) => new Date(String(value).trim()).getTime())
    .filter(Number.isFinite);
  if (!candidates.length) return null;
  const resolvedAt = isValidSourceDate(ticket.resolvedAt) ? new Date(ticket.resolvedAt).getTime() : null;
  const createdAt = new Date(ticket.createdAt).getTime();
  const sourceTimestampExists = [ticket.sourceSolvedDate,ticket.completionTimestamp].some(isValidSourceDate);
  if (ticket.sourceSpreadsheetRow && resolvedAt === createdAt && !sourceTimestampExists) return null;
  return Math.max(...candidates);
}

export function countTicketsSolvedWithin(tickets: readonly Ticket[], now = Date.now(), days = 14): number {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return tickets.filter((ticket) => {
    const resolvedAt = ticketResolutionTimestamp(ticket);
    return resolvedAt !== null && resolvedAt >= cutoff && resolvedAt <= now;
  }).length;
}

export function effectiveCompletedBy(ticket: Pick<Ticket, "status" | "completedBy" | "historicalStaff" | "sourceSolvedValue" | "sourceSolvedDate" | "completionTimestamp" | "reopenedAt">): string {
  if (!isTicketResolved(ticket)) return "";
  const completedBy = ticket.completedBy?.trim() ?? "";
  if (completedBy) return completedBy;
  const historical = ticket.historicalStaff?.trim() ?? "";
  return hasRealSourceValue(historical) && !/^it staff(?:\s*\(shared account\))?$/i.test(historical) ? historical : "";
}
