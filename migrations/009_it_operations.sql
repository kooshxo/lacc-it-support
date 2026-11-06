BEGIN;

-- Sensitive onboarding details and internal network references are IT-only.
-- Credentials/password values are intentionally not represented in this schema.
CREATE TABLE IF NOT EXISTS it_onboarding_requests (
  id text PRIMARY KEY,
  first_name text NOT NULL,
  last_name text NOT NULL,
  start_date date NOT NULL,
  requested_needs jsonb NOT NULL DEFAULT '[]'::jsonb,
  work_locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  shared_drive_access text NOT NULL DEFAULT '',
  equipment_details text NOT NULL DEFAULT '',
  need_by_date date,
  main_contact_email text NOT NULL,
  requested_by text NOT NULL,
  status text NOT NULL DEFAULT 'New' CHECK (status IN ('New','In progress','Complete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS it_onboarding_queue ON it_onboarding_requests(status,created_at DESC);

CREATE TABLE IF NOT EXISTS it_printer_directory (
  id text PRIMARY KEY,
  location text NOT NULL UNIQUE,
  ip_address inet NOT NULL,
  printer_model text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS it_operations_audit (
  id text PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  actor_uid text NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS it_operations_audit_entity ON it_operations_audit(entity_type,entity_id,created_at DESC);

COMMIT;
