import { getOptionalEmployee } from "@/lib/authz";
import { getRepository } from "@/lib/excel";
import { AuthorizationError } from "@/lib/excel/repository";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: RouteContext<"/api/tickets/[ticketNumber]">) {
  const actor = await getOptionalEmployee();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { const { ticketNumber } = await context.params; const detail = await getRepository().getTicketByNumber(ticketNumber, actor); if (!detail) return Response.json({ error: "Not found" }, { status: 404 }); return Response.json(detail, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { if (error instanceof AuthorizationError) return Response.json({ error: "Forbidden" }, { status: 403 }); return Response.json({ error: "Support data is temporarily unavailable" }, { status: 503 }); }
}
