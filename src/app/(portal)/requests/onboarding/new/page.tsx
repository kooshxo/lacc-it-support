import { redirect } from "next/navigation";
import { onboardingLocations, onboardingNeeds } from "@/lib/domain/onboarding";
import { requireEmployee } from "@/lib/authz";
import { submitOnboardingRequest } from "@/app/(portal)/it/onboarding/actions";

export default async function NewOnboardingRequestPage({ searchParams }: { searchParams: Promise<{ error?: string; submitted?: string }> }) {
  const employee = await requireEmployee();
  if (employee.role !== "EMPLOYEE") redirect("/access-denied");
  const query = await searchParams;
  if (process.env.DATA_BACKEND !== "sql") {
    return <p>New Hire Setup requests are available after the SQL backend is configured. / Las solicitudes de preparación para nuevos empleados estarán disponibles al configurar SQL.</p>;
  }

  return <div className="mx-auto max-w-3xl space-y-5">
    <div>
      <h1 className="text-3xl font-semibold">New Hire Setup / Preparación de nuevo empleado</h1>
      <p className="mt-2 text-muted-foreground">Send the setup details to IT. Never include passwords. / Envíe los detalles de configuración a TI. Nunca incluya contraseñas.</p>
    </div>
    {query.submitted && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950" role="status">Your New Hire Setup request was sent to IT. / Su solicitud se envió a TI.</p>}
    {query.error && <p className="rounded-md border border-destructive/30 p-3 text-sm text-destructive" role="alert">{query.error === "Check+required+fields" ? "Please complete the required fields and try again. / Complete los campos obligatorios e inténtelo de nuevo." : query.error === "Unable+to+save+request" ? "We could not submit this request. Please try again. / No se pudo enviar la solicitud. Inténtelo de nuevo." : "New Hire Setup is temporarily unavailable. / La preparación de nuevo empleado no está disponible temporalmente."}</p>}
    <form action={submitOnboardingRequest} className="space-y-5 rounded-xl border bg-background p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2">First name / Nombre<input className="rounded border p-3" name="firstName" required maxLength={100}/></label>
        <label className="grid gap-2">Last name / Apellido<input className="rounded border p-3" name="lastName" required maxLength={100}/></label>
        <label className="grid gap-2">Start date / Fecha de inicio<input className="rounded border p-3" name="startDate" type="date" required/></label>
        <label className="grid gap-2">Need-by date / Fecha límite<input className="rounded border p-3" name="needByDate" type="date"/></label>
      </div>
      <fieldset className="space-y-2"><legend className="font-medium">IT needs / Necesidades de TI (select all / seleccione todo)</legend><div className="grid gap-2 sm:grid-cols-2">{onboardingNeeds.map((value)=><label key={value} className="flex gap-2"><input type="checkbox" name="needs" value={value}/>{value}</label>)}</div></fieldset>
      <fieldset className="space-y-2"><legend className="font-medium">Work location(s) / Lugar(es) de trabajo (select all / seleccione todo)</legend><div className="grid gap-2 sm:grid-cols-2">{onboardingLocations.map((value)=><label key={value} className="flex gap-2"><input type="checkbox" name="locations" value={value}/>{value.startsWith("Remote") ? value : `${value}${value.includes("New Castle") ? " / New Castle" : ""}`}</label>)}</div></fieldset>
      <label className="grid gap-2">Shared-drive folders or access needed / Carpetas o accesos a unidades compartidas<textarea className="rounded border p-3" name="sharedDriveAccess" rows={3} maxLength={4000} placeholder="List folder names and permission level. Do not include passwords. / Indique carpetas y nivel de permiso. No incluya contraseñas."/></label>
      <label className="grid gap-2">Desktop or laptop purchase and main work tasks / Compra de computadora y tareas principales<textarea className="rounded border p-3" name="equipmentDetails" rows={3} maxLength={4000}/></label>
      <label className="grid gap-2">Main contact LACC email / Correo de contacto principal de LACC<input className="rounded border p-3" name="contactEmail" type="email" pattern=".+@thelatincenter\.org" required maxLength={254}/></label>
      <button className="rounded bg-primary px-4 py-2 text-primary-foreground">Submit / Enviar</button>
    </form>
  </div>;
}
