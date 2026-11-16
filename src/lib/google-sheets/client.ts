import "server-only";

import { WorkbookUnavailableError } from "@/lib/excel/repository";
import { assertSafeSpreadsheetConfiguration } from "@/lib/config/runtime-safety";
import { parseGoogleFormsTimestamp } from "./time";
import { ticketMetadataVersion } from "./version";

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
const historicalSpreadsheetId = "1pDvb5W1FajPdE4paro-AzJDfr9mI2lCgNad8GXH34EM";
const columnLetter = (index: number) => { let n = index + 1, result = ""; while (n > 0) { const r = (n - 1) % 26; result = String.fromCharCode(65 + r) + result; n = Math.floor((n - 1) / 26); } return result; };
function assertWritableSpreadsheet() {
  try { assertSafeSpreadsheetConfiguration(); }
  catch (error) { throw new WorkbookUnavailableError(error instanceof Error ? error.message : "Unsafe Google Sheets configuration."); }
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
  try { assertSafeSpreadsheetConfiguration(); }
  catch (error) { throw new WorkbookUnavailableError(error instanceof Error ? error.message : "Unsafe Google Sheets configuration."); }
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId())}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!response.ok) throw new WorkbookUnavailableError(`Google Sheets request failed (${response.status}).`);
  return response;
}

/** Read-only access to the historical requester source. Passwords and writes are never exposed. */
export async function readHistoricalRequesterRows() {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${historicalSpreadsheetId}/values/${encodeURIComponent("IT support request!A1:E")}`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
    cache: "no-store",
  });
  if (!response.ok) throw new WorkbookUnavailableError(`Historical requester lookup failed (${response.status}).`);
  const payload = await response.json() as { values?: unknown[][] };
  return payload.values ?? [];
}

/** Read native data-validation choices from a bounded spreadsheet column. Read-only. */
export async function readGoogleSheetValidationOptions(id: string, range: string): Promise<string[]> {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?includeGridData=true&ranges=${encodeURIComponent(range)}&fields=sheets(data(rowData(values(dataValidation(condition(values(userEnteredValue)))))))`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
    cache: "no-store",
  });
  if (!response.ok) throw new WorkbookUnavailableError(`Google Sheets staff validation lookup failed (${response.status}).`);
  const payload = await response.json() as { sheets?: Array<{ data?: Array<{ rowData?: Array<{ values?: Array<{ dataValidation?: { condition?: { values?: Array<{ userEnteredValue?: string }> } } }> }> }> }> };
  const options = new Set<string>();
  for (const grid of payload.sheets?.flatMap((sheet) => sheet.data ?? []) ?? []) {
    for (const row of grid.rowData ?? []) {
      for (const cell of row.values ?? []) {
        for (const value of cell.dataValidation?.condition?.values ?? []) {
          if (value.userEnteredValue?.trim()) options.add(value.userEnteredValue.trim());
        }
      }
    }
  }
  return [...options];
}

export async function readGoogleSheetStaffValidationOptions(): Promise<string[]> {
  const response = await request("?fields=sheets(properties(title),tables(tableId,range,columnProperties(columnName,columnIndex,columnType,dataValidationRule(condition(type,values(userEnteredValue))))))");
  const payload = await response.json() as { sheets?: Array<{ properties?: { title?: string }; tables?: Array<{ columnProperties?: Array<{ columnName?: string; columnType?: string; dataValidationRule?: { condition?: { type?: string; values?: Array<{ userEnteredValue?: string }> } } }> }> }> };
  const options = new Set<string>();
  for (const sheet of payload.sheets ?? []) {
    if (sheet.properties?.title !== sheetName()) continue;
    for (const table of sheet.tables ?? []) {
      for (const column of table.columnProperties ?? []) {
        if (column.columnName?.trim().toLowerCase() !== "staff resolved") continue;
        if (column.columnType !== "DROPDOWN" || column.dataValidationRule?.condition?.type !== "ONE_OF_LIST") continue;
        for (const value of column.dataValidationRule.condition.values ?? []) {
          if (value.userEnteredValue?.trim()) options.add(value.userEnteredValue.trim());
        }
      }
    }
  }
  return [...options];
}

export async function readGoogleSheetIntakeRows() {
  const range = `${sheetName()}!A2:Z`;
  const response = await request(`/values/${encodeURIComponent(range)}`);
  const payload = await response.json() as { values?: unknown[][] };
  return payload.values ?? [];
}

export async function readGoogleSheetValues(range: string): Promise<unknown[][]> {
  const response = await request(`/values/${encodeURIComponent(range)}`);
  const payload = await response.json() as { values?: unknown[][] };
  return payload.values ?? [];
}

export async function readGoogleSheetIntakeTable() {
  const range = `${sheetName()}!A1:Z`;
  const response = await request(`/values/${encodeURIComponent(range)}`);
  const payload = await response.json() as { values?: unknown[][] };
  const values = payload.values ?? [];
  return { headers: values[0] ?? [], rows: values.slice(1) };
}

export async function updateGoogleSheetIntakeRow(row: number, updates: Array<[string, string]>, expected?: { timestamp: string; email: string; ticketId?: string; version?: number }) {
  assertWritableSpreadsheet();
  return withRowLock(`${spreadsheetId()}:${sheetName()}:${row}`, async () => {
    if (expected) {
      const headerResponse = await request(`/values/${encodeURIComponent(`${sheetName()}!A1:Z1`)}`);
      const headers = ((await headerResponse.json()) as { values?: unknown[][] }).values?.[0] ?? [];
      const currentResponse = await request(`/values/${encodeURIComponent(`${sheetName()}!A${row}:Z${row}`)}`);
      const current = ((await currentResponse.json()) as { values?: unknown[][] }).values?.[0] ?? [];
      const normalized = headers.map((header) => String(header ?? "").trim().toLowerCase());
      const find = (test: (value: string) => boolean) => normalized.findIndex(test);
      const timestampIndex = find((value) => value.startsWith("timestamp"));
      const emailIndex = find((value) => value.includes("lacc work email"));
      const ticketIdIndex = normalized.indexOf("ticket id");
      const resolvedIndex = find((value) => value.startsWith("resolved"));
      const staffIndex = find((value) => value.startsWith("staff resolved"));
      const statusIndex = normalized.indexOf("status");
      const resolvedAtIndex = normalized.indexOf("resolved at");
      const resolutionIndex = normalized.indexOf("resolution details");
      const updatedAtIndex = normalized.indexOf("last updated at");
      const currentTimestamp = String(current[timestampIndex] ?? "").trim();
      const currentEmail = String(current[emailIndex] ?? "").trim().toLowerCase();
      const currentTicketId = String(current[ticketIdIndex] ?? "").trim();
      const currentVersion = ticketMetadataVersion(row, [String(current[updatedAtIndex] ?? "").trim(), String(current[statusIndex] ?? "").trim(), String(current[resolvedAtIndex] ?? "").trim(), String(current[resolutionIndex] ?? "").trim(), String(current[staffIndex] ?? "").trim(), String(current[resolvedIndex] ?? "").trim()]);
      const expectedTimestamp = parseGoogleFormsTimestamp(expected.timestamp)?.getTime();
      const actualTimestamp = parseGoogleFormsTimestamp(currentTimestamp)?.getTime();
      if (!currentTimestamp || !currentEmail || (Number.isFinite(expectedTimestamp) && Number.isFinite(actualTimestamp) && expectedTimestamp !== actualTimestamp) || currentEmail !== expected.email.trim().toLowerCase() || (expected.ticketId && currentTicketId && expected.ticketId !== currentTicketId) || (expected.version !== undefined && currentVersion !== expected.version)) {
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

export { columnLetter };
