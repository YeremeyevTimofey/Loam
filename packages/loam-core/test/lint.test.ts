import { describe, expect, it } from 'vitest';
import {
  applyPlan,
  InterviewInput,
  planAddExample,
  planAddStarterSkill,
  planImportSkill,
  planSaveInterview,
  planSyncAgentSkills,
  planUpdateProfile,
} from '../src';
import { planFixDuplicates, planTouchProcess, runLint } from '../src/lint';
import { freshBase, starterSkills, TODAY } from './helpers';

const para = (seed: string) =>
  `${seed} We always keep the agency voice friendly, specific and short, and we never promise a date the team has not confirmed with the client in writing first.`;
const filler = (words: number) => Array.from({ length: Math.ceil(words / 10) }, (_, i) => `Item ${i} describes one more routine detail of how the account team works.`).join(' ');

async function messyBase() {
  const store = await freshBase();
  const input = InterviewInput.parse({
    profile: { name: 'Sarah', role: 'Account manager', tools: ['HubSpot'] },
    processes: [
      { title: 'Weekly client report', frequency: 'weekly', minutes_per_run: 40, automation: 'ready', what: 'Weekly report.' },
      { title: 'Client brief', frequency: 'ad-hoc', minutes_per_run: 90, automation: 'ready', runs_per_year: 10, what: 'A brief.' },
    ],
    complete: true,
  });
  await applyPlan(store, (await planSaveInterview(store, input, '2026-08-01')).plan);
  // one example only for the weekly report
  await applyPlan(store, (await planAddExample(store, { slug: 'weekly-client-report', content: 'Good report body', kind: 'good', today: TODAY })).plan);
  // bloated profile with a paragraph that is repeated in the process, plus a contradiction pair
  const repeated = para('Voice rule.');
  await applyPlan(store, await planUpdateProfile(store, { context: `${repeated}\n\nTone: formal\n\n${filler(500)}` }, TODAY));
  await store.writeFile('processes/client-brief/process.md', (await store.readFile('processes/client-brief/process.md')) + `\n\n${repeated}\n\nTone: casual\n`);
  // an unreviewed import, and a skill with no description
  await applyPlan(store, (await planImportSkill(store, { content: '---\nname: tone-checker\ndescription: Check a draft for tone and suggest changes\nlicense: MIT\n---\n\nCheck the tone.\n', origin: 'paste', today: TODAY })).plan);
  await applyPlan(store, (await planImportSkill(store, { content: '---\nname: no-desc\ndescription: ""\nlicense: MIT\n---\n\nSummarise.\n', origin: 'paste', today: TODAY })).plan);
  await applyPlan(store, await planAddStarterSkill(store, starterSkills()[0]!, TODAY));
  await applyPlan(store, await planSyncAgentSkills(store));
  return store;
}

describe('Context Lint (acceptance 29-30)', () => {
  it('reports all ten checks, each with a plain-language status line', async () => {
    const store = await messyBase();
    const report = await runLint(store, { today: TODAY });
    expect(report.checks.map((c) => c.rule)).toEqual(['cost', 'budget', 'duplicates', 'contradictions', 'stale', 'placeholders', 'no-examples', 'unreviewed', 'no-description', 'layout']);
    for (const c of report.checks) expect(c.summary.length).toBeGreaterThan(10);
    const attention = report.checks.filter((c) => c.status === 'attention').map((c) => c.rule);
    expect(attention).toEqual(expect.arrayContaining(['budget', 'duplicates', 'contradictions', 'stale', 'no-examples', 'unreviewed', 'no-description']));
    expect(attention).not.toContain('layout');
  });
  it('writes findings a non-technical person can read, most important first', async () => {
    const store = await messyBase();
    const { findings } = await runLint(store, { today: TODAY });
    const titles = findings.map((f) => f.title);
    expect(titles.some((t) => /profile\.md is [\d,]+ words — the limit is 400/.test(t))).toBe(true);
    expect(titles.some((t) => /“Weekly client report” has not been updated for \d+ days/.test(t))).toBe(true);
    expect(titles.some((t) => /“Client brief” has no examples yet/.test(t))).toBe(true);
    expect(titles.some((t) => /imported skill “tone-checker” has not been reviewed/.test(t))).toBe(true);
    expect(titles.some((t) => /“tone” says different things in 2 files — please check/i.test(t))).toBe(true);
    const sev = findings.map((f) => f.severity);
    expect(sev).toEqual([...sev].sort((a, b) => ['high', 'medium', 'low'].indexOf(a) - ['high', 'medium', 'low'].indexOf(b)));
    expect(findings.map((f) => `${f.title} ${f.detail}`).join(' ')).not.toMatch(/frontmatter|yaml|schema|undefined|null/i);
  });
  it('computes a concrete before/after reduction', async () => {
    const store = await messyBase();
    const r = await runLint(store, { today: TODAY });
    expect(r.savings.beforeTokens).toBe(r.totalTokens);
    expect(r.savings.afterTokens).toBeLessThan(r.savings.beforeTokens);
    expect(r.savings.percent).toBeGreaterThan(5);
    expect(Number.isInteger(r.savings.percent)).toBe(true);
    expect(r.savings.items.map((i) => i.label)).toEqual(expect.arrayContaining(['Remove repeated paragraphs', 'Bring oversized files down to their limit']));
    expect(r.typical.tokens).toBeGreaterThan(0);
    expect(r.typical.files[0]).toBe('AGENTS.md');
    expect(r.typical.monthlyUsd).not.toBeNull();
  });
  it('fix: removing duplicates keeps the first copy and lowers the duplicate count to zero', async () => {
    const store = await messyBase();
    const plan = await planFixDuplicates(store, TODAY);
    expect(plan.changes.map((c) => c.path)).toEqual(['processes/client-brief/process.md']);
    await applyPlan(store, plan);
    const after = await runLint(store, { today: TODAY });
    expect(after.findings.filter((f) => f.rule === 'duplicates')).toHaveLength(0);
    expect(await store.readFile('profile.md')).toContain('Voice rule.');
  });
  it('fix: marking a process as up to date clears the stale finding', async () => {
    const store = await messyBase();
    await applyPlan(store, await planTouchProcess(store, 'weekly-client-report', TODAY));
    expect((await runLint(store, { today: TODAY })).findings.some((f) => f.rule === 'stale')).toBe(false);
  });
  it('fix: layout drift is reported and the sync fix clears it', async () => {
    const store = await messyBase();
    await store.writeFile('.claude/skills/loam-tone-checker/SKILL.md', 'tampered');
    let r = await runLint(store, { today: TODAY });
    expect(r.findings.find((f) => f.rule === 'layout')?.fix?.kind).toBe('sync');
    await applyPlan(store, await planSyncAgentSkills(store));
    r = await runLint(store, { today: TODAY });
    expect(r.findings.some((f) => f.rule === 'layout')).toBe(false);
  });
  it('a fresh base only complains about the template text and the missing interview', async () => {
    const store = await freshBase();
    const r = await runLint(store, { today: TODAY });
    expect(r.findings.every((f) => f.rule === 'placeholders')).toBe(true);
    expect(r.findings.length).toBeGreaterThan(0);
  });
  it('flags unreadable files instead of crashing', async () => {
    const store = await freshBase();
    await store.writeFile('processes/broken/process.md', '---\ntype: process\n---\n\nHi');
    const r = await runLint(store, { today: TODAY });
    expect(r.findings[0]).toMatchObject({ rule: 'unreadable', severity: 'high' });
  });
});
