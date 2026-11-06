"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AttachmentRecord } from "@/lib/domain/models";
import { Button } from "./ui/button";

const maxFileSize = 3 * 1024 * 1024;

export function TicketAttachments({
  ticketNumber,
  attachments,
  enabled,
}: {
  ticketNumber: string;
  attachments: AttachmentRecord[];
  enabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const form = event.currentTarget;
    const input = form.elements.namedItem("file");
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    if (file.size > maxFileSize) {
      setError("This file is larger than 3 MB. Choose a smaller file.");
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch(
        `/api/tickets/${encodeURIComponent(ticketNumber)}/attachments`,
        { method: "POST", body },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Upload failed. Try again.");
      }
      form.reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

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
      {enabled ? (
        <form onSubmit={upload} className="grid gap-2">
          <label className="grid gap-2 text-sm">
            Add a file
            <input className="block w-full rounded-md border p-2 text-sm" type="file" name="file" accept="image/png,image/jpeg,application/pdf" required />
          </label>
          <p className="text-xs text-muted-foreground">PNG, JPEG, or PDF · maximum 3 MB</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div>
            <Button type="submit" size="sm" disabled={busy}>{busy ? "Uploading…" : "Upload file"}</Button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground" role="status">Uploads will be enabled after ticket storage is migrated.</p>
      )}
    </section>
  );
}
