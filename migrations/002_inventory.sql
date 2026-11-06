BEGIN;
CREATE TABLE IF NOT EXISTS inventory_imports (
 id text PRIMARY KEY, source_sha256 text NOT NULL UNIQUE, metadata jsonb NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inventory_source_records (
 import_id text NOT NULL REFERENCES inventory_imports(id), table_name text NOT NULL,
 ordinal integer NOT NULL, data jsonb NOT NULL, PRIMARY KEY(import_id,table_name,ordinal)
);
CREATE TABLE IF NOT EXISTS inventory_people (
 id text PRIMARY KEY, source_import_id text REFERENCES inventory_imports(id), data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory_assets (
 id text PRIMARY KEY, source_import_id text REFERENCES inventory_imports(id),
 version integer NOT NULL DEFAULT 1, data jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_asset_code ON inventory_assets((data->>'asset_code'));
CREATE TABLE IF NOT EXISTS inventory_custody (
 id text PRIMARY KEY, asset_id text NOT NULL REFERENCES inventory_assets(id),
 person_id text NOT NULL REFERENCES inventory_people(id),
 source_import_id text REFERENCES inventory_imports(id), returned_at timestamptz,
 data jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_one_open_custody ON inventory_custody(asset_id) WHERE returned_at IS NULL;
CREATE TABLE IF NOT EXISTS inventory_changes (
 id text PRIMARY KEY, asset_id text NOT NULL REFERENCES inventory_assets(id), actor_uid text NOT NULL,
 event_type text NOT NULL, before_data jsonb, after_data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
