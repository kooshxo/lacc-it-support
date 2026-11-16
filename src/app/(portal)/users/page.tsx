import Link from "next/link";
import { requireAgent } from "@/lib/authz";
import { getRepository } from "@/lib/excel";
import { listRecentRequesterDirectory } from "@/lib/google-sheets/requester-directory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAgent();
  const { q } = await searchParams;
  const tickets = await getRepository().listTickets();
  const users = await listRecentRequesterDirectory(tickets);
  const query = q?.trim().toLowerCase() ?? "";
  const directory = users.filter((user) => !query || user.email.includes(query) || user.names.some((name) => name.toLowerCase().includes(query)) || user.phones.some((phone) => phone.includes(query)));
  return <div className="space-y-6"><div><p className="text-sm font-medium text-primary">IT operations</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Users</h1><p className="mt-2 text-muted-foreground">Recent requester directory from the last two months. Ticket counts reflect the active ticket source only.</p></div><Card><CardHeader><CardTitle>{directory.length} recent requesters</CardTitle><CardDescription>People are deduplicated by normalized work email; conflicting names are shown for review.</CardDescription></CardHeader><CardContent><form className="flex flex-col gap-3 sm:flex-row"><Input name="q" defaultValue={q} placeholder="Search by name, email, or phone…"/><Button type="submit">Search users</Button></form></CardContent></Card><Card><CardContent className="p-0"><div className="divide-y">{directory.map((user)=><Link key={user.email} href={`/it?state=ALL&requester=${encodeURIComponent(user.email)}`} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 hover:bg-muted/40"><div className="min-w-0"><p className="truncate font-medium">{user.names.join(" / ") || "Unnamed requester"}{user.identityConflict&&<span className="ml-2 text-xs text-amber-700">Review name conflict</span>}</p><p className="truncate text-sm text-muted-foreground">{user.email}</p>{user.phones.length>0&&<p className="text-sm text-muted-foreground">{user.phones.join(" / ")}</p>}<p className="text-xs text-muted-foreground">Most recent request: {new Date(user.mostRecentRequest).toLocaleDateString()}</p></div><div className="flex gap-4 text-right text-sm"><span><strong className="block">{user.ticketCount}</strong><span className="text-muted-foreground">tickets</span></span><span><strong className="block">{user.openTicketCount}</strong><span className="text-muted-foreground">open</span></span></div></Link>)}{!directory.length&&<p className="p-12 text-center text-muted-foreground">No recent requester records found.</p>}</div></CardContent></Card></div>;
}
