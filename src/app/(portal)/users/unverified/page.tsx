import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAgent } from "@/lib/authz";
import { getRepository } from "@/lib/excel";
import { isValidRequesterEmail, normalizeRequesterEmail } from "@/lib/domain/email";
import { isTicketResolved } from "@/lib/domain/resolution";

export default async function UnverifiedRequesterPage() {
  await requireAgent();
  const tickets = (await getRepository().listTickets())
    .filter((ticket) => !isValidRequesterEmail(ticket.requesterEmail))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return <div className="space-y-6">
    <div><Link href="/users" className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Users</Link><p className="mt-4 text-sm font-medium text-primary">Requester identity review</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Requests needing a valid email</h1><p className="mt-2 text-muted-foreground">These submissions are kept separate until a valid requester email is available.</p></div>
    <Card><CardHeader><CardTitle>{tickets.length} requests</CardTitle><CardDescription>Each request is listed on its own because a blank or malformed email cannot safely identify one person. Confirm the right email before grouping this history into a profile.</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><Link href="/users">Back to requester profiles</Link></Button></CardContent></Card>
    <Card><CardContent className="p-0"><div className="divide-y">{tickets.map((ticket) => <Link key={ticket.ticketUid} href={`/requests/${ticket.ticketNumber}`} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 hover:bg-muted/40"><div className="min-w-0"><p className="font-medium">{ticket.requesterName || "Unidentified requester"}</p><p className="mt-1 text-sm text-muted-foreground">{ticket.requesterEmail.trim() || "No email supplied"} · {ticket.ticketNumber} · {new Date(ticket.createdAt).toLocaleDateString()}</p><p className="mt-1 text-sm text-muted-foreground">{ticket.subject}</p></div><span className="rounded-full border px-3 py-1 text-xs">{isTicketResolved(ticket) ? "Resolved" : "Received"}</span></Link>)}{tickets.length === 0 && <p className="p-12 text-center text-muted-foreground">All dated requests have a valid requester email.</p>}</div></CardContent></Card>
  </div>;
}
