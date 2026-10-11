// workerd caps PBKDF2 at 100,000 iterations. An independent server-side pepper
// protects database-only leaks; it is stored exclusively in Cloudflare Secrets.
const ITERATIONS = 100_000;
const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const decode = (text: string) => new Uint8Array(Buffer.from(text, 'base64url'));
async function derive(password: string, salt: Uint8Array, iterations: number, pepper: string) {
  if (pepper.length < 32) throw new Error('Configure ADMIN_PASSWORD_PEPPER');
  const hmac = await crypto.subtle.importKey('raw', new TextEncoder().encode(pepper), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const material = await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode(password));
  const key = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256));
}
export function validPasswordHash(hash: string) { return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash) || /^pbkdf2-sha256-peppered\$100000\$[\w-]{22}\$[\w-]{43}$/.test(hash); }
export async function webCryptoHash(password: string, pepper = process.env.ADMIN_PASSWORD_PEPPER ?? '') {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256-peppered$${ITERATIONS}$${encode(salt)}$${encode(await derive(password, salt, ITERATIONS, pepper))}`;
}
export async function webCryptoVerify(password: string, hash: string, pepper = process.env.ADMIN_PASSWORD_PEPPER ?? '') {
  if (!hash.startsWith('pbkdf2-sha256-peppered$') || !validPasswordHash(hash)) return false;
  const parts = hash.split('$'), actual = await derive(password, decode(parts[2]), ITERATIONS, pepper), expected = decode(parts[3]);
  let different = actual.length ^ expected.length;
  for (let i = 0; i < actual.length; i++) different |= actual[i] ^ expected[i];
  return different === 0;
}
