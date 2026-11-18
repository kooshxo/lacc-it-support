import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeAgreementSignAttempt: vi.fn(),
  signAgreement: vi.fn(),
  isElectronicAgreementWorkflowEnabled: vi.fn(),
  validateSignerInput: vi.fn(),
}));

vi.mock("@/lib/sql/agreements", () => ({
  consumeAgreementSignAttempt: mocks.consumeAgreementSignAttempt,
  signAgreement: mocks.signAgreement,
}));
vi.mock("@/lib/sql/agreement-state", () => ({
  isElectronicAgreementWorkflowEnabled: mocks.isElectronicAgreementWorkflowEnabled,
  validateSignerInput: mocks.validateSignerInput,
}));

import { POST } from "@/app/api/agreement/sign/route";

const token = "T".repeat(43);
const signerName = "Synthetic Preview Signer";
const signedAt = "2026-11-18T04:47:07.943Z";

function request() {
  return new Request("https://preview.example.test/api/agreement/sign", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://preview.example.test" },
    body: JSON.stringify({ token, signerName, consent: true }),
  });
}

describe("POST /api/agreement/sign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATA_BACKEND = "sql";
    mocks.isElectronicAgreementWorkflowEnabled.mockReturnValue(true);
    mocks.validateSignerInput.mockReturnValue({ valid: true, normalizedName: signerName });
    mocks.consumeAgreementSignAttempt.mockResolvedValue(true);
    mocks.signAgreement.mockResolvedValue({ signedAt, signerName, documentSha256: "f".repeat(64) });
  });

  it("returns a timestamp string after the signing transaction commits", async () => {
    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, signedAt, signerName });
    expect(typeof payload.signedAt).toBe("string");
    expect(mocks.signAgreement).toHaveBeenCalledWith(token, signerName);
  });

  it("does not claim success when the locked transaction finds a stale or completed link", async () => {
    mocks.signAgreement.mockResolvedValue(null);

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.ok).not.toBe(true);
  });
});
