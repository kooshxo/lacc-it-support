'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAgent } from '@/lib/authz';
import { savePerson } from '@/lib/inventory/repository';
import { ConflictError } from '@/lib/excel/repository';
const blank=z.string().trim().max(4000);
const schema=z.object({person_code:blank,full_name:z.string().trim().min(1).max(300),email:z.union([z.literal(''),z.email().max(320)]),phone:blank,person_type:blank,department:blank,program:blank,job_title:blank,manager_id:blank,manager_name:blank,start_date:z.union([z.literal(''),z.iso.date()]),end_date:z.union([z.literal(''),z.iso.date()]),notes:blank,is_active:z.enum(['true','false'])});
export async function personAction(form:FormData){
 const actor=await requireAgent();if(process.env.DATA_BACKEND!=='sql')throw new Error('SQL inventory is not enabled.');
 const raw=Object.fromEntries(form.entries()),id=typeof raw.id==='string'&&raw.id?raw.id:null;
 try{const values=schema.parse(raw);await savePerson(id,id?z.coerce.number().int().positive().parse(raw.version):null,actor.employeeUid,{...values,is_active:values.is_active==='true'});}
 catch(error){const message=error instanceof ConflictError?'This person record changed. Refresh and try again.':error instanceof z.ZodError?'Check the required fields and email address.':'Unable to save this person record.';redirect(`/inventory/people${id?`/${encodeURIComponent(id)}`:'/new'}?error=${encodeURIComponent(message)}`);}
 revalidatePath('/inventory/people');revalidatePath('/inventory');redirect(`/inventory/people${id?`/${encodeURIComponent(id)}`:'/new'}?saved=1`);
}
