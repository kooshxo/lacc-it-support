"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AgreementDocument } from "@/components/agreement-document";
import { AgreementSignForm } from "@/components/agreement-sign-form";
import { isValidAgreementToken } from "@/lib/sql/agreement-state";

type Agreement={data:Record<string,unknown>;status:string;signedAt:string|null;expiresAt:string;termsVersion:string};
const unavailable="This agreement link is unavailable, expired, revoked, or already completed. Contact LACC IT for help.";

export function PublicAgreement(){
  const hash=useSyncExternalStore(subscribeToHash,readHash,()=>"\u0000");
  const token=new URLSearchParams(hash.startsWith("#")?hash.slice(1):"").get("token")||"";
  useEffect(()=>{if(isValidAgreementToken(token))window.history.replaceState(null,"",window.location.pathname);},[token]);
  if(hash==="\u0000")return <AgreementLoading/>;
  if(!isValidAgreementToken(token))return <UnavailableAgreement message={unavailable}/>;
  return <AgreementLoader token={token}/>;
}

function AgreementLoader({token}:{token:string}){
  const [agreement,setAgreement]=useState<Agreement|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    void (async()=>{
      try{
        const response=await fetch("/api/agreement/access",{method:"POST",body:JSON.stringify({token}),headers:{"Content-Type":"application/json","Accept":"application/json"},cache:"no-store",credentials:"same-origin",signal:controller.signal});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok||!payload.agreement){setError(typeof payload.error==="string"?payload.error:unavailable);return;}
        setAgreement(payload.agreement as Agreement);
      }catch(error){if(error instanceof DOMException&&error.name==="AbortError")return;setError("The agreement could not be loaded. Check your connection and reopen the private link.");}
    })();
    return()=>controller.abort();
  },[token]);
  if(error)return <UnavailableAgreement message={error}/>;
  if(!agreement)return <AgreementLoading/>;
  const onSigned=(name:string,signedAt:string)=>setAgreement(current=>current?{...current,status:"SIGNED",signedAt,data:{...current.data,signer_name:name}}:current);
  return <main className="min-h-screen bg-muted/30 p-4 sm:p-6 print:bg-white print:p-0"><p className="no-print mx-auto mb-3 max-w-3xl text-sm text-muted-foreground">Review the equipment details and complete terms before signing. This private link expires {new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(agreement.expiresAt))}.</p><AgreementDocument data={agreement.data} signedAt={agreement.signedAt} termsVersion={agreement.termsVersion} pending={agreement.status==="PENDING"} printable={agreement.status!=="PENDING"}>{agreement.status==="PENDING"&&<AgreementSignForm token={token} onSigned={onSigned}/>}</AgreementDocument>{agreement.status!=="PENDING"&&<p className="no-print mx-auto mt-4 max-w-3xl rounded-md border border-emerald-700 bg-emerald-50 p-4 font-medium text-emerald-950" role="status">Electronic signature recorded. You may print this page for the remaining physical processing steps.</p>}</main>;
}

function AgreementLoading(){return <main className="grid min-h-screen place-items-center p-5"><p className="rounded-lg border bg-card p-5" role="status">Loading your agreement…</p></main>;}
function UnavailableAgreement({message}:{message:string}){return <main className="mx-auto max-w-xl p-5 sm:p-8"><section className="rounded-lg border bg-card p-6"><p className="text-sm font-semibold text-muted-foreground">The Latin American Community Center</p><h1 className="mt-2 text-2xl font-bold">Agreement link unavailable</h1><p className="mt-3 leading-7">{message}</p></section></main>;}
function readHash(){return window.location.hash;}
function subscribeToHash(onChange:()=>void){window.addEventListener("hashchange",onChange);return()=>window.removeEventListener("hashchange",onChange);}
