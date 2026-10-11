import { DIR } from './constants';
import type { FileEntry, KbStore } from './types';

/** All files under `dir`, depth-first. History copies are skipped unless asked for. */
export async function walk(
  store: KbStore,
  dir = '',
  options: { includeHistory?: boolean } = {},
): Promise<FileEntry[]> {
  let entries: FileEntry[];
  try {
    entries = await store.listFiles(dir);
  } catch {
    return [];
  }
  const files: FileEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === 'file') files.push(entry);
    else if (options.includeHistory || entry.path !== DIR.history) {
      files.push(...(await walk(store, entry.path, options)));
    }
  }
  return files;
}
