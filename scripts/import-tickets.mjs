import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const file = process.argv.find((arg, index) => index > 1 && !arg.startsWith('--'));
if (!file) throw new Error('Usage: node scripts/import-tickets.mjs tickets.csv [--apply]');
const bytes = await readFile(file);
function parseCsv(input) {
  const text = input.toString('utf8').replace(/^\uFEFF/, '');
  const records = [];
  let record = [], value = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index++; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"' && value.length === 0) quoted = true;
    else if (char === ',') { record.push(value); value = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      record.push(value); records.push(record); record = []; value = '';
    } else value += char;
  }
  if (quoted) throw new Error('Malformed CSV: unterminated quoted field.');
  if (record.length || value.length) { record.push(value); records.push(record); }
  return records;
}
const [headers, ...rows] = parseCsv(bytes);
if (!Array.isArray(headers) || headers.length !== 20 || headers[18] !== 'Ticket Number' || headers[19] !== 'Problem description (English)') throw new Error('CSV does not match the expected LACC TICKETS export.');
if (rows.some((row) => !Array.isArray(row) || row.length !== headers.length)) throw new Error('CSV rows do not match the source header width.');

const sourceId = '1XOh8iTb5njS4ZLHT6CJQdhgCL2HlA7ayZHQOqvCk4Bw';
const sha = createHash('sha256').update(bytes).digest('hex');
const nonempty = rows.map((row, index) => ({ row, sourceRow: index + 2 })).filter(({ row }) => row.some((cell) => String(cell ?? '').trim() !== ''));
const parseSourceDate = (value) => {
  const match = String(value ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, month, day, year, hour, minute, second] = match.map(Number);
  const utcWall = Date.UTC(year, month - 1, day, hour, minute, second);
  const valid = new Date(utcWall);
  if (valid.getUTCFullYear() !== year || valid.getUTCMonth() !== month - 1 || valid.getUTCDate() !== day || valid.getUTCHours() !== hour || valid.getUTCMinutes() !== minute || valid.getUTCSeconds() !== second) return null;
  const offsetMinutesAt = (instant) => {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' }).formatToParts(instant).find((part) => part.type === 'timeZoneName')?.value;
    if (name === 'GMT') return 0;
    const offset = name?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!offset) return null;
    return (Number(offset[2]) * 60 + Number(offset[3] ?? 0)) * (offset[1] === '-' ? -1 : 1);
  };
  let instant = new Date(utcWall);
  for (let attempt = 0; attempt < 3; attempt++) {
    const offset = offsetMinutesAt(instant);
    if (offset === null) return null;
    instant = new Date(utcWall - offset * 60_000);
  }
  // Reject nonexistent local times during the spring DST transition.
  const check = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(instant);
  const observed = Object.fromEntries(check.map((part) => [part.type, Number(part.value)]));
  if (observed.year !== year || observed.month !== month || observed.day !== day || observed.hour !== hour || observed.minute !== minute || observed.second !== second) return null;
  return instant.toISOString();
};
const normalized = nonempty.map(({ row, sourceRow }) => {
  const values = row.map((value) => String(value ?? ''));
  const createdAt = parseSourceDate(values[0]);
  const meaningful = values.some((value, index) => index > 0 && value.trim() !== '');
  return { values, sourceRow, createdAt, meaningful };
});
const tickets = normalized.filter((row) => row.createdAt && row.meaningful);
const stats = { sha256: sha, sourceId, csvRows: rows.length, emptyRows: rows.length - nonempty.length, preservedSourceRows: nonempty.length, importedTickets: tickets.length, unpromotedRows: nonempty.length - tickets.length, mode: process.argv.includes('--apply') ? 'apply' : 'dry-run' };
console.log(JSON.stringify(stats));
if (!process.argv.includes('--apply')) process.exit(0);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('lacc-ticket-source-import'))");
  const existing = await client.query('SELECT id FROM lacc_ticket_imports WHERE source_sha256=$1', [sha]);
  if (existing.rowCount) {
    await client.query('COMMIT');
    console.log('This exact source snapshot is already imported; no changes.');
  } else {
    if (Number((await client.query('SELECT count(*) FROM lacc_tickets')).rows[0].count) > 0) throw new Error('Live ticket table already contains records. Reconciliation is required before importing history.');
    const importId = randomUUID();
    await client.query('INSERT INTO lacc_ticket_imports(id,source_sha256,source_id,imported_rows,ticket_rows,metadata) VALUES($1,$2,$3,$4,$5,$6)', [importId, sha, sourceId, nonempty.length, tickets.length, JSON.stringify({ headers, emptyCsvRows: stats.emptyRows, sourceTimezone: 'America/New_York', unpromotedRows: stats.unpromotedRows })]);
    const bySourceRow = new Map(tickets.map((row) => [row.sourceRow, row]));
    for (const { values, sourceRow } of normalized) {
      const source = bySourceRow.get(sourceRow);
      let ticketUid = null;
      if (source) {
        ticketUid = `google-row-${sourceRow}`;
        const email = source.values[4].trim().toLowerCase();
        const sourceTicketNumber = source.values[18].trim();
        const solvedValue = source.values[10].trim();
        const completion = parseSourceDate(source.values[15]);
        const solvedDate = source.values[14].trim();
        const staff = source.values[17].trim();
        const isResolved = /^(yes|true|1)$/i.test(solvedValue) || Boolean(completion) || Boolean(solvedDate) || Boolean(staff && !/^(tbd|false|no|n\/a)$/i.test(staff));
        const description = source.values[19].trim() || source.values[7].trim() || source.values[8].trim() || 'No additional details supplied.';
        const category = source.values[11].trim() || source.values[8].trim() || 'General IT';
        const ticketNumber = `GS-${sourceRow}`;
        const ticket = {
          ticketUid, ticketNumber, operationUid: `legacy-import-${sha.slice(0, 12)}-${sourceRow}`,
          requesterUid: email || `requester-${sourceRow}`, requesterEmail: email,
          requesterName: source.values[1].trim() || 'Unidentified requester',
          subject: source.values[8].trim() || source.values[7].trim().slice(0, 100) || 'IT support request',
          description, category, priority: 'P3', status: isResolved ? 'RESOLVED' : 'NEW',
          assigneeUid: '', departmentUid: source.values[5].trim(), locationUid: source.values[6].trim(),
          assetUid: '', impact: 'ONE', workBlocked: false, workaroundAvailable: false,
          createdAt: source.createdAt, updatedAt: completion || source.createdAt,
          resolvedAt: isResolved ? (completion || source.createdAt) : '', version: 1,
          historicalStaff: staff, resolutionNotes: source.values[12].trim(),
          sourceSolvedValue: solvedValue, sourceSolvedDate: solvedDate, completionTimestamp: source.values[15].trim(),
          sourceTicketNumber, sourceSpreadsheetRow: sourceRow,
        };
        await client.query('INSERT INTO lacc_tickets(uid,number,operation_uid,requester_uid,version,data,created_at) VALUES($1,$2,$3,$4,1,$5,$6)', [ticketUid, ticketNumber, ticket.operationUid, ticket.requesterUid, JSON.stringify(ticket), source.createdAt]);
      }
      await client.query('INSERT INTO lacc_ticket_source_rows(import_id,source_row,ticket_uid,headers,original_values) VALUES($1,$2,$3,$4,$5)', [importId, sourceRow, ticketUid, JSON.stringify(headers), JSON.stringify(values)]);
    }
    const count = Number((await client.query('SELECT count(*) FROM lacc_ticket_source_rows WHERE import_id=$1', [importId])).rows[0].count);
    const ticketCount = Number((await client.query('SELECT count(*) FROM lacc_tickets')).rows[0].count);
    if (count !== nonempty.length || ticketCount !== tickets.length) throw new Error('Database readback count does not match the source.');
    await client.query('COMMIT');
    console.log('Imported and verified preserved source rows and ticket records.');
  }
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }
