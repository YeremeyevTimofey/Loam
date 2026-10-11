import { FILE } from './constants';
import { newPlan, readOrNull, stage, type Plan } from './plan';
import { agentsMdForOwner, CLAUDE_MD, GEMINI_MD } from './templates';
import type { KbStore } from './types';

const OWNER_LINE = /^Personal work context for (.*)\. Read this first, then load only what you need\.$/m;

/**
 * The instruction files agents read (AGENTS.md, plus the one-line CLAUDE.md and GEMINI.md that point to it) as they
 * should be for this version of Loam. The owner line is kept as it is. CLAUDE.md and GEMINI.md are only created when
 * missing: people often add their own lines to them.
 */
export async function expectedProtocol(store: KbStore): Promise<{ path: string; text: string; reason: string }[]> {
  const agents = await readOrNull(store, FILE.agents);
  const owner = agents ? (OWNER_LINE.exec(agents)?.[1] ?? 'the owner of this folder') : 'the owner of this folder';
  const wanted = agentsMdForOwner(owner);
  const out: { path: string; text: string; reason: string }[] = [];
  if (agents !== wanted) {
    out.push({ path: FILE.agents, text: wanted, reason: agents === null ? 'Add the instructions for your agent' : 'Update the instructions for your agent to this version of Loam' });
  }
  if ((await readOrNull(store, FILE.gemini)) === null) out.push({ path: FILE.gemini, text: GEMINI_MD, reason: 'Point Gemini CLI to AGENTS.md' });
  if ((await readOrNull(store, FILE.claude)) === null) out.push({ path: FILE.claude, text: CLAUDE_MD, reason: 'Point Claude Code to AGENTS.md' });
  return out;
}

/** Brings AGENTS.md up to date and adds GEMINI.md / CLAUDE.md when missing. Always shown as a diff first. */
export async function planUpdateProtocol(store: KbStore): Promise<Plan> {
  const plan = newPlan();
  for (const file of await expectedProtocol(store)) await stage(plan, store, file.path, file.text, file.reason);
  return plan;
}
