import { getDb } from './cloudflare-db';
import { TABLE_META, SCHEMA_VERSION, ImportError } from './admin-data-schema';
import { CREDENTIAL_KEY_RE, getSettingDef } from './app-config';
import type { ExportBundle, ExportOptions, TableName, ImportOptions, ImportReport, TableReport, DatabaseOverview } from './admin-data';
import type { D1PreparedStatement } from '@cloudflare/workers-types';
export { TABLE_META, SCHEMA_VERSION, ImportError } from './admin-data-schema';
export type { ExportBundle, ExportOptions, TableName, ImportOptions, ImportReport, DatabaseOverview } from './admin-data';

function tables(input: unknown): TableName[] {
  if (!Array.isArray(input)) return TABLE_META.map(t => t.name);
  const selected = TABLE_META.filter(t => input.includes(t.name)).map(t => t.name);
  return selected.length ? selected : TABLE_META.map(t => t.name);
}
export function exportFilename(now = new Date()) { return `nekocircle-backup-${now.toISOString().replace(/[:.]/g, '-')}.json`; }

export async function buildExportBundle(options: ExportOptions = {}): Promise<ExportBundle> {
  const names = tables(options.tables), include = options.includeCredentials === true;
  const db = getDb();
  const bundle: ExportBundle = { app: 'nekocircle', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), options: { credentials: include, tables: names }, counts: {}, tables: {} };
  // Bound each response before materializing the full database in Worker memory.
  for (const name of names) {
    const size = await db.prepare(`SELECT COUNT(*) n FROM ${name}`).get() as { n: number };
    if (size.n > 5000) throw new ImportError('数据量较大，请使用 Wrangler D1 导出，避免超过免费 Worker 的内存限制。');
    let rows = await db.prepare(`SELECT * FROM ${name}`).all() as Record<string, unknown>[];
    if (name === 'settings') rows = rows.filter(r => !CREDENTIAL_KEY_RE.test(String(r.key)) || include && String(r.key).endsWith('_hash'));
    bundle.tables[name] = rows; bundle.counts[name] = rows.length;
    if (JSON.stringify(bundle).length > 1_000_000) throw new ImportError('在线导出上限为 1 MB，请使用 Wrangler D1 导出完整数据库。');
  }
  return bundle;
}

/** All replacements, the snapshot and all inserts commit in a single atomic D1 batch. */
export async function applyImport(raw: unknown, options: ImportOptions, db = getDb()): Promise<ImportReport> {
  if (options.mode !== 'merge' && options.mode !== 'replace') throw new ImportError('mode 只能是 merge 或 replace。');
  if (options.mode === 'replace' && !options.confirm && !options.dryRun) throw new ImportError('覆盖导入需要 confirm 确认。');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ImportError('不是 JSON 对象。');
  const bundle = raw as ExportBundle;
  if (bundle.app !== 'nekocircle' || bundle.schemaVersion > SCHEMA_VERSION || !bundle.tables || typeof bundle.tables !== 'object' || Array.isArray(bundle.tables)) throw new ImportError('备份格式或版本无效。');
  if (JSON.stringify(bundle).length > 1_000_000) throw new ImportError('在线导入上限为 1 MB，大型备份请使用 Wrangler。');
  const requested = TABLE_META.filter(t => Object.hasOwn(bundle.tables, t.name));
  if (!requested.length) throw new ImportError('没有可导入的表。');
  const batch: D1PreparedStatement[] = [], reports: TableReport[] = [], insertReports: { index: number; report: TableReport }[] = [];
  const columns = new Map<TableName, string[]>();
  for (const meta of TABLE_META) columns.set(meta.name, (await db.prepare(`PRAGMA table_info(${meta.name})`).all() as { name: string }[]).map(r => r.name));
  const snapshotId = options.mode === 'replace' && !options.dryRun ? crypto.randomUUID() : null;
  if (snapshotId) {
    const jsonTables = TABLE_META.map(t => `'${t.name}', json((SELECT COALESCE(json_group_array(json_object(${columns.get(t.name)!.map(c => `'${c}', ${c}`).join(',')})), '[]') FROM ${t.name}))`).join(',');
    batch.push(db.binding.prepare(`INSERT INTO import_snapshots(id, data, created_at) SELECT ?, json_object('app','nekocircle','schemaVersion',3,'tables',json_object(${jsonTables})), ?`).bind(snapshotId, Date.now()));
    batch.push(db.binding.prepare('DELETE FROM import_snapshots WHERE id NOT IN (SELECT id FROM import_snapshots ORDER BY created_at DESC LIMIT 3)'));
  }
  for (const meta of requested) {
    const incoming = bundle.tables[meta.name];
    if (!Array.isArray(incoming)) throw new ImportError(`${meta.label}不是数组，已中止导入。`);
    const report: TableReport = { table: meta.name, label: meta.label, received: incoming.length, inserted: 0, skipped: 0, notes: [] }; reports.push(report);
    const rows: Record<string, unknown>[] = [];
    for (const item of incoming) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) { report.skipped++; continue; }
      const row = Object.fromEntries(Object.entries(item).filter(([k, v]) => columns.get(meta.name)!.includes(k) && (v === null || ['string','number'].includes(typeof v))));
      if (!meta.primaryKey.every(k => row[k] !== undefined)) { report.skipped++; continue; }
      if (meta.name === 'settings') {
        const key = String(row.key), def = getSettingDef(key);
        if (CREDENTIAL_KEY_RE.test(key) || !def || def.secret) { report.skipped++; continue; }
        const val = String(row.value ?? '');
        if (val.length > 500 || def.type === 'number' && (!Number.isFinite(Number(val)) || Number(val) < (def.min ?? -Infinity) || Number(val) > (def.max ?? Infinity)) || def.type === 'boolean' && !['true','false'].includes(val) || key.endsWith('_proxy') && val) throw new ImportError(`${key} 的设置值无效。`);
        row.value = val;
      }
      rows.push(row);
    }
    if (options.mode === 'replace') {
      if (meta.name === 'settings') batch.push(db.binding.prepare("DELETE FROM settings WHERE key NOT LIKE 'admin_password%' AND key NOT LIKE 'github_backup_token%'"));
      else batch.push(db.binding.prepare(`DELETE FROM ${meta.name}`));
    }
    for (const row of rows) {
      const cols = Object.keys(row), verb = options.mode === 'merge' ? 'INSERT OR IGNORE' : 'INSERT';
      insertReports.push({ index: batch.length, report });
      batch.push(db.binding.prepare(`${verb} INTO ${meta.name} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...cols.map(c => row[c])));
    }
  }
  if (batch.length > 40) throw new ImportError('单次在线导入最多 40 条 SQL 操作，请拆分备份或使用 Wrangler 导入。');
  if (!options.dryRun && batch.length) {
    const results = await db.binding.batch(batch);
    for (const {index, report} of insertReports) { if (results[index].meta.changes) report.inserted++; else report.skipped++; }
  } else for (const { report } of insertReports) report.inserted++;
  return { mode: options.mode, appliedAt: new Date().toISOString(), snapshotPath: snapshotId ? `D1:import_snapshots/${snapshotId}` : null, tables: reports, dryRun: !!options.dryRun };
}

export async function databaseOverview(): Promise<DatabaseOverview> {
  const db = getDb(), output: DatabaseOverview['tables'] = [];
  let bytes = 0;
  for (const meta of TABLE_META) {
    const result = await db.binding.prepare(`SELECT COUNT(*) c FROM ${meta.name}`).all<{ c: number }>();
    output.push({ name: meta.name, label: meta.label, rows: result.results[0].c });
    bytes = result.meta.size_after;
  }
  // D1 does not authorize the native SQLite page_count/page_size pragmas.
  return { path: 'D1:NEKOCIRCLE_DB', bytes, tables: output };
}
