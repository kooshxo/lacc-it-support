"use client";

import { inventoryAction } from "@/app/(portal)/inventory/actions";

export function AgreementRevokeForm({agreementId,compact=false}:{agreementId:string;compact?:boolean}){
  return <form action={inventoryAction} onSubmit={event=>{if(!window.confirm("Revoke this signing link? The employee will no longer be able to use it."))event.preventDefault();}}><input type="hidden" name="operation" value="revoke_agreement"/><input type="hidden" name="agreement_id" value={agreementId}/><button className={`${compact?"min-h-10 text-sm":"min-h-11 px-4"} font-medium text-destructive underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>Revoke signing link</button></form>;
}
