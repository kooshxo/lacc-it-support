import { NextResponse } from "next/server";
import { consumeAgreementAccessAttempt, getAgreementByToken } from "@/lib/sql/agreements";
import { isValidAgreementToken } from "@/lib/sql/agreement-state";

const headers={"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow, noarchive"};

export async function POST(request:Request){
  if(process.env.DATA_BACKEND!=="sql")return NextResponse.json({error:"This agreement link is unavailable. Contact LACC IT for help."},{status:404,headers});
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)return NextResponse.json({error:"This request could not be verified."},{status:403,headers});
  const length=Number(request.headers.get("content-length")||0);
  if(length>2048)return NextResponse.json({error:"This agreement link is unavailable. Contact LACC IT for help."},{status:400,headers});
  let body:unknown;
  try{body=await request.json();}catch{return NextResponse.json({error:"This agreement link is unavailable. Contact LACC IT for help."},{status:400,headers});}
  const token=body&&typeof body==="object"&&"token" in body&&typeof body.token==="string"?body.token:"";
  if(!isValidAgreementToken(token))return NextResponse.json({error:"This agreement link is unavailable, expired, revoked, or already completed. Contact LACC IT for help."},{status:404,headers});
  if(!await consumeAgreementAccessAttempt(token))return NextResponse.json({error:"This agreement link is unavailable, expired, revoked, or already completed. Contact LACC IT for help."},{status:404,headers});
  const agreement=await getAgreementByToken(token);
  if(!agreement)return NextResponse.json({error:"This agreement link is unavailable, expired, revoked, or already completed. Contact LACC IT for help."},{status:404,headers});
  return NextResponse.json({agreement:{data:agreement.data,status:agreement.status,signedAt:agreement.signed_at,expiresAt:agreement.expires_at,termsVersion:agreement.terms_version}},{headers});
}
