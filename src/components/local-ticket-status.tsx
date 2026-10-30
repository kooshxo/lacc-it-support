"use client";

import { useCallback, useEffect, useState } from "react";
import type { Ticket } from "@/lib/domain/models";
import { getPendingTicketWrite, outboxChangedEvent, type LocalPendingTicketWrite } from "@/lib/offline/ticket-write-outbox";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";

export function LocalTicketStatus({ ticket }: { ticket: Ticket }) {
  const [pending, setPending] = useState<LocalPendingTicketWrite | null>(null);
  const refresh = useCallback(() => { void getPendingTicketWrite(ticket.ticketUid).then(setPending); }, [ticket.ticketUid]);

  useEffect(() => {
    refresh();
    window.addEventListener(outboxChangedEvent, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(outboxChangedEvent, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return <span className="inline-flex flex-wrap items-center gap-2">
    <StatusBadge status={pending?.status ?? ticket.status} />
    {pending && <Badge variant="secondary">Pending Sheets sync</Badge>}
  </span>;
}
