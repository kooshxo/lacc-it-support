#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

if (process.env.VERCEL !== "1") process.exit(0);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be provided by the deployment environment.");
if (!process.env.APP_DATABASE_URL) throw new Error("APP_DATABASE_URL must identify the restricted application role.");
const migration = await readFile(new URL("../migrations/010_auth_login_limits.sql", import.meta.url), "utf8");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  await pool.query(migration);
  const runtimeRole = decodeURIComponent(new URL(process.env.APP_DATABASE_URL).username);
  if (!runtimeRole) throw new Error("Could not identify the restricted application database role.");
  const quotedRole = `"${runtimeRole.replaceAll('"', '""')}"`;
  await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON lacc_auth_login_limits TO ${quotedRole}`);
  process.stdout.write("Applied migration 010_auth_login_limits.sql.\n");
} finally {
  await pool.end();
}
