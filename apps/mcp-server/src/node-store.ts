import { promises as fs, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { BackedStore, LoamError, type FileEntry } from '@loam/core';

const JUNK = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

/**
 * The knowledge base on disk. Every path is checked twice before it is touched: lexically (after
 * normalisation it must stay under the root) and through symlinks (the real location must too).
 * A path that escapes is an error, never a warning.
 */
export class NodeStore extends BackedStore {
  readonly mode = 'fs' as const;
  readonly label: string;
  readonly root: string;
  private readonly realRoot: string;

  constructor(folder: string) {
    super();
    const resolved = path.resolve(folder);
    let real: string;
    try {
      real = realpathSync(resolved);
      if (!statSync(real).isDirectory()) throw new Error('not a directory');
    } catch {
      throw new LoamError(
        `The knowledge base folder "${folder}" does not exist or is not a folder. Check the folder in your agent's Loam settings (Claude Desktop: the extension's folder setting; other agents: the --folder path in the MCP configuration) and choose or type it again.`,
      );
    }
    this.root = real;
    this.realRoot = real;
    this.label = path.basename(real);
  }

  private inside(candidate: string): boolean {
    const rel = path.relative(this.realRoot, candidate);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  }

  /** Absolute path for a relative one, after proving it cannot leave the root. */
  private async safe(rel: string): Promise<string> {
    const target = path.join(this.root, ...rel.split('/'));
    if (!this.inside(target)) throw new LoamError(`"${rel}" is outside the knowledge base folder.`);
    let probe = target;
    for (;;) {
      try {
        const real = await fs.realpath(probe);
        if (!this.inside(real)) throw new LoamError(`"${rel}" leads outside the knowledge base folder (through a link).`);
        return target;
      } catch (error) {
        if (error instanceof LoamError) throw error;
        const parent = path.dirname(probe);
        if (parent === probe) return target;
        probe = parent;
      }
    }
  }

  protected async rawRead(rel: string): Promise<string | null> {
    const target = await this.safe(rel);
    try {
      return await fs.readFile(target, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'EISDIR' || code === 'ENOTDIR') return null;
      throw error;
    }
  }

  protected async rawWrite(rel: string, content: string): Promise<void> {
    const target = await this.safe(rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(tmp, content, 'utf8');
      await fs.rename(tmp, target);
    } catch (error) {
      await fs.rm(tmp, { force: true });
      throw error;
    }
  }

  protected async rawRemove(rel: string): Promise<void> {
    await fs.rm(await this.safe(rel), { force: true });
  }

  protected async rawList(rel: string): Promise<FileEntry[]> {
    const target = rel === '' ? this.root : await this.safe(rel);
    let entries;
    try {
      entries = await fs.readdir(target, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .filter((e) => !JUNK.has(e.name) && !e.isSymbolicLink())
      .map((e) => ({ path: rel === '' ? e.name : `${rel}/${e.name}`, name: e.name, kind: e.isDirectory() ? 'dir' : 'file' }) as FileEntry);
  }

  protected async rawRemoveDirIfEmpty(rel: string): Promise<void> {
    await fs.rmdir(await this.safe(rel)).catch(() => undefined);
  }

  protected async rawEnsureDirs(dirs: string[]): Promise<void> {
    for (const d of dirs) await fs.mkdir(await this.safe(d), { recursive: true });
  }

  /** Markdown files with their size and modification time, for the search index. */
  async markdownStats(): Promise<{ path: string; mtimeMs: number; size: number }[]> {
    const out: { path: string; mtimeMs: number; size: number }[] = [];
    const visit = async (rel: string): Promise<void> => {
      for (const entry of await this.rawList(rel)) {
        if (entry.kind === 'dir') {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') await visit(entry.path);
        } else if (/\.md$/i.test(entry.name)) {
          const st = await fs.stat(path.join(this.root, ...entry.path.split('/')));
          out.push({ path: entry.path, mtimeMs: st.mtimeMs, size: st.size });
        }
      }
    };
    await visit('');
    return out;
  }
}
