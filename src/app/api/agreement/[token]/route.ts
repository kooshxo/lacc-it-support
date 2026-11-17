import { NextResponse } from "next/server";
import { signAgreement } from "@/lib/sql/agreements";
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}) { const {token}=await params; const form=await request.formData(); const name=String(form.get("signerName")||"").trim(); if(!name||form.get("consent")!=="on") return NextResponse.json({error:"Name and consent are required."},{status:400}); const ok=await signAgreement(token,name); return ok?NextResponse.json({ok:true}):NextResponse.json({error:"This agreement is no longer pending."},{status:409}); }
