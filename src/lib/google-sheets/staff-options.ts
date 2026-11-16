import "server-only";
import { readGoogleSheetStaffValidationOptions, readGoogleSheetValidationOptions } from "./client";
const historicalSpreadsheetId = "1pDvb5W1FajPdE4paro-AzJDfr9mI2lCgNad8GXH34EM";
export async function readGoogleSheetStaffOptions(): Promise<string[]> {
  try {
    const live = await readGoogleSheetStaffValidationOptions();
    const historical = live.length ? live : await readGoogleSheetValidationOptions(historicalSpreadsheetId, "IT support request!R1:R4433");
    return [...new Set(historical.filter((name) => !/^tbd$/i.test(name) && !/^staff working the request/i.test(name)))].sort((a, b) => a.localeCompare(b));
  }
  catch { return []; }
}
