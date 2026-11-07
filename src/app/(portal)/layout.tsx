import { AppShell } from "@/components/app-shell";
import { requireEmployee } from "@/lib/authz";
export default async function PortalLayout({ children }: { children: React.ReactNode }) { const employee = await requireEmployee(); return <AppShell employee={employee}>{children}</AppShell>; }
