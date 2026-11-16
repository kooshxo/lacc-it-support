import "server-only";
import { readGoogleSheetStaffValidationOptions, readGoogleSheetValues } from "./client";
export async function readGoogleSheetStaffOptions(): Promise<string[]> {
  try {
    const validation = await readGoogleSheetStaffValidationOptions();
    const values = await readGoogleSheetValues("Q2:Q1000");
    const observed = values.flat().filter((value): value is string => typeof value === "string");
    return [...new Set([...validation, ...observed].map((name) => name.trim()).filter((name) => name && !/^tbd$/i.test(name)))].sort((a, b) => a.localeCompare(b));
  } catch { return []; }
}
