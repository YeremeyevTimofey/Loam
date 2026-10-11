import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MemoryStore } from '../src/memory-store';
import { ensureBase } from './ensure';

export const TODAY = '2026-10-11';
export const ROOT = resolve(__dirname, '../../..');

export const fixture = (group: 'malicious' | 'benign', name: string): string =>
  readFileSync(join(__dirname, 'fixtures', group, name), 'utf8');

export const starterSkills = (): { name: string; text: string }[] => {
  const dir = join(ROOT, 'apps/web/src/starter-skills');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ name: f.replace(/\.md$/, ''), text: readFileSync(join(dir, f), 'utf8') }));
};

/** A fresh base with the starter files in place. */
export async function freshBase(): Promise<MemoryStore> {
  const store = new MemoryStore('test', {}, 'fs');
  await store.init();
  await ensureBase(store, TODAY);
  return store;
}
