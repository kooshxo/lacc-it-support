import "server-only";

import { WorkbookUnavailableError } from "@/lib/excel/repository";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new WorkbookUnavailableError(`Google Sheets setting ${name} is not configured.`);
  return value;
};

async function accessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: required("GOOGLE_SHEETS_CLIENT_ID"),
      client_secret: required("GOOGLE_SHEETS_CLIENT_SECRET"),
      refresh_token: required("GOOGLE_SHEETS_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new WorkbookUnavailableError("Google OAuth could not provide a Sheets access token.");
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new WorkbookUnavailableError("Google OAuth returned no Sheets access token.");
  return payload.access_token;
}

const sheetName = () => process.env.GOOGLE_SHEETS_TAB_NAME ?? "your-sheet-tab";
const spreadsheetId = () => required("GOOGLE_SHEETS_SPREADSHEET_ID");
const productionSpreadsheetId = "18YbqQZbxXLHm3gI51UH_EphsSW1X7RBueM7YDeOhrfw";
function assertWritableSpreadsheet() {
  if (spreadsheetId() === productionSpreadsheetId || spreadsheetId() === process.env.GOOGLE_SHEETS_PRODUCTION_SPREADSHEET_ID) {
    throw new WorkbookUnavailableError("Writes to the LACC Production spreadsheet are disabled by the integration-test safety guard.");
  }
}
const rowLocks = new Map<string, Promise<void>>();

async function withRowLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = rowLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  rowLocks.set(key, current);
  await previous;
  try { return await operation(); }
  finally { release(); if (rowLocks.get(key) === current) rowLocks.delete(key); }
}

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId())}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!response.ok) throw new WorkbookUnavailableError(`Google Sheets request failed (${response.status}).`);
  return response;
}

export async function markGoogleSheetTicketCompleted(ticketNumber: string, staffName: string, completedAt: string) {
  const range = `${sheetName()}!S2:S`;
  const valuesResponse = await request(`/values/${encodeURIComponent(range)}`);
  const values = await valuesResponse.json() as { values?: unknown[][] };
  const offset = (values.values ?? []).findIndex((row) => String(row[0] ?? "").trim() === ticketNumber.trim());
  if (offset < 0) throw new WorkbookUnavailableError(`The source intake row for ticket ${ticketNumber} could not be found.`);
  const row = offset + 2;
  const body = {
    valueInputOption: "USER_ENTERED",
    data: [
      { range: `${sheetName()}!K${row}`, values: [["Yes"]] },
      { range: `${sheetName()}!P${row}`, values: [[completedAt]] },
      { range: `${sheetName()}!R${row}`, values: [[staffName]] },
    ],
  };
  await request("/values:batchUpdate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function readGoogleSheetIntakeRows() {
  const range = `${sheetName()}!A2:U`;
  const response = await request(`/values/${encodeURIComponent(range)}`);
  const payload = await response.json() as { values?: unknown[][] };
  return payload.values ?? [];
}

export async function readGoogleSheetIntakeTable() {
  const range = `${sheetName()}!A1:U`;
  const response = await request(`/values/${encodeURIComponent(range)}`);
  const payload = await response.json() as { values?: unknown[][] };
  const values = payload.values ?? [];
  return { headers: values[0] ?? [], rows: values.slice(1) };
}

export async function updateGoogleSheetIntakeRow(row: number, updates: Array<[string, string]>, expected?: { timestamp: string; email: string; ticketId?: string }) {
  assertWritableSpreadsheet();
  return withRowLock(`${spreadsheetId()}:${sheetName()}:${row}`, async () => {
    if (expected) {
      const currentResponse = await request(`/values/${encodeURIComponent(`${sheetName()}!A${row}:Q${row}`)}`);
      const current = ((await currentResponse.json()) as { values?: unknown[][] }).values?.[0] ?? [];
      const currentTimestamp = String(current[0] ?? "").trim();
      const currentEmail = String(current[1] ?? "").trim().toLowerCase();
      const currentTicketId = String(current[16] ?? "").trim();
      const expectedTimestamp = new Date(expected.timestamp).getTime();
      const actualTimestamp = new Date(currentTimestamp).getTime();
      if (!currentTimestamp || !currentEmail || (Number.isFinite(expectedTimestamp) && Number.isFinite(actualTimestamp) && expectedTimestamp !== actualTimestamp) || currentEmail !== expected.email.trim().toLowerCase() || (expected.ticketId && currentTicketId && expected.ticketId !== currentTicketId)) {
        throw new WorkbookUnavailableError("The spreadsheet row changed identity; refresh before saving.");
      }
    }
    await request("/values:batchUpdate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: updates.map(([column, value]) => ({ range: `${sheetName()}!${column}${row}`, values: [[value]] })),
      }),
    });
  });
}
