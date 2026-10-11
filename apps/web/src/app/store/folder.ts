import { del, get, set } from 'idb-keyval';

/** An opaque handle to a folder the person chose. Only this module and FsStore know what is inside. */
export type Folder = FileSystemDirectoryHandle;

const KEY = 'loam:folder';

export const supportsFolders = (): boolean => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

export async function rememberFolder(handle: Folder): Promise<void> {
  await set(KEY, handle);
}

export async function recallFolder(): Promise<Folder | null> {
  try {
    const handle = await get<Folder>(KEY);
    return handle ?? null;
  } catch {
    return null;
  }
}

export const forgetFolder = (): Promise<void> => del(KEY);

/** The text of the folder's path as the person typed it in "Connect your agent" (browsers never reveal it). */
const PATH_KEY = 'loam:folder-path';
export async function recallFolderPath(): Promise<string> {
  try {
    return (await get<string>(PATH_KEY)) ?? '';
  } catch {
    return '';
  }
}
export const rememberFolderPath = (path: string): Promise<void> => set(PATH_KEY, path).catch(() => undefined);

export type FolderAccess = 'granted' | 'prompt' | 'denied';

export async function folderAccess(handle: Folder): Promise<FolderAccess> {
  try {
    return await handle.queryPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
}

/** Must be called from a click: Chrome only shows the permission prompt for a user gesture. */
export async function requestFolderAccess(handle: Folder): Promise<boolean> {
  try {
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

/** Opens the system folder picker. Returns null if the person closes it. */
export async function pickFolder(): Promise<Folder | null> {
  try {
    return await window.showDirectoryPicker!({ id: 'loam', mode: 'readwrite' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
}

export function describePickerError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'SecurityError') {
    return "Your browser doesn't allow this folder (system folders and folders like Documents or Downloads are blocked). Create a new folder, for example \"Loam\", and choose that one.";
  }
  return error instanceof Error ? error.message : 'The folder could not be opened.';
}
