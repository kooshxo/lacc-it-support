'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAgent } from '@/lib/authz';
import { createAsset,createInventoryIssue,mutateAsset,resolveInventoryIssue } from '@/lib/inventory/repository';
import { ConflictError } from '@/lib/excel/repository';
import { createAgreementForCurrentAssignment, isAgreementStorageReady, revokePendingAgreement, updateAgreementTracking } from '@/lib/sql/agreements';
const text=z.string().trim().max(8000);
const fields=z.object({category:text,manufacturer:text,model:text,serial_number:text,phone_number:text,service_tag:text,inventory_number:text,device_hostname:text,department:text,building:text,room:text,usage_location:text,condition:text,description:text,accessories:text,notes:text,inventory_date:z.union([z.literal(''),z.iso.date()]),purchase_date:z.union([z.literal(''),z.iso.date()]),warranty_expiration:z.union([z.literal(''),z.iso.date()]),purchase_cost:z.union([z.literal(''),z.coerce.number().nonnegative().finite()]),forticlient_installed:z.union([z.literal(''),z.literal('0'),z.literal('1')]).transform(value=>value===''?'':Number(value)),retirement_reason:text});
export async function inventoryAction(form:FormData){
 const actor=await requireAgent();if(process.env.DATA_BACKEND!=='sql')throw new Error('SQL inventory is not enabled.');
 const raw=Object.fromEntries(form),operation=z.enum(['create','save','assign','return','retire','agreement','create_agreement','mark_printed','mark_handed_off','revoke_agreement','issue','resolve_issue']).parse(raw.operation);raw.acknowledgement_required??='';raw.agreement_signed??='';
 let id=String(raw.id||''),target='/inventory';
 try{
  if(operation==='create'){const data=fields.parse(raw),code=z.string().trim().min(1).max(80).parse(raw.asset_code);id=await createAsset({...data,asset_code:code},actor.employeeUid);target=`/inventory/${encodeURIComponent(id)}`;}
  else if(operation==='resolve_issue'){
   const values=z.object({issue_id:z.string().min(1).max(100),resolution:z.string().trim().min(1).max(8000)}).parse(raw);await resolveInventoryIssue(values.issue_id,actor.employeeUid,values.resolution);target='/inventory/issues';
  }else if(operation==='create_agreement'){
   if(!id)throw new Error('Missing asset ID.'); target=`/inventory/${encodeURIComponent(id)}`;if(!await isAgreementStorageReady())throw new Error('Agreement storage is not configured for this database.'); if(raw.confirm_review!=='on')throw new Error('Review the agreement terms and equipment details before creating the link.'); const created=await createAgreementForCurrentAssignment(id); target=`/inventory/agreements#created=${encodeURIComponent(created.token)}&expires=${Date.parse(created.expiresAt)}`;
  }else if(operation==='revoke_agreement'){
   target='/inventory/agreements';if(!await isAgreementStorageReady())throw new Error('Agreement storage is not configured for this database.');await revokePendingAgreement(z.string().min(1).max(100).parse(raw.agreement_id),actor.employeeUid);
  }else if(operation==='mark_printed'||operation==='mark_handed_off'){
   target='/inventory/agreements';if(!await isAgreementStorageReady())throw new Error('Agreement storage is not configured for this database.');await updateAgreementTracking(z.string().min(1).parse(raw.agreement_id),operation==='mark_printed'?'printed_at':'handed_off_at',actor.employeeUid);
  }else{
   const version=z.coerce.number().int().positive().parse(raw.version);if(!id)throw new Error('Missing asset ID.');
   if(operation==='issue'){
    const values=z.object({issue_type:z.enum(['repair','missing','damaged']),issue_notes:text}).parse({issue_type:raw.issue_type,issue_notes:raw.issue_notes});await createInventoryIssue(id,version,actor.employeeUid,values.issue_type,values.issue_notes);
   }else{
    const values=operation==='save'?fields.parse(raw):operation==='assign'?z.object({person_id:z.string().min(1).max(100),purpose:text,issue_date:z.union([z.literal(''),z.iso.date()]),expected_return_date:z.union([z.literal(''),z.iso.date()]),assignment_type:z.string().max(200),usage_location:text,department_program:text,condition_at_issue:z.string().max(100),accessories_issued:text,acknowledgement_required:z.string(),agreement_signed:z.string(),agreement_signed_date:z.union([z.literal(''),z.iso.date()]),agreement_notes:text,notes:text}).parse(raw):operation==='return'?z.object({condition_at_return:z.string().max(100),accessories_returned:text,return_notes:text}).parse(raw):operation==='agreement'?z.object({agreement_signed:z.string(),agreement_signed_date:z.union([z.literal(''),z.iso.date()]),agreement_notes:text}).parse(raw):z.object({retirement_reason:text}).parse(raw);
    await mutateAsset(id,version,actor.employeeUid,operation,values);
   }
   target=`/inventory/${encodeURIComponent(id)}`;
  }
 }catch(error){
  const message=error instanceof ConflictError?(error.message==='An open issue of this type already exists for this asset.'?error.message:'This record changed. Refresh and try again.'):error instanceof z.ZodError?'Check the required fields.':error instanceof Error&&['Only available equipment can be checked out.','Select an active person.','No single open checkout found. Review custody before returning.','Check in equipment before retiring it.','No active checkout found for this asset.','Retired equipment cannot receive a new issue report.','Review the agreement terms and equipment details before creating the link.','Agreement storage is not configured for this database.','Equipment must have an active assigned employee.','The equipment assignment is no longer active.','The assigned employee record is unavailable.','Only an active pending agreement link can be revoked.','Only signed agreements can be printed.','Mark the agreement printed before handoff.'].includes(error.message)?error.message:'Unable to save. Check for a duplicate asset code or a temporary database problem.';
  const errorTarget=operation==='create'?'/inventory/new':operation==='resolve_issue'?'/inventory/issues':operation==='create_agreement'&&id?`/inventory/${encodeURIComponent(id)}`:target;
  redirect(`${errorTarget}?error=${encodeURIComponent(message)}`);
 }
 revalidatePath('/inventory');revalidatePath('/inventory/issues');revalidatePath('/inventory/reports');revalidatePath('/inventory/checkouts');revalidatePath('/inventory/agreements');if(id)revalidatePath(`/inventory/${id}`);revalidatePath('/inventory/people');const fragmentIndex=target.indexOf('#');const redirectTarget=fragmentIndex>=0?`${target.slice(0,fragmentIndex)}?saved=1${target.slice(fragmentIndex)}`:`${target}${target.includes('?')?'&':'?'}saved=1`;redirect(redirectTarget);
}
