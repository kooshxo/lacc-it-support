import "server-only";
import { Pool } from "pg";
let pool: Pool | undefined;
export function database() {
  const connectionString = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("SQL storage is not configured.");
  return pool ??= new Pool({ connectionString, max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000 });
}
