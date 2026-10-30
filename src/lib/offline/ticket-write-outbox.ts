"use client";

import type { PendingTicketWrite } from "@/lib/domain/schemas";

export type LocalPendingTicketWrite = PendingTicketWrite & { lastError: string };

const databaseName = "lacc-it-support-local-outbox";
const objectStoreName = "ticket-writes";
const localStorageKey = "lacc-it-support-ticket-write-outbox-v1";
export const outboxChangedEvent = "lacc:ticket-write-outbox-changed";
let cachedWrites: LocalPendingTicketWrite[] | null = null;
let pendingRead: Promise<LocalPendingTicketWrite[]> | null = null;
let storageListenerInstalled = false;

function openOutbox(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(objectStoreName)) database.createObjectStore(objectStoreName, { keyPath: "ticketUid" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the local ticket outbox."));
  });
}

function readLocalStorage(): LocalPendingTicketWrite[] {
  try {
    const value = window.localStorage.getItem(localStorageKey);
    if (!value) return [];
    const parsed = JSON.parse(value) as LocalPendingTicketWrite[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalStorage(writes: LocalPendingTicketWrite[]) {
  try {
    window.localStorage.setItem(localStorageKey, JSON.stringify(writes));
    return true;
  } catch {
    return false;
  }
}

function byLatestTicket(writes: LocalPendingTicketWrite[]) {
  const latest = new Map<string, LocalPendingTicketWrite>();
  for (const write of writes) latest.set(write.ticketUid, write);
  return [...latest.values()].sort((a, b) => a.completedAt.localeCompare(b.completedAt));
}

export async function listPendingTicketWrites(): Promise<LocalPendingTicketWrite[]> {
  if (cachedWrites) return cachedWrites;
  if (pendingRead) return pendingRead;
  if (!storageListenerInstalled && typeof window !== "undefined") {
    window.addEventListener("storage", () => { cachedWrites = null; });
    storageListenerInstalled = true;
  }
  const read = (async () => {
    const fallback = readLocalStorage();
    try {
      const database = await openOutbox();
      const records = await new Promise<LocalPendingTicketWrite[]>((resolve, reject) => {
        const request = database.transaction(objectStoreName, "readonly").objectStore(objectStoreName).getAll();
        request.onsuccess = () => resolve(request.result as LocalPendingTicketWrite[]);
        request.onerror = () => reject(request.error ?? new Error("Could not read the local ticket outbox."));
      });
      database.close();
      return byLatestTicket([...fallback, ...records]);
    } catch {
      return byLatestTicket(fallback);
    }
  })();
  pendingRead = read;
  try {
    const writes = await read;
    cachedWrites = writes;
    return writes;
  } finally {
    if (pendingRead === read) pendingRead = null;
  }
}

export async function getPendingTicketWrite(ticketUid: string): Promise<LocalPendingTicketWrite | null> {
  return (await listPendingTicketWrites()).find((write) => write.ticketUid === ticketUid) ?? null;
}

export async function queuePendingTicketWrites(writes: PendingTicketWrite[], lastError: string): Promise<void> {
  if (!writes.length) return;
  const fallback = readLocalStorage();
  const error = lastError.slice(0, 1200);
  const records = writes.map((write) => ({ ...write, lastError: error }));
  const fallbackSaved = writeLocalStorage(byLatestTicket([...fallback, ...records]));
  try {
    const database = await openOutbox();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(objectStoreName, "readwrite");
      const store = transaction.objectStore(objectStoreName);
      records.forEach((record) => store.put(record));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the local ticket outbox."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Could not save the local ticket outbox."));
    });
    database.close();
  } catch {
    if (!fallbackSaved) throw new Error("The ticket update failed, and this browser could not store a local retry copy. Keep this page open and try Save again after storage is available.");
  }
  notifyOutboxChanged();
}

export async function removePendingTicketWrites(writes: PendingTicketWrite[]): Promise<void> {
  if (!writes.length) return;
  const fallback = readLocalStorage().filter((record) => !writes.some((write) => write.ticketUid === record.ticketUid && write.operationUid === record.operationUid));
  const fallbackSaved = writeLocalStorage(fallback);
  try {
    const database = await openOutbox();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(objectStoreName, "readwrite");
      const store = transaction.objectStore(objectStoreName);
      writes.forEach((write) => {
        const request = store.get(write.ticketUid);
        request.onsuccess = () => {
          const stored = request.result as LocalPendingTicketWrite | undefined;
          if (stored?.operationUid === write.operationUid) store.delete(write.ticketUid);
        };
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not update the local ticket outbox."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Could not update the local ticket outbox."));
    });
    database.close();
  } catch {
    if (!fallbackSaved) throw new Error("Could not update the local ticket retry queue.");
  }
  notifyOutboxChanged();
}

export function notifyOutboxChanged() {
  if (typeof window !== "undefined") {
    cachedWrites = null;
    window.dispatchEvent(new Event(outboxChangedEvent));
  }
}
