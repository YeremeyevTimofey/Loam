import { FILE } from './constants';
import { AuditLog, type AuditEntry } from './schema';
import type { KbStore } from './types';

const MAX_ENTRIES = 500;

/** SHA-256 of the text, hex. Uses WebCrypto, which both browsers and Node 22 provide. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function readAudit(store: KbStore): Promise<AuditEntry[]> {
  try {
    const parsed = AuditLog.safeParse(JSON.parse(await store.readFile(FILE.audit)));
    return parsed.success ? parsed.data.entries : [];
  } catch {
    return [];
  }
}

/** Appends entries to .loam/skill-audit.json (newest last, capped). */
export async function appendAudit(store: KbStore, entries: AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const all = [...(await readAudit(store)), ...entries].slice(-MAX_ENTRIES);
  await store.writeFile(FILE.audit, `${JSON.stringify({ version: 1, entries: all }, null, 2)}\n`);
}

export async function makeAuditEntry(
  entry: Omit<AuditEntry, 'hash' | 'time'> & { content: string; time?: string },
): Promise<AuditEntry> {
  const { content, time, ...rest } = entry;
  return { ...rest, time: time ?? new Date().toISOString(), hash: await sha256Hex(content) };
}
