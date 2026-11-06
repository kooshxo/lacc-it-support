BEGIN;
CREATE TABLE IF NOT EXISTS inventory_issues (
 id text PRIMARY KEY,
 asset_id text NOT NULL REFERENCES inventory_assets(id),
 issue_type text NOT NULL CHECK (issue_type IN ('repair','missing','damaged')),
 status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Resolved')),
 reported_by text NOT NULL,
 reported_at timestamptz NOT NULL DEFAULT now(),
 resolution text NOT NULL DEFAULT '',
 resolved_by text,
 resolved_at timestamptz,
 data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_one_open_issue_type ON inventory_issues(asset_id,issue_type) WHERE status='Open';
CREATE INDEX IF NOT EXISTS inventory_issue_queue ON inventory_issues(status,reported_at DESC);
COMMIT;
