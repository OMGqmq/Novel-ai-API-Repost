import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

function isQuery(sql) {
  const s = sql.trim().toUpperCase();
  return s.startsWith('SELECT') || s.startsWith('WITH') || s.startsWith('PRAGMA');
}

class D1PreparedStatement {
  constructor(rawDb, sql, params = []) {
    this.rawDb = rawDb;
    this.sql = sql;
    this.params = params;
  }

  bind(...args) {
    const bindParams = (args.length === 1 && Array.isArray(args[0])) ? args[0] : args;
    return new D1PreparedStatement(this.rawDb, this.sql, bindParams);
  }

  async first(column) {
    const stmt = this.rawDb.prepare(this.sql);
    const row = stmt.get(...this.params);
    if (!row) return null;
    if (column) return row[column];
    return row;
  }

  async all() {
    const stmt = this.rawDb.prepare(this.sql);
    const rows = stmt.all(...this.params);
    return {
      results: rows || [],
      success: true,
      meta: { changes: 0 }
    };
  }

  async run() {
    const stmt = this.rawDb.prepare(this.sql);
    const res = stmt.run(...this.params);
    return {
      success: true,
      results: [],
      meta: {
        changes: res.changes || 0,
        last_row_id: res.lastInsertRowid || 0
      }
    };
  }

  async raw() {
    const stmt = this.rawDb.prepare(this.sql);
    const rows = stmt.all(...this.params);
    return (rows || []).map(r => Object.values(r));
  }

  async execute() {
    return isQuery(this.sql) ? this.all() : this.run();
  }
}

/**
 * D1Adapter: Implements Cloudflare D1 Database API using Node.js built-in node:sqlite.
 * Enables zero-dependency local execution of Cloudflare D1 code on a standalone server.
 */
export class D1Adapter {
  constructor(dbPath = './data/nai.db') {
    if (dbPath !== ':memory:') {
      const dir = path.dirname(path.resolve(dbPath));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.dbPath = dbPath;
    this.rawDb = new DatabaseSync(dbPath);
    
    // Performance and integrity pragmas
    this.rawDb.exec('PRAGMA journal_mode = WAL;');
    this.rawDb.exec('PRAGMA synchronous = NORMAL;');
    this.rawDb.exec('PRAGMA foreign_keys = ON;');
  }

  /**
   * Initializes database schema if tables do not exist
   */
  initSchema(schemaPath = './init_db.sql') {
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      this.rawDb.exec(sql);
    }
  }

  /**
   * Prepares a SQL statement, returning a D1PreparedStatement
   */
  prepare(sql) {
    return new D1PreparedStatement(this.rawDb, sql, []);
  }

  /**
   * Executes a batch of statements inside a single transaction
   */
  async batch(statements) {
    this.rawDb.exec('BEGIN TRANSACTION;');
    try {
      const results = [];
      for (const stmt of statements) {
        if (!stmt) continue;
        if (typeof stmt.execute === 'function') {
          results.push(await stmt.execute());
        } else if (typeof stmt.run === 'function') {
          results.push(await stmt.run());
        } else if (typeof stmt.all === 'function') {
          results.push(await stmt.all());
        }
      }
      this.rawDb.exec('COMMIT;');
      return results;
    } catch (err) {
      this.rawDb.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Executes raw multi-statement SQL
   */
  async exec(sql) {
    this.rawDb.exec(sql);
  }

  close() {
    this.rawDb.close();
  }
}
