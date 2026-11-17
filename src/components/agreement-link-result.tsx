"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isValidAgreementToken } from "@/lib/sql/agreement-state";

export function AgreementLinkResult(){
  const hash=useSyncExternalStore(subscribeToHash,readHash,()=>"\u0000");
  const params=new URLSearchParams(hash.startsWith("#")?hash.slice(1):"");
  const token=params.get("created")||"";
  const expires=params.get("expires")||"";
  const expiresAt=/^\d{13}$/.test(expires)?new Date(Number(expires)).toISOString():"";
  useEffect(()=>{
    if(isValidAgreementToken(token))window.history.replaceState(null,"",`${window.location.pathname}${window.location.search}`);
  },[token]);
  if(!isValidAgreementToken(token)||typeof window==="undefined")return null;
  const url=`${window.location.origin}/agreement#token=${encodeURIComponent(token)}`;
  return <AgreementLinkDisplay url={url} expiresAt={expiresAt}/>;
}

function AgreementLinkDisplay({url,expiresAt}:{url:string;expiresAt:string}){
  const [copied,setCopied]=useState(false);
  const [error,setError]=useState("");
  return <section className="rounded-lg border border-emerald-700 bg-emerald-50 p-4 text-emerald-950" aria-live="polite"><h2 className="font-semibold">Signing link created</h2><p className="mt-1 text-sm">Share this private link directly with the assigned employee. It expires in seven days{expiresAt?` (on ${new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZone:"America/New_York",timeZoneName:"short"}).format(new Date(expiresAt))})`:""}.</p><label className="mt-3 grid gap-1 text-sm font-medium">Private signing link<input aria-label="Private signing link" className="min-h-11 w-full rounded-md border border-emerald-800 bg-white px-3 font-normal" readOnly value={url} onFocus={event=>event.currentTarget.select()}/></label><button type="button" className="mt-3 min-h-11 rounded-md border border-emerald-800 px-4 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800" onClick={async()=>{try{await navigator.clipboard.writeText(url);setCopied(true);setError("");}catch{setError("Clipboard access was blocked. Select and copy the link from the field above.");}}}>{copied?"Link copied":"Copy signing link"}</button>{error&&<p className="mt-2 text-sm" role="alert">{error}</p>}</section>;
}

function readHash(){return window.location.hash;}
function subscribeToHash(onChange:()=>void){window.addEventListener("hashchange",onChange);return()=>window.removeEventListener("hashchange",onChange);}
