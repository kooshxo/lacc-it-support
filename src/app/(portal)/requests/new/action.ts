'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireEmployee } from '@/lib/authz';
import { getRepository } from '@/lib/excel';
import { badgeRequestSchema } from '@/lib/domain/badge-request';
export async function submitBadgeRequest(_state:{error?:string},form:FormData):Promise<{error?:string}>{
  const employee=await requireEmployee();
  if(process.env.DATA_BACKEND!=='sql') return {error:'Employee requests are not enabled yet.'};
  const parsed=badgeRequestSchema.safeParse(Object.fromEntries(form));
  if(!parsed.success)return {error:parsed.error.issues[0]?.message??'Check the form.'};
  const data=parsed.data;
  if(data.preferredPin && process.env.REQUEST_PIN_COLLECTION_ENABLED !== "true") return {error:"PIN selection is not enabled yet. Submit the access request without a PIN."};
  let number:string;
  try {
    const ticket=await getRepository().createTicket({operationUid:data.operationUid,preferredPin:data.preferredPin||undefined,subject:data.requestType,category:data.requestType,description:[data.details,`Phone: ${data.phone || '—'}`,`Extension: ${data.extension || '—'}`,`Supervisor: ${data.supervisorEmail}`,`Existing badge: ${data.badgeNumber || '—'}`].join('\n'),locationUid:data.location,assetUid:'',impact:'ONE',workBlocked:false,workaroundAvailable:false},{...employee,departmentUid:data.department});
    number=ticket.ticketNumber;
  }catch{return {error:'Your request could not be saved. Please retry this submission.'};}
  revalidatePath('/it'); revalidatePath('/requests'); redirect(`/requests/${number}?created=1`);
}
