import test from 'node:test';
import assert from 'node:assert/strict';
import {SignJWT} from 'jose';
import {getAdminSecret,verifyAdminToken} from '../lib/admin-auth';
import {createAdminToken} from '../lib/auth';
import {trustedAdminMutation,allowAdminLogin} from '../lib/admin-request';

test('administrator tokens require a real secret and independent admin keys survive ordinary JWT rotation',async()=>{
 const previous={jwt:process.env.JWT_SECRET,admin:process.env.ADMIN_JWT_SECRET};
 try{
  delete process.env.JWT_SECRET;delete process.env.ADMIN_JWT_SECRET;assert.throws(getAdminSecret);
  process.env.JWT_SECRET='your-secret-key-change-in-production';assert.throws(getAdminSecret);
  process.env.JWT_SECRET='a'.repeat(64);process.env.ADMIN_JWT_SECRET='b'.repeat(64);
  const token=await createAdminToken('test');assert.equal(await verifyAdminToken(token),true);
  process.env.JWT_SECRET='c'.repeat(64);assert.equal(await verifyAdminToken(token),true);
  const wrongAlgorithm=await new SignJWT({role:'admin'}).setProtectedHeader({alg:'HS384'}).setExpirationTime('1h').sign(getAdminSecret());
  assert.equal(await verifyAdminToken(wrongAlgorithm),false);
  process.env.ADMIN_JWT_SECRET='d'.repeat(64);assert.equal(await verifyAdminToken(token),false);
  assert.equal(await verifyAdminToken(token+'tampered'),false);
 }finally{if(previous.jwt===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous.jwt;if(previous.admin===undefined)delete process.env.ADMIN_JWT_SECRET;else process.env.ADMIN_JWT_SECRET=previous.admin;}
});
test('admin mutations reject missing, cross-origin and forged forwarded-origin requests',()=>{
 const previous=process.env.SITE_URL;process.env.SITE_URL='https://circle.example.com';
 try{
  const request=(origin?:string,forwarded?:string)=>new Request('http://127.0.0.1:3001/api/admin/settings',{method:'POST',headers:{...(origin?{Origin:origin}:{}),...(forwarded?{'X-Forwarded-Host':forwarded}:{})}});
  assert.equal(trustedAdminMutation(request('https://circle.example.com')),true);
  assert.equal(trustedAdminMutation(request()),false);
  assert.equal(trustedAdminMutation(request('https://attacker.example','attacker.example')),false);
  assert.equal(trustedAdminMutation(new Request('https://circle.example.com/admin')),true);
 }finally{if(previous===undefined)delete process.env.SITE_URL;else process.env.SITE_URL=previous;}
});
test('admin password attempts are bounded and expire after fifteen minutes',()=>{
 const request=new Request('http://localhost/api/auth/login',{headers:{'cf-connecting-ip':'192.0.2.91'}});
 for(let i=0;i<20;i++)assert.equal(allowAdminLogin(request,1000),true);
 assert.equal(allowAdminLogin(request,1000),false);
 assert.equal(allowAdminLogin(request,901000),true);
});
