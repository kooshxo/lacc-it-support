import Link from "next/link";
import { requireAgent } from "@/lib/authz";
import { getRepository } from "@/lib/excel";
import { isTicketResolved } from "@/lib/domain/resolution";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAgent();
  const { q } = await searchParams;
  const tickets = await getRepository().listTickets();
  const users = new Map<string, { email: string; names: Set<string>; total: number; open: number }>();
  for (const ticket of tickets) {
    const email = ticket.requesterEmail.trim().toLowerCase();
    if (!email) continue;
    const current = users.get(email) ?? { email, names: new Set<string>(), total: 0, open: 0 };
    if (ticket.requesterName.trim()) current.names.add(ticket.requesterName.trim());
    current.total += 1;
    if (!isTicketResolved(ticket)) current.open += 1;
    users.set(email, current);
  }
  const query = q?.trim().toLowerCase() ?? "";
  const directory = [...users.values()].filter((user) => !query || user.email.includes(query) || [...user.names].some((name) => name.toLowerCase().includes(query))).sort((a, b) => (a.names.values().next().value ?? a.email).localeCompare(b.names.values().next().value ?? b.email));
  return <div className="space-y-6"><div><p className="text-sm font-medium text-primary">IT operations</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Users</h1><p className="mt-2 text-muted-foreground">Requester history keyed by normalized LACC email. Names are display values, not identities.</p></div><Card><CardHeader><CardTitle>{directory.length} unique requesters</CardTitle><CardDescription>Duplicate names and capitalization resolve to the same person when the email matches.</CardDescription></CardHeader><CardContent><form className="flex flex-col gap-3 sm:flex-row"><Input name="q" defaultValue={q} placeholder="Search by name or email…"/><Button type="submit">Search users</Button></form></CardContent></Card><Card><CardContent className="p-0"><div className="divide-y">{directory.map((user)=><Link key={user.email} href={`/it?state=ALL&requester=${encodeURIComponent(user.email)}`} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 hover:bg-muted/40"><div className="min-w-0"><p className="truncate font-medium">{[...user.names].join(" / ") || "Unnamed requester"}</p><p className="truncate text-sm text-muted-foreground">{user.email}</p></div><div className="flex gap-4 text-right text-sm"><span><strong className="block">{user.total}</strong><span className="text-muted-foreground">tickets</span></span><span><strong className="block">{user.open}</strong><span className="text-muted-foreground">open</span></span></div></Link>)}{!directory.length&&<p className="p-12 text-center text-muted-foreground">No requester emails found in the current source window.</p>}</div></CardContent></Card></div>;
}
