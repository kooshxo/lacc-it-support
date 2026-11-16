"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAgent, requireEmployee } from "@/lib/authz";
import { ticketCreateSchema, ticketUpdateSchema } from "@/lib/domain/schemas";
import type { Ticket } from "@/lib/domain/models";
import { getRepository } from "@/lib/excel";
import { AuthorizationError, ConflictError, NotFoundError, WorkbookUnavailableError } from "@/lib/excel/repository";
import { normalizeCompletedBy } from "@/lib/domain/staff-options";
import { readGoogleSheetStaffOptions } from "@/lib/google-sheets/staff-options";

export type ActionState = { error?: string; fields?: Record<string, string>; savedVersion?: number; savedTicket?: Pick<Ticket, "status" | "priority" | "completedBy" | "resolutionNotes"> };

export async function createTicketAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const employee = await requireEmployee();
  const raw = Object.fromEntries(formData.entries());
  const parsed = ticketCreateSchema.safeParse({ operationUid: raw.operationUid, subject: raw.subject, description: raw.description, category: raw.category, impact: raw.impact, workBlocked: raw.workBlocked === "on", workaroundAvailable: raw.workaroundAvailable === "on", locationUid: raw.locationUid ?? "", assetUid: raw.assetUid ?? "" });
  if (!parsed.success) return { error: "Please review the highlighted information and try again.", fields: Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])) };
  try { const ticket = await getRepository().createTicket(parsed.data, employee); redirect(`/requests/${ticket.ticketNumber}?created=1`); }
  catch (error) { if (error instanceof WorkbookUnavailableError) return { error: error.message }; throw error; }
}

export async function updateTicketAction(ticketUid: string, ticketNumber: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireAgent();
  const completedBy = formData.get("completedBy");
  const resolved = formData.get("resolved") === "on";
  const currentStatus = String(formData.get("currentStatus") || "NEW");
  const status = resolved ? "RESOLVED" : currentStatus === "RESOLVED" ? "IN_PROGRESS" : currentStatus;
  const allowedStaff = process.env.TICKET_BACKEND === "google" ? await readGoogleSheetStaffOptions() : undefined;
  const normalizedCompletedBy = normalizeCompletedBy(typeof completedBy === "string" ? completedBy : undefined, allowedStaff);
  const parsed = ticketUpdateSchema.safeParse({ expectedVersion: Number(formData.get("expectedVersion")), operationUid: String(formData.get("operationUid") || randomUUID()), status, priority: formData.get("priority") || undefined, completedBy: normalizedCompletedBy || undefined, internalNote: formData.get("internalNote") });
  if (!parsed.success) return { error: "The update contains an invalid value. Review the fields and try again." };
  if (resolved && !normalizedCompletedBy) return { error: "Select who completed the ticket before marking it resolved." };
  try {
    const ticket = await getRepository().updateTicket(ticketUid, parsed.data, actor);
    revalidatePath(`/requests/${ticketNumber}`);
    revalidatePath("/it");
    return { savedVersion: ticket.version, savedTicket: { status: ticket.status, priority: ticket.priority, completedBy: ticket.completedBy ?? "", resolutionNotes: ticket.resolutionNotes ?? "" } };
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof ConflictError || error instanceof NotFoundError || error instanceof WorkbookUnavailableError) return { error: error.message };
    throw error;
  }
}
