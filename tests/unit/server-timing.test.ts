import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createServerCorrelationId, timedServerOperation } from "@/lib/server-timing";

describe("server timing diagnostics", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs start before invoking the operation and correlates completion", async () => {
    const events: string[] = [];
    vi.spyOn(console, "info").mockImplementation((value) => { events.push(String(value)); });
    const result = await timedServerOperation("/it", "listTickets", "req-1", async () => {
      expect(JSON.parse(events[0]).phase).toBe("start");
      events.push("operation");
      return 12;
    });
    expect(result).toBe(12);
    expect(events[1]).toBe("operation");
    const complete = JSON.parse(events[2]);
    expect(complete).toMatchObject({ phase: "complete", correlationId: "req-1", route: "/it", operation: "listTickets" });
    expect(complete.durationMs).toEqual(expect.any(Number));
  });

  it("logs sanitized errors and rethrows the original error", async () => {
    const events: string[] = [];
    const error = new Error("private payload and credentials");
    vi.spyOn(console, "info").mockImplementation((value) => { events.push(String(value)); });
    vi.spyOn(console, "error").mockImplementation((value) => { events.push(String(value)); });
    await expect(timedServerOperation("/it", "listTickets", "req-2", async () => { throw error; })).rejects.toBe(error);
    expect(JSON.parse(events[1])).toMatchObject({ phase: "error", correlationId: "req-2", errorName: "Error" });
    expect(events.join(" ")).not.toContain("private payload");
  });

  it("keeps concurrent operations correlated independently", async () => {
    const events: string[] = [];
    vi.spyOn(console, "info").mockImplementation((value) => { events.push(String(value)); });
    await Promise.all([
      timedServerOperation("/it", "one", "req-a", async () => undefined),
      timedServerOperation("/it", "two", "req-b", async () => undefined),
    ]);
    const parsed = events.map((event) => JSON.parse(event));
    expect(parsed.filter((event) => event.phase === "start").map((event) => event.correlationId)).toEqual(["req-a", "req-b"]);
    expect(parsed.filter((event) => event.phase === "complete").map((event) => event.correlationId)).toEqual(["req-a", "req-b"]);
  });

  it("generates a synchronous correlation ID without request headers", async () => {
    const id = createServerCorrelationId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    const events: string[] = [];
    vi.spyOn(console, "info").mockImplementation((value) => { events.push(String(value)); });
    await timedServerOperation("/it", "render", id, async () => undefined);
    expect(events.map((event) => JSON.parse(event).correlationId)).toEqual([id, id]);
  });
});
