import "server-only";
import type { AttachmentRecord, Employee, HealthCheck, Priority, Ticket, TicketDetail, TicketEvent, TicketMessage, TicketStatus } from "@/lib/domain/models";
import { canManageTickets, canReadTicket } from "@/lib/domain/policy";
import type { MessageCreateInput, TicketCreateInput, TicketUpdateInput } from "@/lib/domain/schemas";
import { readGoogleSheetIntakeTable, updateGoogleSheetIntakeRow } from "./client";
import { AuthorizationError, ConflictError, NotFoundError, type TicketFilter, type TicketRepository, WorkbookUnavailableError } from "@/lib/excel/repository";
import { canonicalTicketStatus } from "@/lib/domain/ticket-status";

const field = (row: unknown[], index: number | undefined) => String(index === undefined ? "" : row[index] ?? "").trim();
const asDate = (value: string) => { const date = new Date(value); return Number.isNaN(date.valueOf()) ? null : date; };
const cutoff = new Date("2026-11-07T00:00:00-05:00");
const statusFor = (status: string, solved: string): TicketStatus => {
  const normalized = canonicalTicketStatus(status);
  if (normalized === "IN_PROGRESS" || normalized === "RESOLVED" || normalized === "NEW") return normalized;
  return String(solved).toLowerCase() === "true" || String(solved).toLowerCase() === "yes" ? "RESOLVED" : "NEW";
};

type Columns = Record<string, number>;
function columns(headers: unknown[]): Columns {
  const normalized = headers.map((h) => String(h ?? "").trim().toLowerCase());
  const find = (test: (value: string) => boolean, required = true) => {
    const index = normalized.findIndex(test);
    if (required && index < 0) throw new WorkbookUnavailableError("The TICKETS sheet is missing a required header.");
    return index;
  };
  return {
    timestamp: find((v) => v.startsWith("timestamp")), email: find((v) => v.includes("lacc work email")),
    department: find((v) => v.startsWith("department")), phone: find((v) => v.startsWith("phone"), false),
    extension: find((v) => v.startsWith("extension"), false), category: find((v) => v.startsWith("what do you need")),
    problem: find((v) => v.startsWith("describe your problem"), false), access: find((v) => v.startsWith("describe the badge"), false),
    site: find((v) => v.startsWith("site / building"), false), name: find((v) => v.startsWith("full name /"), false),
    resolved: find((v) => v.startsWith("resolved"), false), staff: find((v) => v.startsWith("staff resolved"), false),
    ticketId: find((v) => v === "ticket id", false), status: find((v) => v === "status", false),
    resolvedAt: find((v) => v === "resolved at", false), resolution: find((v) => v === "resolution details", false), updatedAt: find((v) => v === "last updated at", false),
  };
}

type IntakeTicket = Ticket & { sourceRow: number };

function ticketFrom(row: unknown[], sourceRow: number, c: Columns): IntakeTicket | null {
  const created = asDate(field(row, c.timestamp));
  if (!created || created < cutoff) return null;
  const requesterEmail = field(row, c.email).toLowerCase();
  const detail = [field(row, c.problem), field(row, c.access)].filter(Boolean).join("\n");
  const needs = field(row, c.category);
  const solved = field(row, c.resolved);
  const status = field(row, c.status);
  const resolvedAt = field(row, c.resolvedAt);
  const resolutionNotes = field(row, c.resolution);
  const staff = field(row, c.staff);
  const ticket: IntakeTicket = {
    sourceRow,
    ticketUid: `google-row-${sourceRow}`,
    ticketNumber: `GS-${sourceRow}`,
    operationUid: "",
    requesterUid: requesterEmail || `requester-${sourceRow}`,
    requesterEmail,
    requesterName: field(row, 1) || "Unidentified requester",
    subject: needs || detail.slice(0, 100) || "IT support request",
    description: detail || needs || "No additional details supplied.",
    category: needs || "General IT",
    priority: "P3" as Priority,
    status: statusFor(status, solved),
    assigneeUid: "",
    departmentUid: field(row, c.department),
    locationUid: field(row, c.site),
    assetUid: "",
    impact: "ONE",
    workBlocked: false,
    workaroundAvailable: false,
    createdAt: created.toISOString(),
    updatedAt: field(row, c.updatedAt) || created.toISOString(),
    resolvedAt: resolvedAt && asDate(resolvedAt) ? asDate(resolvedAt)!.toISOString() : "",
    version: sourceRow,
    historicalStaff: staff,
    resolutionNotes,
    sourceSolvedValue: solved,
    sourceSolvedDate: resolvedAt,
    completionTimestamp: resolvedAt,
  };
  ticket.status = statusFor(status, solved);
  ticket.requesterName = field(row, c.name) || "Unidentified requester";
  return ticket;
}

export class GoogleSheetTicketRepository implements TicketRepository {
  private async tickets() { const table = await readGoogleSheetIntakeTable(); const c = columns(table.headers); return table.rows.map((row, index) => ticketFrom(row, index + 2, c)).filter((ticket): ticket is IntakeTicket => ticket !== null); }

  async getEmployeeByEmail(email: string): Promise<Employee | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;
    return { employeeUid: normalized, email: normalized, displayName: process.env.DEMO_STAFF_NAME ?? "IT Staff", departmentUid: "IT", locationUid: "LACC", role: "ADMIN", active: true };
  }

  async listTickets(filter: TicketFilter = {}) {
    let tickets = await this.tickets();
    if (filter.requesterUid || filter.requesterEmail) tickets = tickets.filter((ticket) => ticket.requesterUid === filter.requesterUid || Boolean(filter.requesterEmail && ticket.requesterEmail === filter.requesterEmail.toLowerCase()));
    if (filter.status) tickets = tickets.filter((ticket) => ticket.status === filter.status);
    if (filter.assigneeUid) tickets = tickets.filter((ticket) => ticket.assigneeUid === filter.assigneeUid);
    if (filter.query) { const query = filter.query.toLowerCase(); tickets = tickets.filter((ticket) => [ticket.ticketNumber, ticket.requesterName, ticket.requesterEmail, ticket.subject, ticket.description, ticket.category, ticket.departmentUid, ticket.locationUid].some((value) => value.toLowerCase().includes(query))); }
    return tickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getTicketByNumber(ticketNumber: string, actor: Employee): Promise<TicketDetail | null> {
    const ticket = (await this.tickets()).find((item) => item.ticketNumber === ticketNumber);
    if (!ticket) return null;
    if (!canReadTicket(actor, ticket) && !canManageTickets(actor)) throw new AuthorizationError();
    return { ticket, messages: [], events: [], attachments: [] };
  }

  async createTicket(input: TicketCreateInput, requester: Employee): Promise<Ticket> { void input; void requester; throw new WorkbookUnavailableError("New requests are submitted through the LACC IT request form."); }
  async addMessage(ticketUid: string, input: MessageCreateInput, actor: Employee): Promise<TicketMessage> { void ticketUid; void input; void actor; throw new WorkbookUnavailableError("Messages are not stored in the source request form."); }
  async addAttachment(record: AttachmentRecord, actor: Employee): Promise<void> { void record; void actor; throw new WorkbookUnavailableError("Attachments are not stored in the source request form."); }
  async listEvents(ticketUid: string): Promise<TicketEvent[]> { void ticketUid; return []; }

  async updateTicket(ticketUid: string, input: TicketUpdateInput, actor: Employee): Promise<Ticket> {
    if (!canManageTickets(actor)) throw new AuthorizationError();
    const ticket = (await this.tickets()).find((item) => item.ticketUid === ticketUid);
    if (!ticket) throw new NotFoundError();
    if (ticket.version !== input.expectedVersion) throw new ConflictError();
    const nextStatus = canonicalTicketStatus(input.status ?? ticket.status);
    const now = new Date().toISOString();
    const staff = input.completedBy?.trim() ?? ticket.completedBy ?? "";
    const updates: Array<[string, string]> = [["R", nextStatus], ["U", now]];
    if (nextStatus === "RESOLVED") {
      updates.push(["O", "TRUE"], ["P", staff], ["S", now]);
    } else {
      updates.push(["O", "FALSE"], ["S", ""]);
      if (input.completedBy !== undefined) updates.push(["P", staff]);
    }
    if (input.resolutionNotes !== undefined) updates.push(["T", input.resolutionNotes]);
    await updateGoogleSheetIntakeRow(ticket.sourceRow, updates);
    return { ...ticket, status: nextStatus, completedBy: staff, resolutionNotes: input.resolutionNotes ?? ticket.resolutionNotes, updatedAt: now, resolvedAt: nextStatus === "RESOLVED" ? now : "" };
  }

  async healthCheck(): Promise<HealthCheck> {
    const started = Date.now();
    try { await this.tickets(); return { status: "healthy", backend: "google", workbookReadable: true, workbookWritable: true, schemaVersion: "Google form intake", missingTables: [], problems: [], checkedAt: new Date().toISOString(), latencyMs: Date.now() - started }; }
    catch (error) { return { status: "unconfigured", backend: "google", workbookReadable: false, workbookWritable: false, schemaVersion: null, missingTables: [], problems: [error instanceof Error ? error.message : "Google Sheets check failed."], checkedAt: new Date().toISOString(), latencyMs: Date.now() - started }; }
  }
}
