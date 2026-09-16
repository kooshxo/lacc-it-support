import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, MapPin, UserRound } from "lucide-react";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { TicketManageForm } from "@/components/ticket-manage-form";
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
  return <div className="space-y-6">
    <Link href={agent ? "/it" : "/requests"} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to {agent ? "support inbox" : "my requests"}</Link>
    {created && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950"><CheckCircle2/><AlertTitle>Request received</AlertTitle><AlertDescription>Your request was committed to the support workbook as {ticket.ticketNumber}.</AlertDescription></Alert>}
    <div><p className="text-sm font-medium text-primary">{ticket.ticketNumber}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{ticket.subject}</h1><div className="mt-3 flex flex-wrap gap-2"><StatusBadge status={ticket.status}/>{agent && <PriorityBadge priority={ticket.priority}/>}</div></div>
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        <Card><CardHeader><CardTitle>What happened</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap leading-7">{ticket.description}</p><div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground"><span className="flex items-center gap-2"><UserRound className="size-4"/>{ticket.requesterName} <Link className="underline-offset-2 hover:underline" href={`/it?state=ALL&requester=${encodeURIComponent(ticket.requesterEmail)}`}>({ticket.requesterEmail || "profile"})</Link></span><span className="flex items-center gap-2"><MapPin className="size-4"/>{ticket.locationUid || "Location not listed"}</span><span className="flex items-center gap-2"><Clock3 className="size-4"/>{new Date(ticket.createdAt).toLocaleString()}</span></div></CardContent></Card>
      </div>
      <aside className="space-y-4">
        <Card><CardHeader><CardTitle>{agent ? "Manage request" : "Request details"}</CardTitle></CardHeader><CardContent>{agent ? <TicketManageForm ticket={ticket}/> : <dl className="grid gap-4 text-sm"><div><dt className="text-muted-foreground">Category</dt><dd className="mt-1 font-medium">{ticket.category}</dd></div><div><dt className="text-muted-foreground">Last updated</dt><dd className="mt-1 font-medium">{new Date(ticket.updatedAt).toLocaleString()}</dd></div><div><dt className="text-muted-foreground">Handled by</dt><dd className="mt-1 font-medium">{ticket.historicalStaff || "—"}</dd></div></dl>}</CardContent></Card>
      </aside>
    </div>
  </div>;
}



