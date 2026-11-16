import "server-only";

const productionSpreadsheetId = "18YbqQZbxXLHm3gI51UH_EphsSW1X7RBueM7YDeOhrfw";
const previewSpreadsheetId = "1tCkw89rBVRJjOjjneDbp2MShq8R_2NYah4imdX6-8Ug";
const previewSqlHosts = new Set([
  "ep-shiny-mode-bbsu0bjo-pooler.c-15.us-east-1.aws.neon.tech",
]);

function previewRuntime() {
  return process.env.VERCEL_ENV === "preview";
}

export function assertSafeSpreadsheetConfiguration() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("Google Sheets ticket storage is not configured.");
  if (spreadsheetId === productionSpreadsheetId || spreadsheetId === process.env.GOOGLE_SHEETS_PRODUCTION_SPREADSHEET_ID) {
    throw new Error("The Production Google spreadsheet is blocked by the storage safety guard.");
  }
  if (previewRuntime() && spreadsheetId !== previewSpreadsheetId) {
    throw new Error("Preview Google Sheets storage must use the dedicated synthetic spreadsheet.");
  }
}

export function assertSafeSqlConfiguration(connectionString: string) {
  if (!previewRuntime()) return;
  let host: string;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    throw new Error("Preview SQL storage has an invalid connection URL.");
  }
  if (!previewSqlHosts.has(host)) throw new Error("Preview SQL storage must use the isolated Neon Preview endpoint.");
}
