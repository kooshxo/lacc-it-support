import type { AttachmentRecord, Employee, HealthCheck, Ticket, TicketDetail, TicketEvent, TicketMessage } from "@/lib/domain/models";
import type { MessageCreateInput, TicketCreateInput, TicketUpdateInput } from "@/lib/domain/schemas";

export interface TicketFilter {
  requesterUid?: string;
  status?: string;
  assigneeUid?: string;
  query?: string;
}

export interface TicketRepository {
  getEmployeeByEmail(email: string): Promise<Employee | null>;
  listTickets(filter?: TicketFilter): Promise<Ticket[]>;
  getTicketByNumber(ticketNumber: string, actor: Employee): Promise<TicketDetail | null>;
  createTicket(input: TicketCreateInput, requester: Employee): Promise<Ticket>;
  updateTicket(ticketUid: string, input: TicketUpdateInput, actor: Employee): Promise<Ticket>;
  addMessage(ticketUid: string, input: MessageCreateInput, actor: Employee): Promise<TicketMessage>;
  addAttachment(record: AttachmentRecord, actor: Employee): Promise<void>;
  listEvents(ticketUid: string): Promise<TicketEvent[]>;
  healthCheck(): Promise<HealthCheck>;
}

export class ConflictError extends Error { constructor(message = "This request changed since you opened it. Refresh and try again.") { super(message); this.name = "ConflictError"; } }
export class NotFoundError extends Error { constructor(message = "The requested record was not found.") { super(message); this.name = "NotFoundError"; } }
export class AuthorizationError extends Error { constructor(message = "You are not allowed to perform this action.") { super(message); this.name = "AuthorizationError"; } }
export class WorkbookUnavailableError extends Error { constructor(message = "The support request could not be safely saved to Excel. Please try again.") { super(message); this.name = "WorkbookUnavailableError"; } }
