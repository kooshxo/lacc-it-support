import "server-only";
import { readGoogleSheetStaffValidationOptions } from "./client";
export async function readGoogleSheetStaffOptions(): Promise<string[]> {
  try {
    const validation = await readGoogleSheetStaffValidationOptions();
    return [...new Set(validation.map((name) => name.trim()).filter((name) => name && !/^tbd$/i.test(name)))].sort((a, b) => a.localeCompare(b));
  } catch { return []; }
}
