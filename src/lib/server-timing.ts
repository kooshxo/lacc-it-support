import "server-only";
import { randomUUID } from "node:crypto";
import { cache } from "react";

const requestCorrelationId = cache(() => randomUUID());
export function createServerCorrelationId(): string { return requestCorrelationId(); }

export async function timedServerOperation<T>(route: string, operation: string, correlationId: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = new Date();
  console.info(JSON.stringify({ diagnostic: "server-operation", phase: "start", route, operation, correlationId, timestamp: startedAt.toISOString() }));
  try {
    const result = await fn();
    const completedAt = new Date();
    console.info(JSON.stringify({ diagnostic: "server-operation", phase: "complete", route, operation, correlationId, startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), durationMs: completedAt.getTime() - startedAt.getTime() }));
    return result;
  } catch (error) {
    const completedAt = new Date();
    console.error(JSON.stringify({ diagnostic: "server-operation", phase: "error", route, operation, correlationId, startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), durationMs: completedAt.getTime() - startedAt.getTime(), errorName: error instanceof Error ? error.name : "UnknownError" }));
    throw error;
  }
}
