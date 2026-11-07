import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createGoogleFormTicket, createOnboardingRequest } = vi.hoisted(() => ({ createGoogleFormTicket: vi.fn(), createOnboardingRequest: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/sql/google-form-intake", () => ({ createGoogleFormTicket, googleFormOperationUid: (formId: string, responseId: string) => `${formId}:${responseId}` }));
vi.mock("@/lib/sql/it-operations", () => ({ createOnboardingRequest }));

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
    createOnboardingRequest.mockResolvedValue({ id: "onboarding-test-id", duplicate: false });
  });

  it("creates a support ticket when optional metadata and attachments are omitted", async () => {
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
    expect(createGoogleFormTicket.mock.calls[0]?.[0]).not.toHaveProperty("attachments");
    expect(createOnboardingRequest).not.toHaveBeenCalled();
  });

  it("requires the New Hire Setup section when that request type is selected", async () => {
    const body = JSON.stringify({
      formId: "approved-form",
      responseId: "response-new-hire-missing-details",
      submittedAt: new Date().toISOString(),
      answers: {
        email: "employee@thelatincenter.org",
        requestType: "New Hire Setup",
        details: "Please prepare this new employee.",
      },
    });

    const response = await POST(signedRequest(body));

    expect(response.status).toBe(422);
    expect(createOnboardingRequest).not.toHaveBeenCalled();
  });

  it("creates a New Hire Setup queue request from the authenticated webhook", async () => {
    const body = JSON.stringify({
      formId: "approved-form",
      responseId: "response-new-hire-1",
      submittedAt: new Date().toISOString(),
      answers: {
        email: "employee@thelatincenter.org",
        requestType: "New Hire Setup",
        details: "Please prepare this new employee.",
        newHire: {
          firstName: "Example",
          lastName: "New Hire",
          startDate: "2026-12-01",
          needByDate: "",
          needs: ["Computer account / Cuenta de computadora", "Email account / Cuenta de correo"],
          locations: ["Remote / Remoto"],
          sharedDriveAccess: "Finance read-only",
          equipmentDetails: "Laptop setup",
        },
      },
    });

    const response = await POST(signedRequest(body));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ ok: true, requestId: "onboarding-test-id", duplicate: false });
    expect(createOnboardingRequest).toHaveBeenCalledWith(expect.objectContaining({
      first_name: "Example",
      last_name: "New Hire",
      start_date: "2026-12-01",
      requested_needs: ["Computer account / Cuenta de computadora", "Email account / Cuenta de correo"],
      work_locations: ["Remote / Remoto"],
      main_contact_email: "employee@thelatincenter.org",
    }), expect.stringMatching(/^google-form:/), expect.any(String));
    expect(createGoogleFormTicket).not.toHaveBeenCalled();
  });

  it("returns a duplicate response for a retried New Hire Setup submission", async () => {
    createOnboardingRequest.mockResolvedValue({ id: "onboarding-test-id", duplicate: true });
    const body = JSON.stringify({
      formId: "approved-form",
      responseId: "response-new-hire-duplicate",
      submittedAt: new Date().toISOString(),
      answers: {
        email: "employee@thelatincenter.org",
        requestType: "New Hire Setup",
        newHire: {
          firstName: "Example",
          lastName: "New Hire",
          startDate: "2026-12-01",
          needByDate: "",
          needs: ["Computer account / Cuenta de computadora"],
          locations: ["Remote / Remoto"],
          sharedDriveAccess: "",
          equipmentDetails: "",
        },
      },
    });

    const response = await POST(signedRequest(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, duplicate: true });
  });
});
