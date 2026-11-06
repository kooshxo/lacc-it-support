BEGIN;
CREATE TABLE IF NOT EXISTS lacc_tickets (
  uid text PRIMARY KEY,
  number text NOT NULL UNIQUE,
  operation_uid text NOT NULL UNIQUE,
  requester_uid text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lacc_tickets_requester ON lacc_tickets(requester_uid);
CREATE TABLE IF NOT EXISTS lacc_ticket_events (
  uid text PRIMARY KEY,
  ticket_uid text NOT NULL REFERENCES lacc_tickets(uid),
  operation_uid text NOT NULL UNIQUE,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lacc_messages (
  uid text PRIMARY KEY,
  ticket_uid text NOT NULL REFERENCES lacc_tickets(uid),
  operation_uid text NOT NULL UNIQUE,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lacc_request_secrets (ticket_uid text PRIMARY KEY REFERENCES lacc_tickets(uid), encrypted_pin text NOT NULL);
COMMIT;
