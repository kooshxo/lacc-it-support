import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireAgent } from "@/lib/authz";
import { getRepository } from "@/lib/excel";
import type { Ticket } from "@/lib/domain/models";
import { countTicketsSolvedWithin, effectiveCompletedBy, isTicketResolved } from "@/lib/domain/resolution";
import { canonicalTicketStatus } from "@/lib/domain/ticket-status";

const display = (value: string | undefined) => value?.trim() || "—";
const age = (createdAt: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
};
const isSolved = (ticket: Ticket) => isTicketResolved(ticket);

export default async function ItPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAgent();
  const filters = await searchParams;
  const allTickets = await getRepository().listTickets();
  const state = filters.state ?? "RECEIVED";
  const allView = state === "ALL";
  const scopedTickets = state === "SOLVED" || allView ? allTickets : allTickets.filter((ticket) => !isSolved(ticket));
  const solvedLast14Days = countTicketsSolvedWithin(allTickets);
  const completedByOptions = [...new Set(allTickets.map(effectiveCompletedBy).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const sites = [...new Set(scopedTickets.map((ticket) => ticket.locationUid.trim()).filter(Boolean))].sort();
  const departments = [...new Set(scopedTickets.map((ticket) => ticket.departmentUid.trim()).filter(Boolean))].sort();
  const categories = [...new Set(scopedTickets.map((ticket) => ticket.category.trim()).filter(Boolean))].sort();
  const query = filters.q?.toLowerCase().trim();
  const tickets = scopedTickets.filter((ticket) => {
    const completedBy = effectiveCompletedBy(ticket);
    const haystack = [ticket.ticketNumber, ticket.requesterName, ticket.requesterEmail, ticket.subject, ticket.description, ticket.category, ticket.departmentUid, ticket.locationUid, completedBy].join(" ").toLowerCase();
    const canonical = canonicalTicketStatus(ticket.status);
    return (!query || haystack.includes(query))
      && (!filters.status || canonical === canonicalTicketStatus(filters.status))
      && (!filters.site || ticket.locationUid === filters.site)
      && (!filters.department || ticket.departmentUid === filters.department)
      && (!filters.need || ticket.category === filters.need)
      && (!filters.completedBy || completedBy === filters.completedBy)
      && (!filters.requester || `${ticket.requesterName} ${ticket.requesterEmail}`.toLowerCase().includes(filters.requester.toLowerCase()))
      && (state === "RECEIVED" ? canonical === "NEW" : state === "IN_PROGRESS" ? canonical === "IN_PROGRESS" : state === "SOLVED" ? isSolved(ticket) : true);
  });
  const sortedTickets = [...tickets].sort((a, b) => filters.sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
  const pageNumber = Math.max(1, Number(filters.page ?? "1") || 1);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(sortedTickets.length / pageSize));
  const visibleTickets = sortedTickets.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
  const selectClass = "h-10 min-w-0 w-full rounded-md border bg-background px-3 text-sm";
  const received = allTickets.filter((ticket) => canonicalTicketStatus(ticket.status) === "NEW").length;
  const inProgress = allTickets.filter((ticket) => canonicalTicketStatus(ticket.status) === "IN_PROGRESS").length;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-primary">IT workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{allView ? "All Tickets" : state === "SOLVED" ? "Solved Tickets" : "Support Inbox"}</h1><p className="mt-2 text-sm text-muted-foreground">{received} Received · {inProgress} In Progress · {solvedLast14Days} Solved in the last 14 days</p></div><div className="text-right text-sm text-muted-foreground">{sortedTickets.length} visible</div></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><SlidersHorizontal className="size-4"/>Find tickets</CardTitle><CardDescription>Search requesters, ticket numbers, sites, categories, and completed by.</CardDescription></CardHeader><CardContent><form className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="relative min-w-0 sm:col-span-2"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input className="w-full pl-9" name="q" defaultValue={filters.q} placeholder="Search tickets or requesters"/></div><select name="site" defaultValue={filters.site ?? ""} className={selectClass}><option value="">All sites</option>{sites.map((value)=><option key={value} value={value}>{value}</option>)}</select><select name="department" defaultValue={filters.department ?? ""} className={selectClass}><option value="">All departments</option>{departments.map((value)=><option key={value} value={value}>{value}</option>)}</select><select name="need" defaultValue={filters.need ?? ""} className={selectClass}><option value="">All IT needs</option>{categories.map((value)=><option key={value} value={value}>{value}</option>)}</select><select name="completedBy" defaultValue={filters.completedBy ?? ""} className={selectClass}><option value="">All Completed By</option>{completedByOptions.map((value)=><option key={value} value={value}>{value}</option>)}</select><select name="state" defaultValue={state} className={selectClass}><option value="RECEIVED">Received</option><option value="IN_PROGRESS">In Progress</option><option value="SOLVED">Solved</option><option value="ALL">All tickets</option></select><Button type="submit" className="w-full">Apply</Button></form><div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground"><Link className="rounded-full border px-3 py-1 hover:bg-muted" href="/it?state=RECEIVED">Received</Link><Link className="rounded-full border px-3 py-1 hover:bg-muted" href="/it?state=IN_PROGRESS">In Progress</Link><Link className="rounded-full border px-3 py-1 hover:bg-muted" href="/it?state=SOLVED">Solved</Link><Link className="rounded-full border px-3 py-1 hover:bg-muted" href="/it?sort=oldest&state=RECEIVED">Oldest received</Link></div></CardContent></Card>
    <div className="min-w-0 overflow-hidden rounded-xl border bg-card"><div className="hidden 2xl:grid grid-cols-[minmax(80px,0.6fr)_minmax(0,2.4fr)_minmax(90px,1fr)_minmax(90px,1fr)_minmax(100px,1fr)_minmax(60px,0.6fr)_minmax(110px,1fr)] gap-3 border-b bg-muted/50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><span>Ticket</span><span>Request</span><span>Site</span><span>Department</span><span>Completed By</span><span>Age</span><span>Status</span></div>{visibleTickets.map((ticket)=><Link key={ticket.ticketUid} href={`/requests/${ticket.ticketNumber}`} className="grid min-w-0 grid-cols-[1fr_auto] gap-x-3 gap-y-2 border-b px-4 py-4 last:border-b-0 hover:bg-muted/40 sm:px-5 2xl:grid-cols-[minmax(80px,0.6fr)_minmax(0,2.4fr)_minmax(90px,1fr)_minmax(90px,1fr)_minmax(100px,1fr)_minmax(60px,0.6fr)_minmax(110px,1fr)] 2xl:items-center"><span className="text-sm font-semibold text-primary">{ticket.ticketNumber}</span><span className="justify-self-end text-sm font-medium 2xl:order-6 2xl:justify-self-start">{age(ticket.createdAt)}</span><span className="col-span-2 min-w-0 2xl:col-span-1 2xl:order-2"><strong className="block truncate font-medium">{ticket.subject}</strong><span className="mt-1 block line-clamp-3 text-sm leading-5 text-muted-foreground">{ticket.description}</span><span className="mt-2 block text-xs text-muted-foreground">{display(ticket.requesterName)} · {display(ticket.category)}</span></span><span className="text-sm 2xl:order-3"><span className="mr-1 text-xs text-muted-foreground 2xl:hidden">Site:</span>{display(ticket.locationUid)}</span><span className="text-sm text-muted-foreground 2xl:order-4"><span className="mr-1 text-xs 2xl:hidden">Dept:</span>{display(ticket.departmentUid)}</span><span className="text-sm text-muted-foreground 2xl:order-5"><span className="mr-1 text-xs 2xl:hidden">Completed by:</span>{display(effectiveCompletedBy(ticket))}</span><span className="col-span-2 flex flex-wrap gap-1 2xl:order-7 2xl:col-span-1"><StatusBadge status={ticket.status}/><PriorityBadge priority={ticket.priority}/></span></Link>)}{!sortedTickets.length&&<p className="p-12 text-center text-muted-foreground">No tickets match these filters.</p>}</div>{pageCount>1&&<nav className="flex items-center justify-between text-sm" aria-label="Ticket pages"><span className="text-muted-foreground">Page {Math.min(pageNumber,pageCount)} of {pageCount} · {sortedTickets.length} tickets</span><div className="flex gap-2"><Link className={`rounded-md border px-3 py-2 ${pageNumber<=1?"pointer-events-none opacity-40":"hover:bg-muted"}`} href={`/it?state=${state}&page=${pageNumber-1}`}>Previous</Link><Link className={`rounded-md border px-3 py-2 ${pageNumber>=pageCount?"pointer-events-none opacity-40":"hover:bg-muted"}`} href={`/it?state=${state}&page=${pageNumber+1}`}>Next</Link></div></nav>}
  </div>;
}
