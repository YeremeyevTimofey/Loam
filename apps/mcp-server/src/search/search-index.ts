import { createRequire } from 'node:module';
import path from 'node:path';
import { FILE, parseDoc } from '@loam/core';
import type { NodeStore } from '../node-store';

export interface Hit {
  path: string;
  title: string;
  snippet: string;
}

interface Doc {
  path: string;
  title: string;
  body: string;
}

type Db = {
  prepare(sql: string): { run(...a: unknown[]): unknown; all(...a: unknown[]): unknown[]; get(...a: unknown[]): unknown };
  exec(sql: string): void;
  pragma(s: string, o?: { simple: boolean }): unknown;
  transaction<T extends (...a: never[]) => unknown>(fn: T): T;
  close(): void;
};

const SCHEMA_VERSION = 1;
const WORDS = /[\p{L}\p{N}_]+/gu;

function loadDriver(): ((file: string) => Db) | null {
  try {
    const require = createRequire(import.meta.url);
    const Database = require('better-sqlite3');
    return (file) => new Database(file) as Db;
  } catch (error) {
    process.stderr.write(`[loam] SQLite search is unavailable, using basic search: ${(error as Error).message}\n`);
    return null;
  }
}

function toDoc(rel: string, raw: string): Doc {
  let body = raw;
  let title = '';
  try {
    const parsed = parseDoc(raw);
    body = parsed.body;
    title = String(parsed.data.title ?? parsed.data.name ?? '');
  } catch {
    /* index the raw text */
  }
  title = title || /^#\s+(.+)$/m.exec(body)?.[1] || path.posix.basename(rel, '.md');
  return { path: rel, title, body };
}

/**
 * Full-text search over the base. Uses SQLite FTS5 (bm25 ranking) when the native module loads,
 * and a plain keyword scan otherwise, so the tool keeps working on any machine.
 *
 * The index is built at start-up and then only brought up to date for files whose size or
 * modification time changed. That also picks up edits made in the browser app.
 */
export class SearchIndex {
  private db: Db | null = null;
  private tried = false;
  private basicDocs = new Map<string, Doc & { mtimeMs: number; size: number }>();

  constructor(
    private readonly store: NodeStore,
    private readonly dbFile: string,
    private readonly options: { forceBasic?: boolean } = {},
  ) {
    this.tried = Boolean(options.forceBasic);
  }

  get mode(): 'fts5' | 'basic' {
    return this.db ? 'fts5' : 'basic';
  }

  /** Opens SQLite once, and only inside a folder that is already a Loam base (we never create .loam elsewhere). */
  private async ensureDb(): Promise<void> {
    if (this.db || this.tried) return;
    if (!(await this.store.exists(FILE.state))) return;
    this.tried = true;
    const open = loadDriver();
    if (!open) return;
    try {
      this.db = open(this.dbFile);
      this.setup();
    } catch (error) {
      process.stderr.write(`[loam] could not open ${this.dbFile}: ${(error as Error).message}\n`);
      this.db = null;
    }
  }

  private setup(): void {
    const db = this.db!;
    const version = db.pragma('user_version', { simple: true });
    if (version !== SCHEMA_VERSION) {
      db.exec('DROP TABLE IF EXISTS docs; DROP TABLE IF EXISTS meta;');
      db.pragma(`user_version = ${SCHEMA_VERSION}`);
    }
    db.exec(`CREATE TABLE IF NOT EXISTS meta(path TEXT PRIMARY KEY, mtime REAL NOT NULL, size INTEGER NOT NULL);
             CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5(path UNINDEXED, title, body, tokenize = 'unicode61 remove_diacritics 2');`);
  }

  /** Re-reads only the files that changed since the last call. */
  async sync(): Promise<void> {
    await this.ensureDb();
    const stats = await this.store.markdownStats();
    if (!this.db) {
      const seen = new Set<string>();
      for (const s of stats) {
        seen.add(s.path);
        const known = this.basicDocs.get(s.path);
        if (known && known.mtimeMs === s.mtimeMs && known.size === s.size) continue;
        this.basicDocs.set(s.path, { ...toDoc(s.path, await this.store.readFile(s.path)), mtimeMs: s.mtimeMs, size: s.size });
      }
      for (const key of [...this.basicDocs.keys()]) if (!seen.has(key)) this.basicDocs.delete(key);
      return;
    }
    const db = this.db;
    const known = new Map((db.prepare('SELECT path, mtime, size FROM meta').all() as { path: string; mtime: number; size: number }[]).map((r) => [r.path, r]));
    const changed: { s: (typeof stats)[number]; doc: Doc }[] = [];
    const seen = new Set<string>();
    for (const s of stats) {
      seen.add(s.path);
      const k = known.get(s.path);
      if (k && k.mtime === s.mtimeMs && k.size === s.size) continue;
      changed.push({ s, doc: toDoc(s.path, await this.store.readFile(s.path)) });
    }
    const gone = [...known.keys()].filter((p) => !seen.has(p));
    if (changed.length === 0 && gone.length === 0) return;
    const del = db.prepare('DELETE FROM docs WHERE path = ?');
    const delMeta = db.prepare('DELETE FROM meta WHERE path = ?');
    const ins = db.prepare('INSERT INTO docs(path, title, body) VALUES (?, ?, ?)');
    const insMeta = db.prepare('INSERT OR REPLACE INTO meta(path, mtime, size) VALUES (?, ?, ?)');
    db.transaction(() => {
      for (const p of gone) {
        del.run(p);
        delMeta.run(p);
      }
      for (const { s, doc } of changed) {
        del.run(s.path);
        ins.run(doc.path, doc.title, doc.body);
        insMeta.run(s.path, s.mtimeMs, s.size);
      }
    })();
  }

  async search(query: string, limit: number): Promise<Hit[]> {
    await this.sync();
    const terms = [...new Set((query.toLowerCase().match(WORDS) ?? []).slice(0, 12))];
    if (terms.length === 0) return [];
    if (!this.db) return this.basicSearch(terms, limit);
    const match = terms.map((t) => `"${t}"*`).join(' OR ');
    const rows = this.db
      .prepare(
        `SELECT path, title, snippet(docs, 2, '[', ']', ' … ', 16) AS snippet
         FROM docs WHERE docs MATCH ? ORDER BY bm25(docs, 0.0, 4.0, 1.0) LIMIT ?`,
      )
      .all(match, limit) as Hit[];
    return rows.map((r) => ({ ...r, snippet: r.snippet.replace(/\s+/g, ' ').trim() }));
  }

  private basicSearch(terms: string[], limit: number): Hit[] {
    const scored: (Hit & { score: number })[] = [];
    for (const doc of this.basicDocs.values()) {
      const text = `${doc.title} ${doc.body}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        const n = text.split(t).length - 1;
        score += n + (doc.title.toLowerCase().includes(t) ? 5 : 0);
      }
      if (score === 0) continue;
      const first = terms.map((t) => doc.body.toLowerCase().indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
      scored.push({ path: doc.path, title: doc.title, snippet: `… ${doc.body.slice(Math.max(0, first - 40), first + 120).replace(/\s+/g, ' ')} …`, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(({ score: _s, ...hit }) => hit);
  }

  close(): void {
    this.db?.close();
  }
}
