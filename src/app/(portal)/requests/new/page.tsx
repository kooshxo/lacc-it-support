import { TicketForm } from "@/components/ticket-form";
import { requireEmployee } from "@/lib/authz";
export default async function NewRequestPage(){const employee=await requireEmployee();return <div className="mx-auto max-w-3xl"><div className="mb-8"><p className="text-sm font-medium text-primary">Get IT help</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Tell us what is getting in your way</h1><p className="mt-2 text-muted-foreground">You do not need to diagnose it. A clear description is enough.</p></div><TicketForm defaultLocation={employee.locationUid}/></div>}
