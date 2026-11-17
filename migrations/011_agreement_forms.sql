BEGIN;
CREATE TABLE IF NOT EXISTS inventory_agreement_forms (
  id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  asset_id text NOT NULL REFERENCES inventory_assets(id),
  person_id text NOT NULL REFERENCES inventory_people(id),
  data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SIGNED','PRINTED','HANDED_OFF')),
  signed_at timestamptz,
  printed_at timestamptz,
  handed_off_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_agreement_forms_asset_idx ON inventory_agreement_forms(asset_id, created_at DESC);
COMMIT;
