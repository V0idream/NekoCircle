import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('production rejects public administrator setup without changing the isolated database',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'neko-admin-route-'));
 const previous={...process.env};
 Object.assign(process.env,{DB_PATH:path.join(directory,'circle.db'),NODE_ENV:'production',SITE_URL:'https://circle.example.com',ADMIN_SETUP_ENABLED:'false',JWT_SECRET:'test-only-'.repeat(8)});
 try{
  const {POST}=await import('../app/api/auth/login/route');
  const request=(origin?:string)=>new Request('https://circle.example.com/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify({password:'test-only-password'})});
  assert.equal((await POST(request())).status,403);
  assert.equal((await POST(request('https://attacker.example'))).status,403);
  assert.equal((await POST(request('https://circle.example.com'))).status,403);
  const {getSetting}=await import('../lib/db');
  assert.equal(getSetting('admin_password_hash'),'');
 }finally{
  for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];
  Object.assign(process.env,previous);
  if(path.dirname(directory)!==path.resolve(tmpdir()))throw new Error('Unexpected test cleanup path');
  rmSync(directory,{recursive:true,force:true});
 }
});
