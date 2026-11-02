import "server-only";
import { Pool } from "pg";
let pool: Pool | undefined;
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("SQL storage is not configured.");
  return pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000 });
}
