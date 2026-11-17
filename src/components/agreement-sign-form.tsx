"use client";

import { useState } from "react";

export function AgreementSignForm({token,onSigned}:{token:string;onSigned:(name:string,signedAt:string)=>void}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  return <form className="mt-5 grid gap-5" aria-busy={busy} onSubmit={async event=>{
        event.preventDefault();if(busy)return;setBusy(true);setError("");
        const form=new FormData(event.currentTarget),name=String(form.get("signerName")||"");
        try {
          const response=await fetch("/api/agreement/sign",{method:"POST",body:JSON.stringify({token,signerName:name,consent:form.get("consent")==="on"}),headers:{"Accept":"application/json","Content-Type":"application/json"},cache:"no-store",credentials:"same-origin"});
          const payload=await response.json().catch(()=>({}));
          if(response.ok&&typeof payload.signedAt==="string"){onSigned(typeof payload.signerName==="string"?payload.signerName:name,payload.signedAt);return;}
          setError(typeof payload.error==="string"?payload.error:"Unable to record your signature. Please check your entries and try again.");
        } catch {setError("We could not reach the signing service. Your entries are still on this page; check your connection and try again.");}
        finally{setBusy(false);}
      }}>
      <label className="grid gap-2 text-sm font-medium" htmlFor="signerName">Your full name<input id="signerName" className="min-h-11 rounded-md border bg-background px-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" name="signerName" required maxLength={200} autoComplete="name"/></label>
      <label className="flex items-start gap-3 rounded-md border p-4 text-sm leading-6"><input className="mt-1 size-5 shrink-0 accent-primary" type="checkbox" name="consent" required/><span>I agree that typing my name is my electronic signature for this agreement.</span></label>
      {error&&<p className="rounded-md border border-destructive p-3 text-sm text-destructive" role="alert">{error}</p>}
      <button type="submit" disabled={busy} className="min-h-11 w-full rounded-md bg-primary px-5 font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-fit">{busy?"Recording signature…":"Review and sign agreement"}</button>
    </form>;
}
