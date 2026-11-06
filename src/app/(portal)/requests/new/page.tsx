import { redirect } from 'next/navigation';
import { requireAgent } from '@/lib/authz';

// Employee ticket intake is exclusively the public bilingual Google Form.
// Keep this legacy route closed so portal users cannot create a second class
// of unbridged tickets from inside the IT application.
export default async function NewRequestPage() {
  await requireAgent();
  redirect('/it');
}
