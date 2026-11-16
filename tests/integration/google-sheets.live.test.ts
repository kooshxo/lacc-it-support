import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GoogleSheetTicketRepository } from "@/lib/google-sheets/repository";

const enabled = process.env.RUN_GOOGLE_SHEETS_INTEGRATION === "true";
const id = process.env.GOOGLE_SHEETS_TEST_SPREADSHEET_ID;
const missing = !id || !process.env.GOOGLE_SHEETS_CLIENT_ID || !process.env.GOOGLE_SHEETS_CLIENT_SECRET || !process.env.GOOGLE_SHEETS_REFRESH_TOKEN;

const headers = ["Timestamp", "LACC work email / Correo electrónico del LACC", "Department / Departamento", "Phone", "Extension", "What do you need? / ¿Qué necesita?", "Badge", "Badge name", "Describe your problem / Describa su problema", "Describe the badge or access you need", "Existing badge", "Site / building where help is needed", "Full name", "Site / building", "Resolved ?", "Staff Resolved", "Ticket ID", "Status", "Resolved At", "Resolution Details", "Last Updated At"];
const row = (timestamp: string, email: string, ticketId = "") => [timestamp, email, "Test", "555-0100", "100", "Other / Otro", "", "", "Synthetic test request", "", "", "Test Building", "Fictional Requester", "Test Building", "FALSE", "", ticketId, "", "", "", ""];

async function googleRequest(path: string, init: RequestInit = {}) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.GOOGLE_SHEETS_CLIENT_ID!, client_secret: process.env.GOOGLE_SHEETS_CLIENT_SECRET!, refresh_token: process.env.GOOGLE_SHEETS_REFRESH_TOKEN!, grant_type: "refresh_token" }) });
  const token = (await tokenResponse.json() as { access_token?: string }).access_token;
  if (!token) throw new Error("Google test credentials did not return an access token.");
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id!)}/values/${encodeURIComponent(path)}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (!response.ok) throw new Error(`Google Sheets integration request failed (${response.status}).`);
  return response;
}

describe("real Google Sheets adapter integration", () => {
  if (!enabled) {
    it.skip("set RUN_GOOGLE_SHEETS_INTEGRATION=true to run against the synthetic spreadsheet", () => {});
    return;
  }
  if (missing) {
    it("requires a synthetic spreadsheet ID and local OAuth configuration", () => {
      throw new Error("Real Google Sheets integration was requested, but GOOGLE_SHEETS_TEST_SPREADSHEET_ID or OAuth variables are missing.");
    });
    return;
  }
  beforeAll(async () => {
    if (id === "18YbqQZbxXLHm3gI51UH_EphsSW1X7RBueM7YDeOhrfw") throw new Error("Test spreadsheet ID must not be the Production spreadsheet.");
    await googleRequest(`${process.env.GOOGLE_SHEETS_TAB_NAME ?? "TICKETS"}!A1:U5`, { method: "PUT", body: JSON.stringify({ range: `${process.env.GOOGLE_SHEETS_TAB_NAME ?? "TICKETS"}!A1:U5`, majorDimension: "ROWS", values: [headers, row("11/6/2026 23:59:00", "before@example.invalid"), row("11/7/2026 00:01:00", "one@example.invalid", "synthetic-one"), row("11/7/2026 00:02:00", "two@example.invalid") , row("11/7/2026 00:03:00", "three@example.invalid", "synthetic-three")] }) });
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = id;
  });

  it("reads the real sheet through the production adapter", async () => {
    const repo = new GoogleSheetTicketRepository();
    const tickets = await repo.listTickets();
    expect(tickets.map((ticket) => ticket.ticketUid)).toEqual(["synthetic-three", "google-row-4", "google-row-3"]);
  });

  it("writes status metadata through the adapter and re-reads it", async () => {
    const repo = new GoogleSheetTicketRepository();
    const actor = await repo.getEmployeeByEmail("it@example.invalid");
    const ticket = (await repo.listTickets()).find((item) => item.ticketUid === "synthetic-three")!;
    await repo.updateTicket(ticket.ticketUid, { expectedVersion: ticket.version, operationUid: "synthetic-op", status: "IN_PROGRESS" }, actor!);
    await repo.updateTicket(ticket.ticketUid, { expectedVersion: ticket.version, operationUid: "synthetic-op-2", status: "RESOLVED", completedBy: "Synthetic Tech", resolutionNotes: "Synthetic resolution" }, actor!);
    const reread = (await repo.listTickets()).find((item) => item.ticketUid === "synthetic-three")!;
    expect(reread.status).toBe("RESOLVED");
    expect(reread.completedBy).toBe("Synthetic Tech");
    expect(reread.resolutionNotes).toBe("Synthetic resolution");
  });

  it("refuses a stale version", async () => {
    const repo = new GoogleSheetTicketRepository(); const actor = await repo.getEmployeeByEmail("it@example.invalid"); const ticket = (await repo.listTickets()).find((item) => item.ticketUid === "synthetic-three")!;
    await expect(repo.updateTicket(ticket.ticketUid, { expectedVersion: ticket.version + 1, operationUid: "stale", status: "NEW" }, actor!)).rejects.toThrow("changed since");
  });
});
