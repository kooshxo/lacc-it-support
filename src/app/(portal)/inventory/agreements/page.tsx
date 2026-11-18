import { requireAgent } from "@/lib/authz";
import { isAgreementStorageReady, listAgreementForms } from "@/lib/sql/agreements";
import { AgreementTable } from "@/components/agreement-table";
import { AgreementLinkResult } from "@/components/agreement-link-result";

export const metadata={title:"Equipment agreements | LACC IT Support",robots:{index:false,follow:false}};

export default async function AgreementsPage({searchParams}:{searchParams:Promise<{saved?:string}>}){
  await requireAgent();
  if(process.env.DATA_BACKEND!=="sql")return <section className="rounded-lg border bg-card p-5"><h1 className="text-2xl font-semibold">Equipment agreements unavailable</h1><p className="mt-2 text-muted-foreground">Agreement tracking requires the SQL inventory service.</p></section>;
  if(!await isAgreementStorageReady())return <section className="mx-auto max-w-3xl rounded-lg border bg-card p-5"><p className="text-sm font-semibold text-primary">Inventory / Agreements</p><h1 className="mt-1 text-2xl font-semibold">Equipment agreements are not configured</h1><p className="mt-2 text-muted-foreground">This SQL database does not have the required agreement storage yet. No agreement controls are available.</p></section>;
  const [rows,params]=await Promise.all([listAgreementForms(),searchParams]);
  const counts={waiting:rows.filter(row=>row.status==="PENDING"&&!row.is_expired&&!row.revoked_at).length,completed:rows.filter(row=>row.status==="COMPLETED").length,legacy:rows.filter(row=>row.status==="SIGNED"||row.status==="PRINTED"||row.status==="HANDED_OFF").length};
  const cards=[{label:"Pending signature",count:counts.waiting},{label:"Electronically signed · completed",count:counts.completed},{label:"Legacy paper records",count:counts.legacy}];
  return <div className="mx-auto max-w-7xl space-y-6"><header><p className="text-sm font-semibold text-primary">Inventory / Agreements</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Equipment agreements</h1><p className="mt-2 max-w-3xl text-muted-foreground">Create a secure seven-day link for the assigned employee. Signed agreements are finalized and stored automatically. Historical paper-processing records remain available.</p></header>{params.saved&&<p className="rounded-md border border-emerald-700 bg-emerald-50 p-3 font-medium text-emerald-950" role="status">Agreement record updated.</p>}<AgreementLinkResult/><section aria-label="Agreement workflow counts" className="grid gap-3 sm:grid-cols-3">{cards.map(({label,count})=><article key={label} className="rounded-lg border bg-card p-4"><h2 className="text-sm font-medium text-muted-foreground">{label}</h2><p className="mt-1 text-2xl font-semibold">{count}</p></article>)}</section><AgreementTable rows={rows.map(row=>({...row,created_at:new Date(row.created_at).toISOString(),updated_at:new Date(row.updated_at).toISOString(),expires_at:new Date(row.expires_at).toISOString(),signed_at:row.signed_at?new Date(row.signed_at).toISOString():null,printed_at:row.printed_at?new Date(row.printed_at).toISOString():null,handed_off_at:row.handed_off_at?new Date(row.handed_off_at).toISOString():null}))}/></div>;
}
