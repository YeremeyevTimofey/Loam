import { MemoryStore } from '@loam/core';

export { DEMO_TODAY } from './today';

// `exhaustive` makes the glob include hidden folders (.loam, .claude), which are part of a base.
const modules = import.meta.glob('./kb/**/*', { query: '?raw', import: 'default', eager: true, exhaustive: true }) as Record<string, string>;

export function demoFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(modules)) files[path.replace(/^\.\/kb\//, '')] = content;
  return files;
}

/** The sample base (Sarah, account manager). Lives in memory: edits last until the page is reloaded. */
export class DemoStore extends MemoryStore {
  constructor() {
    super('Sarah — demo base', demoFiles(), 'demo');
  }
}
