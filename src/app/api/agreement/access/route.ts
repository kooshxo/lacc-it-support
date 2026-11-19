import { NextResponse } from "next/server";
import { getAgreementByToken, isPublicAgreementAccessible } from "@/lib/sql/agreements";
import { isElectronicAgreementWorkflowEnabled, isValidAgreementToken } from "@/lib/sql/agreement-state";

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
  if(!await isPublicAgreementAccessible(token))return NextResponse.json({error:"This agreement link is unavailable, expired, revoked, or already completed. Contact LACC IT for help."},{status:404,headers});
  const agreement=await getAgreementByToken(token);
  if(!agreement)return NextResponse.json({error:"This agreement link is unavailable, expired, revoked, or already completed. Contact LACC IT for help."},{status:404,headers});
  if(agreement.status==="PENDING"&&!isElectronicAgreementWorkflowEnabled())return NextResponse.json({error:"This agreement link is unavailable. Contact LACC IT for help."},{status:404,headers});
  const data=agreement.data;
  const publicData=Object.fromEntries(["person_name","asset_code","manufacturer","inventory_number","model","serial_number","service_tag","phone_number","issued_date","signer_name"].flatMap(key=>key in data?[[key,data[key]]]:[]));
  return NextResponse.json({agreement:{data:publicData,status:agreement.status,signedAt:agreement.signed_at,expiresAt:agreement.expires_at,termsVersion:agreement.terms_version}},{headers});
}
