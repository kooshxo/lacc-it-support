import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { database } from "./client";
import { canMarkAgreementHandedOff, canMarkAgreementPrinted, isElectronicAgreementWorkflowEnabled, isLaptopAgreementCategory, isValidAgreementToken, laptopAgreementTerms } from "./agreement-state";
import { ELECTRONIC_SIGNATURE_CONSENT_TEXT, renderLaptopAgreementPdf } from "@/lib/agreements/laptop-pdf";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const pdfLimit = 5 * 1024 * 1024;
const templatePath = join(process.cwd(), "public", "templates", "lacc-laptop-letter-background.jpg");

export const AGREEMENT_TERMS_VERSION = "LACC-LAPTOP-ACKNOWLEDGEMENT-2026-11-17-v2";

export type AgreementForm = {
  id: string; asset_id: string; person_id: string; data: Record<string, unknown>; terms_version: string;
  status: string; signed_at: string | null; printed_at: string | null; handed_off_at: string | null;
  printed_by: string | null; handed_off_by: string | null; revoked_at: string | null; revoked_by: string | null;
  expires_at: string; created_at: string; updated_at: string; signature_consent: boolean | null;
  signature_consent_text: string | null; signed_pdf_sha256: string | null;
};

export async function isAgreementStorageReady() {
  const result = await database().query<{ ready: boolean }>("SELECT to_regclass('public.inventory_agreement_forms') IS NOT NULL AND to_regclass('public.inventory_agreement_events') IS NOT NULL AS ready");
  return result.rows[0]?.ready === true;
}

export async function createAgreementForCurrentAssignment(assetId: string, actorUid: string, actorLabel: string) {
  if (!isElectronicAgreementWorkflowEnabled()) throw new Error("Electronic agreement links are disabled until LACC authorizes their use.");
  const client = await database().connect();
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  try {
    await client.query("BEGIN");
    const asset = (await client.query<{ data: Record<string, unknown> }>("SELECT data FROM inventory_assets WHERE id=$1 FOR SHARE", [assetId])).rows[0];
    if (asset && !isLaptopAgreementCategory(asset.data.category)) throw new Error("Laptop agreements are only available for laptop assets.");
    const assignmentId = String(asset?.data.current_assignment_id || "");
    if (!asset || !assignmentId) throw new Error("Equipment must have an active assigned employee.");
    const custody = (await client.query<{ person_id: string; data: Record<string, unknown> }>("SELECT person_id,data FROM inventory_custody WHERE id=$1 AND asset_id=$2 AND returned_at IS NULL FOR SHARE", [assignmentId, assetId])).rows[0];
    if (!custody) throw new Error("The equipment assignment is no longer active.");
    const person = (await client.query<{ data: Record<string, unknown> }>("SELECT data FROM inventory_people WHERE id=$1 AND coalesce((data->>'is_active')::boolean,true) FOR SHARE", [custody.person_id])).rows[0];
    if (!person) throw new Error("The assigned employee record is unavailable.");
    const data = {
      asset_code: asset.data.asset_code, category: asset.data.category, manufacturer: asset.data.manufacturer,
      model: asset.data.model, serial_number: asset.data.serial_number, service_tag: asset.data.service_tag,
      inventory_number: asset.data.inventory_number, phone_number: asset.data.phone_number,
      person_name: person.data.full_name, person_email: person.data.email, assignment_id: assignmentId,
      issued_date: custody.data.issue_date, expected_return_date: custody.data.expected_return_date,
      terms_text: laptopAgreementTerms(),
    };
    const inserted = await client.query<{ expires_at: Date; created_at: Date }>(
      "INSERT INTO inventory_agreement_forms(id,token_hash,asset_id,person_id,data,terms_version,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '7 days') RETURNING expires_at,created_at",
      [id, hash(token), assetId, custody.person_id, JSON.stringify(data), AGREEMENT_TERMS_VERSION],
    );
    await client.query(
      "INSERT INTO inventory_agreement_events(id,agreement_id,event_type,actor_type,actor_uid,actor_label,event_data) VALUES($1,$2,'LINK_CREATED','staff',$3,$4,$5)",
      [randomUUID(), id, actorUid, actorLabel, JSON.stringify({ terms_version: AGREEMENT_TERMS_VERSION, expires_at: inserted.rows[0].expires_at.toISOString() })],
    );
    await client.query("COMMIT");
    return { id, token, data, createdAt: new Date(inserted.rows[0].created_at).toISOString(), expiresAt: new Date(inserted.rows[0].expires_at).toISOString() };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getAgreementByToken(token: string): Promise<AgreementForm | null> {
  if (!isValidAgreementToken(token)) return null;
  const row = (await database().query<AgreementForm>(
    "SELECT id,asset_id,person_id,data,terms_version,status,signed_at,printed_at,handed_off_at,printed_by,handed_off_by,revoked_at,revoked_by,expires_at,created_at,updated_at,signature_consent,signature_consent_text,signed_pdf_sha256 FROM inventory_agreement_forms WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()",
    [hash(token)],
  )).rows[0];
  return normalizeAgreement(row);
}

export async function getAgreementById(id: string): Promise<AgreementForm | null> {
  const row = (await database().query<AgreementForm>(
    "SELECT id,asset_id,person_id,data,terms_version,status,signed_at,printed_at,handed_off_at,printed_by,handed_off_by,revoked_at,revoked_by,expires_at,created_at,updated_at,signature_consent,signature_consent_text,signed_pdf_sha256 FROM inventory_agreement_forms WHERE id=$1",
    [id],
  )).rows[0];
  return normalizeAgreement(row);
}

function normalizeAgreement(row: AgreementForm | undefined): AgreementForm | null {
  if (!row) return null;
  const iso = (value: unknown) => value ? new Date(value as string | Date).toISOString() : null;
  return { ...row, expires_at: iso(row.expires_at)!, created_at: iso(row.created_at)!, updated_at: iso(row.updated_at)!, signed_at: iso(row.signed_at), printed_at: iso(row.printed_at), handed_off_at: iso(row.handed_off_at), revoked_at: iso(row.revoked_at) };
}

export async function consumeAgreementSignAttempt(token: string) {
  if (!isElectronicAgreementWorkflowEnabled() || !isValidAgreementToken(token)) return false;
  const result = await database().query("UPDATE inventory_agreement_forms SET sign_attempts=sign_attempts+1,updated_at=now() WHERE token_hash=$1 AND status='PENDING' AND expires_at>now() AND revoked_at IS NULL AND sign_attempts<5 RETURNING id", [hash(token)]);
  return Boolean(result.rowCount);
}

export async function consumeAgreementAccessAttempt(token: string) {
  if (!isValidAgreementToken(token)) return false;
  const result = await database().query("UPDATE inventory_agreement_forms SET access_attempts=access_attempts+1 WHERE token_hash=$1 AND status IN ('PENDING','SIGNED','PRINTED','HANDED_OFF','COMPLETED') AND expires_at>now() AND revoked_at IS NULL AND access_attempts<50 RETURNING id", [hash(token)]);
  return Boolean(result.rowCount);
}

export async function signAgreement(token: string, signerName: string) {
  if (!isElectronicAgreementWorkflowEnabled() || !isValidAgreementToken(token)) return null;
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const row = (await client.query<{ id: string; asset_id: string; person_id: string; status: string; data: Record<string, unknown>; terms_version: string; expires_at: Date; revoked_at: Date | null; sign_attempts: number }>(
      "SELECT id,asset_id,person_id,status,data,terms_version,expires_at,revoked_at,sign_attempts FROM inventory_agreement_forms WHERE token_hash=$1 FOR UPDATE", [hash(token)],
    )).rows[0];
    if (!row || row.status !== "PENDING" || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now() || row.sign_attempts < 1 || row.sign_attempts > 5) {
      await client.query("ROLLBACK");
      return null;
    }
    const assignmentId = typeof row.data.assignment_id === "string" ? row.data.assignment_id : "";
    const currentCustody = assignmentId && (await client.query(
      "SELECT c.id FROM inventory_assets a JOIN inventory_custody c ON c.id=$3 AND c.asset_id=a.id AND c.person_id=$2 AND c.returned_at IS NULL WHERE a.id=$1 AND a.data->>'current_assignment_id'=$3 FOR UPDATE OF a,c",
      [row.asset_id, row.person_id, assignmentId],
    )).rowCount;
    if (!currentCustody) {
      await client.query("ROLLBACK");
      return null;
    }
    const signedAt = (await client.query<{ signed_at: Date }>("SELECT clock_timestamp() AS signed_at")).rows[0].signed_at;
    const template = await readFile(templatePath);
    const document = await renderLaptopAgreementPdf(template, row.data, { signerName, signedAt: signedAt.toISOString() });
    if (document.byteLength > pdfLimit) throw new Error("The completed agreement PDF exceeds the safe storage limit.");
    const documentHash = sha256(document);
    const update = await client.query(
      "UPDATE inventory_agreement_forms SET status='COMPLETED',signed_at=$2,signature_consent=true,signature_consent_text=$3,signed_pdf=$4,signed_pdf_sha256=$5,data=data||jsonb_build_object('signer_name',$6::text),updated_at=$2 WHERE id=$1 AND status='PENDING' RETURNING id",
      [row.id, signedAt, ELECTRONIC_SIGNATURE_CONSENT_TEXT, Buffer.from(document), documentHash, signerName.trim()],
    );
    if (!update.rowCount) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      "UPDATE inventory_custody SET data=data||jsonb_build_object('agreement_signed',true,'agreement_signed_date',to_char($3::timestamptz AT TIME ZONE 'America/New_York','YYYY-MM-DD')) WHERE id=$1 AND asset_id=$2 AND returned_at IS NULL",
      [assignmentId, row.asset_id, signedAt],
    );
    await client.query(
      "INSERT INTO inventory_agreement_events(id,agreement_id,event_type,actor_type,actor_uid,actor_label,occurred_at,event_data) VALUES($1,$2,'ELECTRONICALLY_SIGNED','signer',NULL,$3,$4,$5)",
      [randomUUID(), row.id, signerName.trim(), signedAt, JSON.stringify({ terms_version: row.terms_version, signature_consent: true, consent_text: ELECTRONIC_SIGNATURE_CONSENT_TEXT, document_sha256: documentHash })],
    );
    await client.query("COMMIT");
    return { signedAt: signedAt.toISOString(), signerName: signerName.trim(), documentSha256: documentHash };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

type PdfRow = { signed_pdf: Buffer; signed_pdf_sha256: string };
function verifyPdf(row: PdfRow | undefined) {
  if (!row) return null;
  const bytes = Buffer.from(row.signed_pdf);
  if (bytes.byteLength < 100 || bytes.byteLength > pdfLimit || sha256(bytes) !== row.signed_pdf_sha256) throw new Error("Stored agreement document failed its integrity check.");
  return { bytes, sha256: row.signed_pdf_sha256 };
}

export async function getSignedAgreementPdf(id: string) {
  const row = (await database().query<PdfRow>("SELECT signed_pdf,signed_pdf_sha256 FROM inventory_agreement_forms WHERE id=$1 AND status='COMPLETED' AND signed_pdf IS NOT NULL", [id])).rows[0];
  return verifyPdf(row);
}

export async function getSignedAgreementPdfByToken(token: string) {
  if (!isValidAgreementToken(token)) return null;
  const row = (await database().query<PdfRow>("SELECT signed_pdf,signed_pdf_sha256 FROM inventory_agreement_forms WHERE token_hash=$1 AND status='COMPLETED' AND signed_pdf IS NOT NULL AND expires_at>now() AND revoked_at IS NULL", [hash(token)])).rows[0];
  return verifyPdf(row);
}

export async function listAgreementForms() {
  return (await database().query<AgreementForm & { is_expired: boolean }>(
    "SELECT id,asset_id,person_id,data,terms_version,status,signed_at,printed_at,handed_off_at,printed_by,handed_off_by,revoked_at,revoked_by,expires_at,expires_at<=now() AS is_expired,created_at,updated_at,signature_consent,signature_consent_text,signed_pdf_sha256 FROM inventory_agreement_forms ORDER BY created_at DESC",
  )).rows;
}

export async function listAgreementEvents(id: string) {
  return (await database().query<{ event_type: string; actor_type: string; actor_uid: string | null; actor_label: string; occurred_at: Date; event_data: Record<string, unknown> }>(
    "SELECT event_type,actor_type,actor_uid,actor_label,occurred_at,event_data FROM inventory_agreement_events WHERE agreement_id=$1 ORDER BY occurred_at,id", [id],
  )).rows;
}

export async function revokePendingAgreement(id: string, actor: string, actorLabel: string) {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("UPDATE inventory_agreement_forms SET revoked_at=now(),revoked_by=$2,updated_at=now() WHERE id=$1 AND status='PENDING' AND revoked_at IS NULL AND expires_at>now() RETURNING id,revoked_at", [id, actor]);
    const row = result.rows[0] as { id: string; revoked_at: Date } | undefined;
    if (!row) throw new Error("Only an active pending agreement link can be revoked.");
    await client.query("INSERT INTO inventory_agreement_events(id,agreement_id,event_type,actor_type,actor_uid,actor_label,occurred_at) VALUES($1,$2,'REVOKED','staff',$3,$4,$5)", [randomUUID(), id, actor, actorLabel, row.revoked_at]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAgreementTracking(id: string, field: "printed_at" | "handed_off_at", actor: string, actorLabel: string) {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const row = (await client.query<{ status: string }>("SELECT status FROM inventory_agreement_forms WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!row) throw new Error("Agreement not found.");
    if (field === "printed_at" && !canMarkAgreementPrinted(row.status)) throw new Error("Only signed legacy agreements can be printed.");
    if (field === "handed_off_at" && !canMarkAgreementHandedOff(row.status)) throw new Error("Mark the legacy agreement printed before handoff.");
    const status = field === "printed_at" ? "PRINTED" : "HANDED_OFF";
    const event = field === "printed_at" ? "LEGACY_PRINTED" : "LEGACY_HANDED_OFF";
    const result = await client.query(`UPDATE inventory_agreement_forms SET ${field}=clock_timestamp(),${field === "printed_at" ? "printed_by" : "handed_off_by"}=$2,status=$3,updated_at=clock_timestamp() WHERE id=$1 RETURNING ${field} AS occurred_at`, [id, actor, status]);
    await client.query("INSERT INTO inventory_agreement_events(id,agreement_id,event_type,actor_type,actor_uid,actor_label,occurred_at) VALUES($1,$2,$3,'staff',$4,$5,$6)", [randomUUID(), id, event, actor, actorLabel, result.rows[0].occurred_at]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
