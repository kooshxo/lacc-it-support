import { NextResponse } from "next/server";
import { requireAgent } from "@/lib/authz";
import { getSignedAgreementPdf } from "@/lib/sql/agreements";

export async function GET(_request:Request,{params}:{params:Promise<{agreementId:string}>}){
  await requireAgent();
  if(process.env.DATA_BACKEND!=="sql")return NextResponse.json({error:"Not found"},{status:404});
  const {agreementId}=await params;
  const pdf=await getSignedAgreementPdf(agreementId);
  if(!pdf)return NextResponse.json({error:"Not found"},{status:404,headers:{"Cache-Control":"private, no-store"}});
  return new Response(new Uint8Array(pdf.bytes),{status:200,headers:{"Cache-Control":"private, no-store, max-age=0","Content-Type":"application/pdf","Content-Disposition":"inline; filename=\"signed-laptop-agreement.pdf\"","Content-Length":String(pdf.bytes.byteLength),"X-Content-Type-Options":"nosniff","X-Agreement-SHA256":pdf.sha256}});
}
