import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SETTING_DEFS, CREDENTIAL_KEY_RE } from '../lib/app-config';
/** Offline, read-only export. The destination must be a NEW, empty NekoCircle D1. */
const source=process.argv[2] ?? 'runtime/data/circle.db';
const database=new Database(path.resolve(source),{readonly:true});
const names=['settings','announcements','generation_log','yahoo_circles','feedbacks'] as const;
const definitions=new Map(SETTING_DEFS.map(d=>[d.key,d]));
const quote=(value: unknown):string=>value===null?'NULL':typeof value==='number'&&Number.isFinite(value)?String(value):typeof value==='string'?`'${value.replaceAll("'","''")}'`:(()=>{throw new Error('Unsupported SQLite value');})();
try {
 const integrity=database.pragma('integrity_check',{simple:true});if(integrity!=='ok')throw new Error('Source integrity check failed');
 const statements:string[]=[],counts:Record<string,number>={}, circleBytes:{id:string;bytes:number}[]=[];
 for(const table of names) {
  let rows=database.prepare(`SELECT * FROM ${table}`).all() as Record<string,unknown>[];
  if(table==='settings')rows=rows.filter(r=>definitions.has(String(r.key))&&!definitions.get(String(r.key))?.secret&&!CREDENTIAL_KEY_RE.test(String(r.key))&&!String(r.key).endsWith('_proxy')&&!String(r.key).startsWith('github_backup_'));
  counts[table]=rows.length;
  for(const row of rows){
   const columns=Object.keys(row);if(columns.some(c=>!/^[a-z_]+$/.test(c)))throw new Error('Unexpected source columns');
   // D1 bounds SQL text more tightly than bound values. Split large JSON into
   // Unicode-safe chunks; the D1 bulk import restores the old state on failure.
   const parts:string[]=[];
   if(table==='yahoo_circles') {
    const text=String(row.circle_data),chars=Array.from(text);
    circleBytes.push({id:String(row.id),bytes:Buffer.byteLength(text,'utf8')});
    for(let offset=0;offset<chars.length;offset+=8192)parts.push(chars.slice(offset,offset+8192).join(''));
    row.circle_data=parts.shift()??'';
   }
   statements.push(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(c=>quote(row[c])).join(',')});`);
   for(const part of parts)statements.push(`UPDATE yahoo_circles SET circle_data = circle_data || ${quote(part)} WHERE id = ${quote(row.id)};`);
  }
 }
 fs.mkdirSync('runtime',{recursive:true});
 fs.writeFileSync('runtime/sqlite-migration.sql',statements.join('\n')+'\n',{mode:0o600});
 fs.writeFileSync('runtime/sqlite-migration-counts.json',JSON.stringify({integrity,counts,circleBytes,credentialsExported:false,sourceUnchanged:true},null,2));
 console.log(JSON.stringify({integrity,counts,credentialsExported:false,sourceUnchanged:true,output:'runtime/sqlite-migration.sql'}));
} finally {database.close();}
