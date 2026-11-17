import Link from "next/link";
import { notFound } from "next/navigation";
import { AgreementDocument } from "@/components/agreement-document";
import { AgreementRevokeForm } from "@/components/agreement-revoke-form";
import { inventoryAction } from "../../actions";
import { requireAgent } from "@/lib/authz";
import { getAgreementById } from "@/lib/sql/agreements";

export default async function AgreementRecordPage({params}:{params:Promise<{id:string}>}){
  await requireAgent();
  if(process.env.DATA_BACKEND!=="sql")notFound();
  const {id}=await params;
  const agreement=await getAgreementById(id);
  if(!agreement)notFound();
  const status=agreement.revoked_at?"Link revoked":agreement.status.replaceAll("_"," ");
  return <div className="mx-auto max-w-4xl space-y-5"><Link className="no-print inline-flex min-h-11 items-center font-medium underline underline-offset-4" href="/inventory/agreements">Back to agreements</Link><header className="no-print"><p className="text-sm font-semibold text-primary">Inventory / Agreements</p><h1 className="mt-1 text-3xl font-semibold">Agreement record</h1><p className="mt-2 text-muted-foreground">{status} · Created {new Date(agreement.created_at).toLocaleString()}</p></header><AgreementDocument data={agreement.data} signedAt={agreement.signed_at} termsVersion={agreement.terms_version} printable={Boolean(agreement.signed_at)}/><section className="no-print rounded-lg border bg-card p-5"><h2 className="font-semibold">Processing history</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">Printed</dt><dd>{agreement.printed_at?`${new Date(agreement.printed_at).toLocaleString()} · ${agreement.printed_by||"Staff identity unavailable"}`:"Not yet marked printed"}</dd></div><div><dt className="text-sm text-muted-foreground">Handed off</dt><dd>{agreement.handed_off_at?`${new Date(agreement.handed_off_at).toLocaleString()} · ${agreement.handed_off_by||"Staff identity unavailable"}`:"Not yet handed off"}</dd></div><div><dt className="text-sm text-muted-foreground">Link expiry</dt><dd>{new Date(agreement.expires_at).toLocaleString()}</dd></div><div><dt className="text-sm text-muted-foreground">Link validity</dt><dd>{agreement.revoked_at?`Revoked ${new Date(agreement.revoked_at).toLocaleString()} by ${agreement.revoked_by||"staff"}`:agreement.status==="PENDING"&&new Date(agreement.expires_at)<=new Date()?"Expired":agreement.status==="PENDING"?"Active":"Signing complete"}</dd></div></dl><div className="mt-4 flex flex-wrap gap-3">{agreement.status==="SIGNED"&&<form action={inventoryAction}><input type="hidden" name="operation" value="mark_printed"/><input type="hidden" name="agreement_id" value={agreement.id}/><button className="min-h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground">Mark as printed</button></form>}{agreement.status==="PRINTED"&&<form action={inventoryAction}><input type="hidden" name="operation" value="mark_handed_off"/><input type="hidden" name="agreement_id" value={agreement.id}/><button className="min-h-11 rounded-md border px-4 font-medium">Mark handed off</button></form>}{agreement.status==="PENDING"&&!agreement.revoked_at&&new Date(agreement.expires_at)>new Date()&&<AgreementRevokeForm agreementId={agreement.id}/>}</div></section></div>;
}
