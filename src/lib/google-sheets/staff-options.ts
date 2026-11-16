import "server-only";
import { readGoogleSheetValues } from "./client";

const fallbackStaffOptions = ["Duane", "Jose"];
export async function readGoogleSheetStaffOptions(): Promise<string[]> {
  try {
    const values = await readGoogleSheetValues("STAFF_OPTIONS!A2:A");
    const options = values.map((row) => String(row[0] ?? "").trim()).filter(Boolean);
    return [...new Set(options)].sort((a, b) => a.localeCompare(b));
  } catch { return fallbackStaffOptions; }
}
