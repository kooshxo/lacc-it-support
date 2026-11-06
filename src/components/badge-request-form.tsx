'use client';
import { useActionState, useState } from 'react';
import { submitBadgeRequest } from '@/app/(portal)/requests/new/action';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
export function BadgeRequestForm({ collectPin = false }: { collectPin?: boolean }){
  const [state,action,pending]=useActionState(submitBadgeRequest,{error:""});
  const [operationUid]=useState(()=>crypto.randomUUID());
  const [kind,setKind]=useState('New badge');
  return <form action={action} className="space-y-5 rounded-xl border bg-background p-6">
    <input type="hidden" name="operationUid" value={operationUid}/>
    {state.error&&<p role="alert" className="text-destructive">{state.error}</p>}
    <label className="grid gap-2">What do you need? / ¿Qué necesita?
      <select name="requestType" value={kind} onChange={event=>setKind(event.target.value)} className="rounded-md border p-3">
        <option value="New badge">New badge / Credencial nueva</option><option value="Replacement badge">Replacement badge / Reemplazo de credencial</option><option value="Access / PIN only">Access / PIN only · Acceso / PIN</option><option value="Other">Other / Otro</option>
      </select>
    </label>
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="grid gap-2">Department / Departamento<select name="department" required className="rounded-md border p-3"><option value="">Select / Seleccione</option>{['Admin / Administración','ECS','EDC','FSS','Facilities / Instalaciones','LE','P&A','YD'].map(value=><option key={value}>{value}</option>)}</select></label>
      <label className="grid gap-2">Site / building / Sede o edificio<select name="location" required className="rounded-md border p-3"><option value="">Select / Seleccione</option>{['Main Building / Edificio principal','MOB','La Fiesta II','La Fiesta III','New Castle / New Castle','New Castle site / Sitio de New Castle','Remote / Remoto'].map(value=><option key={value}>{value}</option>)}</select></label>
      <label className="grid gap-2">Contact phone (required) / Teléfono (obligatorio)<Input name="phone" type="tel" required maxLength={60}/></label>
      <label className="grid gap-2">Extension (required) / Extensión (obligatoria)<Input name="extension" required maxLength={20}/></label>
    </div>
    {kind==='Replacement badge / Reemplazo de credencial'&&<label className="grid gap-2">Existing badge number / Número de credencial actual<Input name="badgeNumber" required maxLength={80} placeholder="Enter unknown if unavailable / Escriba unknown si no lo sabe"/></label>}
    {kind!=='Replacement badge'&&<input type="hidden" name="badgeNumber" value=""/>}
    {collectPin && <label className="grid gap-2">Preferred new PIN (optional)<Input name="preferredPin" type="password" inputMode="numeric" pattern="[0-9]{4,12}" maxLength={12} autoComplete="new-password"/></label>}
    {!collectPin && <input type="hidden" name="preferredPin" value=""/>}
    <label className="grid gap-2">{kind==='Other'?'Describe your issue / Describa el problema':'Request details / Detalles de la solicitud'}<Textarea name="details" required minLength={10} maxLength={4000} rows={4} placeholder="Describe what you need. Do not include passwords. / Describa lo que necesita. No incluya contraseñas."/></label>
    <Button type="submit" disabled={pending}>{pending?'Saving… / Guardando…':'Submit request / Enviar solicitud'}</Button>
  </form>;
}
