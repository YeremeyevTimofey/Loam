import { appendAudit } from './audit';
import type { AuditEntry } from './schema';
import { LoamError, NotFoundError, type Change, type KbStore } from './types';

/**
 * Every edit is first a Plan: the files that would change plus the audit entries to write.
 * The app shows the plan as a diff and applies it on "Apply"; the MCP server applies it right away
 * and returns the diff. One code path, so what the user previews is exactly what gets written.
 */
export interface Plan {
  changes: Change[];
  audit: AuditEntry[];
  /** Messages for the person or agent, e.g. "3 files updated". */
  notes: string[];
}

export const newPlan = (): Plan => ({ changes: [], audit: [], notes: [] });

export async function readOrNull(store: KbStore, path: string): Promise<string | null> {
  try {
    return await store.readFile(path);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

/** Adds a change computed against the current content. No-ops are dropped. */
export async function stage(plan: Plan, store: KbStore, path: string, after: string | null, reason?: string): Promise<void> {
  const before = await readOrNull(store, path);
  if (before === after) return;
  const existing = plan.changes.find((c) => c.path === path);
  if (existing) {
    existing.after = after;
    if (reason) existing.reason = reason;
    return;
  }
  plan.changes.push({ path, before, after, reason });
}

/** Writes the plan. Refuses if a file changed since the plan was made, so nothing is silently overwritten. */
export async function applyPlan(store: KbStore, plan: Plan): Promise<void> {
  for (const change of plan.changes) {
    const current = await readOrNull(store, change.path);
    if (current !== change.before) {
      throw new LoamError(`${change.path} changed since the preview. Refresh and try again.`);
    }
  }
  for (const change of plan.changes) {
    if (change.after === null) await store.deleteFile(change.path);
    else await store.writeFile(change.path, change.after);
  }
  await appendAudit(store, plan.audit);
}

export function mergePlans(...plans: Plan[]): Plan {
  const merged = newPlan();
  for (const p of plans) {
    for (const c of p.changes) {
      const existing = merged.changes.find((x) => x.path === c.path);
      if (existing) existing.after = c.after;
      else merged.changes.push({ ...c });
    }
    merged.audit.push(...p.audit);
    merged.notes.push(...p.notes);
  }
  return merged;
}

/** True when applying the plan should be followed by a sync of the agent skill folders. */
export const touchesSkills = (plan: Plan): boolean =>
  plan.changes.some((c) => /^skills\/[^/]+\/SKILL\.md$/.test(c.path) || /^processes\/[^/]+\/SKILL\.md$/.test(c.path));
