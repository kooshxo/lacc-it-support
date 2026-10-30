"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { listPendingTicketWrites, outboxChangedEvent, type LocalPendingTicketWrite } from "@/lib/offline/ticket-write-outbox";

export function LocalWriteOutboxNotice() {
  const [writes, setWrites] = useState<LocalPendingTicketWrite[]>([]);
  const refresh = useCallback(() => { void listPendingTicketWrites().then(setWrites); }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(outboxChangedEvent, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(outboxChangedEvent, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  if (!writes.length) return null;
  const latestError = writes.at(-1)?.lastError;
  const visibleWrites = writes.slice(-5).reverse();
  return <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6">
    <Alert variant="destructive" role="status">
      <AlertTitle>{writes.length} ticket {writes.length === 1 ? "update is" : "updates are"} waiting for Google Sheets</AlertTitle>
      <AlertDescription>
        <p>The changes are saved in this browser and remain visible as pending. The next ticket save will retry them together with that new update.</p>
        {latestError && <p className="mt-1"><span className="font-medium">Last Sheets error:</span> {latestError}</p>}
        <ul className="mt-2 list-inside list-disc">
          {visibleWrites.map((write) => <li key={write.ticketUid}>{write.ticketNumber} · {write.status === "NEW" ? "Received" : "Resolved"}</li>)}
          {writes.length > visibleWrites.length && <li>and {writes.length - visibleWrites.length} more</li>}
        </ul>
      </AlertDescription>
    </Alert>
  </div>;
}
