import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { database } from "./client";
import { canMarkAgreementHandedOff, canMarkAgreementPrinted, isValidAgreementToken } from "./agreement-state";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function isAgreementStorageReady(){
  const result=await database().query<{ready:boolean}>("SELECT to_regclass('public.inventory_agreement_forms') IS NOT NULL AS ready");
  return result.rows[0]?.ready===true;
}
export const AGREEMENT_TERMS_VERSION = "LACC-LAPTOP-ACKNOWLEDGEMENT-2026-11-17-v1";
export const AGREEMENT_TERMS = `I am now in possession of the equipment identified above. This Agency Laptop is to be used only for purposes relating to my work at the Latin American Community Center (LACC). The device will not be handled in a manner that places it at a probable risk* of becoming lost, stolen, or damaged in any way. Loss of and any damage that this laptop incurs must be immediately reported to the Information Technology department of the LACC.\n\nI understand that I must return this laptop, cellular device, my office keys, and my LACC Agency ID upon ending my employment at the Latin American Community Center.\n\nThis equipment is property of the Latin American Community Center.\n\n* It will be determined solely by the IT department if a risk is considered to be a “probable risk”.`;
export type AgreementForm = { id:string; asset_id:string; person_id:string; data:Record<string,unknown>; terms_version:string; status:string; signed_at:string|null; printed_at:string|null; handed_off_at:string|null; printed_by:string|null; handed_off_by:string|null; revoked_at:string|null; revoked_by:string|null; expires_at:string; created_at:string; updated_at:string };
export async function createAgreementForCurrentAssignment(assetId:string) {
  const client=await database().connect(); const token=randomBytes(32).toString("base64url"),id=randomUUID();
  try { await client.query("BEGIN");
    const asset=(await client.query<{data:Record<string,unknown>}>("SELECT data FROM inventory_assets WHERE id=$1 FOR SHARE",[assetId])).rows[0];
    const assignmentId=String(asset?.data.current_assignment_id||""); if(!asset||!assignmentId) throw new Error("Equipment must have an active assigned employee.");
    const custody=(await client.query<{person_id:string;data:Record<string,unknown>}>("SELECT person_id,data FROM inventory_custody WHERE id=$1 AND asset_id=$2 AND returned_at IS NULL FOR SHARE",[assignmentId,assetId])).rows[0];
    if(!custody) throw new Error("The equipment assignment is no longer active.");
    const person=(await client.query<{data:Record<string,unknown>}>("SELECT data FROM inventory_people WHERE id=$1 AND coalesce((data->>'is_active')::boolean,true) FOR SHARE",[custody.person_id])).rows[0];
    if(!person) throw new Error("The assigned employee record is unavailable.");
    const data={asset_code:asset.data.asset_code,category:asset.data.category,manufacturer:asset.data.manufacturer,model:asset.data.model,serial_number:asset.data.serial_number,service_tag:asset.data.service_tag,inventory_number:asset.data.inventory_number,phone_number:asset.data.phone_number,person_name:person.data.full_name,person_email:person.data.email,assignment_id:assignmentId,issued_date:custody.data.issue_date,expected_return_date:custody.data.expected_return_date,terms_text:AGREEMENT_TERMS};
    const inserted=await client.query<{expires_at:Date}>("INSERT INTO inventory_agreement_forms(id,token_hash,asset_id,person_id,data,terms_version,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '7 days') RETURNING expires_at",[id,hash(token),assetId,custody.person_id,JSON.stringify(data),AGREEMENT_TERMS_VERSION]);
    await client.query("COMMIT"); return {id,token,data,expiresAt:new Date(inserted.rows[0].expires_at).toISOString()};
  } catch(e){await client.query("ROLLBACK");throw e;} finally {client.release();}
}
export async function getAgreementByToken(token:string):Promise<AgreementForm|null> {
  if (!isValidAgreementToken(token)) return null;
  const row = (await database().query<AgreementForm>("SELECT id,asset_id,person_id,data,terms_version,status,signed_at,printed_at,handed_off_at,printed_by,handed_off_by,revoked_at,revoked_by,expires_at,created_at,updated_at FROM inventory_agreement_forms WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()",[hash(token)])).rows[0];
  if (!row) return null;
  return row ? {...row, expires_at:new Date(row.expires_at).toISOString(), created_at:new Date(row.created_at).toISOString(), updated_at:new Date(row.updated_at).toISOString(), signed_at:row.signed_at?new Date(row.signed_at).toISOString():null, printed_at:row.printed_at?new Date(row.printed_at).toISOString():null, handed_off_at:row.handed_off_at?new Date(row.handed_off_at).toISOString():null} : null;
}
export async function getAgreementById(id:string):Promise<AgreementForm|null> {
  const row=(await database().query<AgreementForm>("SELECT id,asset_id,person_id,data,terms_version,status,signed_at,printed_at,handed_off_at,printed_by,handed_off_by,revoked_at,revoked_by,expires_at,created_at,updated_at FROM inventory_agreement_forms WHERE id=$1",[id])).rows[0];
  return row?{...row,expires_at:new Date(row.expires_at).toISOString(),created_at:new Date(row.created_at).toISOString(),updated_at:new Date(row.updated_at).toISOString(),signed_at:row.signed_at?new Date(row.signed_at).toISOString():null,printed_at:row.printed_at?new Date(row.printed_at).toISOString():null,handed_off_at:row.handed_off_at?new Date(row.handed_off_at).toISOString():null}:null;
}
export async function consumeAgreementSignAttempt(token:string) {
  if (!isValidAgreementToken(token)) return false;
  const result=await database().query("UPDATE inventory_agreement_forms SET sign_attempts=sign_attempts+1,updated_at=now() WHERE token_hash=$1 AND status='PENDING' AND expires_at>now() AND revoked_at IS NULL AND sign_attempts<5 RETURNING id",[hash(token)]);
  return Boolean(result.rowCount);
}
export async function consumeAgreementAccessAttempt(token:string) {
  if (!isValidAgreementToken(token)) return false;
  const result=await database().query("UPDATE inventory_agreement_forms SET access_attempts=access_attempts+1 WHERE token_hash=$1 AND status IN ('PENDING','SIGNED','PRINTED','HANDED_OFF') AND expires_at>now() AND revoked_at IS NULL AND access_attempts<50 RETURNING id",[hash(token)]);
  return Boolean(result.rowCount);
}
export async function signAgreement(token:string, signerName:string) {
  if (!isValidAgreementToken(token)) return null;
  const result = await database().query<{signed_at:Date}>("UPDATE inventory_agreement_forms SET status='SIGNED',signed_at=now(),updated_at=now(),data=data||jsonb_build_object('signer_name',$2::text) WHERE token_hash=$1 AND status='PENDING' AND expires_at>now() AND revoked_at IS NULL AND sign_attempts BETWEEN 1 AND 5 RETURNING signed_at",[hash(token),signerName.trim()]);
  return result.rows[0]?new Date(result.rows[0].signed_at).toISOString():null;
}
export async function listAgreementForms() { return (await database().query<AgreementForm & {is_expired:boolean}>("SELECT id,asset_id,person_id,data,terms_version,status,signed_at,printed_at,handed_off_at,printed_by,handed_off_by,revoked_at,revoked_by,expires_at,expires_at<=now() AS is_expired,created_at,updated_at FROM inventory_agreement_forms ORDER BY created_at DESC")).rows; }
export async function revokePendingAgreement(id:string,actor:string) {
  const result=await database().query("UPDATE inventory_agreement_forms SET revoked_at=now(),revoked_by=$2,updated_at=now() WHERE id=$1 AND status='PENDING' AND revoked_at IS NULL AND expires_at>now() RETURNING id",[id,actor]);
  if (!result.rowCount) throw new Error("Only an active pending agreement link can be revoked.");
}
export async function updateAgreementTracking(id:string, field:"printed_at"|"handed_off_at",actor:string) { const client=await database().connect(); try {await client.query("BEGIN"); const row=(await client.query<{status:string;expires_at:Date;revoked_at:Date|null}>("SELECT status,expires_at,revoked_at FROM inventory_agreement_forms WHERE id=$1 FOR UPDATE",[id])).rows[0]; if(!row)throw new Error("Agreement not found."); if(field==="printed_at"&&!canMarkAgreementPrinted(row.status))throw new Error("Only signed agreements can be printed."); if(field==="handed_off_at"&&!canMarkAgreementHandedOff(row.status))throw new Error("Mark the agreement printed before handoff."); const status=field==="printed_at"?"PRINTED":"HANDED_OFF"; await client.query(`UPDATE inventory_agreement_forms SET ${field}=now(),${field==='printed_at'?'printed_by':'handed_off_by'}=$2,status=$3,updated_at=now() WHERE id=$1`,[id,actor,status]); await client.query("COMMIT");}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();} }
