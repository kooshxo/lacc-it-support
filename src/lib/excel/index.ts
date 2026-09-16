import "server-only";
import type { TicketRepository } from "./repository";
import { FixtureTicketRepository } from "./fixture-repository";
import { GraphTicketRepository } from "./graph-repository";
import { GoogleSheetTicketRepository } from "@/lib/google-sheets/repository";

let repository: TicketRepository | undefined;

export function getRepository(): TicketRepository {
  if (repository) return repository;
  const backend = process.env.DATA_BACKEND ?? "graph";
  if (backend === "fixture") {
    if (process.env.NODE_ENV === "production") throw new Error("Fixture data is disabled in production.");
    repository = new FixtureTicketRepository();
  } else if (backend === "google") {
    repository = new GoogleSheetTicketRepository();
  } else {
    repository = new GraphTicketRepository();
  }
  return repository;
}
