import { NextResponse } from "next/server";
import { getSignedAgreementPdfByToken, isPublicAgreementAccessible } from "@/lib/sql/agreements";
import { isElectronicAgreementWorkflowEnabled } from "@/lib/sql/agreement-state";

const headers={"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow, noarchive","X-Content-Type-Options":"nosniff"};

export async function POST(request:Request){
  if(process.env.DATA_BACKEND!=="sql"||!isElectronicAgreementWorkflowEnabled())return NextResponse.json({error:"The signed agreement is unavailable."},{status:404,headers});
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)return NextResponse.json({error:"This request could not be verified."},{status:403,headers});
  if(Number(request.headers.get("content-length")||0)>2048)return NextResponse.json({error:"The signed agreement is unavailable."},{status:400,headers});
  let body:unknown;
  try{body=await request.json();}catch{return NextResponse.json({error:"The signed agreement is unavailable."},{status:400,headers});}
  const token=body&&typeof body==="object"&&"token" in body&&typeof body.token==="string"?body.token:"";
  if(!await isPublicAgreementAccessible(token))return NextResponse.json({error:"The signed agreement is unavailable."},{status:404,headers});
  const pdf=await getSignedAgreementPdfByToken(token);
  if(!pdf)return NextResponse.json({error:"The signed agreement is unavailable."},{status:404,headers});
  return new Response(new Uint8Array(pdf.bytes),{status:200,headers:{...headers,"Content-Type":"application/pdf","Content-Disposition":"inline; filename=\"signed-laptop-agreement.pdf\"","Content-Length":String(pdf.bytes.byteLength),"X-Agreement-SHA256":pdf.sha256}});
}
