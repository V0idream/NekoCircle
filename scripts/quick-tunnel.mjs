import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..'),runtime=path.join(root,'runtime');
process.chdir(root);
if(fs.existsSync('.env.local'))process.loadEnvFile('.env.local');
const stateFile=path.join(runtime,'quick-tunnel.json');
const executable=process.env.CLOUDFLARED_PATH||'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const local='http://127.0.0.1:'+Number(process.env.NEKOCIRCLE_PORT||3001);
const protocol=process.env.CLOUDFLARED_PROTOCOL||'auto';
if(!['auto','http2','quic'].includes(protocol))throw new Error('CLOUDFLARED_PROTOCOL must be auto, http2 or quic.');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
function identity(state){
 if(!alive(state.pid))return false;
 if(process.platform!=='win32')throw new Error('Process identity verification is currently implemented for Windows only.');
 const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Get-CimInstance Win32_Process -Filter "ProcessId = ${Number(state.pid)}" | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true});
 const processInfo=JSON.parse(output);
 return processInfo.ExecutablePath?.toLowerCase()===state.executable.toLowerCase()&&processInfo.CommandLine?.includes(state.logFile);
}
async function health(origin){try{const res=await fetch(origin+'/api/health/ready',{signal:AbortSignal.timeout(5000)});return res.ok?(await res.json()):null;}catch{return null;}}
const command=process.argv[2]||'help';
if(command==='start'){
 if(!fs.existsSync(executable))throw new Error('Set CLOUDFLARED_PATH to the installed official cloudflared executable.');
 if(fs.existsSync(stateFile)){
  const existing=JSON.parse(fs.readFileSync(stateFile,'utf8'));
  if(alive(existing.pid)){
   if(!identity(existing))throw new Error('Recorded PID belongs to another process.');
   if(!existing.origin)throw new Error('Tunnel startup was interrupted; inspect its log and run stop before retrying.');
   console.log(JSON.stringify({origin:existing.origin,reused:true,healthy:Boolean(await health(existing.origin))}));process.exit(0);
  }
 }
 const ready=await health(local);if(!ready)throw new Error('Start the independent local service first.');
 fs.mkdirSync(path.join(runtime,'logs'),{recursive:true});
 const logFile=path.join(runtime,'logs','quick-tunnel-'+randomUUID()+'.log');
 const stdLog=fs.openSync(logFile+'.console','a');
 const args=['tunnel','--no-autoupdate','--url',local,'--protocol',protocol,'--metrics','127.0.0.1:0','--logfile',logFile];
 const child=spawn(executable,args,{cwd:root,detached:true,windowsHide:true,stdio:['ignore',stdLog,stdLog]});
 child.on('error',()=>{});child.unref();fs.closeSync(stdLog);
 if(!child.pid)throw new Error('Unable to launch cloudflared.');
 const state={pid:child.pid,executable,logFile,local,protocol,releaseId:ready.releaseId,origin:null,createdAt:new Date().toISOString()};
 fs.writeFileSync(stateFile,JSON.stringify(state,null,2));
 const deadline=Date.now()+90000;
 while(Date.now()<deadline){
  if(!alive(child.pid))throw new Error('cloudflared exited; inspect the ignored runtime log.');
  const logs=[logFile,logFile+'.console'].filter(f=>fs.existsSync(f)).map(f=>fs.readFileSync(f,'utf8')).join('\n');
  const match=logs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if(match){state.origin=match[0];fs.writeFileSync(stateFile,JSON.stringify(state,null,2));
   const remote=await health(state.origin);
   if(remote?.releaseId===ready.releaseId){console.log(JSON.stringify({origin:state.origin,pid:state.pid,healthy:true,temporary:true}));process.exit(0);}
  }
  await pause(500);
 }
 throw new Error('Public health check timed out; state and logs retained for diagnosis.');
}else if(command==='configure'){
 if(!fs.existsSync(stateFile))throw new Error('Start the managed Quick Tunnel first.');
 const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
 if(!identity(state)||!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(state.origin)||!await health(state.origin))throw new Error('Managed public tunnel is not healthy.');
 const file='.env.local',content=fs.readFileSync(file,'utf8');
 const updated=/^SITE_URL=.*$/m.test(content)?content.replace(/^SITE_URL=.*$/m,'SITE_URL='+state.origin):content+'\nSITE_URL='+state.origin+'\n';
 fs.writeFileSync(file,updated,{mode:0o600});
 console.log('SITE_URL updated in ignored .env.local. Stop, build and start Next.js to apply it. Secrets and DB_PATH preserved.');
}else if(command==='status'||command==='stop'){
 if(!fs.existsSync(stateFile)){console.log('No managed Quick Tunnel.');process.exit(0);}
 const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
 if(!alive(state.pid)){if(command==='stop')fs.unlinkSync(stateFile);console.log('Quick Tunnel is stopped.');process.exit(0);}
 if(!identity(state))throw new Error('Process identity mismatch; refusing to stop an unrelated process.');
 if(command==='status'){console.log(JSON.stringify({origin:state.origin,pid:state.pid,healthy:state.origin?Boolean(await health(state.origin)):false,temporary:true}));}
 else{
  process.kill(state.pid,'SIGTERM');
  for(let i=0;i<30&&alive(state.pid);i++)await pause(100);
  if(alive(state.pid))throw new Error('Process has not exited; state retained.');
  fs.unlinkSync(stateFile);console.log('Quick Tunnel stopped; Next.js, SQLite and secrets preserved.');
 }
}else console.log('node scripts/quick-tunnel.mjs start | configure | status | stop\nQuick Tunnel is temporary. A new hostname requires updating SITE_URL and the main-site NEKOCIRCLE_URL.');
