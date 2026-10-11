import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
const root=path.resolve(import.meta.dirname,'..'),runtime=path.join(root,'runtime'),stateFile=path.join(runtime,'server.json');
process.chdir(root);fs.mkdirSync(path.join(runtime,'logs'),{recursive:true});
function load(){if(fs.existsSync('.env.local'))process.loadEnvFile('.env.local');process.env.NEXT_TELEMETRY_DISABLED='1';}
function run(file,args=[]){const result=spawnSync(process.execPath,[file,...args],{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});if(result.status!==0)throw new Error('Command failed: '+file);}
function settings(){load();const port=Number(process.env.NEKOCIRCLE_PORT||3001);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local port');if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32)throw new Error('Run init to configure JWT_SECRET');return {port,url:'http://127.0.0.1:'+port};}
const command=process.argv[2]||'help';
if(command==='init'){
 if(!fs.existsSync('.env.local')){
  const values={JWT_SECRET:randomBytes(32).toString('hex'),ADMIN_JWT_SECRET:randomBytes(32).toString('hex'),DB_PATH:path.join(runtime,'data','circle.db').replaceAll('\\','/'),SITE_URL:'http://127.0.0.1:3001',NEKOCIRCLE_PORT:'3001',ADMIN_SETUP_ENABLED:'false'};
  fs.writeFileSync('.env.local',Object.entries(values).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600,flag:'wx'});
  console.log('Created ignored .env.local; secrets withheld. Original data/circle.db is untouched.');
 }
 settings();run('node_modules/tsx/dist/cli.mjs',['scripts/bootstrap-admin.ts']);
}else if(command==='build'){
 if(fs.existsSync(stateFile)){
  const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
  try{process.kill(state.pid,0);throw new Error('Stop the managed server before building in the same directory.');}catch(error){if(error.code!=='ESRCH')throw error;}
 }
 settings();run('node_modules/next/dist/bin/next',['build']);
}else if(command==='start'){
 const {port,url}=settings();
 if(!fs.existsSync('.next/BUILD_ID'))throw new Error('Run build first.');
 if(fs.existsSync(stateFile)){
  const previous=JSON.parse(fs.readFileSync(stateFile,'utf8'));
  try{process.kill(previous.pid,0);throw new Error('Recorded process is running; use status or stop first.');}catch(error){if(error.code!=='ESRCH')throw error;}
 }
 try{await fetch(url+'/api/health/live',{signal:AbortSignal.timeout(1000)});throw new Error('Port already serves an application; refusing duplicate launch.');}catch(error){if(error.message.startsWith('Port already'))throw error;}
 const releaseId=randomUUID(),log=fs.openSync(path.join(runtime,'logs','server.log'),'a');
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,NODE_ENV:'production',NEKOCIRCLE_RELEASE_ID:releaseId},detached:true,windowsHide:true,stdio:['ignore',log,log]});
 child.unref();fs.closeSync(log);fs.writeFileSync(stateFile,JSON.stringify({pid:child.pid,url,releaseId},null,2));
 let ready=false;
 for(let i=0;i<40;i++){try{const response=await fetch(url+'/api/health/ready',{signal:AbortSignal.timeout(2000)});const data=await response.json();if(response.ok&&data.releaseId===releaseId){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 if(!ready)throw new Error('Startup check failed; inspect runtime/logs/server.log.');
 console.log('Ready: '+url+'/zh ; loopback only. PID '+child.pid);
}else if(command==='stop'||command==='status'){
 if(!fs.existsSync(stateFile)){console.log('No managed local server.');process.exit(0);}
 const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));let healthy=false;
 try{const response=await fetch(state.url+'/api/health/ready',{signal:AbortSignal.timeout(3000)});healthy=response.ok&&(await response.json()).releaseId===state.releaseId;}catch{}
 if(command==='status')console.log(JSON.stringify({url:state.url,healthy,pid:state.pid}));
 else{
  try{process.kill(state.pid,0);}catch(error){if(error.code==='ESRCH'){fs.unlinkSync(stateFile);console.log('Already stopped.');process.exit(0);}throw error;}
  if(!healthy)throw new Error('Could not verify managed process identity; refusing to kill an unrelated process.');
  process.kill(state.pid,'SIGTERM');
  for(let i=0;i<30;i++){try{process.kill(state.pid,0);}catch(error){if(error.code==='ESRCH')break;throw error;}await new Promise(r=>setTimeout(r,100));}
  try{process.kill(state.pid,0);throw new Error('Process has not exited; state retained.');}catch(error){if(error.code!=='ESRCH')throw error;}
  fs.unlinkSync(stateFile);console.log('Local server stopped; database and secrets preserved.');
 }
}else if(command==='backup'){
 settings();const source=process.env.DB_PATH||path.join(root,'data','circle.db');if(!fs.existsSync(source))throw new Error('Database does not exist.');
 const directory=path.join(runtime,'backups');fs.mkdirSync(directory,{recursive:true});
 const destination=path.join(directory,'circle-'+new Date().toISOString().replaceAll(/[:.]/g,'-')+'.db');
 const db=new Database(source,{readonly:true});try{await db.backup(destination);}finally{db.close();}console.log('SQLite online backup saved in ignored runtime/backups.');
}else console.log('node scripts/local-runtime.mjs init | build | start | status | stop | backup');
