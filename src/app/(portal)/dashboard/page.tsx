import Link from "next/link";
import { ArrowRight, Clock3, Plus, TicketCheck } from "lucide-react";
import { requireEmployee } from "@/lib/authz";
import { getRepository } from "@/lib/excel";
import { StatusBadge } from "@/components/status-badge";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isTicketResolved } from "@/lib/domain/resolution";
import { canonicalTicketStatus } from "@/lib/domain/ticket-status";

export default async function Dashboard() {
  const employee = await requireEmployee();
  if (employee.role !== "EMPLOYEE") redirect("/it");
  const all = await getRepository().listTickets({ requesterUid: employee.employeeUid, requesterEmail: employee.email });
  const open = all.filter((ticket) => !isTicketResolved(ticket));

  return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">Welcome back, {employee.displayName.split(" ")[0]}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">How can IT help today?</h1><p className="mt-2 text-muted-foreground">Start a request or check on something already in progress.</p></div><Button asChild size="lg"><Link href="/requests/new"><Plus />Get IT help</Link></Button></div><div className="grid gap-4 sm:grid-cols-3"><Metric icon={<Clock3 />} label="Open requests" value={String(open.length)} /><Metric icon={<TicketCheck />} label="Solved" value={String(all.filter(isTicketResolved).length)} /><Metric icon={<ArrowRight />} label="In Progress" value={String(all.filter((ticket) => canonicalTicketStatus(ticket.status) === "IN_PROGRESS").length)} /></div><Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Recent requests</CardTitle><CardDescription>Your latest support activity</CardDescription></div><Button asChild variant="ghost"><Link href="/requests">View all<ArrowRight /></Link></Button></CardHeader><CardContent>{all.length ? <div className="divide-y">{all.slice(0, 5).map((ticket) => <Link key={ticket.ticketUid} href={`/requests/${ticket.ticketNumber}`} className="grid gap-2 py-4 transition-colors hover:bg-muted/50 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-medium">{ticket.subject}</p><p className="mt-1 text-sm text-muted-foreground">{ticket.ticketNumber} · Updated {new Date(ticket.updatedAt).toLocaleDateString()}</p></div><StatusBadge status={ticket.status} /></Link>)}</div> : <div className="py-12 text-center"><p className="font-medium">No requests yet</p><p className="mt-1 text-sm text-muted-foreground">When you need help, your requests will appear here.</p></div>}</CardContent></Card></div>;
}

function Metric({ icon, label, value }: { icon: React.ReactElement; label: string; value: string }) {
  return <Card><CardContent className="flex items-center gap-4 p-5"><div className="grid size-11 place-items-center rounded-xl bg-accent text-primary [&_svg]:size-5">{icon}</div><div><p className="text-2xl font-semibold">{value}</p><p className="text-sm text-muted-foreground">{label}</p></div></CardContent></Card>;
}

