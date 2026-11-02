import { BadgeRequestForm } from '@/components/badge-request-form';
import { requireEmployee } from '@/lib/authz';
export default async function NewRequestPage(){
  const employee=await requireEmployee();
  return <div className="mx-auto max-w-2xl"><h1 className="text-3xl font-semibold">Badge & access request</h1><p className="my-4 text-muted-foreground">Submitting as {employee.displayName} ({employee.email}). Access-only requests do not require a badge.</p>{process.env.DATA_BACKEND==='sql'?<BadgeRequestForm collectPin={process.env.REQUEST_PIN_COLLECTION_ENABLED === "true"}/>:<p>Employee requests are not enabled yet.</p>}</div>;
}
