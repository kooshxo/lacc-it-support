import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { database } from "./client";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export type AgreementForm = { id:string; asset_id:string; person_id:string; data:Record<string,unknown>; status:string; signed_at:string|null; printed_at:string|null; handed_off_at:string|null; created_at:string; updated_at:string };
export async function createAgreementForm(assetId:string, personId:string, data:Record<string,unknown>) {
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  await database().query("INSERT INTO inventory_agreement_forms(id,token_hash,asset_id,person_id,data) VALUES($1,$2,$3,$4,$5)",[id,hash(token),assetId,personId,JSON.stringify(data)]);
  return { id, token };
}
export async function getAgreementByToken(token:string):Promise<AgreementForm|null> {
  const row = (await database().query<AgreementForm>("SELECT id,asset_id,person_id,data,status,signed_at,printed_at,handed_off_at,created_at,updated_at FROM inventory_agreement_forms WHERE token_hash=$1",[hash(token)])).rows[0];
  return row ? {...row, created_at:new Date(row.created_at).toISOString(), updated_at:new Date(row.updated_at).toISOString(), signed_at:row.signed_at?new Date(row.signed_at).toISOString():null, printed_at:row.printed_at?new Date(row.printed_at).toISOString():null, handed_off_at:row.handed_off_at?new Date(row.handed_off_at).toISOString():null} : null;
}
export async function signAgreement(token:string, signerName:string) {
  const result = await database().query("UPDATE inventory_agreement_forms SET status='SIGNED',signed_at=now(),updated_at=now(),data=data||jsonb_build_object('signer_name',$2::text) WHERE token_hash=$1 AND status='PENDING' RETURNING id",[hash(token),signerName.trim()]);
  return Boolean(result.rowCount);
}
export async function listAgreementForms() { return (await database().query<AgreementForm>("SELECT id,asset_id,person_id,data,status,signed_at,printed_at,handed_off_at,created_at,updated_at FROM inventory_agreement_forms ORDER BY created_at DESC")).rows; }
export async function updateAgreementTracking(id:string, field:"printed_at"|"handed_off_at") { await database().query(`UPDATE inventory_agreement_forms SET ${field}=coalesce(${field},now()),status=CASE WHEN $2='handed_off_at' THEN 'HANDED_OFF' WHEN status='SIGNED' THEN 'PRINTED' ELSE status END,updated_at=now() WHERE id=$1`,[id,field]); }
