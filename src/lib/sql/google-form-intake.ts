import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Employee, Ticket, TicketEvent } from "@/lib/domain/models";
import { suggestedPriority } from "@/lib/domain/policy";
import { database } from "./client";

export type GoogleFormTicketInput = {
  formId: string;
  responseId: string;
  submittedAt: string;
  requesterEmail: string;
  requesterName: string;
  department: string;
  location: string;
  phone: string;
  extension: string;
  requestType: "New badge" | "Replacement badge" | "Access or PIN only" | "Other";
  details: string;
  badgeNumber: string;
  badgeName: string;
};

function operationUid(formId: string, responseId: string) {
  const bytes = createHash("sha256").update(`${formId}\0${responseId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function createGoogleFormTicket(input: GoogleFormTicketInput) {
  const uid = randomUUID();
  const operation = operationUid(input.formId, input.responseId);
  const submitted = new Date(input.submittedAt);
  const createdAt = Number.isNaN(submitted.valueOf()) ? new Date().toISOString() : submitted.toISOString();
  const details = input.details.trim() || "No additional details were provided.";
  const description = [
    details,
    `Requester: ${input.requesterName}`,
    `Department: ${input.department || "—"}`,
    `Site: ${input.location || "—"}`,
    `Phone: ${input.phone || "—"}`,
    `Extension: ${input.extension || "—"}`,
    `Existing badge: ${input.badgeNumber || "—"}`,
    `Badge name: ${input.badgeName || "—"}`,
    "Requester identity was supplied in Google Forms and has not been verified.",
  ].join("\n");
  const requester: Employee = {
    employeeUid: `gform:${operation}`,
    email: input.requesterEmail.toLowerCase(),
    displayName: input.requesterName,
    departmentUid: input.department,
    locationUid: input.location,
    role: "EMPLOYEE",
    active: true,
  };
  const ticket: Ticket = {
    ticketUid: uid,
    ticketNumber: `LACC-${uid.toUpperCase()}`,
    operationUid: operation,
    requesterUid: requester.employeeUid,
    requesterEmail: requester.email,
    requesterName: requester.displayName,
    subject: input.requestType,
    description,
    category: input.requestType,
    priority: suggestedPriority({ impact: "ONE", workBlocked: false, workaroundAvailable: false }),
    status: "NEW",
    assigneeUid: "",
    departmentUid: input.department,
    locationUid: input.location,
    assetUid: "",
    impact: "ONE",
    workBlocked: false,
    workaroundAvailable: false,
    createdAt,
    updatedAt: createdAt,
    resolvedAt: "",
    version: 1,
    requesterIdentityVerified: false,
    sourceFormId: input.formId,
    sourceFormResponseId: input.responseId,
  };
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ data: Ticket }>(
      `INSERT INTO lacc_tickets(uid,number,operation_uid,requester_uid,version,data)
       VALUES($1,$2,$3,$4,1,$5)
       ON CONFLICT DO NOTHING RETURNING data`,
      [uid, ticket.ticketNumber, operation, requester.employeeUid, JSON.stringify(ticket)],
    );
    const existing = inserted.rows[0]?.data ?? (await client.query<{ data: Ticket }>(
      `SELECT data FROM lacc_tickets
       WHERE operation_uid=$1 OR (data->>'sourceFormId'=$2 AND data->>'sourceFormResponseId'=$3)
       FOR UPDATE`,
      [operation, input.formId, input.responseId],
    )).rows[0]?.data;
    if (!existing || existing.sourceFormId !== input.formId || existing.sourceFormResponseId !== input.responseId) {
      throw new Error("Google Form response identity conflict.");
    }
    if (inserted.rowCount) {
      const event: TicketEvent = {
        eventUid: randomUUID(), operationUid: operation, ticketUid: uid, actorUid: requester.employeeUid,
        eventType: "CREATED", field: "status", oldValue: "", newValue: "NEW", createdAt,
      };
      await client.query("INSERT INTO lacc_ticket_events(uid,ticket_uid,operation_uid,data) VALUES($1,$2,$3,$4)", [event.eventUid, uid, operation, JSON.stringify(event)]);
    }
    await client.query("COMMIT");
    return { ticket: existing, duplicate: !inserted.rowCount };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
