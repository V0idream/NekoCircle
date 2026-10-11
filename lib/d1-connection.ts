import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';

/** Small compatibility facade: all I/O is asynchronous; no emulated transactions. */
export class D1Connection {
  constructor(readonly binding: D1Database) {}
  prepare(sql: string) {
    const statement = this.binding.prepare(sql);
    function bind(args: unknown[]): D1PreparedStatement {
      const values = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      return values.length ? statement.bind(...values) : statement;
    }
    return {
      async get(...args: unknown[]): Promise<unknown> { return (await bind(args).first()) ?? undefined; },
      async all(...args: unknown[]): Promise<unknown[]> { return (await bind(args).all()).results; },
      async run(...args: unknown[]) {
        const result = await bind(args).run();
        return { changes: result.meta.changes, lastInsertRowid: result.meta.last_row_id };
      },
    };
  }
  close() { /* D1 connections belong to the request runtime. */ }
}
