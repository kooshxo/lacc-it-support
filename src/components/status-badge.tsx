import type { Priority, TicketStatus } from "@/lib/domain/models";
import { canonicalTicketStatus, ticketStatusLabel } from "@/lib/domain/ticket-status";
import { Badge } from "./ui/badge";

const styles = {
  NEW: "bg-blue-50 text-blue-800 border-blue-200",
  IN_PROGRESS: "bg-amber-50 text-amber-900 border-amber-200",
  RESOLVED: "bg-emerald-50 text-emerald-800 border-emerald-200",
} as const;

export function StatusBadge({ status }: { status: TicketStatus }) {
  const canonical = canonicalTicketStatus(status);
  return <Badge variant="outline" className={styles[canonical]}>{ticketStatusLabel(status)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const label = { P1: "P1 Critical", P2: "P2 High", P3: "P3 Normal", P4: "P4 Low" }[priority];
  return <Badge variant="outline" className={priority === "P1" ? "border-red-200 bg-red-50 text-red-800" : priority === "P2" ? "border-orange-200 bg-orange-50 text-orange-900" : "border-slate-200 bg-slate-50 text-slate-700"}>{label}</Badge>;
}
