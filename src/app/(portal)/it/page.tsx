import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireAgent } from "@/lib/authz";
import { getRepository } from "@/lib/excel";
import type { Ticket } from "@/lib/domain/models";
import { isTicketResolved } from "@/lib/domain/resolution";

const text = (value: string | undefined) => value?.trim() || "—";
const age = (createdAt: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
};
const isSolved = (ticket: Ticket) => isTicketResolved(ticket);

export default async function ItPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [actor, filters] = await Promise.all([requireAgent(), searchParams]);
  const allTickets = await getRepository().listTickets({ query: filters.q, status: filters.status });
  const values = (key: keyof Ticket) => [...new Set(allTickets.map((ticket) => String(ticket[key] ?? "").trim()).filter(Boolean))].sort();
  const sites = values("locationUid");
  const departments = values("departmentUid");
  const categories = values("category");
  const technicians = [...new Set(allTickets.map((ticket) => ticket.historicalStaff?.trim() || "").filter(Boolean))].sort();
  const state = filters.state ?? "RECEIVED";
  const allView = state === "ALL";
  const query = filters.q?.toLowerCase().trim();
  let tickets = allTickets.filter((ticket) => {
    const haystack = [ticket.ticketNumber, ticket.requesterName, ticket.requesterEmail, ticket.subject, ticket.description, ticket.category, ticket.departmentUid, ticket.locationUid, ticket.historicalStaff].join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (!filters.site || ticket.locationUid === filters.site) && (!filters.department || ticket.departmentUid === filters.department) && (!filters.need || ticket.category === filters.need) && (!filters.technician || ticket.historicalStaff === filters.technician) && (!filters.requester || `${ticket.requesterName} ${ticket.requesterEmail}`.toLowerCase().includes(filters.requester.toLowerCase())) && (state === "RECEIVED" ? !isSolved(ticket) : state === "SOLVED" ? isSolved(ticket) : true);
  });
  tickets = [...tickets].sort((a, b) => filters.sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
  const pageNumber = Math.max(1, Number(filters.page ?? "1") || 1);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(tickets.length / pageSize));
  const visibleTickets = tickets.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
  const open = tickets.filter((ticket) => !isSolved(ticket));
  const selectClass = "h-9 rounded-md border bg-background px-3 text-sm";
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-primary">IT workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{allView ? "All tickets" : "Support inbox"}</h1><p className="mt-2 text-muted-foreground">{allView ? "Complete ticket history from the Google Sheet." : `${open.length} received · ${tickets.length - open.length} solved`} · signed in as {actor.displayName}</p></div><div className="text-right text-sm text-muted-foreground">{tickets.length} visible</div></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><SlidersHorizontal className="size-4"/>Find and filter</CardTitle><CardDescription>Search descriptions, requesters, sites, categories, technicians, and ticket IDs.</CardDescription></CardHeader><CardContent><form className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-7"><div className="relative min-w-0 sm:col-span-2 lg:col-span-3 2xl:col-span-2"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input className="w-full pl-9" name="q" defaultValue={filters.q} placeholder={allView ? "Search by requester email, name, ticket, or issue…" : "/ Search ticket, issue, requester…"}/></div><select name="site" defaultValue={filters.site ?? ""} className={`${selectClass} min-w-0 w-full`}><option value="">All sites</option>{sites.map((value)=><option key={value} value={value}>{value}</option>)}</select><select name="department" defaultValue={filters.department ?? ""} className={`${selectClass} min-w-0 w-full`}><option value="">All departments</option>{departments.map((value)=><option key={value} value={value}>{value}</option>)}</select><select name="need" defaultValue={filters.need ?? ""} className={`${selectClass} min-w-0 w-full`}><option value="">All IT needs</option>{categories.map((value)=><option key={value} value={value}>{value}</option>)}</select><select name="technician" defaultValue={filters.technician ?? ""} className={`${selectClass} min-w-0 w-full`}><option value="">All technicians</option>{technicians.map((value)=><option key={value} value={value}>{value}</option>)}</select><select name="state" defaultValue={state} className={`${selectClass} min-w-0 w-full`}><option value="RECEIVED">Received</option><option value="">All states</option><option value="SOLVED">Solved</option></select><Button type="submit" className="w-full">Apply</Button></form><div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground"><Link className="rounded-full border px-3 py-1 hover:bg-muted" href="/it?state=RECEIVED">Received</Link><Link className="rounded-full border px-3 py-1 hover:bg-muted" href={`/it?technician=${encodeURIComponent(actor.displayName)}&state=RECEIVED`}>My tickets</Link><Link className="rounded-full border px-3 py-1 hover:bg-muted" href="/it?sort=oldest&state=RECEIVED">Oldest received</Link></div></CardContent></Card>
    <div className="min-w-0 overflow-hidden rounded-xl border bg-card"><div className="hidden 2xl:grid-cols-[minmax(80px,0.6fr)_minmax(0,2.4fr)_minmax(90px,1fr)_minmax(90px,1fr)_minmax(100px,1fr)_minmax(60px,0.6fr)_minmax(110px,1fr)] gap-3 border-b bg-muted/50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground 2xl:grid"><span>Ticket</span><span>Request</span><span>Site</span><span>Department</span><span>Handled by</span><span>Age</span><span>State</span></div>{visibleTickets.map((ticket)=><Link key={ticket.ticketUid} href={`/requests/${ticket.ticketNumber}`} className="min-w-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 border-b px-4 py-4 last:border-b-0 hover:bg-muted/40 sm:px-5 2xl:grid-cols-[minmax(80px,0.6fr)_minmax(0,2.4fr)_minmax(90px,1fr)_minmax(90px,1fr)_minmax(100px,1fr)_minmax(60px,0.6fr)_minmax(110px,1fr)] 2xl:items-center"><span className="text-sm font-semibold text-primary">{ticket.ticketNumber}</span><span className="justify-self-end text-sm font-medium 2xl:order-6 2xl:justify-self-start">{age(ticket.createdAt)}</span><span className="col-span-2 min-w-0 2xl:col-span-1 2xl:order-2"><strong className="block truncate font-medium">{ticket.subject}</strong><span className="mt-1 block line-clamp-3 text-sm leading-5 text-muted-foreground">{ticket.description}</span><span className="mt-2 block text-xs text-muted-foreground">{text(ticket.requesterName)} · {text(ticket.category)}</span></span><span className="text-sm 2xl:order-3"><span className="mr-1 text-xs text-muted-foreground 2xl:hidden">Site:</span>{text(ticket.locationUid)}</span><span className="text-sm text-muted-foreground 2xl:order-4"><span className="mr-1 text-xs 2xl:hidden">Dept:</span>{text(ticket.departmentUid)}</span><span className="text-sm text-muted-foreground 2xl:order-5"><span className="mr-1 text-xs 2xl:hidden">Handled by:</span>{text(ticket.historicalStaff)}</span><span className="col-span-2 flex flex-wrap gap-1 2xl:order-7 2xl:col-span-1"><StatusBadge status={ticket.status}/><PriorityBadge priority={ticket.priority}/></span></Link>)}{!tickets.length&&<p className="p-12 text-center text-muted-foreground">No tickets match these filters.</p>}</div>{pageCount > 1 && <nav className="flex items-center justify-between text-sm" aria-label="Ticket pages"><span className="text-muted-foreground">Page {Math.min(pageNumber, pageCount)} of {pageCount} · {tickets.length} tickets</span><div className="flex gap-2"><Link className={`rounded-md border px-3 py-2 ${pageNumber <= 1 ? "pointer-events-none opacity-40" : "hover:bg-muted"}`} href={`/it?state=${state}&page=${pageNumber - 1}`}>Previous</Link><Link className={`rounded-md border px-3 py-2 ${pageNumber >= pageCount ? "pointer-events-none opacity-40" : "hover:bg-muted"}`} href={`/it?state=${state}&page=${pageNumber + 1}`}>Next</Link></div></nav>}
  </div>;
}









