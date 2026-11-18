BEGIN;

ALTER TABLE inventory_agreement_forms
  ADD COLUMN IF NOT EXISTS signature_consent boolean,
  ADD COLUMN IF NOT EXISTS signature_consent_text text,
  ADD COLUMN IF NOT EXISTS signed_pdf bytea,
  ADD COLUMN IF NOT EXISTS signed_pdf_sha256 text;

ALTER TABLE inventory_agreement_forms
  DROP CONSTRAINT IF EXISTS inventory_agreement_forms_status_check;
ALTER TABLE inventory_agreement_forms
  ADD CONSTRAINT inventory_agreement_forms_status_check
  CHECK (status IN ('PENDING','SIGNED','PRINTED','HANDED_OFF','COMPLETED'));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='inventory_agreement_forms_signed_pdf_hash_check') THEN
    ALTER TABLE inventory_agreement_forms ADD CONSTRAINT inventory_agreement_forms_signed_pdf_hash_check
      CHECK (signed_pdf IS NULL OR (octet_length(signed_pdf)>0 AND signed_pdf_sha256 ~ '^[0-9a-f]{64}$'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='inventory_agreement_forms_completed_requires_pdf_check') THEN
    ALTER TABLE inventory_agreement_forms ADD CONSTRAINT inventory_agreement_forms_completed_requires_pdf_check
      CHECK (status <> 'COMPLETED' OR (signed_pdf IS NOT NULL AND signature_consent IS TRUE AND signed_at IS NOT NULL));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS inventory_agreement_events (
  id uuid PRIMARY KEY,
  agreement_id text NOT NULL REFERENCES inventory_agreement_forms(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('LINK_CREATED','ELECTRONICALLY_SIGNED','REVOKED','LEGACY_PRINTED','LEGACY_HANDED_OFF')),
  actor_type text NOT NULL CHECK (actor_type IN ('staff','signer')),
  actor_uid text,
  actor_label text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS inventory_agreement_events_agreement_idx
  ON inventory_agreement_events(agreement_id, occurred_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_agreement_events_single_signature_idx
  ON inventory_agreement_events(agreement_id) WHERE event_type='ELECTRONICALLY_SIGNED';

CREATE OR REPLACE FUNCTION prevent_signed_agreement_document_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.signed_pdf IS NOT NULL AND (to_jsonb(NEW) - 'access_attempts') IS DISTINCT FROM (to_jsonb(OLD) - 'access_attempts') THEN
    RAISE EXCEPTION 'The signed agreement document is immutable.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS inventory_agreement_document_immutable ON inventory_agreement_forms;
CREATE TRIGGER inventory_agreement_document_immutable
  BEFORE UPDATE ON inventory_agreement_forms
  FOR EACH ROW EXECUTE FUNCTION prevent_signed_agreement_document_mutation();

CREATE OR REPLACE FUNCTION prevent_signed_agreement_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.signed_pdf IS NOT NULL THEN
    RAISE EXCEPTION 'A signed agreement record cannot be deleted.';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS inventory_agreement_signed_delete_guard ON inventory_agreement_forms;
CREATE TRIGGER inventory_agreement_signed_delete_guard
  BEFORE DELETE ON inventory_agreement_forms
  FOR EACH ROW EXECUTE FUNCTION prevent_signed_agreement_delete();

CREATE OR REPLACE FUNCTION prevent_agreement_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Agreement history is append-only.';
END $$;
DROP TRIGGER IF EXISTS inventory_agreement_events_immutable ON inventory_agreement_events;
CREATE TRIGGER inventory_agreement_events_immutable
  BEFORE UPDATE OR DELETE ON inventory_agreement_events
  FOR EACH ROW EXECUTE FUNCTION prevent_agreement_event_mutation();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='lacc_runtime') THEN
    GRANT SELECT, INSERT ON inventory_agreement_events TO lacc_runtime;
  END IF;
END $$;

COMMIT;
