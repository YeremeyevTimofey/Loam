import { createTwoFilesPatch, diffLines } from 'diff';
import type { Change } from './types';

export type DiffLineType = 'add' | 'del' | 'ctx' | 'gap';
export interface DiffLine {
  type: DiffLineType;
  text: string;
}

/** Classic unified diff text, used by the MCP server so the agent can show it in chat. */
export function unifiedDiff(path: string, before: string | null, after: string | null): string {
  if (before === after) return `(no changes in ${path})`;
  const patch = createTwoFilesPatch(
    before === null ? '/dev/null' : `a/${path}`,
    after === null ? '/dev/null' : `b/${path}`,
    before ?? '',
    after ?? '',
    '',
    '',
    { context: 3 },
  );
  return patch.replace(/^Index: .*\n=+\n/, '').trimEnd();
}

/** Line-level diff for the UI. Long unchanged stretches collapse into a single "gap" line. */
export function lineDiff(before: string | null, after: string | null, context = 2): DiffLine[] {
  const parts = diffLines(before ?? '', after ?? '');
  const lines: DiffLine[] = [];
  for (const part of parts) {
    const type: DiffLineType = part.added ? 'add' : part.removed ? 'del' : 'ctx';
    const text = part.value.endsWith('\n') ? part.value.slice(0, -1) : part.value;
    for (const line of text.split('\n')) lines.push({ type, text: line });
  }
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, i) => {
    if (line.type === 'ctx') return;
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) keep[j] = true;
  });
  const out: DiffLine[] = [];
  let skipped = 0;
  lines.forEach((line, i) => {
    if (keep[i]) {
      if (skipped > 0) out.push({ type: 'gap', text: `${skipped} unchanged line${skipped === 1 ? '' : 's'}` });
      skipped = 0;
      out.push(line);
    } else skipped += 1;
  });
  if (skipped > 0 && out.length > 0) out.push({ type: 'gap', text: `${skipped} unchanged line${skipped === 1 ? '' : 's'}` });
  return out;
}

export type ChangeKind = 'create' | 'edit' | 'delete';
export const changeKind = (c: Change): ChangeKind =>
  c.before === null ? 'create' : c.after === null ? 'delete' : 'edit';

/** Drops changes that would not change anything. */
export const effectiveChanges = (changes: Change[]): Change[] => changes.filter((c) => c.before !== c.after);
