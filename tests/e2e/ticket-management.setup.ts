import { Pool } from "pg";

export default async function seedTicketManagementDatabase() {
  const url = process.env.TEST_TICKETS_DATABASE_URL;
  if (!url) throw new Error("Set TEST_TICKETS_DATABASE_URL to the dedicated local ticket redesign test database.");
  const connection = new URL(url);
  if (!["localhost", "127.0.0.1", "::1"].includes(connection.hostname) || connection.pathname !== "/lacc_ticket_redesign_test") {
    throw new Error("Refusing to seed anything except the dedicated local lacc_ticket_redesign_test database.");
  }
  const pool = new Pool({ connectionString: url, max: 2 });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lacc_tickets(uid text PRIMARY KEY,number text NOT NULL UNIQUE,operation_uid text NOT NULL UNIQUE,requester_uid text NOT NULL,version integer NOT NULL,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS lacc_ticket_events(uid text PRIMARY KEY,ticket_uid text NOT NULL REFERENCES lacc_tickets(uid),operation_uid text NOT NULL UNIQUE,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS lacc_messages(uid text PRIMARY KEY,ticket_uid text NOT NULL REFERENCES lacc_tickets(uid),operation_uid text NOT NULL UNIQUE,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS lacc_attachments(uid text PRIMARY KEY,ticket_uid text NOT NULL REFERENCES lacc_tickets(uid),filename text NOT NULL,mime_type text NOT NULL,size integer NOT NULL,uploaded_by text NOT NULL,uploaded_at timestamptz NOT NULL,content bytea);
    `);
    await pool.query("TRUNCATE lacc_messages,lacc_ticket_events,lacc_attachments,lacc_tickets CASCADE");
    const createdAt = new Date().toISOString();
    const item = {
      ticketUid: "ticket-management-e2e", ticketNumber: "LACC-E2E-100001", operationUid: "ticket-management-e2e-create",
      requesterUid: "employee-e2e", requesterEmail: "employee@thelatincenter.org", requesterName: "Test Requester",
      subject: "Ticket management E2E persistence", description: "An isolated test ticket used to verify save, reload, solve and reopen behavior.",
      category: "Network", priority: "P3", status: "NEW", assigneeUid: "legacy-assignee-to-preserve", departmentUid: "IT",
      locationUid: "Test site", assetUid: "", impact: "ONE", workBlocked: false, workaroundAvailable: true,
      createdAt, updatedAt: createdAt, resolvedAt: "", version: 1,
    };
    await pool.query("INSERT INTO lacc_tickets(uid,number,operation_uid,requester_uid,version,data,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)", [item.ticketUid, item.ticketNumber, item.operationUid, item.requesterUid, item.version, JSON.stringify(item), item.createdAt]);
  } finally {
    await pool.end();
  }
}
