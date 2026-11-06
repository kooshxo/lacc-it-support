import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Pool } from 'pg';
const file=process.argv.find((arg,index)=>index>1&&!arg.startsWith('--'));
if(!file)throw new Error('Usage: node scripts/import-inventory.mjs export.json [--apply]');
const bytes=await readFile(file), payload=JSON.parse(bytes);
const tables=payload.tables, metadata=payload.export_information;
if(!tables||!metadata||metadata['Export scope']!=='Complete asset database')throw new Error('Expected complete authorized raw export.');
for(const [name,rows]of Object.entries(tables)){
 if(!Array.isArray(rows)||rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw new Error(`Invalid table ${name}`);
 const count=metadata[`Record count - ${name}`];if(typeof count!=='number'||rows.length!==count)throw new Error(`Count mismatch: ${name}`);
}
for(const name of ['Assets','People','Active Assignments','Assignment History'])if(!Array.isArray(tables[name]))throw new Error(`Missing ${name}`);
for(const name of ['Assets','People','Assignment History']){const ids=tables[name].map(r=>String(r.id));if(ids.includes('undefined')||new Set(ids).size!==ids.length)throw new Error(`Invalid IDs: ${name}`);}
const assets=new Set(tables.Assets.map(r=>String(r.id))), people=new Set(tables.People.map(r=>String(r.id)));
const codes=tables.Assets.map(r=>r.asset_code);if(codes.some(c=>!c)||new Set(codes).size!==codes.length)throw new Error('Invalid asset codes');
const active=new Set(tables['Active Assignments'].map(r=>String(r.id)));
const activeAssets=new Set();
for(const row of tables['Assignment History']){
 if(!assets.has(String(row.asset_id))||!people.has(String(row.person_id)))throw new Error('Broken custody reference');
 if(active.has(String(row.id))){if(activeAssets.has(String(row.asset_id)))throw new Error('Conflicting open custody');activeAssets.add(String(row.asset_id));}
}
for(const id of active)if(!tables['Assignment History'].some(row=>String(row.id)===id))throw new Error('Missing custody history');
const sha=createHash('sha256').update(bytes).digest('hex');
console.log(JSON.stringify({sha256:sha,counts:Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length])),mode:process.argv.includes('--apply')?'apply':'dry-run'}));
if(!process.argv.includes('--apply'))process.exit(0);
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1}),client=await pool.connect();
try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('lacc-inventory-import'))");
 const existing=await client.query('SELECT id FROM inventory_imports WHERE source_sha256=$1',[sha]);
 if(existing.rowCount){await client.query('COMMIT');console.log('Already imported; no changes.');}
 else{
 const latest=(await client.query('SELECT id,source_sha256 FROM inventory_imports ORDER BY imported_at DESC LIMIT 1')).rows[0];
 if(latest){
  let identical=true;
  for(const [name,rows]of Object.entries(tables)){
   const stored=(await client.query('SELECT data FROM inventory_source_records WHERE import_id=$1 AND table_name=$2 ORDER BY ordinal',[latest.id,name])).rows.map(row=>row.data);
   if(!isDeepStrictEqual(stored,rows)){identical=false;break;}
  }
  if(identical){await client.query('COMMIT');console.log('Source rows match the latest snapshot; only export metadata changed. No duplicate import was created.');}
  else throw new Error('Source rows differ from the latest snapshot. Reconciliation is required before importing changed data.');
 }else if(Number((await client.query('SELECT count(*) FROM inventory_assets')).rows[0].count)>0)throw new Error('Inventory already populated without a source snapshot. Reconciliation is required before importing.');
 else{
 const importId=randomUUID();await client.query('INSERT INTO inventory_imports(id,source_sha256,metadata) VALUES($1,$2,$3)',[importId,sha,JSON.stringify(metadata)]);
 for(const [name,rows]of Object.entries(tables))for(const [index,row]of rows.entries())await client.query('INSERT INTO inventory_source_records(import_id,table_name,ordinal,data) VALUES($1,$2,$3,$4)',[importId,name,index,JSON.stringify(row)]);
 for(const row of tables.People)await client.query('INSERT INTO inventory_people(id,source_import_id,data) VALUES($1,$2,$3)',[String(row.id),importId,JSON.stringify(row)]);
 for(const row of tables.Assets)await client.query('INSERT INTO inventory_assets(id,source_import_id,data) VALUES($1,$2,$3)',[String(row.id),importId,JSON.stringify(row)]);
 for(const row of tables['Assignment History'])await client.query('INSERT INTO inventory_custody(id,asset_id,person_id,source_import_id,returned_at,data) VALUES($1,$2,$3,$4,$5,$6)',[String(row.id),String(row.asset_id),String(row.person_id),importId,active.has(String(row.id))?null:(row.actual_return_date||row.completed_at||metadata['Export date and time (UTC)']),JSON.stringify(row)]);
 const actual=(await client.query('SELECT table_name,count(*)::integer AS count FROM inventory_source_records WHERE import_id=$1 GROUP BY table_name',[importId])).rows;
 for(const [name,rows]of Object.entries(tables))if((actual.find(r=>r.table_name===name)?.count??0)!==rows.length)throw new Error('Readback count mismatch');
 await client.query('COMMIT');console.log('Imported and verified all exported table counts.');}
 }
}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
