BEGIN;
CREATE TABLE IF NOT EXISTS inventory_agreement_forms (
  id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  asset_id text NOT NULL REFERENCES inventory_assets(id),
  person_id text NOT NULL REFERENCES inventory_people(id),
  data jsonb NOT NULL,
  terms_version text NOT NULL DEFAULT 'LACC-LAPTOP-ACKNOWLEDGEMENT-2026-11-17-v1',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SIGNED','PRINTED','HANDED_OFF')),
  signed_at timestamptz,
  printed_at timestamptz,
  handed_off_at timestamptz,
  printed_by text,
  handed_off_by text,
  revoked_at timestamptz,
  revoked_by text,
  access_attempts integer NOT NULL DEFAULT 0 CHECK(access_attempts BETWEEN 0 AND 50),
  sign_attempts integer NOT NULL DEFAULT 0 CHECK(sign_attempts BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE inventory_agreement_forms ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE inventory_agreement_forms ADD COLUMN IF NOT EXISTS terms_version text;
ALTER TABLE inventory_agreement_forms ADD COLUMN IF NOT EXISTS printed_by text;
ALTER TABLE inventory_agreement_forms ADD COLUMN IF NOT EXISTS handed_off_by text;
ALTER TABLE inventory_agreement_forms ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE inventory_agreement_forms ADD COLUMN IF NOT EXISTS revoked_by text;
ALTER TABLE inventory_agreement_forms ADD COLUMN IF NOT EXISTS access_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE inventory_agreement_forms ADD COLUMN IF NOT EXISTS sign_attempts integer NOT NULL DEFAULT 0;
UPDATE inventory_agreement_forms SET terms_version='LEGACY-UNVERSIONED' WHERE terms_version IS NULL;
UPDATE inventory_agreement_forms SET expires_at=created_at+interval '7 days' WHERE expires_at IS NULL;
ALTER TABLE inventory_agreement_forms ALTER COLUMN terms_version SET NOT NULL;
ALTER TABLE inventory_agreement_forms ALTER COLUMN terms_version SET DEFAULT 'LACC-LAPTOP-ACKNOWLEDGEMENT-2026-11-17-v1';
ALTER TABLE inventory_agreement_forms ALTER COLUMN expires_at SET NOT NULL;
ALTER TABLE inventory_agreement_forms ALTER COLUMN expires_at SET DEFAULT (now()+interval '7 days');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='inventory_agreement_forms_sign_attempts_check') THEN
    ALTER TABLE inventory_agreement_forms ADD CONSTRAINT inventory_agreement_forms_sign_attempts_check CHECK (sign_attempts BETWEEN 0 AND 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='inventory_agreement_forms_access_attempts_check') THEN
    ALTER TABLE inventory_agreement_forms ADD CONSTRAINT inventory_agreement_forms_access_attempts_check CHECK (access_attempts BETWEEN 0 AND 50);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS inventory_agreement_forms_asset_idx ON inventory_agreement_forms(asset_id, created_at DESC);
COMMIT;
