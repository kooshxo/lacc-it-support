import { notFound } from "next/navigation";
import { getAgreementByToken } from "@/lib/sql/agreements";
import { AgreementSignForm } from "@/components/agreement-sign-form";

export default async function AgreementPage({params}:{params:Promise<{token:string}>}) {
  const {token}=await params; const agreement=await getAgreementByToken(token); if(!agreement) notFound();
  return <main className="mx-auto max-w-3xl space-y-6 p-6 print:p-0"><div className="rounded border bg-background p-6 print:border-0"><p className="text-sm font-semibold text-muted-foreground">The Latin American Community Center</p><h1 className="mt-2 text-2xl font-bold">Laptop / Equipment Agreement</h1><p className="mt-4">I acknowledge receipt of the LACC equipment described below and agree to use it for authorized work purposes, protect it from loss or damage, report problems promptly, and return it when requested or when my employment ends.</p><dl className="mt-6 grid gap-3 rounded bg-muted/30 p-4 sm:grid-cols-2">{Object.entries(agreement.data).map(([key,value])=><div key={key}><dt className="text-xs uppercase text-muted-foreground">{key.replaceAll("_"," ")}</dt><dd className="font-medium">{String(value||"—")}</dd></div>)}</dl>{agreement.status === "PENDING" ? <AgreementSignForm token={token}/> : <p className="mt-6 rounded bg-emerald-50 p-4 text-emerald-900">This agreement was signed on {agreement.signed_at ? new Date(agreement.signed_at).toLocaleString("en-US",{timeZone:"America/New_York"}) : "record"}.</p>}</div></main>;
}
