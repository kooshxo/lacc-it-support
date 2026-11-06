"use server";
import { isIP } from "node:net";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAgent } from "@/lib/authz";
import { upsertPrinterReference } from "@/lib/sql/it-operations";

export async function savePrinterReference(form:FormData){
 const actor=await requireAgent();
 if(process.env.DATA_BACKEND!=="sql")redirect("/it/printers?error=SQL+is+not+enabled");
 const parsed=z.object({location:z.string().trim().min(2).max(200),ipAddress:z.string().trim().max(45),printerModel:z.string().trim().max(200),notes:z.string().trim().max(1000)}).safeParse({location:form.get("location"),ipAddress:form.get("ipAddress"),printerModel:form.get("printerModel"),notes:form.get("notes")});
 if(!parsed.success||isIP(parsed.data.ipAddress)===0)redirect("/it/printers?error=Enter+a+valid+location+and+IP+address");
 try{await upsertPrinterReference(parsed.data,actor.employeeUid);}catch{redirect("/it/printers?error=Unable+to+save");}
 revalidatePath("/it/printers");redirect("/it/printers?saved=1");
}
