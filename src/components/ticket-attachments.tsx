import type { AttachmentRecord } from "@/lib/domain/models";

export function TicketAttachments({
  ticketNumber,
  attachments,
}: {
  ticketNumber: string;
  attachments: AttachmentRecord[];
}) {
  return (
    <section className="space-y-4" aria-labelledby="ticket-attachments-heading">
      <h3 id="ticket-attachments-heading" className="font-semibold">Attachments</h3>
      {attachments.length ? (
        <ul className="space-y-2">
          {attachments.map((item) => (
            <li key={item.attachmentUid} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <a className="underline underline-offset-2" href={`/api/tickets/${encodeURIComponent(ticketNumber)}/attachments?id=${encodeURIComponent(item.attachmentUid)}`}>
                {item.filename}
              </a>
              <span className="text-xs text-muted-foreground">
                {(item.size / 1024).toFixed(0)} KB · {new Date(item.uploadedAt).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No files attached.</p>
      )}
    </section>
  );
}
