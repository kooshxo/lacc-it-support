import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Pool } from 'pg';

const file = process.argv[2];
if (!file || !process.env.DATABASE_URL) throw new Error('Supply the source CSV path and DATABASE_URL.');
const bytes = await readFile(file), sha = createHash('sha256').update(bytes).digest('hex');
const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
function parseCsv(input) {
  const records=[]; let record=[], value='', quoted=false;
  for(let index=0;index<input.length;index++) { const char=input[index];
    if(quoted) { if(char==='"'&&input[index+1]==='"'){value+='"';index++;} else if(char==='"')quoted=false; else value+=char; }
    else if(char==='"'&&value.length===0)quoted=true;
    else if(char===','){record.push(value);value='';}
    else if(char==='\n'||char==='\r'){if(char==='\r'&&input[index+1]==='\n')index++;record.push(value);records.push(record);record=[];value='';}
    else value+=char;
  }
  if(quoted)throw new Error('Malformed CSV.');if(record.length||value.length){record.push(value);records.push(record);}return records;
}
const [headers,...rows]=parseCsv(text), source=rows.map((row,index)=>({sourceRow:index+2,values:row})).filter(({values})=>values.some(value=>String(value??'').trim()!==''));
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
try {
 const importRow=(await pool.query('SELECT id,imported_rows,ticket_rows FROM lacc_ticket_imports WHERE source_sha256=$1',[sha])).rows[0];
 if(!importRow)throw new Error('Ticket source snapshot is missing from SQL.');
 const stored=(await pool.query('SELECT source_row,ticket_uid,headers,original_values FROM lacc_ticket_source_rows WHERE import_id=$1 ORDER BY source_row',[importRow.id])).rows;
 if(stored.length!==source.length||stored.length!==importRow.imported_rows)throw new Error('Source row count mismatch.');
 for(let i=0;i<source.length;i++){const original=source[i],record=stored[i];if(Number(record.source_row)!==original.sourceRow||!isDeepStrictEqual(record.headers,headers)||!isDeepStrictEqual(record.original_values,original.values))throw new Error(`Source row ${original.sourceRow} differs from the archived values.`);}
 const linked=stored.filter(row=>row.ticket_uid).length;if(linked!==importRow.ticket_rows)throw new Error('Linked SQL ticket count mismatch.');
 const mapped=(await pool.query("SELECT uid,number,operation_uid,requester_uid,version,data,created_at FROM lacc_tickets WHERE uid IN (SELECT ticket_uid FROM lacc_ticket_source_rows WHERE import_id=$1 AND ticket_uid IS NOT NULL)",[importRow.id])).rows;
 if(mapped.length!==linked)throw new Error('Mapped SQL ticket count mismatch.');
 for (const ticket of mapped) { const sourceRow=Number(ticket.data.sourceSpreadsheetRow);const archived=stored.find(row=>Number(row.source_row)===sourceRow);if(!archived||ticket.uid!==archived.ticket_uid||ticket.data.ticketUid!==ticket.uid||ticket.data.ticketNumber!==ticket.number||ticket.data.operationUid!==ticket.operation_uid||ticket.data.requesterUid!==ticket.requester_uid||ticket.data.version!==ticket.version||new Date(ticket.created_at).toISOString()!==ticket.data.createdAt)throw new Error(`Mapped SQL ticket for source row ${sourceRow} does not match its indexed values.`); }
 console.log(`Verified ${source.length} preserved source rows and ${linked} mapped ticket records; source header and every cell match field-for-field.`);
} finally { await pool.end(); }
