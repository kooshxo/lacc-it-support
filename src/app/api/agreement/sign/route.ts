import { NextResponse } from "next/server";
import { consumeAgreementSignAttempt, signAgreement } from "@/lib/sql/agreements";
import { validateSignerInput } from "@/lib/sql/agreement-state";

const headers={"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow, noarchive"};

export async function POST(request:Request){
  if(process.env.DATA_BACKEND!=="sql")return NextResponse.json({error:"This agreement link is unavailable. Contact LACC IT for help."},{status:404,headers});
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)return NextResponse.json({error:"This request could not be verified. Reload the agreement and try again."},{status:403,headers});
  const length=Number(request.headers.get("content-length")||0);
  if(length>4096)return NextResponse.json({error:"Check your name and consent, then try again."},{status:400,headers});
  let body:unknown;
  try{body=await request.json();}catch{return NextResponse.json({error:"Check your name and consent, then try again."},{status:400,headers});}
  const value=body&&typeof body==="object"?body as Record<string,unknown>:{};
  const token=typeof value.token==="string"?value.token:"";
  const available=await consumeAgreementSignAttempt(token);
  if(!available)return NextResponse.json({error:"This agreement link is unavailable, expired, already signed, revoked, or has reached its attempt limit. Contact LACC IT for help."},{status:409,headers});
  const signer=validateSignerInput(typeof value.signerName==="string"?value.signerName:"",value.consent===true);
  if(!signer.valid)return NextResponse.json({error:"Enter your full name (up to 200 characters) and confirm the electronic-signature consent."},{status:400,headers});
  const signedAt=await signAgreement(token,signer.normalizedName);
  return signedAt?NextResponse.json({ok:true,signedAt,signerName:signer.normalizedName},{headers}):NextResponse.json({error:"This agreement is no longer pending. Contact LACC IT for help."},{status:409,headers});
}
