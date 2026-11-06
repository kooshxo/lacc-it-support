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

export function TicketManageForm({ticket,staffOptions}:{ticket:Ticket;staffOptions:string[]}){const action=updateTicketAction.bind(null,ticket.ticketUid,ticket.ticketNumber,ticket.version);const [state,formAction,pending]=useActionState<ActionState,FormData>(action,{});const operationUid=useMemo(()=>crypto.randomUUID(),[]);const staff=[...new Set([...staffOptions,ticket.assigneeUid].filter(Boolean))];return <form action={formAction} className="grid gap-4"><input type="hidden" name="operationUid" value={operationUid}/><div className="grid gap-2"><Label>Status</Label><Select name="status" defaultValue={ticket.status}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="NEW">Received</SelectItem><SelectItem value="ASSIGNED">Assigned</SelectItem><SelectItem value="IN_PROGRESS">In progress</SelectItem><SelectItem value="WAITING_ON_USER">Waiting on user</SelectItem><SelectItem value="WAITING_ON_VENDOR">Waiting on vendor</SelectItem><SelectItem value="RESOLVED">Resolved</SelectItem><SelectItem value="CLOSED">Closed</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Assigned staff member</Label><Select name="assigneeUid" defaultValue={ticket.assigneeUid||"__unassigned__"}><SelectTrigger><SelectValue placeholder="Unassigned"/></SelectTrigger><SelectContent><SelectItem value="__unassigned__">Unassigned</SelectItem>{staff.map(email=><SelectItem key={email} value={email}>{email}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Completed by</Label><Input name="completedBy" placeholder="Your name (for completion records)"/></div><div className="grid gap-2"><Label>Priority</Label><Select name="priority" defaultValue={ticket.priority}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="P1">P1 Critical</SelectItem><SelectItem value="P2">P2 High</SelectItem><SelectItem value="P3">P3 Normal</SelectItem><SelectItem value="P4">P4 Low</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Resolution details</Label><Textarea name="resolutionNotes" defaultValue={ticket.resolutionNotes} placeholder="Record the fix" rows={4}/></div>{state.error&&<Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>}<Button type="submit" disabled={pending}>{pending?"Saving…":"Save changes"}</Button></form>}



