import { describe, expect, it } from "vitest";
import { parseGoogleFormsTimestamp } from "@/lib/google-sheets/time";

describe("Google Forms timestamp parsing", () => {
  it.each(["UTC", "America/New_York"])("uses sheet timezone independent of process TZ (%s)", (processTimeZone) => {
    const previous = process.env.TZ;
    process.env.TZ = processTimeZone;
    try {
      expect(parseGoogleFormsTimestamp("11/07/2026 00:01:00")?.toISOString()).toBe("2026-11-07T05:01:00.000Z");
      expect(parseGoogleFormsTimestamp("11/07/2026 00:03:00")?.toISOString()).toBe("2026-11-07T05:03:00.000Z");
      expect(parseGoogleFormsTimestamp("11/06/2026 23:59:00")?.toISOString()).toBe("2026-11-07T04:59:00.000Z");
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });

  it("handles daylight-saving offsets in the sheet timezone", () => {
    expect(parseGoogleFormsTimestamp("03/08/2026 01:59:00")?.toISOString()).toBe("2026-03-08T06:59:00.000Z");
    expect(parseGoogleFormsTimestamp("07/01/2026 12:00:00")?.toISOString()).toBe("2026-07-01T16:00:00.000Z");
  });
});
