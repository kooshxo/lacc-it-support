import { redirect } from "next/navigation";
import { requireAgent } from "@/lib/authz";

export default async function LegacyOnboardingCreatePage() {
  await requireAgent();
  redirect("/it/onboarding");
}
