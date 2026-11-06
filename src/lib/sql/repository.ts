import "server-only";
import { randomUUID } from "node:crypto";
import type { AttachmentRecord, Employee, HealthCheck, Ticket, TicketEvent, TicketMessage } from "@/lib/domain/models";
import type { TicketCreateInput, TicketUpdateInput, MessageCreateInput } from "@/lib/domain/schemas";
import { canReadTicket, canManageTickets, canCreateMessage, employeeVisibleMessages, suggestedPriority } from "@/lib/domain/policy";
import { AuthorizationError, ConflictError, NotFoundError, WorkbookUnavailableError, type TicketFilter, type TicketRepository } from "@/lib/excel/repository";
import { encryptPin } from "./secrets";
import { database } from "./client";
import { canonicalTicketStatus } from "@/lib/domain/ticket-status";
import { isTicketResolved } from "@/lib/domain/resolution";

export class SqlTicketRepository implements TicketRepository {
  // Identity is resolved from verified sessions in authz, never from an arbitrary email.
  async getEmployeeByEmail(): Promise<Employee | null> { return null; }
  async listTickets(filter: TicketFilter = {}) {
    const { rows } = await database().query<{data: Ticket}>(`SELECT data FROM lacc_tickets WHERE (($1::text IS NULL AND $2::text IS NULL) OR ((requester_uid=$1 OR lower(data->>'requesterEmail')=$2) AND coalesce(data->>'requesterIdentityVerified','true')='true')) ORDER BY created_at DESC`, [filter.requesterUid ?? null, filter.requesterEmail?.toLowerCase() ?? null]);
    return rows.map(r=>r.data).filter(t=>(!filter.status || t.status===filter.status)&&(!filter.assigneeUid || t.assigneeUid===filter.assigneeUid)&&(!filter.query || JSON.stringify(t).toLowerCase().includes(filter.query.toLowerCase())));
  }
  async getTicketByNumber(number: string, actor: Employee) {
    const { rows } = await database().query<{data: Ticket}>("SELECT data FROM lacc_tickets WHERE number=$1",[number]);
    const ticket=rows[0]?.data; if(!ticket) return null; if(!canReadTicket(actor,ticket)) throw new AuthorizationError();
    const messages=(await database().query<{data: TicketMessage}>("SELECT data FROM lacc_messages WHERE ticket_uid=$1 ORDER BY created_at",[ticket.ticketUid])).rows.map(r=>r.data);
    const attachments=(await database().query<{uid:string;filename:string;mime_type:string;size:number;uploaded_by:string;uploaded_at:Date}>("SELECT uid,filename,mime_type,size,uploaded_by,uploaded_at FROM lacc_attachments WHERE ticket_uid=$1 ORDER BY uploaded_at",[ticket.ticketUid])).rows.map(row=>({attachmentUid:row.uid,operationUid:`attachment-${row.uid}`,ticketUid:ticket.ticketUid,filename:row.filename,storageReference:row.uid,mimeType:row.mime_type,size:row.size,uploadedBy:row.uploaded_by,uploadedAt:new Date(row.uploaded_at).toISOString()}));
    return {ticket,messages:actor.role==='EMPLOYEE'?employeeVisibleMessages(messages):messages,events:actor.role==='EMPLOYEE'?[]:await this.listEvents(ticket.ticketUid),attachments};
  }
  async createTicket(input: TicketCreateInput, actor: Employee): Promise<Ticket> {
    const uid=randomUUID(), now=new Date().toISOString();
    const ticket: Ticket={ticketUid:uid,ticketNumber:`LACC-${uid.toUpperCase()}`,operationUid:input.operationUid,requesterUid:actor.employeeUid,requesterEmail:actor.email,requesterName:actor.displayName,subject:input.subject,description:input.description,category:input.category,priority:suggestedPriority(input),status:'NEW',assigneeUid:'',departmentUid:actor.departmentUid,locationUid:input.locationUid,assetUid:input.assetUid,impact:input.impact,workBlocked:input.workBlocked,workaroundAvailable:input.workaroundAvailable,createdAt:now,updatedAt:now,resolvedAt:'',version:1};
    const client=await database().connect();
    try { await client.query('BEGIN');
      const inserted=await client.query<{data:Ticket}>(`INSERT INTO lacc_tickets(uid,number,operation_uid,requester_uid,version,data) VALUES($1,$2,$3,$4,1,$5) ON CONFLICT(operation_uid) DO NOTHING RETURNING data`,[uid,ticket.ticketNumber,input.operationUid,actor.employeeUid,JSON.stringify(ticket)]);
      const saved=inserted.rows[0]?.data ?? (await client.query<{data:Ticket}>('SELECT data FROM lacc_tickets WHERE operation_uid=$1',[input.operationUid])).rows[0]?.data;
      if(!saved || saved.requesterUid!==actor.employeeUid) throw new AuthorizationError();
      if(inserted.rowCount && input.preferredPin) await client.query('INSERT INTO lacc_request_secrets(ticket_uid,encrypted_pin) VALUES($1,$2)',[uid,encryptPin(input.preferredPin,uid)]);
      if(inserted.rowCount) {const event:TicketEvent={eventUid:randomUUID(),operationUid:input.operationUid,ticketUid:uid,actorUid:actor.employeeUid,eventType:'CREATED',field:'status',oldValue:'',newValue:'NEW',createdAt:now}; await client.query('INSERT INTO lacc_ticket_events(uid,ticket_uid,operation_uid,data) VALUES($1,$2,$3,$4)',[event.eventUid,uid,event.operationUid,JSON.stringify(event)]);}
      await client.query('COMMIT'); return saved;
    } catch(error) {await client.query('ROLLBACK'); throw error;} finally {client.release();}
  }
  async updateTicket(uid:string,input:TicketUpdateInput,actor:Employee):Promise<Ticket>{
    if(!canManageTickets(actor)) throw new AuthorizationError(); const client=await database().connect();
    try {await client.query('BEGIN'); const row=(await client.query<{data:Ticket}>('SELECT data FROM lacc_tickets WHERE uid=$1 FOR UPDATE',[uid])).rows[0]; if(!row) throw new NotFoundError();
      const replay=(await client.query<{data:TicketEvent}>('SELECT data FROM lacc_ticket_events WHERE operation_uid=$1',[input.operationUid])).rows[0];
      const replayNote=(await client.query<{data:TicketMessage}>('SELECT data FROM lacc_messages WHERE operation_uid=$1',[input.operationUid])).rows[0];
      if(replay||replayNote){
        if(replay&&(replay.data.ticketUid!==uid||replay.data.actorUid!==actor.employeeUid))throw new AuthorizationError();
        if(replayNote&&(replayNote.data.ticketUid!==uid||replayNote.data.authorUid!==actor.employeeUid))throw new AuthorizationError();
        await client.query('COMMIT');return row.data;
      }
      if(row.data.version!==input.expectedVersion) throw new ConflictError(); const now=new Date().toISOString();
      const currentStatus=canonicalTicketStatus(row.data.status),nextStatus=input.status?canonicalTicketStatus(input.status):currentStatus;
      const ticket:Ticket={...row.data};
      const editableFields:[keyof Ticket,unknown][]=[["priority",input.priority],["completedBy",input.completedBy],["resolutionNotes",input.resolutionNotes]];
      for(const [field,value] of editableFields)if(value!==undefined)(ticket as unknown as Record<string,unknown>)[field]=value;
      if(input.status&&nextStatus!==currentStatus){
        ticket.status=nextStatus;
        if(nextStatus==="RESOLVED"){ticket.resolvedAt=now;ticket.reopenedAt="";ticket.completedBy=input.completedBy?.trim()??"";}
        else{if(isTicketResolved(row.data))ticket.reopenedAt=now;ticket.resolvedAt="";ticket.completedBy="";}
      }
      const internalNote=input.internalNote?.trim();
      const fields=(Object.keys(ticket) as (keyof Ticket)[]).filter((field)=>field!=="updatedAt"&&field!=="version"&&field!=="operationUid"&&JSON.stringify(row.data[field]??"")!==JSON.stringify(ticket[field]??""));
      if(!fields.length&&!internalNote){await client.query('COMMIT');return row.data;}
      ticket.updatedAt=now;ticket.version=row.data.version+1;
      await client.query('UPDATE lacc_tickets SET data=$1,version=$2 WHERE uid=$3',[JSON.stringify(ticket),ticket.version,uid]);
      if(fields.length){
        const before=Object.fromEntries(fields.map(field=>[field,row.data[field]??""]));const after=Object.fromEntries(fields.map(field=>[field,ticket[field]??""]));
        const event:TicketEvent={eventUid:randomUUID(),operationUid:input.operationUid,ticketUid:uid,actorUid:actor.employeeUid,eventType:'UPDATED',field:fields.join(','),oldValue:JSON.stringify(before),newValue:JSON.stringify(after),createdAt:now};
        await client.query('INSERT INTO lacc_ticket_events(uid,ticket_uid,operation_uid,data) VALUES($1,$2,$3,$4)',[event.eventUid,uid,input.operationUid,JSON.stringify(event)]);
      }
      if(internalNote){
        const note:TicketMessage={messageUid:randomUUID(),operationUid:input.operationUid,ticketUid:uid,authorUid:actor.employeeUid,authorName:actor.displayName,type:"INTERNAL_NOTE",body:internalNote,createdAt:now};
        await client.query('INSERT INTO lacc_messages(uid,ticket_uid,operation_uid,data) VALUES($1,$2,$3,$4)',[note.messageUid,uid,input.operationUid,JSON.stringify(note)]);
      }
      await client.query('COMMIT');return ticket;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async addMessage(uid:string,input:MessageCreateInput,actor:Employee):Promise<TicketMessage>{
    const ticket=(await database().query<{data:Ticket}>('SELECT data FROM lacc_tickets WHERE uid=$1',[uid])).rows[0]?.data;
    if(!ticket)throw new NotFoundError();if(!canCreateMessage(actor,ticket,input.type))throw new AuthorizationError();
    const message:TicketMessage={messageUid:randomUUID(),operationUid:input.operationUid,ticketUid:uid,authorUid:actor.employeeUid,authorName:actor.displayName,type:input.type,body:input.body,createdAt:new Date().toISOString()};
    const result=await database().query<{data:TicketMessage}>('INSERT INTO lacc_messages(uid,ticket_uid,operation_uid,data) VALUES($1,$2,$3,$4) ON CONFLICT(operation_uid) DO NOTHING RETURNING data',[message.messageUid,uid,input.operationUid,JSON.stringify(message)]);
    const saved=result.rows[0]?.data??(await database().query<{data:TicketMessage}>('SELECT data FROM lacc_messages WHERE operation_uid=$1',[input.operationUid])).rows[0]?.data;
    if(!saved||saved.ticketUid!==uid||saved.authorUid!==actor.employeeUid)throw new AuthorizationError();return saved;
  }
  async addAttachment(record:AttachmentRecord,actor:Employee,content?:Uint8Array):Promise<void>{
    if(!content||content.byteLength<1||content.byteLength>3*1024*1024||content.byteLength!==record.size)throw new WorkbookUnavailableError('Attachment must be a nonempty file up to 3 MB.');
    const client=await database().connect();
    try{
      await client.query('BEGIN');
      const ticket=(await client.query<{data:Ticket}>('SELECT data FROM lacc_tickets WHERE uid=$1 FOR UPDATE',[record.ticketUid])).rows[0]?.data;
      if(!ticket)throw new NotFoundError();if(!canReadTicket(actor,ticket))throw new AuthorizationError();
      const usage=(await client.query<{count:string;bytes:string}>("SELECT count(*)::text AS count,coalesce(sum(size),0)::text AS bytes FROM lacc_attachments WHERE ticket_uid=$1",[record.ticketUid])).rows[0];
      if(Number(usage.count)>=10||Number(usage.bytes)+record.size>20*1024*1024)throw new WorkbookUnavailableError('This request has reached its attachment limit.');
      await client.query('INSERT INTO lacc_attachments(uid,ticket_uid,filename,mime_type,size,uploaded_by,uploaded_at,content) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[record.attachmentUid,record.ticketUid,record.filename,record.mimeType,record.size,actor.employeeUid,record.uploadedAt,Buffer.from(content)]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async getAttachment(ticketUid:string,attachmentUid:string,actor:Employee){
    const ticket=(await database().query<{data:Ticket}>('SELECT data FROM lacc_tickets WHERE uid=$1',[ticketUid])).rows[0]?.data;
    if(!ticket)throw new NotFoundError();if(!canReadTicket(actor,ticket))throw new AuthorizationError();
    return(await database().query<{filename:string;mime_type:string;content:Buffer}>("SELECT filename,mime_type,content FROM lacc_attachments WHERE ticket_uid=$1 AND uid=$2",[ticketUid,attachmentUid])).rows[0]??null;
  }
  async listEvents(uid:string):Promise<TicketEvent[]>{return(await database().query<{data:TicketEvent}>('SELECT data FROM lacc_ticket_events WHERE ticket_uid=$1 ORDER BY created_at',[uid])).rows.map(r=>r.data);}
  async healthCheck():Promise<HealthCheck>{
    const started=Date.now(),checkedAt=new Date().toISOString();
    try{
      const [tables,privileges]=await Promise.all([
        database().query<{table_name:string}>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE 'lacc_%' OR table_name LIKE 'inventory_%')"),
        database().query<{can_read:boolean;can_write:boolean;can_attachments:boolean;can_inventory:boolean;can_it_ops:boolean}>(`SELECT
          has_table_privilege(current_user,'lacc_tickets','SELECT') AS can_read,
          has_table_privilege(current_user,'lacc_tickets','INSERT') AND has_table_privilege(current_user,'lacc_tickets','UPDATE')
          AND coalesce(has_table_privilege(current_user,to_regclass('public.lacc_ticket_events'),'SELECT'),false) AND coalesce(has_table_privilege(current_user,to_regclass('public.lacc_ticket_events'),'INSERT'),false)
          AND coalesce(has_table_privilege(current_user,to_regclass('public.lacc_messages'),'SELECT'),false) AND coalesce(has_table_privilege(current_user,to_regclass('public.lacc_messages'),'INSERT'),false)
          AND coalesce(has_table_privilege(current_user,to_regclass('public.lacc_ticket_source_rows'),'SELECT'),false) AS can_write,
          coalesce(has_table_privilege(current_user,to_regclass('public.lacc_attachments'),'SELECT'),false) AND coalesce(has_table_privilege(current_user,to_regclass('public.lacc_attachments'),'INSERT'),false) AS can_attachments,
          coalesce(has_table_privilege(current_user,to_regclass('public.inventory_assets'),'SELECT'),false) AND coalesce(has_table_privilege(current_user,to_regclass('public.inventory_assets'),'INSERT'),false) AND coalesce(has_table_privilege(current_user,to_regclass('public.inventory_assets'),'UPDATE'),false)
          AND coalesce(has_table_privilege(current_user,to_regclass('public.inventory_people'),'SELECT'),false)
          AND coalesce(has_table_privilege(current_user,to_regclass('public.inventory_custody'),'SELECT'),false) AND coalesce(has_table_privilege(current_user,to_regclass('public.inventory_custody'),'INSERT'),false) AND coalesce(has_table_privilege(current_user,to_regclass('public.inventory_custody'),'UPDATE'),false)
          AND coalesce(has_table_privilege(current_user,to_regclass('public.inventory_changes'),'SELECT'),false) AND coalesce(has_table_privilege(current_user,to_regclass('public.inventory_changes'),'INSERT'),false)
          AND coalesce(has_table_privilege(current_user,to_regclass('public.inventory_source_records'),'SELECT'),false) AND coalesce(has_table_privilege(current_user,to_regclass('public.inventory_imports'),'SELECT'),false) AS can_inventory,
          coalesce(has_table_privilege(current_user,to_regclass('public.it_onboarding_requests'),'SELECT'),false) AND coalesce(has_table_privilege(current_user,to_regclass('public.it_onboarding_requests'),'INSERT'),false) AND coalesce(has_table_privilege(current_user,to_regclass('public.it_onboarding_requests'),'UPDATE'),false)
          AND coalesce(has_table_privilege(current_user,to_regclass('public.it_printer_directory'),'SELECT'),false) AND coalesce(has_table_privilege(current_user,to_regclass('public.it_printer_directory'),'INSERT'),false) AND coalesce(has_table_privilege(current_user,to_regclass('public.it_printer_directory'),'UPDATE'),false)
          AND coalesce(has_table_privilege(current_user,to_regclass('public.it_operations_audit'),'SELECT'),false) AND coalesce(has_table_privilege(current_user,to_regclass('public.it_operations_audit'),'INSERT'),false) AS can_it_ops`),
      ]);
      const present=new Set(tables.rows.map(row=>row.table_name));
      const required=['lacc_tickets','lacc_ticket_events','lacc_messages','lacc_ticket_imports','lacc_ticket_source_rows','lacc_attachments','inventory_imports','inventory_source_records','inventory_assets','inventory_people','inventory_custody','inventory_changes','it_onboarding_requests','it_printer_directory','it_operations_audit'];
      const missingTables=required.filter(name=>!present.has(name)),privilege=privileges.rows[0];
      const problems=[...missingTables.map(name=>`Missing table ${name}.`),...(!privilege?.can_read?['Database role cannot read tickets.']:[]),...(!privilege?.can_write?['Database role cannot create or update tickets.']:[]),...(!privilege?.can_attachments?['Database role lacks attachment read or upload access.']:[]),...(!privilege?.can_inventory?['Database role lacks required inventory or custody access.']:[]),...(!privilege?.can_it_ops?['Database role lacks IT onboarding or printer-directory access.']:[])];
      return{status:problems.length?'degraded':'healthy',backend:'sql',workbookReadable:Boolean(privilege?.can_read),workbookWritable:Boolean(privilege?.can_write),schemaVersion:'009',missingTables,problems,checkedAt,latencyMs:Date.now()-started};
    }catch(error){return{status:'unconfigured',backend:'sql',workbookReadable:false,workbookWritable:false,schemaVersion:null,missingTables:[],problems:[error instanceof Error?error.message:'SQL health check failed.'],checkedAt,latencyMs:Date.now()-started};}
  }
}
