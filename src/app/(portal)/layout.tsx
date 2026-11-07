import { AppShell } from "@/components/app-shell";
import { requireEmployee } from "@/lib/authz";
import { createServerCorrelationId, timedServerOperation } from "@/lib/server-timing";
export default async function PortalLayout({ children }: { children: React.ReactNode }) { const correlationId = createServerCorrelationId(); console.info(JSON.stringify({diagnostic:"server-operation",phase:"entry",route:"portal-layout",operation:"render",correlationId,timestamp:new Date().toISOString()})); const employee = await timedServerOperation("portal-layout", "requireEmployee", correlationId, () => requireEmployee()); return <AppShell employee={employee}>{children}</AppShell>; }
