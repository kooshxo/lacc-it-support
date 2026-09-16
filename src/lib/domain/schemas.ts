import { z } from "zod";
import { messageTypes, priorities, ticketStatuses } from "./models";

export const ticketCreateSchema = z.object({
  operationUid: z.uuid(),
  subject: z.string().trim().min(4).max(140),
  description: z.string().trim().min(10).max(8000),
  category: z.string().trim().min(2).max(80),
  impact: z.enum(["ONE", "SEVERAL", "MANY"]),
  workBlocked: z.boolean(),
  workaroundAvailable: z.boolean(),
  locationUid: z.string().trim().max(80).default(""),
  assetUid: z.string().trim().max(80).default(""),
});
export type TicketCreateInput = z.infer<typeof ticketCreateSchema>;

export const ticketUpdateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  operationUid: z.uuid(),
  status: z.enum(ticketStatuses).optional(),
  priority: z.enum(priorities).optional(),
  category: z.string().trim().min(2).max(80).optional(),
  assigneeUid: z.string().trim().max(100).optional(),
  completedBy: z.string().trim().min(2).max(100).optional(),
  resolutionNotes: z.string().trim().max(8000).optional(),
});
export type TicketUpdateInput = z.infer<typeof ticketUpdateSchema>;

export const messageCreateSchema = z.object({
  operationUid: z.uuid(),
  type: z.enum(messageTypes),
  body: z.string().trim().min(1).max(8000),
});
export type MessageCreateInput = z.infer<typeof messageCreateSchema>;

export const attachmentSchema = z.object({
  name: z.string().min(1).max(180),
  size: z.number().int().positive().max(10 * 1024 * 1024),
  type: z.enum(["image/png", "image/jpeg", "application/pdf"]),
});
