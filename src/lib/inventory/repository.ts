import 'server-only';
import { randomUUID } from 'node:crypto';
import { database } from '@/lib/sql/client';
import { ConflictError, NotFoundError } from '@/lib/excel/repository';
export type InventoryRecord=Record<string, unknown>;
export type AssetRow={id:string;version:number;data:InventoryRecord};
export type PersonRow={id:string;version:number;data:InventoryRecord};
export type InventoryAttachment={id:string;asset_id:string;category:string;filename:string;mime_type:string;size:number;uploaded_by:string;uploaded_at:Date};
export class InventoryAttachmentLimitError extends Error{}
export async function listAssets(query='',status='',category=''){
 return (await database().query<AssetRow>(`SELECT id,version,data FROM inventory_assets WHERE ($1='' OR data::text ILIKE '%' || $1 || '%') AND ($2='' OR data->>'status'=$2) AND ($3='' OR data->>'category'=$3) ORDER BY data->>'asset_code' LIMIT 500`,[query,status,category])).rows;
}
export async function getAsset(id:string){return(await database().query<AssetRow>('SELECT id,version,data FROM inventory_assets WHERE id=$1',[id])).rows[0]??null;}
export async function listPeople(){return(await database().query<PersonRow>('SELECT id,version,data FROM inventory_people ORDER BY data->>\'full_name\'')).rows;}
export async function getPerson(id:string){return(await database().query<PersonRow>('SELECT id,version,data FROM inventory_people WHERE id=$1',[id])).rows[0]??null;}
export async function savePerson(id:string|null,version:number|null,actor:string,values:InventoryRecord){
 const client=await database().connect(),personId=id||randomUUID(),now=new Date().toISOString();
 const data:InventoryRecord={...values,id:personId,updated_at:now};
 try{await client.query('BEGIN');
  if(id){const holderRows=await client.query<AssetRow>(`SELECT id,version,data FROM inventory_assets WHERE data->>'current_holder_person_id'=$1 ORDER BY id FOR UPDATE`,[id]);const before=(await client.query<PersonRow>('SELECT id,version,data FROM inventory_people WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!before)throw new NotFoundError();if(before.version!==version)throw new ConflictError();
   await client.query('UPDATE inventory_people SET version=version+1,updated_at=now(),data=$1 WHERE id=$2',[JSON.stringify(data),id]);
   await client.query(`UPDATE inventory_custody SET data=data || jsonb_build_object('person_name',$2::text,'recipient_email',$3::text,'department_program',COALESCE(NULLIF($4::text,''),NULLIF($5::text,''),data->>'department_program')) WHERE person_id=$1 AND returned_at IS NULL`,[id,String(data.full_name||''),String(data.email||''),String(data.department||''),String(data.program||'')]);
   for(const holder of holderRows.rows){const after={...holder.data,holder_name:data.full_name,updated_at:now};await client.query('UPDATE inventory_assets SET version=version+1,data=$1,updated_at=now() WHERE id=$2',[JSON.stringify(after),holder.id]);await client.query('INSERT INTO inventory_changes(id,asset_id,actor_uid,event_type,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),holder.id,actor,'RECIPIENT_UPDATED',JSON.stringify(holder.data),JSON.stringify(after)]);}
   await client.query('INSERT INTO inventory_audit_events(id,entity_type,entity_id,actor_uid,event_type,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),'person',id,actor,'UPDATED',JSON.stringify(before.data),JSON.stringify(data)]);
  }else{
   await client.query('INSERT INTO inventory_people(id,data) VALUES($1,$2)',[personId,JSON.stringify(data)]);
   await client.query('INSERT INTO inventory_audit_events(id,entity_type,entity_id,actor_uid,event_type,after_data) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),'person',personId,actor,'CREATED',JSON.stringify(data)]);
  }
  await client.query('COMMIT');return personId;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function inventorySummary(){
 const [states,categories,people,open,events,issues]=await Promise.all([
  database().query<{label:string;count:number}>(`SELECT COALESCE(data->>'status','Unknown') AS label,count(*)::int AS count FROM inventory_assets GROUP BY 1 ORDER BY 1`),
  database().query<{label:string;count:number}>(`SELECT COALESCE(NULLIF(data->>'category',''),'Uncategorized') AS label,count(*)::int AS count FROM inventory_assets GROUP BY 1 ORDER BY 1`),
  database().query<{count:number}>(`SELECT count(*)::int AS count FROM inventory_people WHERE COALESCE((data->>'is_active')::boolean,true)`),
  database().query<{count:number}>(`SELECT count(*)::int AS count FROM inventory_custody WHERE returned_at IS NULL`),
  database().query<{count:number}>(`SELECT count(*)::int AS count FROM inventory_changes`),
  database().query<{count:number}>(`SELECT count(*)::int AS count FROM inventory_issues WHERE status='Open'`)
 ]);
 return {states:states.rows,categories:categories.rows,activePeople:people.rows[0]?.count??0,openCheckouts:open.rows[0]?.count??0,appChanges:events.rows[0]?.count??0,openIssues:issues.rows[0]?.count??0};
}
export async function listOpenCustody(){return(await database().query<{id:string;asset_id:string;person_id:string;data:InventoryRecord}>('SELECT id,asset_id,person_id,data FROM inventory_custody WHERE returned_at IS NULL ORDER BY data->>\'expected_return_date\' NULLS LAST')).rows;}
export async function listCustody(){return(await database().query<{id:string;asset_id:string;person_id:string;returned_at:Date|null;data:InventoryRecord}>('SELECT id,asset_id,person_id,returned_at,data FROM inventory_custody ORDER BY COALESCE(returned_at,now()) DESC LIMIT 1000')).rows;}
export async function listInventoryIssues(openOnly=false){return(await database().query<{id:string;asset_id:string;asset_code:string;issue_type:string;status:string;reported_by:string;reported_at:Date;resolution:string;resolved_by:string|null;resolved_at:Date|null;data:InventoryRecord}>(`SELECT i.id,i.asset_id,a.data->>'asset_code' AS asset_code,i.issue_type,i.status,i.reported_by,i.reported_at,i.resolution,i.resolved_by,i.resolved_at,i.data FROM inventory_issues i JOIN inventory_assets a ON a.id=i.asset_id WHERE NOT $1::boolean OR i.status='Open' ORDER BY (i.status='Open') DESC,i.reported_at DESC`,[openOnly])).rows;}
export async function listInventoryAttachments(assetId:string){return(await database().query<InventoryAttachment>('SELECT id,asset_id,category,filename,mime_type,size,uploaded_by,uploaded_at FROM inventory_attachments WHERE asset_id=$1 ORDER BY uploaded_at DESC',[assetId])).rows;}
export async function addInventoryAttachment(record:Omit<InventoryAttachment,'uploaded_at'>,content:Uint8Array){const client=await database().connect();try{await client.query('BEGIN');await client.query('SELECT id FROM inventory_assets WHERE id=$1 FOR UPDATE',[record.asset_id]);const usage=(await client.query<{count:number;size:number}>('SELECT count(*)::int AS count,COALESCE(sum(size),0)::int AS size FROM inventory_attachments WHERE asset_id=$1',[record.asset_id])).rows[0];if((usage?.count??0)>=10||(usage?.size??0)+record.size>20*1024*1024)throw new InventoryAttachmentLimitError('This asset has reached the 10-file or 20 MB attachment limit.');await client.query('INSERT INTO inventory_attachments(id,asset_id,category,filename,mime_type,size,uploaded_by,content) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[record.id,record.asset_id,record.category,record.filename,record.mime_type,record.size,record.uploaded_by,content]);await client.query('INSERT INTO inventory_audit_events(id,entity_type,entity_id,actor_uid,event_type,after_data) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),'asset',record.asset_id,record.uploaded_by,'ATTACHMENT_ADDED',JSON.stringify({id:record.id,category:record.category,filename:record.filename,mime_type:record.mime_type,size:record.size})]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
export async function getInventoryAttachment(assetId:string,id:string){return(await database().query<{filename:string;mime_type:string;content:Buffer}>('SELECT filename,mime_type,content FROM inventory_attachments WHERE asset_id=$1 AND id=$2',[assetId,id])).rows[0]??null;}
export async function createInventoryIssue(assetId:string,version:number,actor:string,type:'repair'|'missing'|'damaged',notes:string){
 const client=await database().connect();try{await client.query('BEGIN');const row=(await client.query<AssetRow>('SELECT id,version,data FROM inventory_assets WHERE id=$1 FOR UPDATE',[assetId])).rows[0];if(!row)throw new NotFoundError();if(row.version!==version)throw new ConflictError();
  if(row.data.status==='Retired')throw new Error('Retired equipment cannot receive a new issue report.');
  const id=randomUUID(),now=new Date().toISOString(),status=type==='missing'?'Missing':type==='damaged'?'Damaged':'Needs repair';
  await client.query('INSERT INTO inventory_issues(id,asset_id,issue_type,reported_by,data) VALUES($1,$2,$3,$4,$5)',[id,assetId,type,actor,JSON.stringify({notes})]);
  const after={...row.data,status,issue_reported_at:now,updated_at:now};await client.query('UPDATE inventory_assets SET version=version+1,data=$1,updated_at=now() WHERE id=$2',[JSON.stringify(after),assetId]);await client.query('INSERT INTO inventory_changes(id,asset_id,actor_uid,event_type,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),assetId,actor,`${type.toUpperCase()}_REPORTED`,JSON.stringify(row.data),JSON.stringify(after)]);await client.query('COMMIT');return id;
 }catch(error){await client.query('ROLLBACK');if(typeof error==='object'&&error!==null&&'code'in error&&error.code==='23505')throw new ConflictError('An open issue of this type already exists for this asset.');throw error;}finally{client.release();}
}
export async function resolveInventoryIssue(issueId:string,actor:string,resolution:string){
 const client=await database().connect();try{await client.query('BEGIN');const issueRef=(await client.query<{asset_id:string}>('SELECT asset_id FROM inventory_issues WHERE id=$1',[issueId])).rows[0];if(!issueRef)throw new NotFoundError();const row=(await client.query<AssetRow>('SELECT id,version,data FROM inventory_assets WHERE id=$1 FOR UPDATE',[issueRef.asset_id])).rows[0];if(!row)throw new NotFoundError();const issue=(await client.query<{id:string;asset_id:string;status:string}>('SELECT id,asset_id,status FROM inventory_issues WHERE id=$1 FOR UPDATE',[issueId])).rows[0];if(!issue)throw new NotFoundError();if(issue.status!=='Open')throw new ConflictError();
  await client.query("UPDATE inventory_issues SET status='Resolved',resolution=$2,resolved_by=$3,resolved_at=now() WHERE id=$1",[issueId,resolution,actor]);
  const remaining=(await client.query<{issue_type:string}>("SELECT issue_type FROM inventory_issues WHERE asset_id=$1 AND status='Open' AND id<>$2 ORDER BY CASE issue_type WHEN 'missing' THEN 1 WHEN 'damaged' THEN 2 ELSE 3 END",[issue.asset_id,issueId])).rows;
  const status=row.data.retired_at?'Retired':remaining[0]?(remaining[0].issue_type==='missing'?'Missing':remaining[0].issue_type==='damaged'?'Damaged':'Needs repair'):row.data.current_assignment_id?'Checked out':'Available';
  const now=new Date().toISOString(),after={...row.data,status,issue_resolution:resolution,updated_at:now};await client.query('UPDATE inventory_assets SET version=version+1,data=$1,updated_at=now() WHERE id=$2',[JSON.stringify(after),issue.asset_id]);await client.query('INSERT INTO inventory_changes(id,asset_id,actor_uid,event_type,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),issue.asset_id,actor,'ISSUE_RESOLVED',JSON.stringify(row.data),JSON.stringify(after)]);await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function listAuditEvents(entityType?:string,entityId?:string){return(await database().query<{entity_type:string;entity_id:string;event_type:string;actor_uid:string;created_at:Date;after_data:InventoryRecord}>(`SELECT entity_type,entity_id,event_type,actor_uid,created_at,after_data FROM inventory_audit_events WHERE ($1::text IS NULL OR entity_type=$1) AND ($2::text IS NULL OR entity_id=$2) ORDER BY created_at DESC LIMIT 250`,[entityType??null,entityId??null])).rows;}
export async function sourceTables(){return(await database().query<{table_name:string;count:number}>('SELECT table_name,count(*)::integer AS count FROM inventory_source_records GROUP BY table_name ORDER BY table_name')).rows;}
export async function sourceRecords(table:string){return(await database().query<{data:InventoryRecord}>('SELECT data FROM inventory_source_records WHERE table_name=$1 ORDER BY ordinal',[table])).rows.map(row=>row.data);}
export async function assetHistory(id:string){
 const [source,changes]=await Promise.all([
 database().query<{table_name:string;data:InventoryRecord}>(`SELECT table_name,data FROM inventory_source_records WHERE data->>'asset_id'=$1 ORDER BY table_name,ordinal`,[id]),
 database().query<{event_type:string;created_at:Date;actor_uid:string;before_data:InventoryRecord;after_data:InventoryRecord}>('SELECT event_type,created_at,actor_uid,before_data,after_data FROM inventory_changes WHERE asset_id=$1 ORDER BY created_at DESC',[id])]);
 return{source:source.rows,changes:changes.rows};
}
export async function createAsset(data:InventoryRecord,actor:string){
 const id=randomUUID(),client=await database().connect(),now=new Date().toISOString();
 const record={...data,id,status:'Available',current_holder_person_id:null,current_assignment_id:null,created_at:now,updated_at:now};
 try{await client.query('BEGIN');await client.query('INSERT INTO inventory_assets(id,data) VALUES($1,$2)',[id,JSON.stringify(record)]);await client.query('INSERT INTO inventory_changes(id,asset_id,actor_uid,event_type,after_data) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,actor,'CREATED',JSON.stringify(record)]);await client.query('COMMIT');return id;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function mutateAsset(id:string,version:number,actor:string,operation:'save'|'assign'|'return'|'retire'|'agreement',values:InventoryRecord){
 const client=await database().connect();
 try{await client.query('BEGIN');const row=(await client.query<AssetRow>('SELECT id,version,data FROM inventory_assets WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)throw new NotFoundError();if(row.version!==version)throw new ConflictError();
 const before=row.data,now=new Date().toISOString();let after:InventoryRecord={...before,updated_at:now};
 if(operation==='save'){after={...after,...values};}
 else if(operation==='assign'){
  if(before.status!=='Available')throw new Error('Only available equipment can be checked out.');
  const person=(await client.query<{id:string;data:InventoryRecord}>('SELECT id,data FROM inventory_people WHERE id=$1 FOR SHARE',[values.person_id])).rows[0];
  if(!person||person.data.is_active===false||person.data.is_active===0)throw new Error('Select an active person.');
  const custodyId=randomUUID(),custody={id:custodyId,asset_id:id,asset_code:before.asset_code,person_id:person.id,person_name:person.data.full_name,recipient_email:person.data.email||'',issue_date:values.issue_date||now,expected_return_date:values.expected_return_date||null,actual_return_date:null,purpose:values.purpose||'',assignment_type:values.assignment_type||'Other',usage_location:values.usage_location||before.usage_location||'',department_program:values.department_program||person.data.department||person.data.program||'',issued_by_username:actor,status:'Active',condition_at_issue:values.condition_at_issue||before.condition,accessories_issued:values.accessories_issued||before.accessories||'',acknowledgement_required:values.acknowledgement_required==='true',agreement_signed:values.agreement_signed==='true',agreement_signed_date:values.agreement_signed_date||null,agreement_recorded_at:values.agreement_signed==='true'?now:null,agreement_recorded_by:values.agreement_signed==='true'?actor:null,agreement_notes:values.agreement_notes||'',agreement_file_attached:false,notes:values.notes||''};
  await client.query('INSERT INTO inventory_custody(id,asset_id,person_id,data) VALUES($1,$2,$3,$4)',[custodyId,id,person.id,JSON.stringify(custody)]);
  after={...after,status:'Checked out',current_holder_person_id:person.id,holder_name:person.data.full_name,current_assignment_id:custodyId};
 }else if(operation==='agreement'){
  const assignmentId=String(before.current_assignment_id||'');if(!assignmentId)throw new Error('No active checkout found for this asset.');
  const patch={agreement_signed:values.agreement_signed==='true',agreement_signed_date:values.agreement_signed==='true'?values.agreement_signed_date||now.slice(0,10):null,agreement_recorded_at:now,agreement_recorded_by:actor,agreement_notes:values.agreement_notes||''};
  const updated=await client.query('UPDATE inventory_custody SET data=data || $2::jsonb WHERE id=$1 AND returned_at IS NULL RETURNING id',[assignmentId,JSON.stringify(patch)]);if(updated.rowCount!==1)throw new Error('No active checkout found for this asset.');
  await client.query('INSERT INTO inventory_audit_events(id,entity_type,entity_id,actor_uid,event_type,after_data) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),'checkout',assignmentId,actor,'AGREEMENT_UPDATED',JSON.stringify(patch)]);
  after={...before,updated_at:now};
 }else if(operation==='return'){
  const returned=await client.query(`UPDATE inventory_custody SET returned_at=now(),data=data || $2::jsonb WHERE asset_id=$1 AND returned_at IS NULL RETURNING id`,[id,JSON.stringify({status:'Returned',actual_return_date:now,returned_by:actor,condition_at_return:values.condition_at_return||before.condition,accessories_returned:values.accessories_returned||'',return_notes:values.return_notes||''})]);
  if(returned.rowCount!==1)throw new Error('No single open checkout found. Review custody before returning.');
  if(values.condition_at_return==='Needs repair')await client.query("INSERT INTO inventory_issues(id,asset_id,issue_type,reported_by,data) VALUES($1,$2,'repair',$3,$4) ON CONFLICT DO NOTHING",[randomUUID(),id,actor,JSON.stringify({notes:values.return_notes||'Condition marked Needs repair during check in.'})]);
  after={...after,status:values.condition_at_return==='Needs repair'?'Needs repair':'Available',condition:values.condition_at_return||before.condition,accessories:values.accessories_returned||before.accessories||'',current_holder_person_id:null,holder_name:null,current_assignment_id:null};
 }else{
  if(before.current_assignment_id||before.status==='Checked out'||before.status==='Assigned')throw new Error('Check in equipment before retiring it.');
  after={...after,status:'Retired',retired_at:now,retirement_reason:values.retirement_reason||'Retired by IT'};
 }
 await client.query('UPDATE inventory_assets SET version=version+1,data=$1,updated_at=now() WHERE id=$2',[JSON.stringify(after),id]);
 await client.query('INSERT INTO inventory_changes(id,asset_id,actor_uid,event_type,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),id,actor,operation.toUpperCase(),JSON.stringify(before),JSON.stringify(after)]);
 await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
