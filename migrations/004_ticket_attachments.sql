BEGIN;
CREATE TABLE IF NOT EXISTS lacc_attachments (
  uid text PRIMARY KEY,
  ticket_uid text NOT NULL REFERENCES lacc_tickets(uid) ON DELETE CASCADE,
  filename text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','application/pdf')),
  size integer NOT NULL CHECK (size > 0 AND size <= 3145728),
  uploaded_by text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  content bytea NOT NULL
);
CREATE INDEX IF NOT EXISTS lacc_attachments_ticket ON lacc_attachments(ticket_uid, uploaded_at);
COMMIT;
