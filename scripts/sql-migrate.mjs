import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
const { loadEnvConfig } = await import('@next/env');
loadEnvConfig(process.cwd());
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
try{await pool.query(await readFile(new URL('../migrations/001_tickets.sql',import.meta.url),'utf8'));console.log('SQL migration 001 applied.');}finally{await pool.end();}
