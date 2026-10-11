import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import { preview, type PreviewServer } from 'vite';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WEB = path.join(REPO, 'apps/web');

export interface Site {
  origin: string;
  close: () => Promise<void>;
}

/** Serves the production build (apps/web/dist) on a free port. */
export async function serve(): Promise<Site> {
  if (!existsSync(path.join(WEB, 'dist/index.html'))) throw new Error('Build first: npm run build');
  const server: PreviewServer = await preview({
    root: WEB,
    configFile: path.join(WEB, 'vite.config.ts'),
    preview: { port: 0, host: '127.0.0.1', strictPort: false },
    logLevel: 'error',
  });
  const origin = server.resolvedUrls?.local[0]?.replace(/\/$/, '');
  if (!origin) throw new Error('preview server did not start');
  return { origin, close: () => server.close() };
}

export const launch = {
  chromium: (): Promise<Browser> => chromium.launch(),
  firefox: (): Promise<Browser> => firefox.launch(),
  webkit: (): Promise<Browser> => webkit.launch(),
};

/**
 * A folder for the tests: a sub-directory of the browser's private file system (OPFS). It is the same
 * FileSystemDirectoryHandle API as a folder picked by a person, which is all FsStore uses.
 */
export async function useFakeFolderPicker(context: BrowserContext, name = 'Loam'): Promise<void> {
  await context.addInitScript((folder) => {
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(folder, { create: true });
    };
  }, name);
}

/** Reads every file in the fake folder: path → text. */
export function readFolder(page: Page, name = 'Loam'): Promise<Record<string, string>> {
  return page.evaluate(async (folder) => {
    const out: Record<string, string> = {};
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
      for await (const [entryName, handle] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (handle.kind === 'directory') await walk(handle as FileSystemDirectoryHandle, `${prefix}${entryName}/`);
        else out[`${prefix}${entryName}`] = await (await (handle as FileSystemFileHandle).getFile()).text();
      }
    };
    const root = await navigator.storage.getDirectory();
    await walk(await root.getDirectoryHandle(folder, { create: true }), '');
    return out;
  }, name);
}

/** Writes files into the fake folder (as if an agent had written them on disk). */
export function writeFolder(page: Page, files: Record<string, string>, name = 'Loam'): Promise<void> {
  return page.evaluate(
    async ({ files: fileMap, folder }) => {
      const root = await navigator.storage.getDirectory();
      const base = await root.getDirectoryHandle(folder, { create: true });
      for (const [rel, content] of Object.entries(fileMap)) {
        const parts = rel.split('/');
        let dir = base;
        for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
        const handle = await dir.getFileHandle(parts[parts.length - 1]!, { create: true });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
      }
    },
    { files, folder: name },
  );
}

/** Origins other than the site itself that a page talked to. */
export function trackForeignRequests(page: Page, origin: string): string[] {
  const foreign: string[] = [];
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:') && !url.startsWith('about:')) foreign.push(url);
  });
  return foreign;
}
