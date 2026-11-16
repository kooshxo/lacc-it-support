"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateTicketAction, type ActionState } from "@/app/(portal)/actions";
import type { Ticket, TicketMessage } from "@/lib/domain/models";
import { effectiveCompletedBy } from "@/lib/domain/resolution";
import { canonicalTicketStatus } from "@/lib/domain/ticket-status";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { completedByOptions } from "@/lib/domain/staff-options";

type TicketFormAction = (formData: FormData) => void;

export function TicketManageForm({ ticket, internalNotes }: { ticket: Ticket; internalNotes: TicketMessage[] }) {
  const router = useRouter();
  const [editingFromVersion, setEditingFromVersion] = useState<number | null>(null);
  const action = useMemo(() => updateTicketAction.bind(null, ticket.ticketUid, ticket.ticketNumber), [ticket.ticketUid, ticket.ticketNumber]);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const editing = state.savedVersion === undefined || editingFromVersion === state.savedVersion;

  useEffect(() => {
    if (state.savedVersion !== undefined && state.savedVersion > ticket.version) router.refresh();
  }, [state.savedVersion, ticket.version, router]);

  const persisted = state.savedTicket && state.savedVersion !== undefined && state.savedVersion >= ticket.version
    ? { ...ticket, ...state.savedTicket, version: state.savedVersion }
    : ticket;
  const version = Math.max(ticket.version, state.savedVersion ?? ticket.version);
  const hydratedTicket = { ...persisted, version };

  if (!editing) {
    const status = canonicalTicketStatus(hydratedTicket.status);
    const statusLabel = status === "NEW" ? "Received" : status === "IN_PROGRESS" ? "In Progress" : "Solved";
    const priorityLabel = ({ P1: "P1 Critical", P2: "P2 High", P3: "P3 Normal", P4: "P4 Low" } as const)[hydratedTicket.priority];
    return <div className="space-y-4">
      <p className="text-sm text-emerald-800" role="status">Changes saved.</p>
      <dl className="grid gap-3 text-sm">
        <div><dt className="text-muted-foreground">Status</dt><dd className="font-medium">{statusLabel}</dd></div>
        <div><dt className="text-muted-foreground">Priority</dt><dd className="font-medium">{priorityLabel}</dd></div>
        <div><dt className="text-muted-foreground">Completed By</dt><dd className="font-medium">{effectiveCompletedBy(hydratedTicket) || "—"}</dd></div>
        <div><dt className="text-muted-foreground">Resolution Details</dt><dd className="whitespace-pre-wrap font-medium">{hydratedTicket.resolutionNotes || "—"}</dd></div>
      </dl>
      {internalNotes.length > 0 && <div className="grid gap-2"><h3 className="text-sm font-medium">Internal IT Notes</h3><ul className="grid gap-2 rounded-md border bg-muted/20 p-3" aria-label="Internal IT note history">{internalNotes.map((note) => <li key={note.messageUid} className="border-b pb-2 last:border-b-0 last:pb-0"><div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{note.authorName === "IT Staff" ? "IT staff (shared account)" : note.authorName}</span><time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString()}</time></div><p className="mt-1 whitespace-pre-wrap text-sm">{note.body}</p></li>)}</ul></div>}
      <Button type="button" variant="outline" className="w-full" onClick={() => setEditingFromVersion(state.savedVersion ?? null)}>Edit Ticket</Button>
    </div>;
  }

  return <TicketManageFields
    key={`${ticket.ticketUid}:${version}`}
    action={formAction}
    ticket={hydratedTicket}
    state={state}
    pending={pending}
  />;
}

function TicketManageFields({ action, ticket, state, pending }: {
  action: TicketFormAction;
  ticket: Ticket;
  state: ActionState;
  pending: boolean;
}) {
  const submissionInFlight = useRef(false);
  useEffect(() => {
    if (!pending) submissionInFlight.current = false;
  }, [pending]);

  return <form action={action} onSubmit={(event)=>{
    if (submissionInFlight.current) {
      event.preventDefault();
      return;
    }
    submissionInFlight.current = true;
    const operationUid = event.currentTarget.elements.namedItem("operationUid");
    if (operationUid instanceof HTMLInputElement && !operationUid.value) operationUid.value = crypto.randomUUID();
  }} className="grid min-w-0 gap-5">
    <input type="hidden" name="operationUid" value=""/>
    <input type="hidden" name="expectedVersion" value={ticket.version}/>
    <input type="hidden" name="currentStatus" value={canonicalTicketStatus(ticket.status)} />
    <label className="flex items-center gap-3 rounded-lg border border-input bg-background p-4 text-base font-semibold"><input type="checkbox" name="resolved" defaultChecked={canonicalTicketStatus(ticket.status) === "RESOLVED"} className="size-5 accent-primary" />Resolved</label>
    <div className="grid gap-2"><Label htmlFor="ticket-priority">Priority</Label><select id="ticket-priority" name="priority" defaultValue={ticket.priority} className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"><option value="P1">P1 Critical</option><option value="P2">P2 High</option><option value="P3">P3 Normal</option><option value="P4">P4 Low</option></select></div>
    <div className="grid gap-2"><Label htmlFor="completed-by">Completed By</Label><select id="completed-by" name="completedBy" defaultValue={effectiveCompletedBy(ticket)} className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm"><option value="">Select technician</option>{completedByOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
    {state.error && <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>}
    {state.savedVersion !== undefined && <p className="text-sm text-emerald-800" role="status">Changes saved.</p>}
    <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Save Changes"}</Button>
  </form>;
}
