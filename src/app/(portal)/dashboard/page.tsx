import Link from "next/link";
import { ArrowRight, Clock3, Plus, ShieldCheck, TicketCheck } from "lucide-react";
import { requireEmployee } from "@/lib/authz";
import { getRepository } from "@/lib/excel";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Dashboard() {
  const employee = await requireEmployee();
  const all = await getRepository().listTickets(employee.role === "EMPLOYEE" ? { requesterUid: employee.employeeUid } : {});
  const open = all.filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status));

  if (employee.role !== "EMPLOYEE") {
    return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">IT operations</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Support overview</h1><p className="mt-2 text-muted-foreground">Review the active queue and recent requests.</p></div><Button asChild size="lg"><Link href="/it"><ShieldCheck />Open IT workspace</Link></Button></div><div className="grid gap-4 sm:grid-cols-1"><Metric icon={<Clock3 />} label="Active queue" value={String(open.length)} /></div><Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Recent queue activity</CardTitle><CardDescription>Latest requests across LACC</CardDescription></div><Button asChild variant="ghost"><Link href="/it">View full queue<ArrowRight /></Link></Button></CardHeader><CardContent>{all.length ? <div className="divide-y">{all.slice(0, 5).map((ticket) => <Link key={ticket.ticketUid} href={`/requests/${ticket.ticketNumber}`} className="grid gap-2 py-4 transition-colors hover:bg-muted/50 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-medium">{ticket.subject}</p><p className="mt-1 text-sm text-muted-foreground">{ticket.ticketNumber} · {ticket.requesterName} · Updated {new Date(ticket.updatedAt).toLocaleDateString()}</p></div><StatusBadge status={ticket.status} /></Link>)}</div> : <div className="py-12 text-center"><p className="font-medium">Queue is clear</p><p className="mt-1 text-sm text-muted-foreground">New requests will appear here when the intake form writes to the workbook.</p></div>}</CardContent></Card></div>;
  }

  return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">Welcome back, {employee.displayName.split(" ")[0]}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">How can IT help today?</h1><p className="mt-2 text-muted-foreground">Start a request or check on something already in progress.</p></div><Button asChild size="lg"><Link href="/requests/new"><Plus />Get IT help</Link></Button></div><div className="grid gap-4 sm:grid-cols-3"><Metric icon={<Clock3 />} label="Open requests" value={String(open.length)} /><Metric icon={<TicketCheck />} label="Resolved" value={String(all.filter((t) => t.status === "RESOLVED").length)} /><Metric icon={<ArrowRight />} label="Waiting for you" value={String(all.filter((t) => t.status === "WAITING_ON_USER").length)} /></div><Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Recent requests</CardTitle><CardDescription>Your latest support activity</CardDescription></div><Button asChild variant="ghost"><Link href="/requests">View all<ArrowRight /></Link></Button></CardHeader><CardContent>{all.length ? <div className="divide-y">{all.slice(0, 5).map((ticket) => <Link key={ticket.ticketUid} href={`/requests/${ticket.ticketNumber}`} className="grid gap-2 py-4 transition-colors hover:bg-muted/50 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-medium">{ticket.subject}</p><p className="mt-1 text-sm text-muted-foreground">{ticket.ticketNumber} · Updated {new Date(ticket.updatedAt).toLocaleDateString()}</p></div><StatusBadge status={ticket.status} /></Link>)}</div> : <div className="py-12 text-center"><p className="font-medium">No requests yet</p><p className="mt-1 text-sm text-muted-foreground">When you need help, your requests will appear here.</p></div>}</CardContent></Card></div>;
}

function Metric({ icon, label, value }: { icon: React.ReactElement; label: string; value: string }) {
  return <Card><CardContent className="flex items-center gap-4 p-5"><div className="grid size-11 place-items-center rounded-xl bg-accent text-primary [&_svg]:size-5">{icon}</div><div><p className="text-2xl font-semibold">{value}</p><p className="text-sm text-muted-foreground">{label}</p></div></CardContent></Card>;
}

