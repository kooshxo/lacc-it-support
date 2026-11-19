import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only",()=>({}));
vi.mock("@/lib/config/runtime-safety",()=>({assertSafeSqlConfiguration:vi.fn()}));

import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { database } from "@/lib/sql/client";
import { createAgreementForCurrentAssignment, isPublicAgreementAccessible, consumeAgreementSignAttempt, getAgreementById, getAgreementByToken, getSignedAgreementPdf, isAgreementStorageReady, listAgreementEvents, listAgreementForms, revokePendingAgreement, signAgreement, updateAgreementTracking } from "@/lib/sql/agreements";

const url=process.env.TEST_AGREEMENTS_DATABASE_URL;
const describePg=url?describe:describe.skip;
const pool=url?new Pool({connectionString:url,max:4}):undefined;
const assetId="asset-agreement-test";
const personId="person-agreement-test";
const assignmentId="custody-agreement-test";
const create=()=>createAgreementForCurrentAssignment(assetId,"synthetic-it","Synthetic IT");

describePg("equipment agreement SQL lifecycle",()=>{
  beforeAll(async()=>{
    const connection=new URL(url!);
    if(!["localhost","127.0.0.1","::1"].includes(connection.hostname)||!/^\/lacc_agreements_test(?:_[a-z0-9_]+)?$/.test(connection.pathname))throw new Error("Refusing agreement integration tests outside a dedicated local lacc_agreements_test database.");
    process.env.APP_DATABASE_URL=url!;process.env.DATA_BACKEND="sql";process.env.VERCEL_ENV="preview";process.env.ELECTRONIC_AGREEMENTS_ENABLED="true";
    await pool!.query("CREATE TABLE IF NOT EXISTS inventory_assets(id text PRIMARY KEY,data jsonb NOT NULL)");
    await pool!.query("CREATE TABLE IF NOT EXISTS inventory_people(id text PRIMARY KEY,data jsonb NOT NULL)");
    await pool!.query("CREATE TABLE IF NOT EXISTS inventory_custody(id text PRIMARY KEY,asset_id text NOT NULL REFERENCES inventory_assets(id),person_id text NOT NULL REFERENCES inventory_people(id),returned_at timestamptz,data jsonb NOT NULL)");
    const migration=await readFile(new URL("../../migrations/011_agreement_forms.sql",import.meta.url),"utf8");
    await pool!.query(migration);await pool!.query(migration);
    await pool!.query("DROP TABLE inventory_agreement_forms CASCADE");
    await pool!.query("CREATE TABLE inventory_agreement_forms(id text PRIMARY KEY,token_hash text NOT NULL UNIQUE,asset_id text NOT NULL REFERENCES inventory_assets(id),person_id text NOT NULL REFERENCES inventory_people(id),data jsonb NOT NULL,status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SIGNED','PRINTED','HANDED_OFF')),signed_at timestamptz,printed_at timestamptz,handed_off_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())");
    await pool!.query("INSERT INTO inventory_people(id,data) VALUES('legacy-person',$1)",[JSON.stringify({full_name:"Legacy Synthetic Person"})]);
    await pool!.query("INSERT INTO inventory_assets(id,data) VALUES('legacy-asset',$1)",[JSON.stringify({asset_code:"LEGACY-KEEP"})]);
    await pool!.query("INSERT INTO inventory_agreement_forms(id,token_hash,asset_id,person_id,data,status,signed_at,created_at) VALUES('legacy-agreement','legacy-hash','legacy-asset','legacy-person',$1,'SIGNED','2026-10-01T12:00:00.000Z','2026-10-01T12:00:00.000Z')",[JSON.stringify({legacy:"preserve-me"})]);
    await pool!.query(migration);
    await pool!.query(await readFile(new URL("../../migrations/012_signed_agreement_documents.sql",import.meta.url),"utf8"));
    const upgraded=(await pool!.query<{data:Record<string,unknown>;terms_version:string;sign_attempts:number;access_attempts:number;expires_at:Date;status:string;signed_at:Date}>("SELECT data,terms_version,sign_attempts,access_attempts,expires_at,status,signed_at FROM inventory_agreement_forms WHERE id='legacy-agreement'")).rows[0];
    expect(upgraded).toMatchObject({data:{legacy:"preserve-me"},terms_version:"LEGACY-UNVERSIONED",sign_attempts:0,access_attempts:0,status:"SIGNED"});
    expect(new Date(upgraded.expires_at).toISOString()).toBe("2026-10-08T12:00:00.000Z");
    expect(new Date(upgraded.signed_at).toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });
  beforeEach(async()=>{
    await pool!.query("TRUNCATE inventory_agreement_events,inventory_agreement_forms,inventory_custody,inventory_assets,inventory_people CASCADE");
    await pool!.query("INSERT INTO inventory_people(id,data) VALUES($1,$2)",[personId,JSON.stringify({full_name:"Synthetic Staff Member",email:"synthetic@example.invalid",is_active:true})]);
    await pool!.query("INSERT INTO inventory_assets(id,data) VALUES($1,$2)",[assetId,JSON.stringify({asset_code:"TEST-AGR-001",category:"Laptop",manufacturer:"Example",model:"Laptop",serial_number:"SYNTHETIC-SERIAL",inventory_number:"SYNTHETIC-INVENTORY",current_assignment_id:assignmentId})]);
    await pool!.query("INSERT INTO inventory_custody(id,asset_id,person_id,returned_at,data) VALUES($1,$2,$3,NULL,$4)",[assignmentId,assetId,personId,JSON.stringify({issue_date:"2026-11-17",expected_return_date:null})]);
  });
  afterAll(async()=>{
    await pool?.query("TRUNCATE inventory_agreement_events,inventory_agreement_forms,inventory_custody,inventory_assets,inventory_people CASCADE").catch(()=>{});
    await pool?.end();
    const appPool=database() as Pool;
    await appPool.end().catch(()=>{});
  });

  it("creates, signs, stores and verifies an immutable flattened PDF, then marks custody acknowledged",async()=>{
    expect(await isAgreementStorageReady()).toBe(true);
    const created=await create();
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.data).toMatchObject({asset_code:"TEST-AGR-001",person_name:"Synthetic Staff Member",serial_number:"SYNTHETIC-SERIAL"});
    const stored=(await pool!.query<{token_hash:string;terms_version:string;data:Record<string,unknown>}>("SELECT token_hash,terms_version,data FROM inventory_agreement_forms WHERE id=$1",[created.id])).rows[0];
    expect(stored.token_hash).not.toBe(created.token);
    expect(stored.terms_version).toMatch(/^LACC-LAPTOP-ACKNOWLEDGEMENT-/);
    expect(stored.data.terms_text).toContain("Latin American Community Center");
    expect(await consumeAgreementSignAttempt(created.token)).toBe(true);
    const signed=await signAgreement(created.token,"Synthetic Signer");
    expect(signed).toMatchObject({signerName:"Synthetic Signer"});
    expect(Date.parse(signed!.signedAt)).not.toBeNaN();
    expect(await signAgreement(created.token,"Second Signer")).toBeNull();
    const pdf=await getSignedAgreementPdf(created.id);
    expect(pdf?.sha256).toBe(signed!.documentSha256);
    const parsedPdf=await PDFDocument.load(pdf!.bytes);
    expect(parsedPdf.getPageCount()).toBe(1);
    expect(parsedPdf.getPage(0).getWidth()).toBe(612);
    expect((await listAgreementEvents(created.id)).map(event=>event.event_type)).toEqual(["LINK_CREATED","ELECTRONICALLY_SIGNED"]);
    const custody=(await pool!.query<{data:Record<string,unknown>}>("SELECT data FROM inventory_custody WHERE id=$1",[assignmentId])).rows[0].data;
    expect(custody.agreement_signed).toBe(true);
    expect(custody.agreement_signed_date).toBe(new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(signed!.signedAt)));
    expect(await getAgreementByToken(created.token)).toMatchObject({status:"COMPLETED",data:{signer_name:"Synthetic Signer"},signature_consent:true,signed_pdf_sha256:signed!.documentSha256});
    await expect(pool!.query("UPDATE inventory_agreement_forms SET signed_pdf_sha256=$2 WHERE id=$1",[created.id,"0".repeat(64)])).rejects.toThrow("The signed agreement document is immutable.");
    await expect(pool!.query("UPDATE inventory_agreement_forms SET data=data||'{\"person_name\":\"Tampered\"}'::jsonb WHERE id=$1",[created.id])).rejects.toThrow("The signed agreement document is immutable.");
    await expect(pool!.query("UPDATE inventory_agreement_events SET actor_label='Tampered' WHERE agreement_id=$1 AND event_type='ELECTRONICALLY_SIGNED'",[created.id])).rejects.toThrow("Agreement history is append-only.");
    await expect(pool!.query("DELETE FROM inventory_agreement_forms WHERE id=$1",[created.id])).rejects.toThrow("A signed agreement record cannot be deleted.");
    expect(await getAgreementById(created.id)).toMatchObject({status:"COMPLETED",printed_by:null,handed_off_by:null});
  });

  it("refuses to issue a laptop letter for a non-laptop assignment",async()=>{
    await pool!.query("UPDATE inventory_assets SET data=jsonb_set(data,'{category}','\"Phone\"'::jsonb) WHERE id=$1",[assetId]);
    await expect(create()).rejects.toThrow("Laptop agreements are only available for laptop assets.");
    expect((await pool!.query("SELECT count(*) FROM inventory_agreement_forms")).rows[0].count).toBe("0");
  });

  it("preserves the legacy paper status workflow for existing agreements only",async()=>{
    await pool!.query("INSERT INTO inventory_agreement_forms(id,token_hash,asset_id,person_id,data,status,expires_at) VALUES('legacy-paper-test','legacy-paper-token',$1,$2,$3,'SIGNED',now()+interval '7 days')",[assetId,personId,JSON.stringify({person_name:"Synthetic Staff Member",asset_code:"TEST-AGR-001"})]);
    await updateAgreementTracking("legacy-paper-test","printed_at","synthetic-it","Synthetic IT");
    await updateAgreementTracking("legacy-paper-test","handed_off_at","synthetic-it","Synthetic IT");
    expect(await getAgreementById("legacy-paper-test")).toMatchObject({status:"HANDED_OFF",printed_by:"synthetic-it",handed_off_by:"synthetic-it"});
    expect((await listAgreementEvents("legacy-paper-test")).map(event=>event.event_type)).toEqual(["LEGACY_PRINTED","LEGACY_HANDED_OFF"]);
  });

  it("expires and revokes links, and refuses signatures after custody has ended",async()=>{
    const created=await create();
    expect(await getAgreementByToken(created.token)).not.toBeNull();
    await revokePendingAgreement(created.id,"synthetic-admin","Synthetic Admin");
    expect(await getAgreementByToken(created.token)).toBeNull();
    expect(await isPublicAgreementAccessible(created.token)).toBe(false);
    expect(await consumeAgreementSignAttempt(created.token)).toBe(false);
    await expect(revokePendingAgreement(created.id,"synthetic-admin","Synthetic Admin")).rejects.toThrow("Only an active pending agreement link can be revoked.");
    const expired=await create();
    await pool!.query("UPDATE inventory_agreement_forms SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);
    expect(await getAgreementByToken(expired.token)).toBeNull();
    expect(await isPublicAgreementAccessible(expired.token)).toBe(false);
    expect(await consumeAgreementSignAttempt(expired.token)).toBe(false);
    const stale=await create();
    await consumeAgreementSignAttempt(stale.token);
    await pool!.query("UPDATE inventory_custody SET returned_at=now() WHERE id=$1",[assignmentId]);
    expect(await signAgreement(stale.token,"Synthetic Signer")).toBeNull();
  });

  it("allows repeated public reads without consuming the link, while bounding signing attempts",async()=>{
    const created=await create();
    for(let i=0;i<75;i++)expect(await isPublicAgreementAccessible(created.token)).toBe(true);
    const attempts=(await pool!.query<{access_attempts:number}>("SELECT access_attempts FROM inventory_agreement_forms WHERE id=$1",[created.id])).rows[0].access_attempts;
    expect(attempts).toBe(0);
    for(let i=0;i<5;i++)expect(await consumeAgreementSignAttempt(created.token)).toBe(true);
    expect(await consumeAgreementSignAttempt(created.token)).toBe(false);
  });

  it("serializes simultaneous signatures and records one signature event",async()=>{
    const created=await create();
    await consumeAgreementSignAttempt(created.token);
    const signatures=await Promise.all([signAgreement(created.token,"First Signer"),signAgreement(created.token,"Second Signer")]);
    expect(signatures.filter(Boolean)).toHaveLength(1);
    expect((await listAgreementEvents(created.id)).filter(event=>event.event_type==="ELECTRONICALLY_SIGNED")).toHaveLength(1);
    expect((await listAgreementForms())).toHaveLength(1);
  });
});
