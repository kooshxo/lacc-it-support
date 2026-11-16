import "server-only";

const productionSpreadsheetId = "18YbqQZbxXLHm3gI51UH_EphsSW1X7RBueM7YDeOhrfw";
const previewSpreadsheetId = "1tCkw89rBVRJjOjjneDbp2MShq8R_2NYah4imdX6-8Ug";
const previewSqlHosts = new Set([
  "ep-shiny-mode-bbsu0bjo.c-15.us-east-1.aws.neon.tech",
  "ep-shiny-mode-bbsu0bjo-pooler.c-15.us-east-1.aws.neon.tech",
]);
const productionSqlHosts = new Set([
  "ep-green-meadow-bcqt6qig.c-16.us-east-1.aws.neon.tech",
  "ep-green-meadow-bcqt6qig-pooler.c-16.us-east-1.aws.neon.tech",
]);

function runtimeEnvironment(): "preview" | "production" {
  const environment = process.env.VERCEL_ENV;
  if (environment === "preview" || environment === "production") return environment;
  throw new Error("Storage safety requires an explicit Preview or Production runtime environment.");
}

export function assertSafeSpreadsheetConfiguration() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("Google Sheets ticket storage is not configured.");
  const environment = runtimeEnvironment();
  if (environment === "preview" && spreadsheetId !== previewSpreadsheetId) {
    throw new Error("Preview Google Sheets storage must use the dedicated synthetic spreadsheet.");
  }
  if (environment === "production" && spreadsheetId !== productionSpreadsheetId) {
    throw new Error("Production Google Sheets storage must use the approved live spreadsheet.");
  }
}

export function assertSafeSqlConfiguration(connectionString: string) {
  let host: string;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    throw new Error("Preview SQL storage has an invalid connection URL.");
  }
  const environment = runtimeEnvironment();
  const allowedHosts = environment === "preview" ? previewSqlHosts : productionSqlHosts;
  if (!allowedHosts.has(host)) throw new Error(`${environment === "preview" ? "Preview" : "Production"} SQL storage must use the approved Neon endpoint.`);
}
