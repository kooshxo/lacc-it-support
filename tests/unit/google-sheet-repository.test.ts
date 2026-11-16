import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { readTable, updateRow } = vi.hoisted(() => ({ readTable: vi.fn(), updateRow: vi.fn() }));
vi.mock("@/lib/google-sheets/client", () => ({ readGoogleSheetIntakeTable: readTable, updateGoogleSheetIntakeRow: updateRow, columnLetter: (index: number) => { let n = index + 1, result = ""; while (n > 0) { const r = (n - 1) % 26; result = String.fromCharCode(65 + r) + result; n = Math.floor((n - 1) / 26); } return result; } }));

import { GoogleSheetTicketRepository } from "@/lib/google-sheets/repository";

const headers = ["Timestamp", "LACC work email / Correo electrónico del LACC", "Department / Departamento", "Phone", "Extension", "What do you need? / ¿Qué necesita?", "Badge", "Badge name", "Describe your problem / Describa su problema", "Describe the badge or access you need", "Existing badge", "Site / building where help is needed", "Full name", "Site / building", "Requester Full Name / Nombre completo del solicitante", "Resolved ?", "Staff Resolved", "Ticket ID", "Status", "Resolved At", "Resolution Details", "Last Updated At"];
const row = (timestamp: string, overrides: Record<number, string> = []) => {
  const values = Array(22).fill("") as string[]; values[0] = timestamp; values[1] = "person@thelatincenter.org"; values[2] = "ECS"; values[5] = "Other / Otro"; values[8] = "Laptop issue"; values[11] = "Main Building"; values[12] = "Access person"; values[15] = "FALSE";
  for (const [key, value] of Object.entries(overrides)) values[Number(key)] = value;
  return values;
};

describe("Google Sheets ticket adapter", () => {
  beforeEach(() => { readTable.mockReset(); updateRow.mockReset(); readTable.mockResolvedValue({ headers, rows: [] }); });

  it("uses the Q identity when present and ignores pre-cutoff rows", async () => {
    readTable.mockResolvedValue({ headers, rows: [row("11/6/2026 23:59:00"), row("11/7/2026 00:01:00", { 17: "ticket-stable-1" })] });
    const tickets = await new GoogleSheetTicketRepository().listTickets();
    expect(tickets).toHaveLength(1);
    expect(tickets[0].ticketUid).toBe("ticket-stable-1");
  });

  it("reads requester name from its header rather than a fixed column", async () => {
    const reordered = [...headers];
    const nameIndex = reordered.indexOf("Requester Full Name / Nombre completo del solicitante");
    reordered.splice(nameIndex, 1);
    reordered.splice(3, 0, "Requester Full Name / Nombre completo del solicitante");
    const values = row("11/7/2026 00:01:00");
    values[nameIndex] = "Ana Test";
    values.splice(nameIndex, 1);
    values.splice(3, 0, "Ana Test");
    readTable.mockResolvedValue({ headers: reordered, rows: [values] });
    const ticket = (await new GoogleSheetTicketRepository().listTickets())[0];
    expect(ticket.requesterName).toBe("Ana Test");
  });

  it("falls back to O/P when R:U metadata is blank", async () => {
    readTable.mockResolvedValue({ headers, rows: [row("11/7/2026 10:00:00", { 15: "TRUE", 16: "Jose" })] });
    const ticket = (await new GoogleSheetTicketRepository().listTickets())[0];
    expect(ticket.status).toBe("RESOLVED");
    expect(ticket.completedBy).toBe("Jose");
  });

  it("persists Received → In Progress → Solved → Reopened with metadata", async () => {
    const values = row("11/7/2026 10:00:00", { 17: "ticket-stable-2" });
    readTable.mockResolvedValue({ headers, rows: [values] });
    const repo = new GoogleSheetTicketRepository(); const actor = await repo.getEmployeeByEmail("it@thelatincenter.org");
    const ticket = (await repo.listTickets())[0];
    await repo.updateTicket(ticket.ticketUid, { expectedVersion: ticket.version, operationUid: "op-1", status: "IN_PROGRESS" }, actor!);
    expect(updateRow).toHaveBeenLastCalledWith(2, expect.arrayContaining([["S", "IN_PROGRESS"]]), expect.any(Object));
    await repo.updateTicket(ticket.ticketUid, { expectedVersion: ticket.version, operationUid: "op-2", status: "RESOLVED", completedBy: "Duane", resolutionNotes: "Fixed" }, actor!);
    expect(updateRow).toHaveBeenLastCalledWith(2, expect.arrayContaining([["S", "RESOLVED"], ["Q", "Duane"], ["U", "Fixed"]]), expect.any(Object));
    await repo.updateTicket(ticket.ticketUid, { expectedVersion: ticket.version, operationUid: "op-3", status: "NEW" }, actor!);
    expect(updateRow).toHaveBeenLastCalledWith(2, expect.arrayContaining([["S", "NEW"], ["P", "FALSE"], ["T", ""]]), expect.any(Object));
  });

  it("rejects stale versions before writing", async () => {
    readTable.mockResolvedValue({ headers, rows: [row("11/7/2026 10:00:00")] });
    const repo = new GoogleSheetTicketRepository(); const actor = await repo.getEmployeeByEmail("it@thelatincenter.org"); const ticket = (await repo.listTickets())[0];
    await expect(repo.updateTicket(ticket.ticketUid, { expectedVersion: ticket.version + 1, operationUid: "op-stale", status: "RESOLVED" }, actor!)).rejects.toThrow("changed since");
    expect(updateRow).not.toHaveBeenCalled();
  });
});
