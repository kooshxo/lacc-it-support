export const roles = ["EMPLOYEE", "IT_AGENT", "ADMIN"] as const;
export type Role = (typeof roles)[number];

export const ticketStatuses = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_ON_USER",
  "WAITING_ON_VENDOR",
  "RESOLVED",
  "CLOSED",
] as const;
export type TicketStatus = (typeof ticketStatuses)[number];

export const priorities = ["P1", "P2", "P3", "P4"] as const;
export type Priority = (typeof priorities)[number];

export const messageTypes = ["EMPLOYEE_REPLY", "PUBLIC_REPLY", "INTERNAL_NOTE"] as const;
export type MessageType = (typeof messageTypes)[number];

export interface Employee {
  employeeUid: string;
  email: string;
  displayName: string;
  departmentUid: string;
  locationUid: string;
  role: Role;
  active: boolean;
}

export interface Ticket {
  ticketUid: string;
  ticketNumber: string;
  operationUid: string;
  requesterUid: string;
  requesterEmail: string;
  requesterName: string;
  subject: string;
  description: string;
  category: string;
  priority: Priority;
  status: TicketStatus;
  assigneeUid: string;
  departmentUid: string;
  locationUid: string;
  assetUid: string;
  impact: "ONE" | "SEVERAL" | "MANY";
  workBlocked: boolean;
  workaroundAvailable: boolean;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string;
  version: number;
  /** Source-of-truth fields; historical staff is not an active assignment. */
  historicalStaff?: string;
  resolutionNotes?: string;
  sourceSolvedValue?: string;
  sourceSolvedDate?: string;
  completionTimestamp?: string;
}

export interface TicketMessage {
  messageUid: string;
  operationUid: string;
  ticketUid: string;
  authorUid: string;
  authorName: string;
  type: MessageType;
  body: string;
  createdAt: string;
}

export interface TicketEvent {
  eventUid: string;
  operationUid: string;
  ticketUid: string;
  actorUid: string;
  eventType: string;
  field: string;
  oldValue: string;
  newValue: string;
  createdAt: string;
}

export interface AttachmentRecord {
  attachmentUid: string;
  operationUid: string;
  ticketUid: string;
  filename: string;
  storageReference: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface TicketDetail { ticket: Ticket; messages: TicketMessage[]; events: TicketEvent[]; attachments: AttachmentRecord[] }

export interface HealthCheck {
  status: "healthy" | "degraded" | "unconfigured";
  backend: "graph" | "fixture" | "google";
  workbookReadable: boolean;
  workbookWritable: boolean;
  schemaVersion: string | null;
  missingTables: string[];
  problems: string[];
  checkedAt: string;
  latencyMs: number;
}
