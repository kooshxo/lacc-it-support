BEGIN;
ALTER TABLE inventory_people ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE inventory_people ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS inventory_source_records_table_order ON inventory_source_records(table_name,ordinal);
CREATE INDEX IF NOT EXISTS inventory_custody_asset_history ON inventory_custody(asset_id,returned_at);
CREATE TABLE IF NOT EXISTS inventory_audit_events (
 id text PRIMARY KEY,
 entity_type text NOT NULL,
 entity_id text NOT NULL,
 actor_uid text NOT NULL,
 event_type text NOT NULL,
 before_data jsonb,
 after_data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_audit_entity_history ON inventory_audit_events(entity_type,entity_id,created_at DESC);
COMMIT;
