import "server-only";
import { randomUUID } from "node:crypto";
import type { AttachmentRecord, Employee, HealthCheck, Ticket, TicketEvent, TicketMessage } from "@/lib/domain/models";
import type { TicketCreateInput, TicketUpdateInput, MessageCreateInput } from "@/lib/domain/schemas";
import { canReadTicket, canManageTickets, canCreateMessage, employeeVisibleMessages, suggestedPriority } from "@/lib/domain/policy";
import { AuthorizationError, ConflictError, NotFoundError, WorkbookUnavailableError, type TicketFilter, type TicketRepository } from "@/lib/excel/repository";
import { encryptPin } from "./secrets";
import { database } from "./client";

export class SqlTicketRepository implements TicketRepository {
  // Identity is resolved from verified sessions in authz, never from an arbitrary email.
  async getEmployeeByEmail(): Promise<Employee | null> { return null; }
  async listTickets(filter: TicketFilter = {}) {
    const { rows } = await database().query<{data: Ticket}>(`SELECT data FROM lacc_tickets WHERE ($1::text IS NULL OR requester_uid=$1) ORDER BY created_at DESC`, [filter.requesterUid ?? null]);
    return rows.map(r=>r.data).filter(t=>(!filter.status || t.status===filter.status)&&(!filter.assigneeUid || t.assigneeUid===filter.assigneeUid)&&(!filter.query || JSON.stringify(t).toLowerCase().includes(filter.query.toLowerCase())));
  }
  async getTicketByNumber(number: string, actor: Employee) {
    const { rows } = await database().query<{data: Ticket}>("SELECT data FROM lacc_tickets WHERE number=$1",[number]);
    const ticket=rows[0]?.data; if(!ticket) return null; if(!canReadTicket(actor,ticket)) throw new AuthorizationError();
    const messages=(await database().query<{data: TicketMessage}>("SELECT data FROM lacc_messages WHERE ticket_uid=$1 ORDER BY created_at",[ticket.ticketUid])).rows.map(r=>r.data);
    return {ticket,messages:actor.role==='EMPLOYEE'?employeeVisibleMessages(messages):messages,events:actor.role==='EMPLOYEE'?[]:await this.listEvents(ticket.ticketUid),attachments:[]};
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
      if(replay){if(replay.data.ticketUid!==uid||replay.data.actorUid!==actor.employeeUid)throw new AuthorizationError(); await client.query('COMMIT');return row.data;}
      if(row.data.version!==input.expectedVersion) throw new ConflictError(); const now=new Date().toISOString();
      const {expectedVersion,operationUid,completedBy,...changes}=input; void expectedVersion;
      const ticket:Ticket={...row.data,...changes,updatedAt:now,version:row.data.version+1};
      if(input.status==='RESOLVED'||input.status==='CLOSED'){ticket.resolvedAt=now;ticket.historicalStaff=completedBy||actor.displayName; ticket.sourceSolvedValue='Yes';}
      else if(input.status){ticket.resolvedAt='';ticket.sourceSolvedValue='';ticket.sourceSolvedDate='';ticket.completionTimestamp='';ticket.historicalStaff='';}
      await client.query('UPDATE lacc_tickets SET data=$1,version=$2 WHERE uid=$3',[JSON.stringify(ticket),ticket.version,uid]);
      const event:TicketEvent={eventUid:randomUUID(),operationUid,ticketUid:uid,actorUid:actor.employeeUid,eventType:'UPDATED',field:'status',oldValue:row.data.status,newValue:ticket.status,createdAt:now};
      await client.query('INSERT INTO lacc_ticket_events(uid,ticket_uid,operation_uid,data) VALUES($1,$2,$3,$4)',[event.eventUid,uid,operationUid,JSON.stringify(event)]);await client.query('COMMIT');return ticket;
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
  async addAttachment(_record:AttachmentRecord,_actor:Employee):Promise<void>{void _record;void _actor;throw new WorkbookUnavailableError('Attachments are not enabled.');}
  async listEvents(uid:string):Promise<TicketEvent[]>{return(await database().query<{data:TicketEvent}>('SELECT data FROM lacc_ticket_events WHERE ticket_uid=$1 ORDER BY created_at',[uid])).rows.map(r=>r.data);}
  async healthCheck():Promise<HealthCheck>{await database().query('SELECT uid FROM lacc_tickets LIMIT 1');return{status:'healthy',backend:'sql',workbookReadable:true,workbookWritable:true,schemaVersion:'001',missingTables:[],problems:[],checkedAt:new Date().toISOString(),latencyMs:0};}
}
