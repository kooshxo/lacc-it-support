"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAgent, requireEmployee } from "@/lib/authz";
import { messageCreateSchema, pendingTicketWritesSchema, ticketCreateSchema, ticketUpdateSchema, type PendingTicketWrite } from "@/lib/domain/schemas";
import { getRepository } from "@/lib/excel";
import { AuthorizationError, ConflictError, WorkbookUnavailableError } from "@/lib/excel/repository";

export type ActionState = { error?: string; fields?: Record<string, string>; success?: boolean; pendingWrites?: PendingTicketWrite[] };

export async function createTicketAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const employee = await requireEmployee();
  const raw = Object.fromEntries(formData.entries());
  const parsed = ticketCreateSchema.safeParse({ operationUid: raw.operationUid, subject: raw.subject, description: raw.description, category: raw.category, impact: raw.impact, workBlocked: raw.workBlocked === "on", workaroundAvailable: raw.workaroundAvailable === "on", locationUid: raw.locationUid ?? "", assetUid: raw.assetUid ?? "" });
  if (!parsed.success) return { error: "Please review the highlighted information and try again.", fields: Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])) };
  try { const ticket = await getRepository().createTicket(parsed.data, employee); redirect(`/requests/${ticket.ticketNumber}?created=1`); }
  catch (error) { if (error instanceof WorkbookUnavailableError) return { error: error.message }; throw error; }
}

export async function addMessageAction(ticketUid: string, ticketNumber: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  const employee = await requireEmployee();
  const parsed = messageCreateSchema.safeParse({ operationUid: formData.get("operationUid"), type: formData.get("type"), body: formData.get("body") });
  if (!parsed.success) return { error: "Write a message before sending." };
  try { await getRepository().addMessage(ticketUid, parsed.data, employee); revalidatePath(`/requests/${ticketNumber}`); return {}; }
  catch (error) { if (error instanceof AuthorizationError || error instanceof WorkbookUnavailableError) return { error: error.message }; throw error; }
}

export async function updateTicketAction(ticketUid: string, ticketNumber: string, expectedVersion: number, _state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireAgent();
  const parsed = ticketUpdateSchema.safeParse({ expectedVersion, operationUid: String(formData.get("operationUid") || randomUUID()), status: formData.get("status") || undefined, priority: formData.get("priority") || undefined, category: formData.get("category") || undefined, assigneeUid: formData.get("assigneeUid") ?? undefined, completedBy: formData.get("completedBy") || undefined, resolutionNotes: formData.get("resolutionNotes") !== null ? formData.get("resolutionNotes") : undefined });
  if (!parsed.success) return { error: "The update contains an invalid value." };
  const rawPendingWrites = String(formData.get("pendingWrites") || "[]");
  let parsedPendingWrites;
  try { parsedPendingWrites = pendingTicketWritesSchema.safeParse(JSON.parse(rawPendingWrites)); }
  catch { return { error: "The saved Sheets retry queue could not be read. Your local copy has been kept." }; }
  if (!parsedPendingWrites.success) return { error: "The saved Sheets retry queue is too large or contains invalid data. Your local copy has been kept." };

  const repository = getRepository();
  if (repository.updateTickets) {
    const isSheetStatus = parsed.data.status === "NEW" || parsed.data.status === "RESOLVED" || parsed.data.status === "CLOSED";
    const currentWrite: PendingTicketWrite | null = isSheetStatus ? {
      operationUid: parsed.data.operationUid,
      ticketUid,
      ticketNumber,
      expectedVersion,
      status: parsed.data.status as "NEW" | "RESOLVED" | "CLOSED",
      completedBy: parsed.data.completedBy || actor.displayName,
      ...(parsed.data.resolutionNotes !== undefined ? { resolutionNotes: parsed.data.resolutionNotes } : {}),
      completedAt: new Date().toISOString(),
    } : null;
    const writes = [...parsedPendingWrites.data, ...(currentWrite ? [currentWrite] : [])];
    if (!writes.length) return { error: "The Google Sheet can store Received or Resolved. This status change was not saved." };
    try {
      await repository.updateTickets(writes, actor);
      revalidatePath(`/requests/${ticketNumber}`);
      revalidatePath("/it");
      return currentWrite ? { success: true } : { success: true, error: "The queued Sheets updates were saved. The selected status is not supported by the source Google Sheet." };
    } catch (error) {
      if (error instanceof AuthorizationError) return { error: error.message };
      return { error: error instanceof Error ? error.message : "Google Sheets could not save the ticket updates.", pendingWrites: writes };
    }
  }

  if (parsedPendingWrites.data.length) return { error: "The saved Sheets updates cannot be replayed by the currently configured ticket backend. They remain stored in this browser." };
  try {
    await repository.updateTicket(ticketUid, parsed.data, actor);
    revalidatePath(`/requests/${ticketNumber}`);
    revalidatePath("/it");
    return { success: true };
  } catch (error) {
    if (error instanceof ConflictError || error instanceof WorkbookUnavailableError) return { error: error.message };
    throw error;
  }
}
