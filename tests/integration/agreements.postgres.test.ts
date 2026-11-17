import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only",()=>({}));
vi.mock("@/lib/config/runtime-safety",()=>({assertSafeSqlConfiguration:vi.fn()}));

import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { database } from "@/lib/sql/client";
import { createAgreementForCurrentAssignment, consumeAgreementAccessAttempt, consumeAgreementSignAttempt, getAgreementById, getAgreementByToken, isAgreementStorageReady, listAgreementForms, revokePendingAgreement, signAgreement, updateAgreementTracking } from "@/lib/sql/agreements";

const url=process.env.TEST_AGREEMENTS_DATABASE_URL;
const describePg=url?describe:describe.skip;
const pool=url?new Pool({connectionString:url,max:4}):undefined;
const assetId="asset-agreement-test";
const personId="person-agreement-test";
const assignmentId="custody-agreement-test";

describePg("equipment agreement SQL lifecycle",()=>{
  beforeAll(async()=>{
    const connection=new URL(url!);
    if(!["localhost","127.0.0.1","::1"].includes(connection.hostname)||!/^\/lacc_agreements_test(?:_[a-z0-9_]+)?$/.test(connection.pathname))throw new Error("Refusing agreement integration tests outside a dedicated local lacc_agreements_test database.");
    process.env.APP_DATABASE_URL=url!;process.env.DATA_BACKEND="sql";process.env.VERCEL_ENV="preview";
    await pool!.query("CREATE TABLE IF NOT EXISTS inventory_assets(id text PRIMARY KEY,data jsonb NOT NULL)");
    await pool!.query("CREATE TABLE IF NOT EXISTS inventory_people(id text PRIMARY KEY,data jsonb NOT NULL)");
    await pool!.query("CREATE TABLE IF NOT EXISTS inventory_custody(id text PRIMARY KEY,asset_id text NOT NULL REFERENCES inventory_assets(id),person_id text NOT NULL REFERENCES inventory_people(id),returned_at timestamptz,data jsonb NOT NULL)");
    const migration=await readFile(new URL("../../migrations/011_agreement_forms.sql",import.meta.url),"utf8");
    await pool!.query(migration);
    await pool!.query(migration);
    await pool!.query("DROP TABLE inventory_agreement_forms CASCADE");
    await pool!.query("CREATE TABLE inventory_agreement_forms(id text PRIMARY KEY,token_hash text NOT NULL UNIQUE,asset_id text NOT NULL REFERENCES inventory_assets(id),person_id text NOT NULL REFERENCES inventory_people(id),data jsonb NOT NULL,status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SIGNED','PRINTED','HANDED_OFF')),signed_at timestamptz,printed_at timestamptz,handed_off_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())");
    await pool!.query("INSERT INTO inventory_people(id,data) VALUES('legacy-person',$1)",[JSON.stringify({full_name:"Legacy Synthetic Person"})]);
    await pool!.query("INSERT INTO inventory_assets(id,data) VALUES('legacy-asset',$1)",[JSON.stringify({asset_code:"LEGACY-KEEP"})]);
    await pool!.query("INSERT INTO inventory_agreement_forms(id,token_hash,asset_id,person_id,data,status,signed_at,created_at) VALUES('legacy-agreement','legacy-hash','legacy-asset','legacy-person',$1,'SIGNED','2026-10-01T12:00:00.000Z','2026-10-01T12:00:00.000Z')",[JSON.stringify({legacy:"preserve-me"})]);
    await pool!.query(migration);
    const upgraded=(await pool!.query<{data:Record<string,unknown>;terms_version:string;sign_attempts:number;access_attempts:number;expires_at:Date;status:string;signed_at:Date}>("SELECT data,terms_version,sign_attempts,access_attempts,expires_at,status,signed_at FROM inventory_agreement_forms WHERE id='legacy-agreement'")).rows[0];
    expect(upgraded).toMatchObject({data:{legacy:"preserve-me"},terms_version:"LEGACY-UNVERSIONED",sign_attempts:0,access_attempts:0,status:"SIGNED"});
    expect(new Date(upgraded.expires_at).toISOString()).toBe("2026-10-08T12:00:00.000Z");
    expect(new Date(upgraded.signed_at).toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });
  beforeEach(async()=>{
    await pool!.query("TRUNCATE inventory_agreement_forms,inventory_custody,inventory_assets,inventory_people CASCADE");
    await pool!.query("INSERT INTO inventory_people(id,data) VALUES($1,$2)",[personId,JSON.stringify({full_name:"Synthetic Staff Member",email:"synthetic@example.invalid",is_active:true})]);
    await pool!.query("INSERT INTO inventory_assets(id,data) VALUES($1,$2)",[assetId,JSON.stringify({asset_code:"TEST-AGR-001",manufacturer:"Example",model:"Laptop",serial_number:"SYNTHETIC-SERIAL",inventory_number:"SYNTHETIC-INVENTORY",current_assignment_id:assignmentId})]);
    await pool!.query("INSERT INTO inventory_custody(id,asset_id,person_id,returned_at,data) VALUES($1,$2,$3,NULL,$4)",[assignmentId,assetId,personId,JSON.stringify({issue_date:"2026-11-17",expected_return_date:null})]);
  });
  afterAll(async()=>{
    await pool?.query("TRUNCATE inventory_agreement_forms,inventory_custody,inventory_assets,inventory_people CASCADE").catch(()=>{});
    await pool?.end();
    const appPool=database() as Pool;
    await appPool.end().catch(()=>{});
  });

  it("creates from the current assignment, snapshots approved terms, and signs only once",async()=>{
    expect(await isAgreementStorageReady()).toBe(true);
    const created=await createAgreementForCurrentAssignment(assetId);
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.data).toMatchObject({asset_code:"TEST-AGR-001",person_name:"Synthetic Staff Member",serial_number:"SYNTHETIC-SERIAL"});
    expect(created.expiresAt).toBeTruthy();
    const stored=(await pool!.query<{token_hash:string;terms_version:string;data:Record<string,unknown>}>("SELECT token_hash,terms_version,data FROM inventory_agreement_forms WHERE id=$1",[created.id])).rows[0];
    expect(stored.token_hash).not.toBe(created.token);
    expect(stored.terms_version).toMatch(/^LACC-LAPTOP-ACKNOWLEDGEMENT-/);
    expect(stored.data.terms_text).toContain("Latin American Community Center");
    expect(await consumeAgreementSignAttempt(created.token)).toBe(true);
    expect(Date.parse((await signAgreement(created.token,"Synthetic Signer"))||"")).not.toBeNaN();
    expect(await signAgreement(created.token,"Second Signer")).toBeNull();
    expect(await getAgreementByToken(created.token)).toMatchObject({status:"SIGNED",data:{signer_name:"Synthetic Signer"}});
    await updateAgreementTracking(created.id,"printed_at","synthetic-it-actor");
    await updateAgreementTracking(created.id,"handed_off_at","synthetic-handoff-actor");
    const row=await getAgreementById(created.id);
    expect(row).toMatchObject({status:"HANDED_OFF",printed_by:"synthetic-it-actor",handed_off_by:"synthetic-handoff-actor"});
    expect(Date.parse(row!.signed_at!)).not.toBeNaN();
    expect(Date.parse(row!.printed_at!)).not.toBeNaN();
    expect(Date.parse(row!.handed_off_at!)).not.toBeNaN();
  });

  it("rejects out-of-order transitions, expires links, and revokes only active pending links",async()=>{
    const created=await createAgreementForCurrentAssignment(assetId);
    await expect(updateAgreementTracking(created.id,"printed_at","synthetic-it-actor")).rejects.toThrow("Only signed agreements can be printed.");
    expect(await getAgreementByToken(created.token)).not.toBeNull();
    await revokePendingAgreement(created.id,"synthetic-admin");
    expect(await getAgreementByToken(created.token)).toBeNull();
    expect(await consumeAgreementSignAttempt(created.token)).toBe(false);
    await expect(revokePendingAgreement(created.id,"synthetic-admin")).rejects.toThrow("Only an active pending agreement link can be revoked.");
    const reissued=await createAgreementForCurrentAssignment(assetId);
    expect(reissued.token).not.toBe(created.token);
    expect(await getAgreementByToken(reissued.token)).toMatchObject({status:"PENDING"});
    const expired=await createAgreementForCurrentAssignment(assetId);
    await pool!.query("UPDATE inventory_agreement_forms SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);
    expect(await getAgreementByToken(expired.token)).toBeNull();
    expect(await consumeAgreementSignAttempt(expired.token)).toBe(false);
  });

  it("enforces the bounded signing-attempt count and rejects stale assignment data",async()=>{
    const created=await createAgreementForCurrentAssignment(assetId);
    for(let i=0;i<5;i++)expect(await consumeAgreementSignAttempt(created.token)).toBe(true);
    expect(await consumeAgreementSignAttempt(created.token)).toBe(false);
    expect(Date.parse((await signAgreement(created.token,"Synthetic Signer"))||"")).not.toBeNaN();
    const staleAsset=await pool!.query("UPDATE inventory_custody SET returned_at=now() WHERE id=$1",[assignmentId]);
    expect(staleAsset.rowCount).toBe(1);
    await expect(createAgreementForCurrentAssignment(assetId)).rejects.toThrow("The equipment assignment is no longer active.");
  });

  it("bounds repeated public agreement reads per bearer link",async()=>{
    const created=await createAgreementForCurrentAssignment(assetId);
    for(let i=0;i<50;i++)expect(await consumeAgreementAccessAttempt(created.token)).toBe(true);
    expect(await consumeAgreementAccessAttempt(created.token)).toBe(false);
  });

  it("serializes concurrent signing and rejects duplicate print/handoff transitions",async()=>{
    const created=await createAgreementForCurrentAssignment(assetId);
    await consumeAgreementSignAttempt(created.token);
    const signatures=await Promise.all([signAgreement(created.token,"First Signer"),signAgreement(created.token,"Second Signer")]);
    expect(signatures.filter(Boolean)).toHaveLength(1);
    await updateAgreementTracking(created.id,"printed_at","synthetic-it-actor");
    await expect(updateAgreementTracking(created.id,"printed_at","synthetic-it-actor")).rejects.toThrow("Only signed agreements can be printed.");
    await updateAgreementTracking(created.id,"handed_off_at","synthetic-it-actor");
    await expect(updateAgreementTracking(created.id,"handed_off_at","synthetic-it-actor")).rejects.toThrow("Mark the agreement printed before handoff.");
    expect((await listAgreementForms())).toHaveLength(1);
  });
});
