import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, MapPin, UserRound } from "lucide-react";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { TicketManageForm } from "@/components/ticket-manage-form";
import { TicketAttachments } from "@/components/ticket-attachments";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireEmployee } from "@/lib/authz";
import { getRepository } from "@/lib/excel";
import { AuthorizationError } from "@/lib/excel/repository";
import { redirect } from "next/navigation";
import { describeTicketEvent, ticketEventActor } from "@/lib/domain/ticket-activity";
import { effectiveCompletedBy } from "@/lib/domain/resolution";

export default async function TicketPage({ params, searchParams }: { params: Promise<{ ticketNumber: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ ticketNumber }, { created }, employee] = await Promise.all([params, searchParams, requireEmployee()]);
  let detail;
  try { detail = await getRepository().getTicketByNumber(ticketNumber, employee); } catch (error) { if (error instanceof AuthorizationError) redirect("/access-denied"); throw error; }
  if (!detail) notFound();
  const { ticket } = detail;
  const agent = employee.role !== "EMPLOYEE";
  const internalNotes = detail.messages.filter((message) => message.type === "INTERNAL_NOTE");
  const activity = [
    ...detail.events.flatMap((event) => describeTicketEvent(event).map((description, index) => ({ key: `${event.eventUid}-${index}`, at: event.createdAt, description, actor: ticketEventActor(event), note: "" }))),
    ...internalNotes.map((note) => ({ key: note.messageUid, at: note.createdAt, description: "Internal IT note added", actor: note.authorName === "IT Staff" ? "IT staff (shared account)" : note.authorName, note: note.body })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return <div className="space-y-6">
    <Link href={agent ? "/it" : "/requests"} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to {agent ? "support inbox" : "my requests"}</Link>
    {created && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950"><CheckCircle2/><AlertTitle>Request received</AlertTitle><AlertDescription>Your request was saved securely as {ticket.ticketNumber}.</AlertDescription></Alert>}
    <div><p className="text-sm font-medium text-primary">{ticket.ticketNumber}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{ticket.subject}</h1><div className="mt-3 flex flex-wrap gap-2"><StatusBadge status={ticket.status}/>{agent && <PriorityBadge priority={ticket.priority}/>}</div></div>
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        <Card><CardHeader><CardTitle>What happened</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap leading-7">{ticket.description}</p><div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground"><span className="flex items-center gap-2"><UserRound className="size-4"/>{ticket.requesterName} <Link className="underline-offset-2 hover:underline" href={`/it?state=ALL&requester=${encodeURIComponent(ticket.requesterEmail)}`}>({ticket.requesterEmail || "profile"})</Link></span><span className="flex items-center gap-2"><MapPin className="size-4"/>{ticket.locationUid || "Location not listed"}</span><span className="flex items-center gap-2"><Clock3 className="size-4"/>{new Date(ticket.createdAt).toLocaleString()}</span></div></CardContent></Card>
        {agent&&ticket.sourceTicketNumber&&<p className="text-sm text-muted-foreground">Original spreadsheet ticket number: {ticket.sourceTicketNumber}{ticket.sourceSpreadsheetRow?` · source row ${ticket.sourceSpreadsheetRow}`:""}</p>}
        {!agent&&ticket.resolutionNotes&&<Card><CardHeader><CardTitle>Resolution Details</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap leading-7">{ticket.resolutionNotes}</p></CardContent></Card>}
        <Card><CardContent className="pt-6"><TicketAttachments ticketNumber={ticket.ticketNumber} attachments={detail.attachments} enabled={process.env.DATA_BACKEND === "sql"}/></CardContent></Card>
        {agent&&activity.length>0&&<Card><CardHeader><CardTitle>Change history</CardTitle></CardHeader><CardContent className="space-y-4">{activity.map(item=><article key={item.key} className="border-l-2 pl-4"><p className="text-sm font-medium">{item.description}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(item.at).toLocaleString()}{item.actor?` · ${item.actor}`:""}</p>{item.note&&<p className="mt-2 whitespace-pre-wrap text-sm">{item.note}</p>}</article>)}</CardContent></Card>}
      </div>
      <aside className="space-y-4">
        <Card><CardHeader><CardTitle>{agent ? "Ticket Details" : "Request details"}</CardTitle></CardHeader><CardContent>{agent ? <TicketManageForm ticket={ticket} internalNotes={internalNotes}/> : <dl className="grid gap-4 text-sm"><div><dt className="text-muted-foreground">Category</dt><dd className="mt-1 font-medium">{ticket.category}</dd></div><div><dt className="text-muted-foreground">Last updated</dt><dd className="mt-1 font-medium">{new Date(ticket.updatedAt).toLocaleString()}</dd></div><div><dt className="text-muted-foreground">Completed By</dt><dd className="mt-1 font-medium">{effectiveCompletedBy(ticket) || "—"}</dd></div></dl>}</CardContent></Card>
      </aside>
    </div>
  </div>;
}



