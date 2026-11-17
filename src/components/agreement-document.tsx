import { PrintAgreementButton } from "@/components/print-agreement-button";

type Props={data:Record<string,unknown>;signedAt:string|null;termsVersion:string;pending?:boolean;printable?:boolean;children?:React.ReactNode};
function displayDate(value:string|null){return value?new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"long",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(value)):"—";}

export function AgreementDocument({data,signedAt,termsVersion,pending=false,printable=true,children}:Props){
  return <>
    {printable&&<div className="no-print mb-4 flex justify-end"><PrintAgreementButton/></div>}
    <article className="agreement-paper mx-auto max-w-3xl rounded-lg border bg-background p-5 shadow-sm sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="border-b pb-5 print:pb-3"><p className="text-sm font-semibold tracking-wide text-muted-foreground">The Latin American Community Center</p><h1 className="mt-2 text-2xl font-bold">Laptop / Equipment Agreement</h1><p className="mt-2 text-sm text-muted-foreground">Document version: {termsVersion}</p></header>
      <section className="py-5"><h2 className="font-semibold">Equipment and recipient</h2><dl className="mt-3 grid gap-3 rounded-md bg-muted/40 p-4 sm:grid-cols-2 print:border print:bg-white">{Object.entries(data).filter(([key])=>!['terms_text','signer_name'].includes(key)).map(([key,value])=><div key={key}><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{key.replaceAll("_"," ")}</dt><dd className="mt-1 break-words font-medium">{String(value||"—")}</dd></div>)}</dl></section>
      <section className="border-t py-5"><h2 className="font-semibold">Agreement terms</h2><p className="mt-3 whitespace-pre-wrap leading-7">{String(data.terms_text||"")}</p></section>
      {signedAt&&<section className="border-t py-5"><h2 className="font-semibold">Electronic signature record</h2><p className="mt-2">Typed name: <strong>{String(data.signer_name||"—")}</strong></p><p>Recorded: {displayDate(signedAt)}</p></section>}
      {pending&&<section className="no-print border-t py-5"><p className="text-sm text-muted-foreground">Review the equipment, recipient, and full terms below before signing.</p>{children}</section>}
      <section className="grid gap-x-8 gap-y-7 border-t pt-8 sm:grid-cols-2 print:mt-5 print:gap-y-6 print:pt-5"><p>Employee signature: __________________________________<br/>Date: ____________________</p><p>Witness: ____________________________________________<br/>Date: ____________________</p><p>Returned by: ________________________________________<br/>Date: ____________________</p><p>Received by: ________________________________________<br/>Date: ____________________</p><p>Witness: ____________________________________________<br/>Date: ____________________</p></section>
      <p className="mt-6 text-sm italic">* It will be determined solely by the IT department if a risk is considered to be a “probable risk”.</p>
    </article>
    <style>{`@page { size: letter; margin: 0.65in; } @media print { body { background: white !important; color: #111 !important; } nav, aside, header[data-app-header], .no-print, form, button { display: none !important; } main { padding: 0 !important; } .agreement-paper { break-inside: auto; } section, dl { break-inside: avoid; } }`}</style>
  </>;
}
