BEGIN;
CREATE TABLE IF NOT EXISTS lacc_ticket_imports (
  id text PRIMARY KEY,
  source_sha256 text NOT NULL UNIQUE,
  source_id text NOT NULL,
  imported_rows integer NOT NULL,
  ticket_rows integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lacc_ticket_source_rows (
  import_id text NOT NULL REFERENCES lacc_ticket_imports(id),
  source_row integer NOT NULL,
  ticket_uid text REFERENCES lacc_tickets(uid),
  headers jsonb NOT NULL,
  original_values jsonb NOT NULL,
  PRIMARY KEY(import_id, source_row)
);
CREATE INDEX IF NOT EXISTS lacc_ticket_source_rows_ticket ON lacc_ticket_source_rows(ticket_uid);
COMMIT;
