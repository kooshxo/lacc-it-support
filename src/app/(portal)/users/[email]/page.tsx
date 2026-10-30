import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAgent } from "@/lib/authz";
import { getRepository } from "@/lib/excel";
import { isTicketResolved } from "@/lib/domain/resolution";

const submittedDate = (value: string) => new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function UserProfilePage({ params }: { params: Promise<{ email: string }> }) {
  await requireAgent();
  const { email: routeEmail } = await params;
  const email = routeEmail.trim().toLowerCase();
  if (!email.includes("@")) notFound();

  const history = (await getRepository().listTickets())
    .filter((ticket) => ticket.requesterEmail.trim().toLowerCase() === email)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!history.length) notFound();

  const nameCounts = new Map<string, { count: number; latest: string }>();
  for (const ticket of history) {
    const name = ticket.requesterName.trim();
    if (!name) continue;
    const previous = nameCounts.get(name) ?? { count: 0, latest: "" };
    nameCounts.set(name, { count: previous.count + 1, latest: previous.latest > ticket.createdAt ? previous.latest : ticket.createdAt });
  }
  const displayName = [...nameCounts.entries()].sort((a, b) => b[1].count - a[1].count || b[1].latest.localeCompare(a[1].latest))[0]?.[0] ?? "Unidentified requester";
  const openCount = history.filter((ticket) => !isTicketResolved(ticket)).length;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><Link href="/users" className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Users</Link><p className="mt-4 text-sm font-medium text-primary">Requester profile</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{displayName}</h1><p className="mt-2 text-muted-foreground">{email}</p></div>
      <Button asChild variant="outline"><Link href={`/it?state=ALL&requester=${encodeURIComponent(email)}`}>View in all tickets</Link></Button>
    </div>
    <Card><CardHeader><CardTitle>Ticket history</CardTitle><CardDescription>This profile is keyed by normalized email; name variations stay together under the same requester.</CardDescription></CardHeader><CardContent><div className="flex flex-wrap gap-8 text-sm"><p><strong className="block text-xl">{history.length}</strong><span className="text-muted-foreground">total tickets</span></p><p><strong className="block text-xl">{openCount}</strong><span className="text-muted-foreground">unresolved</span></p><p><strong className="block text-xl">{history.length - openCount}</strong><span className="text-muted-foreground">resolved</span></p></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Previous requests</CardTitle><CardDescription>Newest submissions appear first.</CardDescription></CardHeader><CardContent className="p-0"><div className="divide-y">{history.map((ticket) => <Link key={ticket.ticketUid} href={`/requests/${ticket.ticketNumber}`} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 hover:bg-muted/40"><div className="min-w-0"><p className="font-medium">{ticket.subject}</p><p className="mt-1 text-sm text-muted-foreground">{ticket.ticketNumber} · {submittedDate(ticket.createdAt)} · {ticket.category}</p></div><span className="rounded-full border px-3 py-1 text-xs">{isTicketResolved(ticket) ? "Resolved" : "Received"}</span></Link>)}</div></CardContent></Card>
  </div>;
}
