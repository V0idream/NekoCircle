import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
if(!process.argv.includes('--new-production-db'))throw new Error('This command requires --new-production-db and refuses any nonempty destination.');
const config='wrangler.production.jsonc', target=JSON.parse(fs.readFileSync(config,'utf8'));
if(target.name!=='voidream-nekocircle'||target.d1_databases?.length!==1||target.d1_databases[0].database_name!=='voidream-nekocircle-production')throw new Error('Unexpected database destination');
const cli='node_modules/wrangler/bin/wrangler.js', expected=JSON.parse(fs.readFileSync('runtime/sqlite-migration-counts.json','utf8'));
if(expected.credentialsExported!==false||expected.integrity!=='ok')throw new Error('Source export was not verified');
const query=Object.keys(expected.counts).map(name=>{if(!/^(settings|announcements|generation_log|yahoo_circles|feedbacks)$/.test(name))throw new Error('Unexpected table');return `SELECT '${name}' name, COUNT(*) n FROM ${name}`;}).join(' UNION ALL ');
function read(sql){const output=execFileSync(process.execPath,[cli,'d1','execute','NEKOCIRCLE_DB','--remote','--config',config,'--command',sql,'--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});return JSON.parse(output)[0].results;}
function counts(){return read(query);}
if(counts().some(row=>row.n!==0))throw new Error('Destination is not empty; existing data is protected.');
execFileSync(process.execPath,[cli,'d1','execute','NEKOCIRCLE_DB','--remote','--config',config,'--file','runtime/sqlite-migration.sql'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
const actual=counts();if(actual.some(row=>row.n!==expected.counts[row.name]))throw new Error('Migration count mismatch. Do not publish before investigating.');
const actualBytes=read('SELECT id, LENGTH(CAST(circle_data AS BLOB)) bytes FROM yahoo_circles');
if(actualBytes.some(row=>expected.circleBytes.find(c=>c.id===row.id)?.bytes!==row.bytes))throw new Error('Circle content size mismatch. Do not publish before investigating.');
fs.writeFileSync('runtime/sqlite-migration-complete.json',JSON.stringify({target:target.d1_databases[0].database_name,counts:actual,credentialsCopied:false,sourceUnchanged:true,verifiedAt:new Date().toISOString()},null,2));
console.log(JSON.stringify({migration:'verified',target:target.d1_databases[0].database_name,counts:actual,credentialsCopied:false,sourceUnchanged:true}));
