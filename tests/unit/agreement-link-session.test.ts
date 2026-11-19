import { describe, expect, it } from "vitest";
import { AGREEMENT_SESSION_HISTORY_KEY, clearAgreementSessionToken, readAgreementSessionToken, storeAgreementSessionToken, tokenFromAgreementHash } from "@/lib/agreements/agreement-link-session";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("public agreement session token recovery", () => {
  const token = "T".repeat(43);
  const entryKey = "8a9e8d9c-5efb-42c3-b771-5b63cde81ee4";

  it("recovers a scrubbed link after refresh from tab session storage", () => {
    const storage = memoryStorage();
    expect(tokenFromAgreementHash(`#token=${token}`)).toBe(token);
    expect(storeAgreementSessionToken(token, entryKey, storage)).toBe(true);
    const state = { [AGREEMENT_SESSION_HISTORY_KEY]: entryKey };

    expect(readAgreementSessionToken("", state, storage)).toBe(token);
    expect(readAgreementSessionToken("", state, storage)).toBe(token);
  });

  it("keeps tokens isolated to each history entry and clears a revoked entry", () => {
    const storage = memoryStorage();
    const secondKey = "0bb4cc98-1068-4e0c-88a0-5af07c27a24d";
    storeAgreementSessionToken(token, entryKey, storage);
    storeAgreementSessionToken("R".repeat(43), secondKey, storage);

    expect(readAgreementSessionToken("", { [AGREEMENT_SESSION_HISTORY_KEY]: entryKey }, storage)).toBe(token);
    expect(readAgreementSessionToken("", { [AGREEMENT_SESSION_HISTORY_KEY]: secondKey }, storage)).toBe("R".repeat(43));
    clearAgreementSessionToken(entryKey, storage);
    expect(readAgreementSessionToken("", { [AGREEMENT_SESSION_HISTORY_KEY]: entryKey }, storage)).toBe("");
    expect(readAgreementSessionToken("", { [AGREEMENT_SESSION_HISTORY_KEY]: secondKey }, storage)).toBe("R".repeat(43));
  });

  it("does not recover a token from persistent storage or malformed history state", () => {
    const storage = memoryStorage();
    storeAgreementSessionToken(token, entryKey, storage);
    expect(readAgreementSessionToken("", null, storage)).toBe("");
    expect(readAgreementSessionToken("", { [AGREEMENT_SESSION_HISTORY_KEY]: "invalid" }, storage)).toBe("");
  });
});
