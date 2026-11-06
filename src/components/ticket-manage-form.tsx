"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { updateTicketAction, type ActionState } from "@/app/(portal)/actions";
import type { Ticket, TicketMessage } from "@/lib/domain/models";
import { effectiveCompletedBy } from "@/lib/domain/resolution";
import { canonicalTicketStatus } from "@/lib/domain/ticket-status";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

type TicketFormAction = (formData: FormData) => void;

export function TicketManageForm({ ticket, internalNotes }: { ticket: Ticket; internalNotes: TicketMessage[] }) {
  const router = useRouter();
  const action = useMemo(() => updateTicketAction.bind(null, ticket.ticketUid, ticket.ticketNumber), [ticket.ticketUid, ticket.ticketNumber]);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  useEffect(() => {
    if (state.savedVersion !== undefined && state.savedVersion > ticket.version) router.refresh();
  }, [state.savedVersion, ticket.version, router]);

  const persisted = state.savedTicket && state.savedVersion !== undefined && state.savedVersion >= ticket.version
    ? { ...ticket, ...state.savedTicket, version: state.savedVersion }
    : ticket;
  const version = Math.max(ticket.version, state.savedVersion ?? ticket.version);
  const hydratedTicket = { ...persisted, version };

  return <TicketManageFields
    key={`${ticket.ticketUid}:${version}`}
    action={formAction}
    ticket={hydratedTicket}
    internalNotes={internalNotes}
    state={state}
    pending={pending}
  />;
}

function TicketManageFields({ action, ticket, internalNotes, state, pending }: {
  action: TicketFormAction;
  ticket: Ticket;
  internalNotes: TicketMessage[];
  state: ActionState;
  pending: boolean;
}) {
  return <form action={action} onSubmit={(event)=>{
    const operationUid = event.currentTarget.elements.namedItem("operationUid");
    if (operationUid instanceof HTMLInputElement) operationUid.value = crypto.randomUUID();
  }} className="grid min-w-0 gap-5">
    <input type="hidden" name="operationUid" value=""/>
    <input type="hidden" name="expectedVersion" value={ticket.version}/>
    <div className="grid gap-2"><Label htmlFor="ticket-status">Status</Label><select id="ticket-status" name="status" defaultValue={canonicalTicketStatus(ticket.status)} className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"><option value="NEW">Received</option><option value="IN_PROGRESS">In Progress</option><option value="RESOLVED">Solved</option></select></div>
    <div className="grid gap-2"><Label htmlFor="ticket-priority">Priority</Label><select id="ticket-priority" name="priority" defaultValue={ticket.priority} className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"><option value="P1">P1 Critical</option><option value="P2">P2 High</option><option value="P3">P3 Normal</option><option value="P4">P4 Low</option></select></div>
    <div className="grid gap-2"><Label htmlFor="completed-by">Completed By</Label><Input id="completed-by" name="completedBy" defaultValue={effectiveCompletedBy(ticket)} maxLength={100} placeholder="Enter the technician who completed the work" autoComplete="off"/></div>
    <div className="grid gap-2"><Label htmlFor="resolution-details">Resolution Details</Label><Textarea id="resolution-details" name="resolutionNotes" defaultValue={ticket.resolutionNotes ?? ""} maxLength={8000} placeholder="Record the work completed or the resolution" rows={4}/></div>
    <div className="grid gap-2"><Label htmlFor="internal-note">Internal IT Notes</Label>
      {internalNotes.length > 0 && <ul className="grid gap-2 rounded-md border bg-muted/20 p-3" aria-label="Internal IT note history">{internalNotes.map((note)=><li key={note.messageUid} className="border-b pb-2 last:border-b-0 last:pb-0"><div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{note.authorName === "IT Staff" ? "IT staff (shared account)" : note.authorName}</span><time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString()}</time></div><p className="mt-1 whitespace-pre-wrap text-sm">{note.body}</p></li>)}</ul>}
      <Textarea id="internal-note" name="internalNote" maxLength={8000} placeholder="Add an internal note for IT staff" rows={3}/>
    </div>
    {state.error && <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>}
    {state.savedVersion !== undefined && <p className="text-sm text-emerald-800" role="status">Changes saved.</p>}
    <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Save Changes"}</Button>
  </form>;
}
