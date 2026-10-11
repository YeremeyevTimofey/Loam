import { basename, dirname, normalizeRelPath } from './paths';
import { DIR, FILE } from './constants';
import { LoamError, NotFoundError, type FileEntry, type HistoryEntry, type KbStore } from './types';

const HISTORY_PREFIX = `${DIR.history}/`;
const MAX_HISTORY = 500;
/** Machine-written files that would only add noise to the change log. */
const NO_BACKUP = new Set<string>([FILE.audit, FILE.lintReport, FILE.index, FILE.state]);

/**
 * Shared behaviour for every store: path validation, history copies, restore.
 * Subclasses only implement the five raw operations for their medium (disk, browser folder, memory),
 * so the backup rules cannot drift between the app and the MCP server.
 */
export abstract class BackedStore implements KbStore {
  abstract readonly mode: 'fs' | 'demo';
  abstract readonly label: string;

  protected abstract rawRead(path: string): Promise<string | null>;
  protected abstract rawWrite(path: string, content: string): Promise<void>;
  protected abstract rawRemove(path: string): Promise<void>;
  protected abstract rawList(dir: string): Promise<FileEntry[]>;
  /** Removes `dir` if it is empty. Must not throw when it is not. */
  protected abstract rawRemoveDirIfEmpty(dir: string): Promise<void>;
  /** Called by init() to create the top-level folders. */
  protected abstract rawEnsureDirs(dirs: string[]): Promise<void>;

  private lastMs = 0;

  async init(): Promise<void> {
    await this.rawEnsureDirs([
      DIR.processes,
      DIR.skills,
      DIR.context,
      DIR.templates,
      DIR.agentSkills,
      DIR.agentsSkills,
      DIR.loam,
      DIR.history,
    ]);
    await this.pruneHistory();
  }

  async listFiles(dir = ''): Promise<FileEntry[]> {
    const clean = dir === '' ? '' : normalizeRelPath(dir);
    const entries = await this.rawList(clean);
    return entries.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1,
    );
  }

  async readFile(path: string): Promise<string> {
    const clean = normalizeRelPath(path);
    const content = await this.rawRead(clean);
    if (content === null) throw new NotFoundError(clean);
    return content;
  }

  async exists(path: string): Promise<boolean> {
    return (await this.rawRead(normalizeRelPath(path))) !== null;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const clean = normalizeRelPath(path);
    if (clean.startsWith(HISTORY_PREFIX) || NO_BACKUP.has(clean)) {
      await this.rawWrite(clean, content);
      return;
    }
    const previous = await this.rawRead(clean);
    if (previous === content) return;
    if (previous !== null) await this.backup(clean, previous);
    await this.rawWrite(clean, content);
  }

  async deleteFile(path: string): Promise<void> {
    const clean = normalizeRelPath(path);
    const previous = await this.rawRead(clean);
    if (previous === null) return;
    if (!clean.startsWith(HISTORY_PREFIX) && !NO_BACKUP.has(clean)) await this.backup(clean, previous);
    await this.rawRemove(clean);
    // Prune folders left empty, but never the top-level ones (processes/, skills/, ...).
    let dir = dirname(clean);
    while (dir.includes('/') && !dir.startsWith(DIR.loam)) {
      await this.rawRemoveDirIfEmpty(dir);
      dir = dirname(dir);
    }
  }

  async listHistory(): Promise<HistoryEntry[]> {
    let entries: FileEntry[];
    try {
      entries = await this.rawList(DIR.history);
    } catch {
      return [];
    }
    const result: HistoryEntry[] = [];
    for (const entry of entries) {
      if (entry.kind !== 'file') continue;
      const parsed = parseHistoryName(entry.name);
      if (parsed) result.push({ id: entry.name, path: entry.path, ...parsed });
    }
    return result.sort((a, b) => (a.id < b.id ? 1 : -1));
  }

  async restore(entry: HistoryEntry): Promise<void> {
    const parsed = parseHistoryName(basename(entry.path));
    if (!parsed) throw new LoamError('This history entry is damaged and cannot be restored.');
    const content = await this.readFile(entry.path);
    await this.writeFile(parsed.originalPath, content);
  }

  protected now(): Date {
    return new Date();
  }

  private async backup(path: string, content: string): Promise<void> {
    // Strictly increasing, so two writes in the same millisecond still get distinct, ordered names.
    this.lastMs = Math.max(this.now().getTime(), this.lastMs + 1);
    const stamp = new Date(this.lastMs).toISOString().replace(/[-:.]/g, '');
    await this.rawWrite(`${HISTORY_PREFIX}${stamp}-${encodeURIComponent(path)}`, content);
  }

  private async pruneHistory(): Promise<void> {
    const all = await this.listHistory();
    for (const old of all.slice(MAX_HISTORY)) await this.rawRemove(old.path);
  }
}

/** `20261011T102030123Z-processes%2Fa%2Fb.md` → { timestamp, originalPath } */
export function parseHistoryName(name: string): { timestamp: string; originalPath: string } | null {
  const m = /^(\d{8}T\d{6}\d{3}Z)-(.+)$/.exec(name);
  if (!m || !m[1] || !m[2]) return null;
  const s = m[1];
  const timestamp = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}.${s.slice(15, 18)}Z`;
  try {
    return { timestamp, originalPath: normalizeRelPath(decodeURIComponent(m[2])) };
  } catch {
    return null;
  }
}
