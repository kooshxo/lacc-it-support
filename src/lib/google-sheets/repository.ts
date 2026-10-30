import "server-only";
import type { AttachmentRecord, Employee, HealthCheck, Priority, Ticket, TicketDetail, TicketEvent, TicketMessage, TicketStatus } from "@/lib/domain/models";
import { canManageTickets, canReadTicket } from "@/lib/domain/policy";
import type { MessageCreateInput, PendingTicketWrite, TicketCreateInput, TicketUpdateInput } from "@/lib/domain/schemas";
import { readGoogleSheetIntakeRows, updateGoogleSheetIntakeRows } from "./client";
import { hasRealSourceValue, isCompletionValue, isValidSourceDate } from "@/lib/domain/resolution";
import { AuthorizationError, ConflictError, NotFoundError, type TicketFilter, type TicketRepository, WorkbookUnavailableError } from "@/lib/excel/repository";

const field = (row: unknown[], index: number) => String(row[index] ?? "").trim();
const asDate = (value: string) => { const date = new Date(value); return Number.isNaN(date.valueOf()) ? null : date; };
const statusFor = (solved: string, solvedDate: string, completion: string, staff: string): TicketStatus => isCompletionValue(solved) || isValidSourceDate(solvedDate) || isValidSourceDate(completion) || hasRealSourceValue(staff) ? "RESOLVED" : "NEW";

type IntakeTicket = Ticket & { sourceRow: number };

function ticketFrom(row: unknown[], sourceRow: number): IntakeTicket | null {
  const created = asDate(field(row, 0));
  if (!created) return null;
  const requesterEmail = field(row, 4).toLowerCase();
  const detail = field(row, 7);
  const needs = field(row, 8);
  const solved = field(row, 10);
  const resolutionNotes = field(row, 12);
  const solvedDate = field(row, 14);
  const completion = field(row, 15);
  const staff = field(row, 17);
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
    category: field(row, 11) || needs || "General IT",
    priority: "P3" as Priority,
    status: statusFor(solved, solvedDate, completion, staff),
    assigneeUid: "",
    departmentUid: field(row, 5),
    locationUid: field(row, 6),
    assetUid: "",
    impact: "ONE",
    workBlocked: false,
    workaroundAvailable: false,
    createdAt: created.toISOString(),
    updatedAt: completion && asDate(completion) ? asDate(completion)!.toISOString() : created.toISOString(),
    resolvedAt: solved.toLowerCase() === "yes" && completion && asDate(completion) ? asDate(completion)!.toISOString() : "",
    version: sourceRow,
    historicalStaff: staff,
    resolutionNotes,
    sourceSolvedValue: solved,
    sourceSolvedDate: solvedDate,
    completionTimestamp: completion,
  };
  return ticket;
}

export class GoogleSheetTicketRepository implements TicketRepository {
  private async tickets() { return (await readGoogleSheetIntakeRows()).map((row, index) => ticketFrom(row, index + 2)).filter((ticket): ticket is IntakeTicket => ticket !== null); }

  async getEmployeeByEmail(email: string): Promise<Employee | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;
    return { employeeUid: normalized, email: normalized, displayName: process.env.DEMO_STAFF_NAME ?? "IT Staff", departmentUid: "IT", locationUid: "LACC", role: "ADMIN", active: true };
  }

  async listTickets(filter: TicketFilter = {}) {
    let tickets = await this.tickets();
    if (filter.requesterUid) tickets = tickets.filter((ticket) => ticket.requesterUid === filter.requesterUid);
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
    if (input.status === "NEW") {
      await this.updateTickets([{ operationUid: input.operationUid, ticketUid: ticket.ticketUid, ticketNumber: ticket.ticketNumber, expectedVersion: input.expectedVersion, status: "NEW", completedBy: actor.displayName, resolutionNotes: "", completedAt: new Date().toISOString() }], actor);
      return { ...ticket, status: "NEW", assigneeUid: "", historicalStaff: "TBD", resolutionNotes: "", sourceSolvedValue: "FALSE", sourceSolvedDate: "", completionTimestamp: "FALSE", updatedAt: new Date().toISOString(), resolvedAt: "" };
    }
    if (input.status !== "RESOLVED" && input.status !== "CLOSED") return ticket;
    const completedAt = new Date().toISOString();
    const staff = input.completedBy || actor.displayName;
    const solvedDate = completedAt.slice(0, 10);
    await this.updateTickets([{ operationUid: input.operationUid, ticketUid: ticket.ticketUid, ticketNumber: ticket.ticketNumber, expectedVersion: input.expectedVersion, status: input.status, completedBy: staff, resolutionNotes: input.resolutionNotes, completedAt }], actor);
    return { ...ticket, status: "RESOLVED", assigneeUid: "", historicalStaff: staff, resolutionNotes: input.resolutionNotes || ticket.resolutionNotes, sourceSolvedValue: "Yes", sourceSolvedDate: solvedDate, completionTimestamp: "TRUE", updatedAt: completedAt, resolvedAt: completedAt };
  }

  async updateTickets(writes: PendingTicketWrite[], actor: Employee): Promise<void> {
    if (!canManageTickets(actor)) throw new AuthorizationError();
    if (!writes.length) return;
    const tickets = await this.tickets();
    const byUid = new Map(tickets.map((ticket) => [ticket.ticketUid, ticket]));
    const latestByTicket = new Map<string, PendingTicketWrite>();
    for (const write of writes) {
      const ticket = byUid.get(write.ticketUid);
      if (!ticket || ticket.ticketNumber !== write.ticketNumber) throw new NotFoundError();
      if (ticket.version !== write.expectedVersion) throw new ConflictError();
      latestByTicket.set(write.ticketUid, write);
    }
    await updateGoogleSheetIntakeRows([...latestByTicket.values()].map((write) => {
      const ticket = byUid.get(write.ticketUid)!;
      if (write.status === "NEW") {
        return { row: ticket.sourceRow, updates: [["K", "FALSE"], ["M", ""], ["O", ""], ["P", "FALSE"], ["R", "TBD"]] as Array<[string, string]> };
      }
      const updates: Array<[string, string]> = [["K", "Yes"], ["O", write.completedAt.slice(0, 10)], ["P", "TRUE"], ["R", write.completedBy]];
      if (write.resolutionNotes !== undefined) updates.push(["M", write.resolutionNotes]);
      return { row: ticket.sourceRow, updates };
    }));
  }

  async healthCheck(): Promise<HealthCheck> {
    const started = Date.now();
    try { await this.tickets(); return { status: "healthy", backend: "google", workbookReadable: true, workbookWritable: true, schemaVersion: "Google form intake", missingTables: [], problems: [], checkedAt: new Date().toISOString(), latencyMs: Date.now() - started }; }
    catch (error) { return { status: "unconfigured", backend: "google", workbookReadable: false, workbookWritable: false, schemaVersion: null, missingTables: [], problems: [error instanceof Error ? error.message : "Google Sheets check failed."], checkedAt: new Date().toISOString(), latencyMs: Date.now() - started }; }
  }
}
