import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createGoogleFormTicket } = vi.hoisted(() => ({ createGoogleFormTicket: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/sql/google-form-intake", () => ({ createGoogleFormTicket }));

import { POST } from "@/app/api/intake/google-form/route";

const secret = "local-intake-route-test-secret";

function signedRequest(body: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return new Request("http://localhost/api/intake/google-form", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lacc-timestamp": timestamp,
      "x-lacc-signature": signature,
    },
    body,
  });
}

describe("Google Form webhook optional fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATA_BACKEND = "sql";
    process.env.GOOGLE_FORM_SOURCE_ID = "approved-form";
    process.env.GOOGLE_FORM_WEBHOOK_SECRET = secret;
    createGoogleFormTicket.mockResolvedValue({
      duplicate: false,
      ticket: { ticketNumber: "LACC-TEST-1" },
    });
  });

  it("creates a ticket when optional fields are omitted", async () => {
    const body = JSON.stringify({
      formId: "approved-form",
      responseId: "response-optional-fields",
      submittedAt: new Date().toISOString(),
      answers: {
        email: "employee@thelatincenter.org",
        name: "",
        requestType: "Other / Otro",
        details: "Request with omitted optional metadata",
        badgeNumber: "",
        badgeName: "",
      },
    });

    const response = await POST(signedRequest(body));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ ok: true, ticketNumber: "LACC-TEST-1", duplicate: false });
    expect(createGoogleFormTicket).toHaveBeenCalledWith(expect.objectContaining({
      department: "",
      phone: "",
      extension: "",
      location: "",
    }));
  });
});
