import "server-only";
import type { TicketRepository } from "./repository";
import { FixtureTicketRepository } from "./fixture-repository";
import { GraphTicketRepository } from "./graph-repository";
import { GoogleSheetTicketRepository } from "@/lib/google-sheets/repository";

import { SqlTicketRepository } from "@/lib/sql/repository";

let repository: TicketRepository | undefined;

export function getRepository(): TicketRepository {
  if (repository) return repository;
  // Ticket storage can be selected independently from SQL-backed operations
  // (inventory, authentication, onboarding, and audit history).
  const backend = process.env.TICKET_BACKEND ?? process.env.DATA_BACKEND ?? "graph";
  if (backend === "fixture") {
    if (process.env.NODE_ENV === "production") throw new Error("Fixture data is disabled in production.");
    repository = new FixtureTicketRepository();
  } else if (backend === "sql") {
    repository = new SqlTicketRepository();
  } else if (backend === "google") {
    repository = new GoogleSheetTicketRepository();
  } else {
    repository = new GraphTicketRepository();
  }
  return repository;
}
