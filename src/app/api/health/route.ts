import { getOptionalEmployee } from "@/lib/authz";
import { getRepository } from "@/lib/excel";
export const dynamic="force-dynamic";
export async function GET(){const actor=await getOptionalEmployee();if(!actor||actor.role!=="ADMIN")return Response.json({error:"Forbidden"},{status:403});return Response.json(await getRepository().healthCheck(),{headers:{"Cache-Control":"private, no-store"}})}
