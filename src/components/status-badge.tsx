import type { Priority, TicketStatus } from "@/lib/domain/models";
import { Badge } from "./ui/badge";

const labels: Record<TicketStatus, string> = { NEW: "Received", ASSIGNED: "Assigned", IN_PROGRESS: "IT is working on it", WAITING_ON_USER: "Waiting for you", WAITING_ON_VENDOR: "Waiting on vendor", RESOLVED: "Resolved", CLOSED: "Closed" };
const styles: Record<TicketStatus, string> = { NEW: "bg-blue-50 text-blue-800 border-blue-200", ASSIGNED: "bg-violet-50 text-violet-800 border-violet-200", IN_PROGRESS: "bg-amber-50 text-amber-900 border-amber-200", WAITING_ON_USER: "bg-orange-50 text-orange-900 border-orange-200", WAITING_ON_VENDOR: "bg-slate-100 text-slate-800 border-slate-200", RESOLVED: "bg-emerald-50 text-emerald-800 border-emerald-200", CLOSED: "bg-slate-100 text-slate-700 border-slate-200" };

export function StatusBadge({ status }: { status: TicketStatus }) { return <Badge variant="outline" className={styles[status]}>{labels[status]}</Badge>; }
export function PriorityBadge({ priority }: { priority: Priority }) { const label = { P1: "P1 Critical", P2: "P2 High", P3: "P3 Normal", P4: "P4 Low" }[priority]; return <Badge variant="outline" className={priority === "P1" ? "border-red-200 bg-red-50 text-red-800" : priority === "P2" ? "border-orange-200 bg-orange-50 text-orange-900" : "border-slate-200 bg-slate-50 text-slate-700"}>{label}</Badge>; }
