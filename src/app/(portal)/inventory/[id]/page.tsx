import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAgent } from '@/lib/authz';
import { getAsset,listPeople,assetHistory,listInventoryIssues,listInventoryAttachments } from '@/lib/inventory/repository';
import { InventoryFields,RecordDetails } from '@/components/inventory-fields';
import { InventoryAttachments } from '@/components/inventory-attachments';
import { inventoryAction } from '../actions';

const field='rounded border p-2';
export default async function AssetPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;saved?:string}>}){
 await requireAgent();if(process.env.DATA_BACKEND!=='sql')notFound();const {id}=await params;
 const [asset,people,history,issues,attachments,query]=await Promise.all([getAsset(id),listPeople(),assetHistory(id),listInventoryIssues(),listInventoryAttachments(id),searchParams]);if(!asset)notFound();const assetIssues=issues.filter(issue=>issue.asset_id===id);
 const hidden=<><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={asset.version}/></>;
 return <div className="space-y-6">
  <Link className="underline" href="/inventory">Back to inventory</Link>
  <h1 className="text-3xl font-semibold">{String(asset.data.asset_code)}</h1>
  <p>{String(asset.data.status)} · Current holder: {String(asset.data.holder_name||'No one')}</p>
  {query.error&&<p role="alert" className="text-destructive">{query.error}</p>}{query.saved&&<p role="status">Changes saved.</p>}
  <details open className="rounded border bg-background p-5"><summary className="mb-4 font-semibold">All equipment details</summary><RecordDetails data={asset.data}/></details>
  <details className="rounded border bg-background p-5"><summary className="font-semibold">Edit equipment</summary><form action={inventoryAction} className="mt-4">{hidden}<input type="hidden" name="operation" value="save"/><InventoryFields data={asset.data}/><button className="rounded bg-primary px-4 py-2 text-primary-foreground">Save details</button></form></details>
  {asset.data.status!=='Retired'&&<form action={inventoryAction} className="grid gap-3 rounded border bg-background p-5">{hidden}<input type="hidden" name="operation" value="issue"/><h2 className="font-semibold">Report equipment issue</h2><label className="grid gap-1">Issue type<select className={field} name="issue_type"><option value="repair">Repair needed</option><option value="damaged">Damaged</option><option value="missing">Missing</option></select></label><label className="grid gap-1">Details<textarea className={field} name="issue_notes" rows={2} maxLength={8000}/></label><button className="w-fit rounded border px-4 py-2">Create issue report</button></form>}
  {assetIssues.length>0&&<details open className="rounded border bg-background p-5"><summary className="font-semibold">Issue log ({assetIssues.length})</summary>{assetIssues.map(issue=><section className="mt-4 border-t pt-3" key={issue.id}><h2 className="font-medium">{issue.issue_type} · {issue.status}</h2><RecordDetails data={{reported_by:issue.reported_by,reported_at:issue.reported_at.toISOString(),notes:issue.data.notes,resolution:issue.resolution,resolved_by:issue.resolved_by,resolved_at:issue.resolved_at?.toISOString()||null}}/></section>)}</details>}
  <InventoryAttachments assetId={id} attachments={attachments}/>
  {asset.data.status==='Available'&&<form action={inventoryAction} className="grid gap-4 rounded border bg-background p-5">
   {hidden}<input type="hidden" name="operation" value="assign"/><h2 className="font-semibold">Give equipment</h2>
   <label className="grid gap-1">Person<select className={field} name="person_id" required defaultValue=""><option value="" disabled>Select person</option>{people.filter(p=>p.data.is_active!==false&&p.data.is_active!==0).map(p=><option value={p.id} key={p.id}>{String(p.data.full_name)}</option>)}</select></label>
   <div className="grid gap-4 sm:grid-cols-2">
    <label className="grid gap-1">Assignment type<select className={field} name="assignment_type"><option>Permanent employee assignment</option><option>Temporary loan</option><option>Department assignment</option><option>Classroom assignment</option><option>Program assignment</option><option>Repair loaner</option><option>Other</option></select></label>
    <label className="grid gap-1">Purpose<input className={field} name="purpose" maxLength={8000}/></label>
    <label className="grid gap-1">Usage location<input className={field} name="usage_location" defaultValue={String(asset.data.usage_location||'')} maxLength={8000}/></label>
    <label className="grid gap-1">Department / program<input className={field} name="department_program" maxLength={8000}/></label>
    <label className="grid gap-1">Start date<input className={field} name="issue_date" type="date" defaultValue={new Date().toISOString().slice(0,10)}/></label>
    <label className="grid gap-1">Return by<input className={field} name="expected_return_date" type="date"/></label>
    <label className="grid gap-1">Condition at issue<select className={field} name="condition_at_issue" defaultValue={String(asset.data.condition||'Unknown')}><option>Unknown</option><option>Brand new</option><option>New</option><option>Excellent</option><option>Good</option><option>Fair</option><option>Poor</option></select></label>
    <label className="grid gap-1">Accessories included<input className={field} name="accessories_issued" defaultValue={String(asset.data.accessories||'')} maxLength={8000}/></label>
   </div>
   <label className="grid gap-1">Internal checkout notes<textarea className={field} name="notes" rows={2} maxLength={8000}/></label>
   <fieldset className="grid gap-2 rounded border p-3"><legend className="px-1 font-medium">Agreement tracking</legend>
    <label><input type="checkbox" name="acknowledgement_required" value="true" defaultChecked/> Acknowledgement required</label>
    <label><input type="checkbox" name="agreement_signed" value="true"/> Signed agreement is already on file</label>
    <label className="grid gap-1">Signed date<input className={field} name="agreement_signed_date" type="date"/></label>
    <label className="grid gap-1">Agreement notes<textarea className={field} name="agreement_notes" rows={2} maxLength={8000}/></label>
   </fieldset><button className="w-fit rounded bg-primary p-2 text-primary-foreground">Record checkout</button>
  </form>}
  {Boolean(asset.data.current_assignment_id)&&<>
   <form action={inventoryAction} className="grid gap-4 rounded border bg-background p-5">{hidden}<input type="hidden" name="operation" value="agreement"/><h2 className="font-semibold">Agreement follow-up</h2>
    <label><input type="checkbox" name="agreement_signed" value="true"/> Signed agreement is now on file</label>
    <label className="grid gap-1">Signed date<input className={field} name="agreement_signed_date" type="date"/></label>
    <label className="grid gap-1">Agreement notes<textarea className={field} name="agreement_notes" rows={2} maxLength={8000}/></label>
    <button className="w-fit rounded border px-4 py-2">Update agreement record</button>
   </form>
   <form action={inventoryAction} className="grid gap-4 rounded border bg-background p-5">{hidden}<input type="hidden" name="operation" value="return"/><h2 className="font-semibold">Check in equipment</h2>
    <label className="grid gap-1">Condition on return<select className={field} name="condition_at_return" defaultValue={String(asset.data.condition||'Unknown')}><option>Unknown</option><option>Brand new</option><option>New</option><option>Excellent</option><option>Good</option><option>Fair</option><option>Poor</option><option>Needs repair</option></select></label>
    <label className="grid gap-1">Accessories returned<input className={field} name="accessories_returned" defaultValue={String(asset.data.accessories||'')} maxLength={8000}/></label>
    <label className="grid gap-1">Return notes<textarea className={field} name="return_notes" rows={2} maxLength={8000}/></label>
    <button className="w-fit rounded bg-primary p-2 text-primary-foreground">Confirm check in</button>
   </form>
  </>}
  {asset.data.status!=='Retired'&&!asset.data.current_assignment_id&&<details className="rounded border p-5"><summary className="font-semibold">Retire equipment</summary><form action={inventoryAction} className="mt-3 grid gap-3">{hidden}<input type="hidden" name="operation" value="retire"/><label className="grid gap-1">Reason<input className={field} name="retirement_reason" required maxLength={2000}/></label><button className="w-fit rounded border px-4 py-2">Retire asset</button></form></details>}
  <details className="rounded border bg-background p-5"><summary className="font-semibold">History & associated source records ({history.source.length})</summary>{history.source.map((row,i)=><section className="mt-5" key={i}><h3 className="mb-3 font-semibold">{row.table_name}</h3><RecordDetails data={row.data}/></section>)}{history.changes.map((row,i)=><section key={i} className="mt-5"><h3>{row.event_type} · {row.created_at.toISOString()}</h3><RecordDetails data={{actor:row.actor_uid,before:row.before_data,after:row.after_data}}/></section>)}</details>
 </div>;
}
