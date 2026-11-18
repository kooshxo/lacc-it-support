"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AgreementForm } from "@/lib/sql/agreements";
import { inventoryAction } from "@/app/(portal)/inventory/actions";
import { AgreementRevokeForm } from "@/components/agreement-revoke-form";
import { agreementNextAction } from "@/lib/sql/agreement-state";

type Row=AgreementForm & {is_expired:boolean};
const statuses=["ALL","PENDING","SIGNED","PRINTED","HANDED_OFF","COMPLETED","EXPIRED","REVOKED"] as const;
const badge:Record<string,string>={PENDING:"border-amber-700 bg-amber-50 text-amber-950",SIGNED:"border-blue-700 bg-blue-50 text-blue-950",PRINTED:"border-violet-700 bg-violet-50 text-violet-950",HANDED_OFF:"border-emerald-700 bg-emerald-50 text-emerald-950",COMPLETED:"border-emerald-800 bg-emerald-100 text-emerald-950",EXPIRED:"border-slate-600 bg-slate-100 text-slate-950",REVOKED:"border-red-700 bg-red-50 text-red-950"};
function date(value:string|null){return value?new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)):"—";}
function label(row:Row){if(row.status==="COMPLETED")return "Completed · electronically signed";const next=agreementNextAction({status:row.status as "PENDING"|"SIGNED"|"PRINTED"|"HANDED_OFF"|"COMPLETED",expiresAt:row.expires_at,revokedAt:row.revoked_at});return ({REVOKED:"Revoked",EXPIRED:"Expired",AWAITING_SIGNATURE:"Pending",PRINT:"Signed · legacy",HAND_OFF:"Printed · legacy",COMPLETE:"Handed off · legacy"} as const)[next];}

export function AgreementTable({rows}:{rows:Row[]}){
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState<(typeof statuses)[number]>("ALL");
  const [sort,setSort]=useState("newest");
  const visible=useMemo(()=>rows.filter(row=>{
    const name=String(row.data.person_name||"").toLowerCase(),email=String(row.data.person_email||"").toLowerCase();
    const equipment=[row.data.asset_code,row.data.serial_number,row.data.model,row.asset_id].join(" ").toLowerCase();
    const state=row.revoked_at?"REVOKED":row.status==="PENDING"&&row.is_expired?"EXPIRED":row.status;
    return (!query||`${name} ${email} ${equipment}`.includes(query.trim().toLowerCase()))&&(status==="ALL"||state===status);
  }).sort((a,b)=>sort==="oldest"?a.created_at.localeCompare(b.created_at):a.created_at.localeCompare(b.created_at)*-1),[rows,query,status,sort]);
  return <section className="overflow-hidden rounded-lg border bg-card">
    <div className="grid gap-3 border-b p-4 sm:grid-cols-[minmax(0,1fr)_12rem_10rem]">
      <label className="grid gap-1 text-sm font-medium">Search agreements<input className="min-h-11 rounded-md border bg-background px-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Employee, email, asset, or serial"/></label>
      <label className="grid gap-1 text-sm font-medium">Status<select className="min-h-11 rounded-md border bg-background px-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={status} onChange={e=>setStatus(e.target.value as (typeof statuses)[number])}>{statuses.map(value=><option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-medium">Sort by<select className="min-h-11 rounded-md border bg-background px-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-muted/70"><tr>{["Employee","Equipment","Status","Created","Signed","Link expires","Next action"].map(value=><th className="p-3 font-semibold" key={value}>{value}</th>)}</tr></thead><tbody>
      {visible.map(row=>{const statusLabel=label(row),statusKey=statusLabel.toUpperCase().replaceAll(" ","_");return <tr className="border-t align-top" key={row.id}>
        <td className="p-3 font-medium">{String(row.data.person_name||"Unknown employee")}<span className="mt-1 block text-xs text-muted-foreground">{String(row.data.person_email||"")}</span></td>
        <td className="p-3">{String(row.data.asset_code||row.asset_id)}<span className="mt-1 block text-xs text-muted-foreground">{[row.data.manufacturer,row.data.model,row.data.serial_number].filter(Boolean).join(" · ")}</span></td>
        <td className="p-3"><span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 font-medium ${badge[statusKey]||"border-border bg-muted text-foreground"}`}>{statusLabel}</span></td>
        <td className="p-3 whitespace-nowrap">{date(row.created_at)}</td><td className="p-3 whitespace-nowrap">{date(row.signed_at)}</td><td className="p-3 whitespace-nowrap">{date(row.expires_at)}</td>
        <td className="p-3"><div className="flex flex-col items-start gap-2">{row.status==="SIGNED"&&<form action={inventoryAction}><input type="hidden" name="operation" value="mark_printed"/><input type="hidden" name="agreement_id" value={row.id}/><button className="min-h-10 rounded-md bg-primary px-3 font-medium text-primary-foreground">Mark as printed (legacy)</button></form>}{row.status==="PRINTED"&&<form action={inventoryAction}><input type="hidden" name="operation" value="mark_handed_off"/><input type="hidden" name="agreement_id" value={row.id}/><button className="min-h-10 rounded-md border px-3 font-medium">Mark handed off (legacy)</button></form>}{row.status==="PENDING"&&!row.revoked_at&&!row.is_expired&&<><span className="text-muted-foreground">Waiting for employee signature</span><AgreementRevokeForm agreementId={row.id} compact/></>}{(row.status==="COMPLETED"||row.status==="SIGNED"||row.status==="PRINTED"||row.status==="HANDED_OFF")&&<Link className="min-h-10 inline-flex items-center font-medium underline underline-offset-4" href={`/inventory/agreements/${encodeURIComponent(row.id)}`}>{row.status==="COMPLETED"?"View signed PDF":"View historical record"}</Link>}{row.status==="PENDING"&&<Link className="min-h-10 inline-flex items-center font-medium underline underline-offset-4" href={`/inventory/agreements/${encodeURIComponent(row.id)}`}>View record</Link>}{(row.status==="PENDING"&&(row.is_expired||row.revoked_at))&&<Link className="min-h-10 inline-flex items-center font-medium underline underline-offset-4" href={`/inventory/${encodeURIComponent(row.asset_id)}`}>Create a new link</Link>}</div></td>
      </tr>;})}
    </tbody></table></div>
    {visible.length===0&&<p className="p-8 text-center text-muted-foreground">{rows.length?"No agreements match these filters.":"No equipment agreements yet. Open an assigned asset and choose “Create agreement.”"}</p>}
    <p className="border-t px-4 py-3 text-sm text-muted-foreground" aria-live="polite">Showing {visible.length} of {rows.length} agreements</p>
  </section>;
}
