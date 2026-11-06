'use server';
import { requireAgent } from '@/lib/authz';
export async function submitBadgeRequest(_state: { error?: string }, _form: FormData): Promise<{error:string}> {
  await requireAgent();
  return { error: 'Submit employee requests through the public bilingual LACC IT request form.' };
}
