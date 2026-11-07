import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { Pool } from "pg";
import type { Employee, Ticket } from "@/lib/domain/models";
import { ConflictError } from "@/lib/excel/repository";
import { SqlTicketRepository } from "@/lib/sql/repository";
import { effectiveCompletedBy, isTicketResolved } from "@/lib/domain/resolution";

const url = process.env.TEST_TICKETS_DATABASE_URL;
const describePg = url ? describe : describe.skip;
const pool = url ? new Pool({ connectionString: url, max: 4 }) : undefined;
const actor: Employee = { employeeUid:"shared-it",email:"it-staff@shared.invalid",displayName:"IT Staff",departmentUid:"IT",locationUid:"",role:"IT_AGENT",active:true };

function ticket(uid: string, overrides: Partial<Ticket> = {}): Ticket {
  return { ticketUid:uid,ticketNumber:`LACC-${uid}`,operationUid:`create-${uid}`,requesterUid:"employee-1",requesterEmail:"employee@thelatincenter.org",requesterName:"Test Requester",subject:"VPN access",description:"VPN disconnects during work.",category:"Network",priority:"P3",status:"NEW",assigneeUid:"legacy-assignee-value",departmentUid:"IT",locationUid:"Main Building",assetUid:"",impact:"ONE",workBlocked:true,workaroundAvailable:false,createdAt:"2026-08-01T12:00:00.000Z",updatedAt:"2026-08-01T12:00:00.000Z",resolvedAt:"",version:1,...overrides };
}

async function seed(item: Ticket) {
  await pool!.query("INSERT INTO lacc_tickets(uid,number,operation_uid,requester_uid,version,data,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)", [item.ticketUid,item.ticketNumber,item.operationUid,item.requesterUid,item.version,JSON.stringify(item),item.createdAt]);
}

describePg("SQL ticket management persistence", () => {
  beforeAll(async () => {
    const connection = new URL(url!);
    if (!["localhost","127.0.0.1","::1"].includes(connection.hostname) || !/^\/lacc_ticket_redesign_test(?:_[a-z0-9_]+)?$/.test(connection.pathname)) throw new Error("Refusing ticket-management integration tests outside a dedicated local lacc_ticket_redesign_test database.");
    process.env.APP_DATABASE_URL = url!;
    process.env.DATA_BACKEND = "sql";
    process.env.NOTIFICATIONS_ENABLED = "false";
    await pool!.query(`
      CREATE TABLE IF NOT EXISTS lacc_tickets(uid text PRIMARY KEY,number text NOT NULL UNIQUE,operation_uid text NOT NULL UNIQUE,requester_uid text NOT NULL,version integer NOT NULL,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS lacc_ticket_events(uid text PRIMARY KEY,ticket_uid text NOT NULL REFERENCES lacc_tickets(uid),operation_uid text NOT NULL UNIQUE,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS lacc_messages(uid text PRIMARY KEY,ticket_uid text NOT NULL REFERENCES lacc_tickets(uid),operation_uid text NOT NULL UNIQUE,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS lacc_attachments(uid text PRIMARY KEY,ticket_uid text NOT NULL REFERENCES lacc_tickets(uid),filename text NOT NULL,mime_type text NOT NULL,size integer NOT NULL,uploaded_by text NOT NULL,uploaded_at timestamptz NOT NULL,content bytea);
    `);
  });

  beforeEach(async () => {
    await pool!.query("TRUNCATE lacc_messages,lacc_ticket_events,lacc_attachments,lacc_tickets CASCADE");
  });

  afterAll(async () => { await pool?.end(); });

  it("persists multiple edits across fresh repository reads without resetting unrelated fields", async () => {
    const repo = new SqlTicketRepository();
    const item = ticket("persist-flow", { priority:"P4", resolutionNotes:"Existing resolution context" });
    const historical = ticket("historical-preserved", { status:"CLOSED", sourceSpreadsheetRow:88, sourceSolvedValue:"Yes", historicalStaff:"Legacy technician" });
    await seed(item); await seed(historical);

    const priorityEdit = await repo.updateTicket(item.ticketUid,{expectedVersion:1,operationUid:"edit-priority",status:"NEW",priority:"P2"},actor);
    expect(priorityEdit).toMatchObject({status:"NEW",priority:"P2",resolutionNotes:"Existing resolution context",resolvedAt:""});
    const persistedPriority = (await pool!.query<{data:Ticket}>("SELECT data FROM lacc_tickets WHERE uid=$1",[item.ticketUid])).rows[0].data;
    expect(persistedPriority).toMatchObject({status:"NEW",priority:"P2",resolutionNotes:"Existing resolution context"});

    const inProgress = await repo.updateTicket(item.ticketUid,{expectedVersion:2,operationUid:"edit-in-progress",status:"IN_PROGRESS"},actor);
    expect(inProgress).toMatchObject({status:"IN_PROGRESS",priority:"P2",resolutionNotes:"Existing resolution context"});
    const solved = await repo.updateTicket(item.ticketUid,{expectedVersion:3,operationUid:"edit-solve",status:"RESOLVED",priority:"P2",completedBy:"Tech A",resolutionNotes:"Reinstalled the VPN profile"},actor);
    expect(solved).toMatchObject({status:"RESOLVED",priority:"P2",completedBy:"Tech A",resolutionNotes:"Reinstalled the VPN profile"});
    expect(Number.isNaN(Date.parse(solved.resolvedAt))).toBe(false);
    const resolutionAt = solved.resolvedAt;

    const onlyPriority = await repo.updateTicket(item.ticketUid,{expectedVersion:4,operationUid:"edit-solved-priority",status:"RESOLVED",priority:"P1",completedBy:"Tech A",resolutionNotes:"Reinstalled the VPN profile"},actor);
    expect(onlyPriority.resolvedAt).toBe(resolutionAt);
    const detail = await repo.getTicketByNumber(item.ticketNumber,actor);
    expect(detail?.ticket).toMatchObject({status:"RESOLVED",priority:"P1",completedBy:"Tech A",resolutionNotes:"Reinstalled the VPN profile"});

    const reopened = await repo.updateTicket(item.ticketUid,{expectedVersion:5,operationUid:"edit-reopen",status:"IN_PROGRESS"},actor);
    expect(reopened).toMatchObject({status:"IN_PROGRESS",priority:"P1",completedBy:"",resolvedAt:""});
    expect(isTicketResolved(reopened)).toBe(false);
    const preserved = (await pool!.query<{data:Ticket}>("SELECT data FROM lacc_tickets WHERE uid=$1",[historical.ticketUid])).rows[0].data;
    expect(preserved).toMatchObject({status:"CLOSED",sourceSolvedValue:"Yes",historicalStaff:"Legacy technician"});
    expect((await pool!.query("SELECT count(*)::int AS n FROM lacc_tickets")).rows[0].n).toBe(2);
  });

  it("does not infer Completed By from the shared staff identity and stores internal notes atomically", async () => {
    const repo = new SqlTicketRepository();
    const item = ticket("shared-identity"); await seed(item);
    const solved = await repo.updateTicket(item.ticketUid,{expectedVersion:1,operationUid:"shared-solve",status:"RESOLVED",internalNote:"Checked the endpoint protection policy."},actor);
    expect(solved.completedBy).toBe("");
    expect(effectiveCompletedBy(solved)).toBe("");
    const detail = await repo.getTicketByNumber(item.ticketNumber,actor);
    expect(detail?.messages).toHaveLength(1);
    expect(detail?.messages[0]).toMatchObject({type:"INTERNAL_NOTE",body:"Checked the endpoint protection policy.",authorName:"IT Staff"});
    expect((await pool!.query("SELECT count(*)::int AS n FROM lacc_ticket_events WHERE ticket_uid=$1",[item.ticketUid])).rows[0].n).toBe(1);
  });

  it("rejects concurrent stale edits and leaves one canonical version", async () => {
    const repo = new SqlTicketRepository();
    const item = ticket("concurrent-edit"); await seed(item);
    const results = await Promise.allSettled([
      repo.updateTicket(item.ticketUid,{expectedVersion:1,operationUid:"concurrent-a",status:"NEW",priority:"P2"},actor),
      repo.updateTicket(item.ticketUid,{expectedVersion:1,operationUid:"concurrent-b",status:"NEW",resolutionNotes:"Other editor"},actor),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected");
    expect(failed?.status === "rejected" && failed.reason).toBeInstanceOf(ConflictError);
    const persisted = (await pool!.query<{data:Ticket}>("SELECT data FROM lacc_tickets WHERE uid=$1",[item.ticketUid])).rows[0].data;
    expect(persisted.version).toBe(2);
  });
});
