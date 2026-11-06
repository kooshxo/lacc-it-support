import Link from 'next/link';
import { requireAgent } from '@/lib/authz';
import { InventoryPersonForm } from '@/components/inventory-person-form';
import { personAction } from '../actions';
export default async function NewPerson({searchParams}:{searchParams:Promise<{error?:string}>}){await requireAgent();if(process.env.DATA_BACKEND!=='sql')return <p>SQL inventory is not enabled.</p>;const {error}=await searchParams;return <div className="mx-auto max-w-3xl space-y-5"><Link href="/inventory/people" className="underline">Back to people</Link><h1 className="text-3xl font-semibold">Add person</h1>{error&&<p role="alert" className="text-destructive">{error}</p>}<form action={personAction} className="rounded border bg-background p-5"><InventoryPersonForm/><button className="rounded bg-primary px-4 py-2 text-primary-foreground">Save person</button></form></div>;}
