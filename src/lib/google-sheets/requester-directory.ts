import "server-only";

import { unstable_cache } from "next/cache";
import type { Ticket } from "@/lib/domain/models";
import { parseGoogleFormsTimestamp } from "./time";
import { readHistoricalRequesterRows } from "./client";

const historicalDirectory = unstable_cache(async () => {
  const values = await readHistoricalRequesterRows();
  const rows = values.slice(1);
  const now = Date.now();
  const startDate = new Date(now);
  startDate.setMonth(startDate.getMonth() - 2);
  const start = startDate.getTime();
  return rows.flatMap((row) => {
    const submittedAt = parseGoogleFormsTimestamp(String(row[0] ?? ""));
    const email = String(row[4] ?? "").trim().toLowerCase();
    if (!submittedAt || submittedAt.getTime() < start || submittedAt.getTime() > now || !email) return [];
    return [{
      email,
      name: String(row[1] ?? "").trim(),
      phone: String(row[3] ?? "").trim(),
      submittedAt: submittedAt.toISOString(),
    }];
  });
}, ["lacc-recent-requester-directory"], { revalidate: 300 });

export type RequesterDirectoryEntry = {
  email: string;
  names: string[];
  phones: string[];
  mostRecentRequest: string;
  ticketCount: number;
  openTicketCount: number;
  identityConflict: boolean;
};

export async function listRecentRequesterDirectory(tickets: Ticket[]): Promise<RequesterDirectoryEntry[]> {
  const historical = await historicalDirectory();
  const byEmail = new Map<string, RequesterDirectoryEntry>();
  const ensure = (email: string) => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;
    const existing = byEmail.get(normalized) ?? { email: normalized, names: [], phones: [], mostRecentRequest: "", ticketCount: 0, openTicketCount: 0, identityConflict: false };
    byEmail.set(normalized, existing);
    return existing;
  };
  const addName = (entry: RequesterDirectoryEntry, name: string) => {
    const clean = name.trim();
    if (!clean || entry.names.includes(clean)) return;
    entry.names.push(clean);
    entry.identityConflict = entry.names.length > 1;
  };
  const addDate = (entry: RequesterDirectoryEntry, value: string) => {
    if (!entry.mostRecentRequest || value > entry.mostRecentRequest) entry.mostRecentRequest = value;
  };
  for (const record of historical) {
    const entry = ensure(record.email);
    if (!entry) continue;
    addName(entry, record.name);
    if (record.phone && !entry.phones.includes(record.phone)) entry.phones.push(record.phone);
    addDate(entry, record.submittedAt);
  }
  for (const ticket of tickets) {
    const entry = ensure(ticket.requesterEmail);
    if (!entry) continue;
    addName(entry, ticket.requesterName);
    entry.ticketCount += 1;
    if (ticket.status !== "RESOLVED") entry.openTicketCount += 1;
    addDate(entry, ticket.createdAt);
  }
  return [...byEmail.values()].sort((a, b) => b.mostRecentRequest.localeCompare(a.mostRecentRequest));
}
