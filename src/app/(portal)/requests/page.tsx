import Link from "next/link";
import { Plus } from "lucide-react";
import { requireEmployee } from "@/lib/authz";
import { getRepository } from "@/lib/excel";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function RequestsPage() { const employee=await requireEmployee(); const tickets=await getRepository().listTickets({requesterUid:employee.employeeUid}); return <div><div className="flex items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight">My requests</h1><p className="mt-2 text-muted-foreground">Every request and update in one place.</p></div><Button asChild><Link href="/requests/new"><Plus/>New request</Link></Button></div><div className="mt-8 space-y-3">{tickets.map((ticket)=><Card key={ticket.ticketUid}><CardContent className="p-0"><Link href={`/requests/${ticket.ticketNumber}`} className="grid gap-4 p-5 hover:bg-muted/40 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="mb-2 flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-primary">{ticket.ticketNumber}</span><StatusBadge status={ticket.status}/></div><h2 className="font-semibold">{ticket.subject}</h2><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{ticket.description}</p></div><p className="text-sm text-muted-foreground">{new Date(ticket.updatedAt).toLocaleDateString()}</p></Link></CardContent></Card>)}{!tickets.length&&<Card><CardContent className="py-14 text-center text-muted-foreground">No requests found.</CardContent></Card>}</div></div> }
