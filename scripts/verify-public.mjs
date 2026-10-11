import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
process.chdir(path.resolve(import.meta.dirname,'..'));
const raw=process.argv[2]||JSON.parse(fs.readFileSync('runtime/quick-tunnel.json','utf8')).origin;
const origin=new URL(raw);assert(origin.protocol==='https:'&&!origin.username&&!origin.password&&origin.pathname==='/'&&!origin.search&&!origin.hash,'Provide an HTTPS origin');
const checks=[];
async function request(p,options={}){return fetch(new URL(p,origin),{redirect:'manual',signal:AbortSignal.timeout(15000),...options});}
for(const [p,status] of [['/api/health/ready',200],['/zh',200],['/api/home-stats',200],['/api/generation-stats',200],['/api/admin/settings',401],['/api/admin/announcements/example.json',401]]){const r=await request(p);assert.equal(r.status,status,p);checks.push({path:p,status});}
const redirect=await request('/');assert([307,308].includes(redirect.status));assert.equal(new URL(redirect.headers.get('location'), origin).origin,origin.origin);
const admin=await request('/admin/login');assert.equal(admin.headers.get('x-frame-options'),'DENY');assert.match(admin.headers.get('content-security-policy')||'',/frame-ancestors 'none'/);
const csrf=await request('/api/admin/settings',{method:'POST',headers:{Origin:'https://untrusted.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(csrf.status,403);
const login=await request('/api/auth/login',{method:'POST',headers:{Origin:origin.origin,'Content-Type':'application/json'},body:'{}'});assert.equal(login.status,400,'Configured HTTPS origin must reach password validation');
const missing=await request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(missing.status,403);
const stats=await (await request('/api/home-stats')).json();
console.log(JSON.stringify({origin:origin.origin,checks,stats,administratorFraming:'denied',crossOriginMutation:403,configuredLoginOrigin:400,missingLoginOrigin:403}));
