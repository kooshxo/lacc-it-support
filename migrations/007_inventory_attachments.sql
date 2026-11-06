BEGIN;
CREATE TABLE IF NOT EXISTS inventory_attachments (
 id text PRIMARY KEY,
 asset_id text NOT NULL REFERENCES inventory_assets(id) ON DELETE CASCADE,
 category text NOT NULL CHECK (category IN ('agreement','repair','other')),
 filename text NOT NULL,
 mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','application/pdf')),
 size integer NOT NULL CHECK (size > 0 AND size <= 3145728),
 uploaded_by text NOT NULL,
 uploaded_at timestamptz NOT NULL DEFAULT now(),
 content bytea NOT NULL
);
CREATE INDEX IF NOT EXISTS inventory_attachments_asset ON inventory_attachments(asset_id,uploaded_at);
COMMIT;
