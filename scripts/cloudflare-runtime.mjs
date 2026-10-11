import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
process.chdir(path.resolve(import.meta.dirname,'..'));
const action=process.argv[2], environment=process.argv[3]||'staging';
if(!['staging','production'].includes(environment))throw new Error('Choose staging or production');
const configFile=`wrangler.${environment}.jsonc`, config=JSON.parse(fs.readFileSync(configFile,'utf8'));
const expected=environment==='staging'?'voidream-nekocircle-staging':'voidream-nekocircle';
if(config.name!==expected||config.d1_databases?.length!==1||!config.d1_databases[0].database_name.startsWith('voidream-nekocircle-')||config.routes||config.r2_buckets||config.durable_objects||config.images)throw new Error('Unexpected deployment target or storage bindings');
fs.mkdirSync('runtime',{recursive:true});
const cli=(file,args,env=process.env)=>{const r=spawnSync(process.execPath,[file,...args],{stdio:'inherit',env,windowsHide:true});if(r.status!==0)process.exit(r.status??1);};
const wrangler='node_modules/wrangler/bin/wrangler.js';
function freeBundleCheck() {
 const r=spawnSync(process.execPath,[wrangler,'deploy','--dry-run','--config',configFile],{encoding:'utf8',windowsHide:true,maxBuffer:2_000_000});
 if(r.status!==0){console.error((r.stderr||r.stdout).slice(-3000));process.exit(r.status??1);}
 const size=r.stdout.match(/gzip:\s*([\d.]+)\s*KiB/);
 if(!size||Number(size[1])>3072)throw new Error('Free Worker gzip limit exceeded or size could not be verified; deployment refused.');
 console.log(`Verified free Worker bundle: ${size[1]} KiB gzip (limit 3072 KiB).`);
}
if(action==='build'){
 cli('scripts/build-og-fallback.mjs',[]);
 const stateFile='runtime/server.json';if(fs.existsSync(stateFile)){const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));try{process.kill(state.pid,0);throw new Error('Stop the managed local server before building.');}catch(e){if(e.code!=='ESRCH')throw e;}}
 fs.writeFileSync('runtime/last-build.json',JSON.stringify({runtime:'cloudflare',environment}));
 cli('node_modules/@opennextjs/cloudflare/dist/cli/index.js',['build','--config',configFile],{...process.env,NEKOCIRCLE_CLOUDFLARE_BUILD:'1',NEKOCIRCLE_CLOUDFLARE:'1',SITE_URL:config.vars.SITE_URL,NEXT_PUBLIC_EMBED_ORIGINS:config.vars.NEXT_PUBLIC_EMBED_ORIGINS,NEXT_TELEMETRY_DISABLED:'1'});
 const bundle=fs.readFileSync('.open-next/server-functions/default/handler.mjs','utf8');
 if(!bundle.includes('NEKOCIRCLE_DB is not configured')||bundle.includes('better-sqlite3'))throw new Error('Build did not select the D1 adapter');
 freeBundleCheck();
}else if(action==='dev')cli(wrangler,['dev','--config',configFile,'--ip','127.0.0.1','--port','3002']);
else if(action==='migrate-local')cli(wrangler,['d1','migrations','apply','NEKOCIRCLE_DB','--local','--config',configFile]);
else if(action==='migrate')cli(wrangler,['d1','migrations','apply','NEKOCIRCLE_DB','--remote','--config',configFile]);
else if(action==='deploy'){freeBundleCheck();cli(wrangler,['deploy','--config',configFile]);}
else if(action==='verify')cli('scripts/verify-public.mjs',[config.vars.SITE_URL]);
else console.log('node scripts/cloudflare-runtime.mjs build | dev | migrate-local | migrate | deploy | verify [staging|production]');
