"use client";
import { useActionState, useMemo } from "react";
import { updateTicketAction, type ActionState } from "@/app/(portal)/actions";
import type { Ticket } from "@/lib/domain/models";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export function TicketManageForm({ticket}:{ticket:Ticket}){const action=updateTicketAction.bind(null,ticket.ticketUid,ticket.ticketNumber,ticket.version);const [state,formAction,pending]=useActionState<ActionState,FormData>(action,{});const operationUid=useMemo(()=>crypto.randomUUID(),[]);const displayStatus=ticket.status==="RESOLVED"||ticket.status==="CLOSED"?"RESOLVED":ticket.status==="IN_PROGRESS"?"IN_PROGRESS":"NEW";return <form action={formAction} className="grid gap-4"><input type="hidden" name="operationUid" value={operationUid}/><div className="grid gap-2"><Label>Status</Label><Select name="status" defaultValue={displayStatus}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="NEW">Received</SelectItem><SelectItem value="IN_PROGRESS">In progress</SelectItem><SelectItem value="RESOLVED">Resolved</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Completed by</Label><Input name="completedBy" placeholder="Your name (for completion records)"/></div><div className="grid gap-2"><Label>Priority</Label><Select name="priority" defaultValue={ticket.priority}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="P1">P1 Critical</SelectItem><SelectItem value="P2">P2 High</SelectItem><SelectItem value="P3">P3 Normal</SelectItem><SelectItem value="P4">P4 Low</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>How was it solved?</Label><Textarea name="resolutionNotes" defaultValue={ticket.resolutionNotes} placeholder="Record the fix in the master sheet" rows={4}/></div>{state.error&&<Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>}<Button type="submit" disabled={pending}>{pending?"Saving…":"Save changes"}</Button></form>}



