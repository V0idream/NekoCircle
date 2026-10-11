import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { initDb, getSetting, setSetting } from '../lib/db';
import { hashPassword } from '../lib/auth';
async function bootstrap() {
    initDb();
    if ((await getSetting('admin_password_hash'))?.startsWith('$2'))
        console.log('Existing administrator preserved.');
    else {
        const password = randomBytes(24).toString('base64url');
        const directory = path.resolve('runtime');
        mkdirSync(directory, { recursive: true });
        const credentials = path.join(directory, 'administrator.secrets.txt');
        const hash = await hashPassword(password);
        writeFileSync(credentials, 'Administrator password (local only):\n' + password + '\n', { mode: 0o600, flag: 'wx' });
        (await setSetting('admin_password_hash', hash));
        console.log('Administrator initialized; password saved in ignored runtime/administrator.secrets.txt (value withheld).');
    }
}
void bootstrap().catch(() => { console.error('Local administrator initialization failed; no credentials printed.'); process.exitCode = 1; });
