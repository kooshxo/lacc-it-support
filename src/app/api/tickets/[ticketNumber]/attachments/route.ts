import { randomUUID } from 'node:crypto';
import { getOptionalEmployee } from '@/lib/authz';
import { attachmentSchema } from '@/lib/domain/schemas';
import { AuthorizationError, NotFoundError, WorkbookUnavailableError } from '@/lib/excel/repository';
import { SqlTicketRepository } from '@/lib/sql/repository';
import type { AttachmentRecord } from '@/lib/domain/models';

const maxSize = 3 * 1024 * 1024;
type Context = { params: Promise<{ ticketNumber: string }> };

function validSignature(type: string, bytes: Uint8Array) {
  if (type === 'image/png') return [137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);
  if (type === 'image/jpeg') return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if (type === 'application/pdf') return new TextDecoder().decode(bytes.subarray(0,5))==='%PDF-';
  return false;
}
function safeFilename(value: string) {
  const clean=value.normalize('NFKC').replace(/[^A-Za-z0-9._() -]/g,'_').replace(/^[. ]+/, '').slice(0,140);
  return clean||'attachment';
}
function jsonError(message:string,status:number){return Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});}

export async function POST(request:Request,{params}:Context){
  if(process.env.DATA_BACKEND!=='sql')return jsonError('File uploads are available after SQL storage is enabled.',409);
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return jsonError('Request origin was rejected.',403);
  const actor=await getOptionalEmployee();if(!actor)return jsonError('Sign in to upload a file.',401);
  const {ticketNumber}=await params,repo=new SqlTicketRepository();
  let detail;
  try{detail=await repo.getTicketByNumber(ticketNumber,actor);}catch(error){if(error instanceof AuthorizationError)return jsonError('You cannot access this request.',403);throw error;}
  if(!detail)return jsonError('Request not found.',404);
  let form:FormData;
  try{form=await request.formData();}catch{return jsonError('Choose a valid file to upload.',400);}
  const file=form.get('file');
  if(!(file instanceof File))return jsonError('Choose a file to upload.',400);
  const parsed=attachmentSchema.safeParse({name:file.name,size:file.size,type:file.type});
  if(!parsed.success||file.size>maxSize)return jsonError('Use a PNG, JPEG, or PDF file up to 3 MB.',400);
  const content=new Uint8Array(await file.arrayBuffer());
  if(!validSignature(file.type,content))return jsonError('The file content does not match its declared type.',400);
  const uid=randomUUID(),record:AttachmentRecord={attachmentUid:uid,operationUid:`attachment-${uid}`,ticketUid:detail.ticket.ticketUid,filename:safeFilename(file.name),storageReference:uid,mimeType:file.type,size:file.size,uploadedBy:actor.employeeUid,uploadedAt:new Date().toISOString()};
  try{await repo.addAttachment(record,actor,content);}catch(error){if(error instanceof AuthorizationError)return jsonError('You cannot access this request.',403);if(error instanceof NotFoundError)return jsonError('Request not found.',404);if(error instanceof WorkbookUnavailableError)return jsonError(error.message,409);throw error;}
  return Response.json({attachment:{attachmentUid:uid,filename:record.filename,mimeType:record.mimeType,size:record.size,uploadedAt:record.uploadedAt}},{status:201,headers:{'Cache-Control':'no-store'}});
}

export async function GET(request:Request,{params}:Context){
  if(process.env.DATA_BACKEND!=='sql')return jsonError('File downloads are unavailable for this storage backend.',409);
  const actor=await getOptionalEmployee();if(!actor)return jsonError('Sign in to download a file.',401);
  const {ticketNumber}=await params,attachmentUid=new URL(request.url).searchParams.get('id');
  if(!attachmentUid||attachmentUid.length>80)return jsonError('Attachment not found.',404);
  const repo=new SqlTicketRepository();
  let detail;
  try{detail=await repo.getTicketByNumber(ticketNumber,actor);}catch(error){if(error instanceof AuthorizationError)return jsonError('You cannot access this request.',403);throw error;}
  if(!detail)return jsonError('Request not found.',404);
  if(!detail.attachments.some(item=>item.attachmentUid===attachmentUid))return jsonError('Attachment not found.',404);
  try{
    const item=await repo.getAttachment(detail.ticket.ticketUid,attachmentUid,actor);if(!item)return jsonError('Attachment not found.',404);
    const encoded=encodeURIComponent(item.filename);
    return new Response(new Uint8Array(item.content),{headers:{'Content-Type':item.mime_type,'Content-Length':String(item.content.length),'Content-Disposition':`attachment; filename="attachment"; filename*=UTF-8''${encoded}`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
  }catch(error){if(error instanceof AuthorizationError)return jsonError('You cannot access this request.',403);if(error instanceof NotFoundError)return jsonError('Request not found.',404);throw error;}
}
