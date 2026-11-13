import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dbStmtCaches = new WeakMap();

function getStmtCache(rawDb) {
  let cache = dbStmtCaches.get(rawDb);
  if (!cache) {
    cache = new Map();
    dbStmtCaches.set(rawDb, cache);
  }
  return cache;
}

function stripLeadingSqlComments(sql) {
  let s = String(sql || '');
  while (true) {
    s = s.trimStart();
    if (s.startsWith('--')) {
      const nl = s.indexOf('\n');
      s = nl === -1 ? '' : s.slice(nl + 1);
    } else if (s.startsWith('/*')) {
      const end = s.indexOf('*/');
      s = end === -1 ? '' : s.slice(end + 2);
    } else {
      break;
    }
  }
  return s;
}

function isQuery(sql) {
  const s = stripLeadingSqlComments(sql).toUpperCase();
  if (s.startsWith('SELECT') || s.startsWith('WITH') || s.startsWith('PRAGMA')) {
    return true;
  }
  const withoutStrings = s.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"/g, '');
  return /\bRETURNING\b/.test(withoutStrings);
}

class D1PreparedStatement {
  constructor(rawDb, sql, params = [], stmtCache = null) {
    this.rawDb = rawDb;
    this.sql = sql;
    this.params = params;
    this._stmtCache = stmtCache || getStmtCache(rawDb);
  }

  _getPrepared() {
    let stmt = this._stmtCache.get(this.sql);
    if (!stmt) {
      if (this._stmtCache.size >= 500) {
        const oldestKey = this._stmtCache.keys().next().value;
        this._stmtCache.delete(oldestKey);
      }
      stmt = this.rawDb.prepare(this.sql);
      this._stmtCache.set(this.sql, stmt);
    }
    return stmt;
  }

  bind(...args) {
    const bindParams = (args.length === 1 && Array.isArray(args[0])) ? args[0] : args;
    return new D1PreparedStatement(this.rawDb, this.sql, bindParams, this._stmtCache);
  }

  _firstSync(column) {
    const stmt = this._getPrepared();
    const row = stmt.get(...this.params);
    if (!row) return null;
    if (column) return row[column];
    return row;
  }

  async first(column) {
    return this._firstSync(column);
  }

  _allSync() {
    const stmt = this._getPrepared();
    const rows = stmt.all(...this.params);
    return {
      results: rows || [],
      success: true,
      meta: { changes: 0 }
    };
  }

  async all() {
    return this._allSync();
  }

  _runSync() {
    const stmt = this._getPrepared();
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

  async run() {
    return this._runSync();
  }

  async raw() {
    const stmt = this._getPrepared();
    const rows = stmt.all(...this.params);
    return (rows || []).map(r => Object.values(r));
  }

  executeSync() {
    return isQuery(this.sql) ? this._allSync() : this._runSync();
  }

  async execute() {
    return this.executeSync();
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
    this.stmtCache = new Map();
    
    // Performance and integrity pragmas
    this.rawDb.exec('PRAGMA journal_mode = WAL;');
    this.rawDb.exec('PRAGMA synchronous = NORMAL;');
    this.rawDb.exec('PRAGMA foreign_keys = ON;');
    this.rawDb.exec('PRAGMA busy_timeout = 5000;');
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
    return new D1PreparedStatement(this.rawDb, sql, [], this.stmtCache);
  }

  /**
   * Executes a batch of statements inside a single transaction
   */
  async batch(statements) {
    this.rawDb.exec('BEGIN IMMEDIATE;');
    try {
      const results = [];
      for (const stmt of statements) {
        if (!stmt) continue;
        if (typeof stmt.executeSync === 'function') {
          results.push(stmt.executeSync());
        } else if (typeof stmt.execute === 'function') {
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
      try {
        this.rawDb.exec('ROLLBACK;');
      } catch (_) {}
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
    this.stmtCache.clear();
    this.rawDb.close();
  }
}
