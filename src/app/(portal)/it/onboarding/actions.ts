"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAgent, requireEmployee } from "@/lib/authz";
import { onboardingRequestSchema } from "@/lib/domain/onboarding";
import { createOnboardingRequest, updateOnboardingStatus } from "@/lib/sql/it-operations";

export async function submitOnboardingRequest(form: FormData) {
  const actor=await requireEmployee();
  if(actor.role!=="EMPLOYEE") redirect("/access-denied");
  if(process.env.DATA_BACKEND!=="sql") redirect("/requests/onboarding/new?error=SQL+is+not+enabled");
  const parsed=onboardingRequestSchema.safeParse({firstName:form.get("firstName"),lastName:form.get("lastName"),startDate:form.get("startDate"),needByDate:form.get("needByDate")??"",needs:form.getAll("needs"),locations:form.getAll("locations"),sharedDriveAccess:form.get("sharedDriveAccess")??"",equipmentDetails:form.get("equipmentDetails")??"",contactEmail:form.get("contactEmail")});
  if(!parsed.success)redirect("/requests/onboarding/new?error=Check+required+fields");
  const x=parsed.data;
  if(!x.contactEmail)redirect("/requests/onboarding/new?error=Check+required+fields");
  try {
    await createOnboardingRequest({first_name:x.firstName,last_name:x.lastName,start_date:x.startDate,requested_needs:x.needs,work_locations:x.locations,shared_drive_access:x.sharedDriveAccess,equipment_details:x.equipmentDetails,need_by_date:x.needByDate||null,main_contact_email:x.contactEmail.toLowerCase()},actor.employeeUid);
  } catch { redirect("/requests/onboarding/new?error=Unable+to+save+request"); }
  revalidatePath("/it/onboarding"); redirect("/requests/onboarding/new?submitted=1");
}

export async function changeOnboardingStatus(form: FormData) {
  const actor=await requireAgent();
  const data=z.object({id:z.string().uuid(),status:z.enum(["New","In progress","Complete"])}).parse({id:form.get("id"),status:form.get("status")});
  if(process.env.DATA_BACKEND!=="sql") redirect("/it/onboarding?error=SQL+is+not+enabled");
  await updateOnboardingStatus(data.id,data.status,actor.employeeUid);
  revalidatePath("/it/onboarding"); redirect("/it/onboarding?saved=1");
}
