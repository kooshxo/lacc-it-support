"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { updateTicketAction, type ActionState } from "@/app/(portal)/actions";
import type { Ticket } from "@/lib/domain/models";
import type { PendingTicketWrite } from "@/lib/domain/schemas";
import { getPendingTicketWrite, listPendingTicketWrites, notifyOutboxChanged, outboxChangedEvent, queuePendingTicketWrites, removePendingTicketWrites } from "@/lib/offline/ticket-write-outbox";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type Props = { ticket: Ticket; actorName: string };

function displayStatus(ticket: Ticket): string {
  return ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? "RESOLVED" : ticket.status === "IN_PROGRESS" ? "IN_PROGRESS" : "NEW";
}

export function TicketManageForm({ ticket, actorName }: Props) {
  const router = useRouter();
  const [pendingWrite, setPendingWrite] = useState<PendingTicketWrite | null>(null);
  const [outboxLoaded, setOutboxLoaded] = useState(false);
  const [status, setStatus] = useState(displayStatus(ticket));
  const [completedBy, setCompletedBy] = useState(actorName);
  const [resolutionNotes, setResolutionNotes] = useState(ticket.resolutionNotes ?? "");
  const operationUid = useMemo(() => crypto.randomUUID(), []);

  const refreshPendingWrite = useCallback(() => {
    void getPendingTicketWrite(ticket.ticketUid).then((write) => {
      setPendingWrite(write);
      if (write) {
        setStatus(write.status);
        setCompletedBy(write.completedBy);
        setResolutionNotes(write.resolutionNotes ?? "");
      }
      setOutboxLoaded(true);
    });
  }, [ticket.ticketUid]);

  useEffect(() => {
    refreshPendingWrite();
    window.addEventListener(outboxChangedEvent, refreshPendingWrite);
    return () => window.removeEventListener(outboxChangedEvent, refreshPendingWrite);
  }, [refreshPendingWrite]);

  const action = useCallback(async (previousState: ActionState, formData: FormData): Promise<ActionState> => {
    const supportedStatus = ["NEW", "RESOLVED", "CLOSED"].includes(String(formData.get("status") ?? ""));
    const previousWrites = await listPendingTicketWrites();
    const writesToReplay = supportedStatus
      ? previousWrites.filter((write) => write.ticketUid !== ticket.ticketUid)
      : previousWrites;
    const payloadWrites = writesToReplay.map((write) => {
      const { lastError, ...payload } = write;
      void lastError;
      return payload;
    });
    formData.set("pendingWrites", JSON.stringify(payloadWrites));

    const currentWrite = supportedStatus ? {
      operationUid: String(formData.get("operationUid") || operationUid),
      ticketUid: ticket.ticketUid,
      ticketNumber: ticket.ticketNumber,
      expectedVersion: ticket.version,
      status: String(formData.get("status")) as "NEW" | "RESOLVED" | "CLOSED",
      completedBy: String(formData.get("completedBy") || actorName).trim() || actorName,
      resolutionNotes: String(formData.get("resolutionNotes") ?? "").trim(),
      completedAt: new Date().toISOString(),
    } satisfies PendingTicketWrite : null;

    try {
      const result = await updateTicketAction(ticket.ticketUid, ticket.ticketNumber, ticket.version, previousState, formData);
      if (result.success) {
        await removePendingTicketWrites(previousWrites);
        notifyOutboxChanged();
        if (result.error) return { error: result.error };
        router.push("/it");
        return { success: true };
      }
      if (result.pendingWrites?.length) {
        await queuePendingTicketWrites(result.pendingWrites, result.error ?? "Google Sheets rejected the ticket update.");
      }
      return result;
    } catch (error) {
      if (currentWrite && /^google-row-\d+$/.test(currentWrite.ticketUid) && /^GS-\d+$/.test(currentWrite.ticketNumber)) {
        const message = error instanceof Error ? error.message : "The ticket system could not reach Google Sheets.";
        await queuePendingTicketWrites([...writesToReplay, currentWrite], message);
        return { error: `${message} The update is saved in this browser and will be retried with the next ticket save.` };
      }
      return { error: error instanceof Error ? error.message : "The ticket update could not be saved." };
    }
  }, [actorName, operationUid, router, ticket]);

  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  return <form action={formAction} className="grid gap-4">
    <input type="hidden" name="operationUid" value={operationUid}/>
    {pendingWrite && <Alert className="border-amber-300 bg-amber-50 text-amber-950" role="status">
      <AlertTitle className="flex items-center justify-between gap-2">This change is pending in this browser <Badge variant="secondary">Sheets sync pending</Badge></AlertTitle>
      <AlertDescription>The last Google Sheets write failed. Saving another ticket will retry this update in the same batch.</AlertDescription>
    </Alert>}
    <div className="grid gap-2"><Label>Status</Label><Select name="status" value={status} onValueChange={setStatus}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="NEW">Received</SelectItem><SelectItem value="IN_PROGRESS">In progress</SelectItem><SelectItem value="RESOLVED">Resolved</SelectItem></SelectContent></Select></div>
    <div className="grid gap-2"><Label>Completed by</Label><Input name="completedBy" maxLength={100} value={completedBy} onChange={(event) => setCompletedBy(event.target.value)} placeholder="Your name (for completion records)"/></div>
    <div className="grid gap-2"><Label>Priority</Label><Select name="priority" defaultValue={ticket.priority}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="P1">P1 Critical</SelectItem><SelectItem value="P2">P2 High</SelectItem><SelectItem value="P3">P3 Normal</SelectItem><SelectItem value="P4">P4 Low</SelectItem></SelectContent></Select></div>
    <div className="grid gap-2"><Label>How was it solved?</Label><Textarea name="resolutionNotes" maxLength={8000} value={resolutionNotes} onChange={(event) => setResolutionNotes(event.target.value)} placeholder="Record the fix in the master sheet" rows={4}/></div>
    {state.error && <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>}
    <Button type="submit" disabled={pending || !outboxLoaded}>{pending ? "Saving…" : !outboxLoaded ? "Loading saved changes…" : "Save changes"}</Button>
  </form>;
}
