"use client";
import { useActionState, useMemo } from "react";
import { Send } from "lucide-react";
import { addMessageAction, type ActionState } from "@/app/(portal)/actions";
import type { Role } from "@/lib/domain/models";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";

export function MessageForm({ ticketUid, ticketNumber, role }: { ticketUid: string; ticketNumber: string; role: Role }) {
  const action = addMessageAction.bind(null, ticketUid, ticketNumber);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const operationUid = useMemo(() => crypto.randomUUID(), []);
  const employee = role === "EMPLOYEE";
  return <form action={formAction} className="grid gap-3 rounded-xl border bg-card p-4"><input type="hidden" name="operationUid" value={operationUid}/>{employee?<input type="hidden" name="type" value="EMPLOYEE_REPLY"/>:<div className="grid gap-2"><Label htmlFor="message-type">Message type</Label><Select name="type" defaultValue="PUBLIC_REPLY"><SelectTrigger id="message-type"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="PUBLIC_REPLY">Reply to employee</SelectItem><SelectItem value="INTERNAL_NOTE">Internal note — IT only</SelectItem></SelectContent></Select></div>}<Label htmlFor="message">{employee?"Add a reply":"Write a message"}</Label><Textarea id="message" name="body" rows={4} required placeholder={employee?"Share an update or answer IT’s question":"Write a clear update"}/>{state.error&&<Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>}<div className="flex justify-end"><Button type="submit" disabled={pending}>{pending?"Sending…":"Send"}<Send/></Button></div></form>;
}
