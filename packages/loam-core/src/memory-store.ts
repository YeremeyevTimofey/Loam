import { BackedStore } from './store-base';
import { basename, dirname } from './paths';
import type { FileEntry } from './types';

/** A store that lives in memory. It backs the demo mode and the tests. */
export class MemoryStore extends BackedStore {
  readonly mode: 'fs' | 'demo';
  readonly label: string;
  protected readonly files = new Map<string, string>();
  protected readonly dirs = new Set<string>();

  constructor(label = 'Memory', initial: Record<string, string> = {}, mode: 'fs' | 'demo' = 'demo') {
    super();
    this.label = label;
    this.mode = mode;
    for (const [path, content] of Object.entries(initial)) this.seed(path, content);
  }

  /** Puts a file in place without history (used while loading initial data). */
  protected seed(path: string, content: string): void {
    this.files.set(path, content);
    for (let d = dirname(path); d !== ''; d = dirname(d)) this.dirs.add(d);
  }

  protected async rawRead(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  protected async rawWrite(path: string, content: string): Promise<void> {
    this.seed(path, content);
  }

  protected async rawRemove(path: string): Promise<void> {
    this.files.delete(path);
  }

  protected async rawList(dir: string): Promise<FileEntry[]> {
    const prefix = dir === '' ? '' : `${dir}/`;
    const seen = new Map<string, FileEntry>();
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash === -1) seen.set(rest, { path, name: rest, kind: 'file' });
      else {
        const name = rest.slice(0, slash);
        seen.set(name, { path: `${prefix}${name}`, name, kind: 'dir' });
      }
    }
    for (const d of this.dirs) {
      if (dirname(d) === dir && !seen.has(basename(d))) seen.set(basename(d), { path: d, name: basename(d), kind: 'dir' });
    }
    return [...seen.values()];
  }

  protected async rawRemoveDirIfEmpty(dir: string): Promise<void> {
    const prefix = `${dir}/`;
    for (const path of this.files.keys()) if (path.startsWith(prefix)) return;
    for (const d of this.dirs) if (d.startsWith(prefix)) return;
    this.dirs.delete(dir);
  }

  protected async rawEnsureDirs(dirs: string[]): Promise<void> {
    for (const d of dirs) {
      for (let p = d; p !== ''; p = dirname(p)) this.dirs.add(p);
    }
  }

  /** Test helper: every file path currently stored (history included). */
  paths(): string[] {
    return [...this.files.keys()].sort();
  }
}
