import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createGoogleFormTicket, type GoogleFormTicketInput } from "@/lib/sql/google-form-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const answer = (max: number) => z.string().trim().max(max).catch("");
const payloadSchema = z.object({
  formId: z.string().trim().min(1).max(256),
  responseId: z.string().trim().min(1).max(256),
  submittedAt: z.string().datetime({ offset: true }),
  answers: z.object({
    email: z.email().max(254).refine((value) => value.toLowerCase().endsWith("@thelatincenter.org")),
    // The current public form only requires work email. Use it as the ticket label
    // unless a later form revision adds a full-name field.
    name: answer(160),
    // Older and conditionally branched form responses may omit these fields.
    department: answer(100),
    phone: answer(60),
    extension: answer(20),
    requestType: z.enum([
      "New badge / Credencial nueva",
      "Replacement badge / Reemplazo de credencial",
      "Access help / Ayuda con el acceso",
      "Other / Otro",
      "New badge",
      "Replacement badge",
      "Access or PIN only",
      "Access / PIN only",
    ]),
    details: answer(4000),
    badgeNumber: answer(80),
    badgeName: answer(160),
    location: answer(160),
  }).strict(),
}).strict();

function validSignature(secret: string, timestamp: string, body: string, signature: string) {
  if (!/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const sentAt = Number(timestamp) * 1000;
  if (Math.abs(Date.now() - sentAt) > 5 * 60 * 1000) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function POST(request: Request) {
  const secret = process.env.GOOGLE_FORM_WEBHOOK_SECRET;
  const sourceFormId = process.env.GOOGLE_FORM_SOURCE_ID;
  if (process.env.DATA_BACKEND !== "sql" || !secret || !sourceFormId) return Response.json({ error: "Intake is not enabled." }, { status: 503 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ error: "Expected JSON." }, { status: 415 });
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > 20_000) return Response.json({ error: "Invalid request size." }, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Missing request body." }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 20_000) { await reader.cancel(); return Response.json({ error: "Invalid request size." }, { status: 413 }); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  if (bytes.byteLength === 0) return Response.json({ error: "Invalid request size." }, { status: 400 });
  const body = new TextDecoder().decode(bytes);
  const timestamp = request.headers.get("x-lacc-timestamp") ?? "";
  const signature = request.headers.get("x-lacc-signature") ?? "";
  if (!validSignature(secret, timestamp, body, signature)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  let untrusted: unknown;
  try { untrusted = JSON.parse(body); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = payloadSchema.safeParse(untrusted);
  if (!parsed.success) return Response.json({ error: "Form fields are invalid or incomplete." }, { status: 422 });
  if (parsed.data.formId !== sourceFormId) return Response.json({ error: "This form is not authorized for ticket intake." }, { status: 403 });
  const answers = parsed.data.answers;
  const requesterName = answers.name || answers.email.toLowerCase();
  const requestTypeMap: Record<string, GoogleFormTicketInput["requestType"]> = {
    "New badge / Credencial nueva": "New badge",
    "Replacement badge / Reemplazo de credencial": "Replacement badge",
    "Access help / Ayuda con el acceso": "Access or PIN only",
    "Other / Otro": "Other",
    "Access / PIN only": "Access or PIN only",
  };
  const requestType = requestTypeMap[answers.requestType] ??
    (["New badge", "Replacement badge", "Access or PIN only", "Other"] as const).find((value) => value === answers.requestType);
  if (!requestType) return Response.json({ error: "This request type is not supported." }, { status: 422 });
  if (requestType === "Replacement badge" && !answers.badgeNumber) {
    return Response.json({ error: "A replacement request requires the existing badge number or 'unknown'." }, { status: 422 });
  }
  if (requestType === "Replacement badge" && !answers.badgeName) {
    return Response.json({ error: "A replacement request requires the name to print on the badge." }, { status: 422 });
  }
  try {
    const result = await createGoogleFormTicket({
      ...parsed.data,
      requesterEmail: answers.email.toLowerCase(),
      requesterName,
      department: answers.department,
      location: answers.location,
      phone: answers.phone,
      extension: answers.extension,
      requestType,
      details: answers.details,
      badgeNumber: answers.badgeNumber,
      badgeName: answers.badgeName,
    });
    return Response.json({ ok: true, ticketNumber: result.ticket.ticketNumber, duplicate: result.duplicate }, { status: result.duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Ticket intake is temporarily unavailable." }, { status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  }
}
