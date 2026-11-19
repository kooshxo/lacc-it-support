export const AGREEMENT_SESSION_HISTORY_KEY = "__laccAgreementSessionKey";
const sessionTokenPrefix = "lacc:public-agreement:";

export interface AgreementSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function tokenFromAgreementHash(hash: string) {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(fragment).get("token") || "";
}

export function readAgreementSessionToken(
  hash: string,
  historyState: unknown,
  storage: AgreementSessionStorage,
) {
  const fromHash = tokenFromAgreementHash(hash);
  if (fromHash) return fromHash;

  if (!historyState || typeof historyState !== "object") return "";
  const key = (historyState as Record<string, unknown>)[AGREEMENT_SESSION_HISTORY_KEY];
  if (typeof key !== "string" || !/^[a-f0-9-]{36}$/i.test(key)) return "";
  try {
    return storage.getItem(`${sessionTokenPrefix}${key}`) || "";
  } catch {
    return "";
  }
}

export function storeAgreementSessionToken(token: string, key: string, storage: AgreementSessionStorage) {
  try {
    storage.setItem(`${sessionTokenPrefix}${key}`, token);
    return true;
  } catch {
    return false;
  }
}

export function clearAgreementSessionToken(key: string | undefined, storage: AgreementSessionStorage) {
  if (!key || !/^[a-f0-9-]{36}$/i.test(key)) return;
  try {
    storage.removeItem(`${sessionTokenPrefix}${key}`);
  } catch {
    // Storage may be unavailable in hardened browser contexts. Server checks remain authoritative.
  }
}
