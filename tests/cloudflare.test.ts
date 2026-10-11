import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import type { D1Database } from '@cloudflare/workers-types';
import { D1Connection } from '../lib/d1-connection';
import { persistYahooCircleGeneration } from '../lib/cloudflare-db';
import { applyImport, ImportError } from '../lib/cloudflare-admin-data';
import { webCryptoHash, webCryptoVerify, validPasswordHash } from '../lib/password';

function fixture() {
  const sqlite = new Database(':memory:'); sqlite.exec(fs.readFileSync('migrations/0001_initial.sql','utf8'));
  class Statement {
    args: unknown[] = [];
    constructor(readonly sql: string) {}
    bind(...args: unknown[]) { this.args = args; return this; }
    async first() { return sqlite.prepare(this.sql).get(...this.args) ?? null; }
    async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
    execute() { const r = sqlite.prepare(this.sql).run(...this.args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; }
    async run() { return this.execute(); }
  }
  const binding = { prepare: (sql: string) => new Statement(sql), async batch(statements: Statement[]) { return sqlite.transaction(() => statements.map(s => s.execute()))(); } } as unknown as D1Database;
  return { sqlite, db: new D1Connection(binding) };
}
test('D1 reads await results, preserve absent rows, flatten bound arrays and report mutations', async () => {
  const {sqlite, db} = fixture(); try {
    assert.equal(await db.prepare('SELECT key FROM settings WHERE key=?').get('absent'), undefined);
    const inserted = await db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(['test', 'value']); assert.equal(inserted.changes,1);
    assert.deepEqual(await db.prepare('SELECT value FROM settings WHERE key=?').get('test'), {value:'value'});
  } finally {sqlite.close();}
});
test('D1 replacement and snapshot roll back atomically when a later insert fails', async () => {
  const {sqlite, db} = fixture(); try {
    sqlite.prepare('INSERT INTO feedbacks(content,created_at) VALUES(?,?)').run('original',1);
    await assert.rejects(applyImport({app:'nekocircle', schemaVersion:3, tables:{feedbacks:[{id:8,content:'good',created_at:2},{id:9,created_at:3}]}}, {mode:'replace',confirm:true},db));
    assert.equal((sqlite.prepare('SELECT content FROM feedbacks').get() as {content:string}).content, 'original');
    assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM import_snapshots').get() as {n:number}).n,0);
  } finally {sqlite.close();}
});
test('D1 dry run writes nothing; confirmed replacement preserves credentials and retains a recoverable snapshot', async () => {
  const {sqlite, db} = fixture(); try {
    sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('admin_password_hash','private');
    const bundle={app:'nekocircle',schemaVersion:3,tables:{settings:[{key:'generation_enabled',value:'false'}]}};
    await applyImport(bundle,{mode:'replace',dryRun:true},db);
    assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM settings').get() as {n:number}).n,1);
    const result=await applyImport(bundle,{mode:'replace',confirm:true},db);
    assert.ok(result.snapshotPath?.startsWith('D1:'));
    assert.equal((sqlite.prepare('SELECT value FROM settings WHERE key=?').get('admin_password_hash') as {value:string}).value,'private');
    const before=JSON.parse((sqlite.prepare('SELECT data FROM import_snapshots').get() as {data:string}).data);
    assert.equal(before.tables.settings[0].value,'private');
  } finally {sqlite.close();}
});
test('D1 rejects oversized atomic imports before modifying any row', async () => {
  const {sqlite, db} = fixture(); try {
    const rows=Array.from({length:41},(_,i)=>({id:i+1,content:'test',created_at:1}));
    await assert.rejects(applyImport({app:'nekocircle',tables:{feedbacks:rows}},{mode:'merge'},db),ImportError);
    assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM feedbacks').get() as {n:number}).n,0);
  } finally {sqlite.close();}
});
test('WebCrypto password hashes reject wrong passwords and malformed iteration parameters', async () => {
  const pepper='test-only-pepper'.repeat(4), hash=await webCryptoHash('test-password-你好',pepper);
  assert.equal(validPasswordHash(hash),true); assert.equal(await webCryptoVerify('test-password-你好',hash,pepper),true);
  assert.equal(await webCryptoVerify('wrong',hash,pepper),false); assert.equal(await webCryptoVerify('test-password-你好',hash.replace('100000','999999999'),pepper),false);
  assert.equal(await webCryptoVerify('test-password-你好',hash,'other-pepper'.repeat(4)),false);
});
test('generation logging failure rolls back the saved circle instead of losing statistics', async () => {
  const {sqlite,db}=fixture();try {
    sqlite.exec("CREATE TRIGGER reject_generation BEFORE INSERT ON generation_log BEGIN SELECT RAISE(ABORT, 'simulated quota failure'); END");
    await assert.rejects(persistYahooCircleGeneration('test1234','NASA','{}',false,db));
    assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM yahoo_circles').get() as {n:number}).n,0);
    sqlite.exec('DROP TRIGGER reject_generation');
    await persistYahooCircleGeneration('test1234','NASA','{}',false,db);
    assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM yahoo_circles').get() as {n:number}).n,1);
    assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM generation_log').get() as {n:number}).n,1);
  }finally {sqlite.close();}
});
