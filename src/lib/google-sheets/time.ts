const GOOGLE_SHEETS_TIME_ZONE = "America/Detroit";

function offsetMinutesAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = value.match(/^GMT([+-])(\d{2}):?(\d{2})$/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? minutes : -minutes;
}

/** Parse Google Forms' locale timestamp as a wall-clock time in the sheet timezone. */
export function parseGoogleFormsTimestamp(value: string, timeZone = GOOGLE_SHEETS_TIME_ZONE): Date | null {
  const input = value.trim();
  if (!input) return null;
  // Values already carrying an offset/UTC marker are unambiguous.
  if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(input)) {
    const parsed = new Date(input);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
  }
  const match = input.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(AM|PM)?)?$/i);
  if (!match) {
    const parsed = new Date(input);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  let hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  const second = Number(match[6] ?? 0);
  const millis = Number((match[7] ?? "").padEnd(3, "0") || 0);
  const meridiem = match[8]?.toUpperCase();
  if (meridiem) hour = hour % 12 + (meridiem === "PM" ? 12 : 0);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  // Interpret the wall-clock fields in the sheet timezone. Two iterations handle
  // both standard/DST offsets and dates near a transition without a dependency.
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  let instant = new Date(wall);
  instant = new Date(wall - offsetMinutesAt(instant, timeZone) * 60_000);
  instant = new Date(wall - offsetMinutesAt(instant, timeZone) * 60_000);
  return Number.isNaN(instant.valueOf()) ? null : instant;
}

export const googleSheetsTimeZone = GOOGLE_SHEETS_TIME_ZONE;
