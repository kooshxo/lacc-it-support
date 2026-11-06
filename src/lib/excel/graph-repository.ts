import "server-only";
import { randomUUID } from "node:crypto";
import type { AttachmentRecord, Employee, HealthCheck, Priority, Role, Ticket, TicketDetail, TicketEvent, TicketMessage, TicketStatus } from "@/lib/domain/models";
import { canCreateMessage, canManageTickets, canReadTicket, employeeVisibleMessages, suggestedPriority } from "@/lib/domain/policy";
import type { MessageCreateInput, TicketCreateInput, TicketUpdateInput } from "@/lib/domain/schemas";
import { ticketNumberFromUid } from "@/lib/domain/ticket-number";
import { GraphExcelClient, getWorkbookAccessToken } from "./graph-client";
import { AuthorizationError, ConflictError, NotFoundError, type TicketFilter, type TicketRepository, WorkbookUnavailableError } from "./repository";
import { requiredTables, tableNames } from "./tables";
import { markGoogleSheetTicketCompleted } from "@/lib/google-sheets/client";

type Row = { index: number; values: unknown[][] };
const text = (value: unknown) => value == null ? "" : String(value).trim();
const bool = (value: unknown) => value === true || text(value).toLowerCase() === "true" || text(value) === "1";
const integer = (value: unknown, fallback = 1) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const legacyIntakeTable = () => process.env.EXCEL_INTAKE_TABLE_NAME ?? "tblLegacyIntake";
const legacyColumns = { solved: 10, completedAt: 15, staff: 17, ticketNumber: 18 } as const;

function employeeFrom(row: Row): Employee | null {
  const v = row.values[0] ?? [];
  if (!text(v[0]) || !text(v[1])) return null;
  const role = text(v[5]) as Role;
  return { employeeUid: text(v[0]), email: text(v[1]).toLowerCase(), displayName: text(v[2]), departmentUid: text(v[3]), locationUid: text(v[4]), role: ["EMPLOYEE", "IT_AGENT", "ADMIN"].includes(role) ? role : "EMPLOYEE", active: bool(v[6]) };
}

function ticketFrom(row: Row): Ticket | null {
  const v = row.values[0] ?? [];
  if (!text(v[0]) || !text(v[1])) return null;
  return {
    ticketUid: text(v[0]), ticketNumber: text(v[1]), operationUid: text(v[2]), requesterUid: text(v[3]), requesterEmail: text(v[4]).toLowerCase(), requesterName: text(v[5]), subject: text(v[6]), description: text(v[7]), category: text(v[8]), priority: (text(v[9]) || "P3") as Priority, status: (text(v[10]) || "NEW") as TicketStatus, assigneeUid: text(v[11]), departmentUid: text(v[12]), locationUid: text(v[13]), assetUid: text(v[14]), impact: (text(v[15]) || "ONE") as Ticket["impact"], workBlocked: bool(v[16]), workaroundAvailable: bool(v[17]), createdAt: text(v[18]), updatedAt: text(v[19]), resolvedAt: text(v[20]), version: integer(v[21]),
  };
}

function ticketCells(t: Ticket) { return [t.ticketUid, t.ticketNumber, t.operationUid, t.requesterUid, t.requesterEmail, t.requesterName, t.subject, t.description, t.category, t.priority, t.status, t.assigneeUid, t.departmentUid, t.locationUid, t.assetUid, t.impact, t.workBlocked, t.workaroundAvailable, t.createdAt, t.updatedAt, t.resolvedAt, t.version]; }

function messageFrom(row: Row): TicketMessage | null { const v = row.values[0] ?? []; return text(v[0]) ? { messageUid: text(v[0]), operationUid: text(v[1]), ticketUid: text(v[2]), authorUid: text(v[3]), authorName: text(v[4]), type: text(v[5]) as TicketMessage["type"], body: text(v[6]), createdAt: text(v[7]) } : null; }
function eventFrom(row: Row): TicketEvent | null { const v = row.values[0] ?? []; return text(v[0]) ? { eventUid: text(v[0]), operationUid: text(v[1]), ticketUid: text(v[2]), actorUid: text(v[3]), eventType: text(v[4]), field: text(v[5]), oldValue: text(v[6]), newValue: text(v[7]), createdAt: text(v[8]) } : null; }
function attachmentFrom(row: Row): AttachmentRecord | null { const v=row.values[0]??[]; return text(v[0])?{attachmentUid:text(v[0]),operationUid:text(v[1]),ticketUid:text(v[2]),filename:text(v[3]),storageReference:text(v[4]),mimeType:text(v[5]),size:integer(v[6],0),uploadedBy:text(v[7]),uploadedAt:text(v[8])}:null; }

export class GraphTicketRepository implements TicketRepository {
  private async withSession<T>(operation: (client: GraphExcelClient, sessionId: string) => Promise<T>) {
    const driveId = process.env.EXCEL_DRIVE_ID;
    const itemId = process.env.EXCEL_WORKBOOK_ITEM_ID;
    if (!driveId || !itemId) throw new WorkbookUnavailableError("The canonical Excel workbook location is not configured.");
    const client = new GraphExcelClient(await getWorkbookAccessToken(), driveId, itemId);
    const session = await client.createSession();
    try { return await operation(client, session); } finally { await client.closeSession(session); }
  }

  async getEmployeeByEmail(email: string) { return this.withSession(async (client, session) => (await client.listTableRows(tableNames.employees, session)).map(employeeFrom).find((item) => item?.active && item.email === email.trim().toLowerCase()) ?? null); }

  async listTickets(filter: TicketFilter = {}) {
    return this.withSession(async (client, session) => {
      let tickets = (await client.listTableRows(tableNames.tickets, session)).map(ticketFrom).filter((item): item is Ticket => Boolean(item));
      if (filter.requesterUid) tickets = tickets.filter((t) => t.requesterUid === filter.requesterUid);
      if (filter.status) tickets = tickets.filter((t) => t.status === filter.status);
      if (filter.assigneeUid) tickets = tickets.filter((t) => t.assigneeUid === filter.assigneeUid);
      if (filter.query) { const q = filter.query.toLowerCase(); tickets = tickets.filter((t) => [t.ticketNumber, t.requesterName, t.requesterEmail, t.subject, t.description, t.category, t.departmentUid, t.locationUid, t.assetUid, t.assigneeUid].some((value) => value.toLowerCase().includes(q))); }
      return tickets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  }

  async getTicketByNumber(ticketNumber: string, actor: Employee): Promise<TicketDetail | null> {
    return this.withSession(async (client, session) => {
      const ticket = (await client.listTableRows(tableNames.tickets, session)).map(ticketFrom).find((item) => item?.ticketNumber === ticketNumber);
      if (!ticket) return null;
      if (!canReadTicket(actor, ticket)) throw new AuthorizationError();
      const messages = (await client.listTableRows(tableNames.messages, session)).map(messageFrom).filter((item): item is TicketMessage => item !== null && item.ticketUid === ticket.ticketUid);
      const events = (await client.listTableRows(tableNames.events, session)).map(eventFrom).filter((item): item is TicketEvent => item !== null && item.ticketUid === ticket.ticketUid);
      const attachments = (await client.listTableRows(tableNames.attachments, session)).map(attachmentFrom).filter((item): item is AttachmentRecord => item !== null && item.ticketUid === ticket.ticketUid);
      return { ticket, messages: actor.role === "EMPLOYEE" ? employeeVisibleMessages(messages) : messages, events, attachments };
    });
  }

  async createTicket(input: TicketCreateInput, requester: Employee) {
    return this.withSession(async (client, session) => {
      const existing = (await client.listTableRows(tableNames.tickets, session)).map(ticketFrom).filter((item): item is Ticket => Boolean(item));
      const replay = existing.find((ticket) => ticket.operationUid === input.operationUid);
      if (replay) return replay;
      const now = new Date().toISOString();
      let ticketUid = randomUUID();
      let ticketNumber = ticketNumberFromUid(ticketUid);
      while (existing.some((ticket) => ticket.ticketNumber === ticketNumber)) { ticketUid = randomUUID(); ticketNumber = ticketNumberFromUid(ticketUid); }
      const ticket: Ticket = { ticketUid, ticketNumber, operationUid: input.operationUid, requesterUid: requester.employeeUid, requesterEmail: requester.email, requesterName: requester.displayName, subject: input.subject, description: input.description, category: input.category, priority: suggestedPriority(input), status: "NEW", assigneeUid: "", departmentUid: requester.departmentUid, locationUid: input.locationUid || requester.locationUid, assetUid: input.assetUid, impact: input.impact, workBlocked: input.workBlocked, workaroundAvailable: input.workaroundAvailable, createdAt: now, updatedAt: now, resolvedAt: "", version: 1 };
      await client.addRow(tableNames.tickets, ticketCells(ticket), session);
      await client.addRow(tableNames.events, [randomUUID(), input.operationUid, ticketUid, requester.employeeUid, "TicketCreated", "", "", ticket.status, now], session);
      return ticket;
    });
  }

  async updateTicket(ticketUid: string, input: TicketUpdateInput, actor: Employee) {
    if (!canManageTickets(actor)) throw new AuthorizationError();
    return this.withSession(async (client, session) => {
      const rows = await client.listTableRows(tableNames.tickets, session);
      const row = rows.find((candidate) => ticketFrom(candidate)?.ticketUid === ticketUid);
      const current = row && ticketFrom(row);
      if (!row || !current) throw new NotFoundError();
      if (current.version !== input.expectedVersion) throw new ConflictError();
      const changed: Array<["status" | "priority" | "category" | "assigneeUid", string]> = [];
      if (input.status !== undefined && input.status !== current.status) changed.push(["status", input.status]);
      if (input.priority !== undefined && input.priority !== current.priority) changed.push(["priority", input.priority]);
      if (input.category !== undefined && input.category !== current.category) changed.push(["category", input.category]);
      if (input.assigneeUid !== undefined && input.assigneeUid !== current.assigneeUid) changed.push(["assigneeUid", input.assigneeUid]);
      const now = new Date().toISOString();
      const updated = { ...current, ...Object.fromEntries(changed), status: input.status ?? current.status, priority: input.priority ?? current.priority, updatedAt: now, resolvedAt: input.status === "RESOLVED" ? now : current.resolvedAt, version: current.version + 1 };
      if (input.status === "RESOLVED" || input.status === "CLOSED") await this.markLegacyIntakeCompleted(client, session, current.ticketNumber, actor.displayName, now);
      await client.replaceRow(tableNames.tickets, row.index, ticketCells(updated), session);
      for (const [field, newValue] of changed) await client.addRow(tableNames.events, [randomUUID(), input.operationUid, ticketUid, actor.employeeUid, `${String(field)}Changed`, field, String(current[field]), String(newValue), now], session);
      return updated;
    });
  }

  private async markLegacyIntakeCompleted(client: GraphExcelClient, session: string, ticketNumber: string, staffName: string, completedAt: string) {
    if (process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
      await markGoogleSheetTicketCompleted(ticketNumber, staffName, completedAt);
      return;
    }
    const rows = await client.listTableRows(legacyIntakeTable(), session);
    const row = rows.find((candidate) => text(candidate.values[0]?.[legacyColumns.ticketNumber]) === text(ticketNumber));
    if (!row) throw new WorkbookUnavailableError(`The source intake row for ticket ${ticketNumber} could not be found; the ticket was not marked complete.`);
    const values = [...(row.values[0] ?? [])];
    values[legacyColumns.solved] = "Yes";
    values[legacyColumns.completedAt] = completedAt;
    values[legacyColumns.staff] = staffName;
    await client.replaceRow(legacyIntakeTable(), row.index, values, session);
  }

  async addMessage(ticketUid: string, input: MessageCreateInput, actor: Employee) {
    return this.withSession(async (client, session) => {
      const ticket = (await client.listTableRows(tableNames.tickets, session)).map(ticketFrom).find((item) => item?.ticketUid === ticketUid);
      if (!ticket) throw new NotFoundError();
      if (!canCreateMessage(actor, ticket, input.type)) throw new AuthorizationError();
      const existing = (await client.listTableRows(tableNames.messages, session)).map(messageFrom).filter((item): item is TicketMessage => Boolean(item));
      const replay = existing.find((message) => message.operationUid === input.operationUid);
      if (replay) return replay;
      const message: TicketMessage = { messageUid: randomUUID(), operationUid: input.operationUid, ticketUid, authorUid: actor.employeeUid, authorName: actor.displayName, type: input.type, body: input.body, createdAt: new Date().toISOString() };
      await client.addRow(tableNames.messages, [message.messageUid, message.operationUid, message.ticketUid, message.authorUid, message.authorName, message.type, message.body, message.createdAt], session);
      await client.addRow(tableNames.events, [randomUUID(), input.operationUid, ticketUid, actor.employeeUid, `${input.type}Added`, "", "", message.messageUid, message.createdAt], session);
      return message;
    });
  }

  async addAttachment(record: AttachmentRecord, actor: Employee) { await this.withSession(async (client, session) => client.addRow(tableNames.attachments, [record.attachmentUid, record.operationUid, record.ticketUid, record.filename, record.storageReference, record.mimeType, record.size, actor.employeeUid, record.uploadedAt], session)); }
  async listEvents(ticketUid: string) { return this.withSession(async (client, session) => (await client.listTableRows(tableNames.events, session)).map(eventFrom).filter((item): item is TicketEvent => item !== null && item.ticketUid === ticketUid)); }

  async healthCheck(): Promise<HealthCheck> {
    const started = Date.now();
    try {
      return await this.withSession(async (client, session) => {
        const names = (await client.listTables(session)).map((table) => table.name);
        const missingTables = requiredTables.filter((name) => !names.includes(name));
        return { status: missingTables.length ? "degraded" : "healthy", backend: "graph", workbookReadable: true, workbookWritable: missingTables.length === 0, schemaVersion: null, missingTables, problems: missingTables.map((name) => `Missing table: ${name}`), checkedAt: new Date().toISOString(), latencyMs: Date.now() - started };
      });
    } catch (error) {
      return { status: process.env.EXCEL_WORKBOOK_ITEM_ID ? "degraded" : "unconfigured", backend: "graph", workbookReadable: false, workbookWritable: false, schemaVersion: null, missingTables: [...requiredTables], problems: [error instanceof Error ? error.message : "Workbook check failed."], checkedAt: new Date().toISOString(), latencyMs: Date.now() - started };
    }
  }
}
