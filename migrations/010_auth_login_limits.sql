BEGIN;
CREATE TABLE IF NOT EXISTS lacc_auth_login_limits (
  key_hash text PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts >= 0),
  reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lacc_auth_login_limits_expiry ON lacc_auth_login_limits(reset_at);
COMMIT;
