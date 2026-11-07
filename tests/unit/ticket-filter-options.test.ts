import { describe, expect, it } from "vitest";
import { distinctTrimmedStrings } from "@/lib/domain/filter-options";

describe("distinctTrimmedStrings", () => {
  it("ignores missing or malformed historical values while collecting filter options", () => {
    expect(distinctTrimmedStrings(["Other", undefined, null, " Printer ", "", 7, "Other"]))
      .toEqual(["Other", "Printer"]);
  });
});
