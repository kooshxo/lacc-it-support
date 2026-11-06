import { redirect } from "next/navigation";
import { requireAgent } from "@/lib/authz";

// Employee self-service pages are not part of the IT portal. Employees submit
// through the public bilingual Google Form; IT uses the support inbox.
export default async function RequestsPage() {
  await requireAgent();
  redirect("/it");
}
