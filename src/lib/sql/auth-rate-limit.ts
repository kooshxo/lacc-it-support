import "server-only";
import { createHmac } from "node:crypto";
import { database } from "@/lib/sql/client";

const maxAttemptsPerWindow = 8;

function keyFor(address: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Authentication signing secret is not configured.");
  return createHmac("sha256", secret).update(address.slice(0, 200)).digest("hex");
}

export async function consumeSharedLoginAttempt(address: string): Promise<boolean> {
  const key = keyFor(address);
  const result = await database().query<{ attempts: number }>(`
    INSERT INTO lacc_auth_login_limits (key_hash, attempts, reset_at, updated_at)
    VALUES ($1, 1, now() + interval '15 minutes', now())
    ON CONFLICT (key_hash) DO UPDATE SET
      attempts = CASE WHEN lacc_auth_login_limits.reset_at <= now() THEN 1
        ELSE LEAST(lacc_auth_login_limits.attempts + 1, $2) END,
      reset_at = CASE WHEN lacc_auth_login_limits.reset_at <= now()
        THEN now() + interval '15 minutes' ELSE lacc_auth_login_limits.reset_at END,
      updated_at = now()
    RETURNING attempts
  `, [key, maxAttemptsPerWindow + 1]);
  if (Math.random() < 0.02) {
    await database().query("DELETE FROM lacc_auth_login_limits WHERE reset_at < now() - interval '1 day'");
  }
  return (result.rows[0]?.attempts ?? maxAttemptsPerWindow + 1) <= maxAttemptsPerWindow;
}

export async function clearSharedLoginAttempts(address: string): Promise<void> {
  await database().query("DELETE FROM lacc_auth_login_limits WHERE key_hash = $1", [keyFor(address)]);
}
