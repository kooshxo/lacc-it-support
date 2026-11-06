import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {Pool} from 'pg';
const file=process.argv[2];if(!file||!process.env.DATABASE_URL)throw new Error('Supply export path and DATABASE_URL.');
const bytes=await readFile(file),payload=JSON.parse(bytes),hash=createHash('sha256').update(bytes).digest('hex');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
try{const imported=(await pool.query('SELECT id,source_sha256,metadata,imported_at FROM inventory_imports ORDER BY imported_at DESC LIMIT 1')).rows[0];if(!imported)throw new Error('No inventory snapshot has been imported.');let count=0;
for(const [name,rows] of Object.entries(payload.tables)){
 const stored=(await pool.query('SELECT data FROM inventory_source_records WHERE import_id=$1 AND table_name=$2 ORDER BY ordinal',[imported.id,name])).rows.map(row=>row.data);
 if(!isDeepStrictEqual(stored,rows))throw new Error(`Record mismatch in ${name}`);count+=rows.length;
}
for(const [name,table] of [['Assets','inventory_assets'],['People','inventory_people']]){
 const sourceIds=payload.tables[name].map(row=>String(row.id));
 const stored=(await pool.query(`SELECT id FROM ${table} WHERE source_import_id=$1 AND id=ANY($2::text[])`,[imported.id,sourceIds])).rows;
 if(stored.length!==sourceIds.length)throw new Error(`Operational ${name.toLowerCase()} set is incomplete.`);
}
const sourceCustodyIds=payload.tables['Assignment History'].map(row=>String(row.id));
const custody=(await pool.query('SELECT id FROM inventory_custody WHERE source_import_id=$1 AND id=ANY($2::text[])',[imported.id,sourceCustodyIds])).rows;
if(custody.length!==sourceCustodyIds.length)throw new Error('Operational custody set is incomplete.');
console.log(JSON.stringify({verified:true,inputSha256:hash,storedSnapshotSha256:imported.source_sha256,exportMetadataDiffers:hash!==imported.source_sha256,sourceTables:Object.keys(payload.tables).length,sourceRows:count,sourceAssets:payload.tables.Assets.length,sourcePeople:payload.tables.People.length,sourceAssignments:sourceCustodyIds.length,operationalRowsRetained:true,importedAt:imported.imported_at},null,2));
}finally{await pool.end();}
