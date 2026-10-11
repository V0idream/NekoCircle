import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { webCryptoHash } from '../lib/password';
/** Offline preparation only. Upload the ignored JSON with wrangler secret bulk. */
async function main() {
 const target=process.argv[2]||'staging';if(!['staging','production'].includes(target))throw new Error('Invalid target');
 const lines=fs.readFileSync('runtime/administrator.secrets.txt','utf8').trim().split(/\r?\n/),password=lines.at(-1)!;
 if(password.length<20)throw new Error('Initialize a strong local administrator password first');
 const file=`runtime/cloudflare-${target}.secrets.json`;
 if(fs.existsSync(file)) {console.log('Existing private environment configuration preserved.');return;}
 const pepper=randomBytes(32).toString('hex');
 fs.writeFileSync(file,JSON.stringify({JWT_SECRET:randomBytes(32).toString('hex'),ADMIN_JWT_SECRET:randomBytes(32).toString('hex'),ADMIN_PASSWORD_PEPPER:pepper,ADMIN_PASSWORD_HASH:await webCryptoHash(password,pepper)}),{flag:'wx',mode:0o600});
 console.log(`Private ${target} configuration saved in ignored runtime directory. Values withheld.`);
}
main().catch(()=>{console.error('Private configuration preparation failed. No values printed.');process.exitCode=1;});
