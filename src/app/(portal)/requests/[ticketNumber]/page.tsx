import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, MapPin, UserRound } from "lucide-react";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { TicketManageForm } from "@/components/ticket-manage-form";
import { MessageForm } from "@/components/message-form";
import { TicketAttachments } from "@/components/ticket-attachments";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireEmployee } from "@/lib/authz";
import { getRepository } from "@/lib/excel";
import { AuthorizationError } from "@/lib/excel/repository";
import { redirect } from "next/navigation";

export default async function TicketPage({ params, searchParams }: { params: Promise<{ ticketNumber: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ ticketNumber }, { created }, employee] = await Promise.all([params, searchParams, requireEmployee()]);
  let detail;
  try { detail = await getRepository().getTicketByNumber(ticketNumber, employee); } catch (error) { if (error instanceof AuthorizationError) redirect("/access-denied"); throw error; }
  if (!detail) notFound();
  const { ticket } = detail;
  const agent = employee.role !== "EMPLOYEE";
  const staffOptions = [...new Set([process.env.IT_STAFF_EMAILS, process.env.IT_ADMIN_EMAILS].flatMap((list) => (list ?? "").split(",")).map((value) => value.trim().toLowerCase()).filter(Boolean))];
  return <div className="space-y-6">
    <Link href={agent ? "/it" : "/requests"} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to {agent ? "support inbox" : "my requests"}</Link>
    {created && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950"><CheckCircle2/><AlertTitle>Request received</AlertTitle><AlertDescription>Your request was saved securely as {ticket.ticketNumber}.</AlertDescription></Alert>}
    <div><p className="text-sm font-medium text-primary">{ticket.ticketNumber}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{ticket.subject}</h1><div className="mt-3 flex flex-wrap gap-2"><StatusBadge status={ticket.status}/>{agent && <PriorityBadge priority={ticket.priority}/>}</div></div>
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        <Card><CardHeader><CardTitle>What happened</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap leading-7">{ticket.description}</p><div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground"><span className="flex items-center gap-2"><UserRound className="size-4"/>{ticket.requesterName} <Link className="underline-offset-2 hover:underline" href={`/it?state=ALL&requester=${encodeURIComponent(ticket.requesterEmail)}`}>({ticket.requesterEmail || "profile"})</Link></span><span className="flex items-center gap-2"><MapPin className="size-4"/>{ticket.locationUid || "Location not listed"}</span><span className="flex items-center gap-2"><Clock3 className="size-4"/>{new Date(ticket.createdAt).toLocaleString()}</span></div></CardContent></Card>
        {agent&&ticket.sourceTicketNumber&&<p className="text-sm text-muted-foreground">Original spreadsheet ticket number: {ticket.sourceTicketNumber}{ticket.sourceSpreadsheetRow?` · source row ${ticket.sourceSpreadsheetRow}`:""}</p>}
        {ticket.resolutionNotes&&<Card><CardHeader><CardTitle>Resolution notes</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap leading-7">{ticket.resolutionNotes}</p></CardContent></Card>}
        <Card><CardContent className="pt-6"><TicketAttachments ticketNumber={ticket.ticketNumber} attachments={detail.attachments} enabled={process.env.DATA_BACKEND === "sql"}/></CardContent></Card>
        <Card><CardHeader><CardTitle>Conversation</CardTitle></CardHeader><CardContent className="space-y-4">{detail.messages.length?detail.messages.map(message=><article key={message.messageUid} className="rounded-lg border p-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-medium">{message.authorName}{message.type==="INTERNAL_NOTE"&&<span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">IT only</span>}</p><time className="text-xs text-muted-foreground">{new Date(message.createdAt).toLocaleString()}</time></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{message.body}</p></article>):<p className="text-sm text-muted-foreground">No replies yet.</p>}{process.env.DATA_BACKEND==="sql"?<MessageForm ticketUid={ticket.ticketUid} ticketNumber={ticket.ticketNumber} role={employee.role}/>:<p className="text-sm text-muted-foreground">Replies will be enabled when ticket storage is migrated.</p>}</CardContent></Card>
        {agent&&detail.events.length>0&&<Card><CardHeader><CardTitle>Change history</CardTitle></CardHeader><CardContent className="space-y-3">{detail.events.map(event=><div key={event.eventUid} className="border-l-2 pl-4"><p className="text-sm font-medium">{event.eventType} · {event.field||"ticket"}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</p><p className="mt-2 break-all text-xs text-muted-foreground">{event.newValue}</p></div>)}</CardContent></Card>}
      </div>
      <aside className="space-y-4">
        <Card><CardHeader><CardTitle>{agent ? "Manage request" : "Request details"}</CardTitle></CardHeader><CardContent>{agent ? <TicketManageForm ticket={ticket} staffOptions={staffOptions}/> : <dl className="grid gap-4 text-sm"><div><dt className="text-muted-foreground">Category</dt><dd className="mt-1 font-medium">{ticket.category}</dd></div><div><dt className="text-muted-foreground">Last updated</dt><dd className="mt-1 font-medium">{new Date(ticket.updatedAt).toLocaleString()}</dd></div><div><dt className="text-muted-foreground">Handled by</dt><dd className="mt-1 font-medium">{ticket.historicalStaff || "—"}</dd></div></dl>}</CardContent></Card>
      </aside>
    </div>
  </div>;
}



