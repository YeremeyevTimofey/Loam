import { describe, expect, it } from 'vitest';
import {
  applyPlan,
  assertAgentNotePath,
  InterviewInput,
  loadSkills,
  parseDoc,
  planAddStarterSkill,
  planDeleteSkill,
  planSaveInterview,
  planSyncAgentSkills,
  planUpdateProtocol,
  agentsMdForOwner,
  countWords,
} from '../src';
import { runLint } from '../src/lint';
import { freshBase, starterSkills, TODAY } from './helpers';

const starter = (name: string) => starterSkills().find((s) => s.name === name)!;

describe('working with agents other than Claude', () => {
  it('a new base has CLAUDE.md and GEMINI.md that both point to AGENTS.md', async () => {
    const store = await freshBase();
    expect(await store.readFile('CLAUDE.md')).toBe('@AGENTS.md\n');
    expect(await store.readFile('GEMINI.md')).toBe('@AGENTS.md\n');
  });

  it('AGENTS.md has a read-only mode for agents that are not connected, and stays within its budget', async () => {
    const store = await freshBase();
    const agents = await store.readFile('AGENTS.md');
    expect(agents).toContain('## If the loam_* tools are not available');
    expect(agents).toMatch(/Do not edit files in the base this way/);
    expect(agents).toContain('Connect your agent');
    expect(countWords(agents)).toBeLessThan(500);
  });

  it('syncs skills into both folders agents read: .claude/skills and .agents/skills', async () => {
    const store = await freshBase();
    await store.writeFile('.agents/skills/my-own/SKILL.md', '---\nname: my-own\ndescription: Mine\n---\nMine.\n');
    await store.writeFile('.agents/skills/loam-lookalike-but-not-ours/notes.txt', 'keep');
    await applyPlan(store, await planAddStarterSkill(store, starter('meeting-summary'), TODAY));
    await applyPlan(store, await planSyncAgentSkills(store));
    for (const root of ['.claude/skills', '.agents/skills']) {
      const text = await store.readFile(`${root}/loam-meeting-summary/SKILL.md`);
      expect(parseDoc(text).data).toEqual({ name: 'loam-meeting-summary', description: expect.any(String) });
    }
    expect(await store.readFile('.claude/skills/loam-meeting-summary/SKILL.md')).toBe(await store.readFile('.agents/skills/loam-meeting-summary/SKILL.md'));
    expect(await store.readFile('.agents/skills/my-own/SKILL.md')).toContain('Mine.');
    expect(await store.readFile('.agents/skills/loam-lookalike-but-not-ours/notes.txt')).toBe('keep');
    expect((await planSyncAgentSkills(store)).changes).toHaveLength(0);

    await applyPlan(store, await planDeleteSkill(store, 'meeting-summary'));
    await applyPlan(store, await planSyncAgentSkills(store));
    expect(await store.exists('.claude/skills/loam-meeting-summary/SKILL.md')).toBe(false);
    expect(await store.exists('.agents/skills/loam-meeting-summary/SKILL.md')).toBe(false);
    expect(await store.exists('.agents/skills/my-own/SKILL.md')).toBe(true);
  });

  it('process skills are exported to both folders too, and imported text stays inside its frame', async () => {
    const store = await freshBase();
    const input = InterviewInput.parse({ profile: { name: 'Sarah', role: 'AM' }, processes: [{ title: 'Weekly report', frequency: 'weekly', minutes_per_run: 40, automation: 'ready' }], complete: true });
    await applyPlan(store, (await planSaveInterview(store, input, TODAY)).plan);
    await applyPlan(store, await planSyncAgentSkills(store));
    expect(await store.exists('.agents/skills/loam-weekly-report/SKILL.md')).toBe(true);
    expect((await loadSkills(store)).skills).toHaveLength(1);
  });

  it('Health notices a damaged copy in .agents/skills and Sync repairs it', async () => {
    const store = await freshBase();
    await applyPlan(store, await planAddStarterSkill(store, starter('task-handoff'), TODAY));
    await applyPlan(store, await planSyncAgentSkills(store));
    await store.writeFile('.agents/skills/loam-task-handoff/SKILL.md', 'tampered');
    const before = await runLint(store, { today: TODAY });
    const finding = before.findings.find((f) => f.rule === 'layout' && f.fix?.kind === 'sync');
    expect(finding?.files).toEqual(['.agents/skills/loam-task-handoff/SKILL.md']);
    await applyPlan(store, await planSyncAgentSkills(store));
    expect((await runLint(store, { today: TODAY })).findings.some((f) => f.rule === 'layout')).toBe(false);
  });

  it('Health notices old instructions and the update keeps the owner, adds GEMINI.md and leaves personal edits to CLAUDE.md alone', async () => {
    const store = await freshBase();
    const input = InterviewInput.parse({ profile: { name: 'Sarah Chen', role: 'Account manager' }, complete: true });
    await applyPlan(store, (await planSaveInterview(store, input, TODAY)).plan);
    // a base made by an older version: old protocol, no GEMINI.md, a personalised CLAUDE.md
    await store.writeFile('AGENTS.md', (await store.readFile('AGENTS.md')).replace(/\n## If the loam_\* tools[\s\S]*$/, '\n'));
    await store.deleteFile('GEMINI.md');
    await store.writeFile('CLAUDE.md', '@AGENTS.md\n\nAlways answer in Dutch.\n');
    const report = await runLint(store, { today: TODAY });
    const finding = report.findings.find((f) => f.fix?.kind === 'protocol');
    expect(finding?.title).toBe('The instructions for your agents are out of date');
    expect(finding?.files.sort()).toEqual(['AGENTS.md', 'GEMINI.md']);

    const plan = await planUpdateProtocol(store);
    expect(plan.changes.map((c) => c.path).sort()).toEqual(['AGENTS.md', 'GEMINI.md']);
    await applyPlan(store, plan);
    expect(await store.readFile('AGENTS.md')).toBe(agentsMdForOwner('Sarah Chen, Account manager'));
    expect(await store.readFile('GEMINI.md')).toBe('@AGENTS.md\n');
    expect(await store.readFile('CLAUDE.md')).toContain('Always answer in Dutch.');
    expect((await planUpdateProtocol(store)).changes).toHaveLength(0);
    expect((await runLint(store, { today: TODAY })).findings.some((f) => f.fix?.kind === 'protocol')).toBe(false);
  });

  it('an agent cannot write the agent folders or instruction files through a note', () => {
    for (const p of ['.agents/skills/loam-x/SKILL.md', '.claude/skills/x/SKILL.md', 'GEMINI.md', 'CLAUDE.md', 'AGENTS.md']) {
      expect(() => assertAgentNotePath(p), p).toThrow();
    }
  });
});
