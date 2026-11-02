'use client';
import { useActionState, useState } from 'react';
import { submitBadgeRequest } from '@/app/(portal)/requests/new/action';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
export function BadgeRequestForm({ collectPin = false }: { collectPin?: boolean }){
  const [state,action,pending]=useActionState(submitBadgeRequest,{});
  const [operationUid]=useState(()=>crypto.randomUUID());
  const [kind,setKind]=useState('New badge');
  return <form action={action} className="space-y-5 rounded-xl border bg-background p-6">
    <input type="hidden" name="operationUid" value={operationUid}/>
    {state.error&&<p role="alert" className="text-destructive">{state.error}</p>}
    <label className="grid gap-2">What do you need?
      <select name="requestType" value={kind} onChange={event=>setKind(event.target.value)} className="rounded-md border p-3">
        <option>New badge</option><option>Replacement badge</option><option>Access / PIN only</option>
      </select>
    </label>
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="grid gap-2">Department<Input name="department" required maxLength={100}/></label>
      <label className="grid gap-2">Site / building<Input name="location" required maxLength={100}/></label>
      <label className="grid gap-2">Contact phone (optional)<Input name="phone" type="tel" maxLength={60}/></label>
      <label className="grid gap-2">Extension (optional)<Input name="extension" maxLength={20}/></label>
    </div>
    <label className="grid gap-2">Supervisor’s LACC email<Input name="supervisorEmail" type="email" required maxLength={254}/></label>
    {kind==='Replacement badge'&&<label className="grid gap-2">Existing badge number<Input name="badgeNumber" required maxLength={80} placeholder="Enter unknown if unavailable"/></label>}
    {kind!=='Replacement badge'&&<input type="hidden" name="badgeNumber" value=""/>}
    {collectPin && <label className="grid gap-2">Preferred new PIN (optional)<Input name="preferredPin" type="password" inputMode="numeric" pattern="[0-9]{4,12}" maxLength={12} autoComplete="new-password"/></label>}
    {!collectPin && <input type="hidden" name="preferredPin" value=""/>}
    <label className="grid gap-2">Request details<Textarea name="details" required minLength={10} maxLength={4000} rows={4} placeholder="Tell us what you need and which site or door is involved."/></label>
    <Button type="submit" disabled={pending}>{pending?'Saving…':'Submit request'}</Button>
  </form>;
}
