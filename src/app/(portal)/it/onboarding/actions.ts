"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAgent } from "@/lib/authz";
import { createOnboardingRequest, updateOnboardingStatus } from "@/lib/sql/it-operations";

const needOptions = ["Computer account / Cuenta de computadora","Email account / Cuenta de correo","Office extension / Extensión telefónica","Desktop setup / Configuración de computadora","Laptop setup / Configuración de laptop","Staff badge / Credencial de empleado","VPN access / Acceso VPN","LACC cellphone / Celular LACC"] as const;
const schema = z.object({
  firstName:z.string().trim().min(1).max(100),lastName:z.string().trim().min(1).max(100),
  startDate:z.iso.date(),needByDate:z.union([z.literal(""),z.iso.date()]),
  needs:z.array(z.enum(needOptions)).min(1).max(20),locations:z.array(z.string().trim().min(1).max(160)).min(1).max(30),
  sharedDriveAccess:z.string().trim().max(4000),equipmentDetails:z.string().trim().max(4000),contactEmail:z.email().max(254).refine(v=>v.toLowerCase().endsWith("@thelatincenter.org")),
});

export async function submitOnboardingRequest(form: FormData) {
  const actor=await requireAgent();
  if(process.env.DATA_BACKEND!=="sql") redirect("/it/onboarding?error=SQL+is+not+enabled");
  const parsed=schema.safeParse({firstName:form.get("firstName"),lastName:form.get("lastName"),startDate:form.get("startDate"),needByDate:form.get("needByDate"),needs:form.getAll("needs"),locations:form.getAll("locations"),sharedDriveAccess:form.get("sharedDriveAccess"),equipmentDetails:form.get("equipmentDetails"),contactEmail:form.get("contactEmail")});
  if(!parsed.success)redirect("/it/onboarding/new?error=Check+required+fields");
  try {
    const x=parsed.data;
    await createOnboardingRequest({first_name:x.firstName,last_name:x.lastName,start_date:x.startDate,requested_needs:x.needs,work_locations:x.locations,shared_drive_access:x.sharedDriveAccess,equipment_details:x.equipmentDetails,need_by_date:x.needByDate||null,main_contact_email:x.contactEmail.toLowerCase()},actor.employeeUid);
  } catch { redirect("/it/onboarding/new?error=Unable+to+save+request"); }
  revalidatePath("/it/onboarding"); redirect("/it/onboarding?saved=1");
}

export async function changeOnboardingStatus(form: FormData) {
  const actor=await requireAgent();
  const data=z.object({id:z.string().uuid(),status:z.enum(["New","In progress","Complete"])}).parse({id:form.get("id"),status:form.get("status")});
  if(process.env.DATA_BACKEND!=="sql") redirect("/it/onboarding?error=SQL+is+not+enabled");
  await updateOnboardingStatus(data.id,data.status,actor.employeeUid);
  revalidatePath("/it/onboarding"); redirect("/it/onboarding?saved=1");
}
