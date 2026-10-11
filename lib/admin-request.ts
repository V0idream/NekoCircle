/** Shared Edge/Node checks; no database or filesystem dependencies. */
export function trustedAdminMutation(req:Request):boolean {
 if(['GET','HEAD','OPTIONS'].includes(req.method))return true;
 const origin=req.headers.get('origin');if(!origin)return false;
 try{return new URL(origin).origin===new URL(process.env.SITE_URL||req.url).origin;}catch{return false;}
}
const loginAttempts=new Map<string,{count:number;until:number}>();
export function allowAdminLogin(req:Request,now=Date.now()):boolean {
 const key=req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'local';
 for(const [ip,entry] of loginAttempts)if(entry.until<=now)loginAttempts.delete(ip);
 let entry=loginAttempts.get(key);
 if(!entry){if(loginAttempts.size>=1000)return false;entry={count:0,until:now+15*60*1000};loginAttempts.set(key,entry);}
 return ++entry.count<=20;
}
