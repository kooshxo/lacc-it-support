import { describe, expect, it, vi } from "vitest";
import { isSpanishText, translateTicketDescription } from "@/lib/domain/translation";

describe("ticket description translation", () => {
  it("detects Spanish descriptions and leaves English alone", async () => {
    expect(isSpanishText("Mi computadora no funciona")).toBe(true);
    expect(isSpanishText("The laptop cannot connect")).toBe(false);
    expect(await translateTicketDescription("The laptop cannot connect")).toBeNull();
  });

  it("returns a translated Spanish description without changing the original", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([[['My computer does not work', 'Mi computadora no funciona']]]), { status: 200 }));
    await expect(translateTicketDescription("Mi computadora no funciona")).resolves.toBe("My computer does not work");
    expect(fetchMock).toHaveBeenCalledOnce();
    fetchMock.mockRestore();
  });
});
