/** A direct child of a directory in the knowledge base. */
export interface FileEntry {
  path: string;
  name: string;
  kind: 'file' | 'dir';
}

/** One saved copy of a file as it was before a write or delete. */
export interface HistoryEntry {
  /** Stable id: the file name inside .loam/history/ */
  id: string;
  /** Path of the saved copy inside the base. */
  path: string;
  /** Path the copy was taken from. Restoring writes back here. */
  originalPath: string;
  /** ISO timestamp of the moment the copy was taken. */
  timestamp: string;
}

/**
 * The only way anything touches the knowledge base: the browser app (File System Access API
 * or in-memory demo) and the MCP server (Node fs) all implement this. Paths are always
 * relative, use "/" and never leave the base.
 */
export interface KbStore {
  readonly mode: 'fs' | 'demo';
  /** Human-readable name of the folder (shown in the UI). */
  readonly label: string;
  init(): Promise<void>;
  /** Direct children of `dir` (default: the root). Sorted, directories first. */
  listFiles(dir?: string): Promise<FileEntry[]>;
  readFile(path: string): Promise<string>;
  /** Writes the file. If it exists with different content, the old content is copied to .loam/history first. */
  writeFile(path: string, content: string): Promise<void>;
  /** Deletes the file (after saving a copy to .loam/history) and prunes directories left empty. */
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  listHistory(): Promise<HistoryEntry[]>;
  /** Writes the saved copy back to its original path (the current content is saved to history first). */
  restore(entry: HistoryEntry): Promise<void>;
}

/** A proposed edit of one file. `after: null` means delete, `before: null` means create. */
export interface Change {
  path: string;
  before: string | null;
  after: string | null;
  /** Short human explanation shown above the diff. */
  reason?: string;
}

export class NotFoundError extends Error {
  constructor(public readonly path: string) {
    super(`File not found: ${path}`);
    this.name = 'NotFoundError';
  }
}

/** Raised for problems the user (or agent) can fix; the message is written for them. */
export class LoamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoamError';
  }
}
