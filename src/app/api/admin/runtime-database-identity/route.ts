import { getOptionalEmployee } from "@/lib/authz";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Temporary, read-only deployment identity check. Remove after release verification. */
export async function GET() {
  const actor = await getOptionalEmployee();
  if (!actor) {
    return Response.json({ error: "Authentication required." }, {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  if (actor.role === "EMPLOYEE") {
    return Response.json({ error: "Staff access required." }, {
      status: 403,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const connectionString = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    return Response.json({ error: "Database is not configured." }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  try {
    const connection = new URL(connectionString);
    const databaseName = decodeURIComponent(connection.pathname.replace(/^\//, ""));
    if (!connection.hostname || !databaseName) throw new Error("Invalid database URL");

    return Response.json({
      hostname: connection.hostname,
      database: databaseName,
      vercelEnvironment: process.env.VERCEL_ENV ?? "unknown",
      configuredVariable: process.env.APP_DATABASE_URL ? "APP_DATABASE_URL" : "DATABASE_URL",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Database configuration is invalid." }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
