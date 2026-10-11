import { BackedStore, dirname, basename, type FileEntry } from '@loam/core';
import type { Folder } from './folder';

const JUNK = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

const isNotFound = (error: unknown) =>
  error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'TypeMismatchError');

/**
 * The knowledge base in a folder the user picked, through the File System Access API.
 * This class is the only place in the app that touches that API (acceptance 4).
 * History copies, restore and path validation come from BackedStore.
 */
export class FsStore extends BackedStore {
  readonly mode = 'fs' as const;
  readonly label: string;

  constructor(private readonly root: FileSystemDirectoryHandle) {
    super();
    this.label = root.name;
  }

  get handle(): FileSystemDirectoryHandle {
    return this.root;
  }

  private async dir(path: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
    let current = this.root;
    if (path === '') return current;
    for (const part of path.split('/')) {
      try {
        current = await current.getDirectoryHandle(part, { create });
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    }
    return current;
  }

  protected async rawRead(path: string): Promise<string | null> {
    const parent = await this.dir(dirname(path), false);
    if (!parent) return null;
    try {
      const file = await (await parent.getFileHandle(basename(path))).getFile();
      return await file.text();
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  protected async rawWrite(path: string, content: string): Promise<void> {
    const parent = await this.dir(dirname(path), true);
    const handle = await parent!.getFileHandle(basename(path), { create: true });
    // createWritable writes to a temporary copy and swaps it in on close: a failed write leaves the old file.
    const writable = await handle.createWritable();
    try {
      await writable.write(content);
    } finally {
      await writable.close();
    }
  }

  protected async rawRemove(path: string): Promise<void> {
    const parent = await this.dir(dirname(path), false);
    if (!parent) return;
    try {
      await parent.removeEntry(basename(path));
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  protected async rawList(dir: string): Promise<FileEntry[]> {
    const handle = await this.dir(dir, false);
    if (!handle) return [];
    const out: FileEntry[] = [];
    for await (const [name, entry] of handle.entries()) {
      if (JUNK.has(name)) continue;
      out.push({ path: dir === '' ? name : `${dir}/${name}`, name, kind: entry.kind === 'directory' ? 'dir' : 'file' });
    }
    return out;
  }

  protected async rawRemoveDirIfEmpty(dir: string): Promise<void> {
    const parent = await this.dir(dirname(dir), false);
    if (!parent) return;
    try {
      await parent.removeEntry(basename(dir)); // refuses when not empty
    } catch {
      /* not empty, or already gone */
    }
  }

  protected async rawEnsureDirs(dirs: string[]): Promise<void> {
    for (const d of dirs) await this.dir(d, true);
  }

  /** True when the folder has nothing in it (apart from OS litter). */
  async isEmpty(): Promise<boolean> {
    return (await this.rawList('')).length === 0;
  }
}
