import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "./client";

export type OnboardingRequest = {
  id: string;
  first_name: string;
  last_name: string;
  start_date: string;
  requested_needs: string[];
  work_locations: string[];
  shared_drive_access: string;
  equipment_details: string;
  need_by_date: string | null;
  main_contact_email: string;
  requested_by: string;
  status: "New" | "In progress" | "Complete";
  created_at: string;
};

export type PrinterReference = { id: string; location: string; ip_address: string; printer_model: string; notes: string; updated_at: string };

export async function listOnboardingRequests() {
  const { rows } = await database().query<OnboardingRequest>(`SELECT id,first_name,last_name,start_date::text,requested_needs,work_locations,shared_drive_access,equipment_details,need_by_date::text,main_contact_email,requested_by,status,created_at::text FROM it_onboarding_requests ORDER BY created_at DESC LIMIT 500`);
  return rows;
}

export async function createOnboardingRequest(input: Omit<OnboardingRequest,"id"|"requested_by"|"status"|"created_at">, actorUid: string) {
  const id = randomUUID();
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO it_onboarding_requests(id,first_name,last_name,start_date,requested_needs,work_locations,shared_drive_access,equipment_details,need_by_date,main_contact_email,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id,input.first_name,input.last_name,input.start_date,JSON.stringify(input.requested_needs),JSON.stringify(input.work_locations),input.shared_drive_access,input.equipment_details,input.need_by_date,input.main_contact_email,actorUid]);
    await client.query(`INSERT INTO it_operations_audit(id,entity_type,entity_id,actor_uid,action) VALUES($1,'onboarding',$2,$3,'created')`,[randomUUID(),id,actorUid]);
    await client.query("COMMIT");
    return id;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function updateOnboardingStatus(id: string, status: OnboardingRequest["status"], actorUid: string) {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("UPDATE it_onboarding_requests SET status=$1,updated_at=now() WHERE id=$2",[status,id]);
    if (!result.rowCount) throw new Error("Onboarding request not found.");
    await client.query(`INSERT INTO it_operations_audit(id,entity_type,entity_id,actor_uid,action) VALUES($1,'onboarding',$2,$3,$4)`,[randomUUID(),id,actorUid,`status:${status}`]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function listPrinterDirectory() {
  return (await database().query<PrinterReference>(`SELECT id,location,host(ip_address) AS ip_address,printer_model,notes,updated_at::text FROM it_printer_directory ORDER BY lower(location)`)).rows;
}

export async function upsertPrinterReference(input: { location: string; ipAddress: string; printerModel: string; notes: string }, actorUid: string) {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const id = randomUUID();
    const saved = await client.query<{id:string}>(`INSERT INTO it_printer_directory(id,location,ip_address,printer_model,notes,updated_by) VALUES($1,$2,$3::inet,$4,$5,$6) ON CONFLICT(location) DO UPDATE SET ip_address=EXCLUDED.ip_address,printer_model=EXCLUDED.printer_model,notes=EXCLUDED.notes,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING id`,[id,input.location,input.ipAddress,input.printerModel,input.notes,actorUid]);
    await client.query(`INSERT INTO it_operations_audit(id,entity_type,entity_id,actor_uid,action) VALUES($1,'printer',$2,$3,'upserted')`,[randomUUID(),saved.rows[0].id,actorUid]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
