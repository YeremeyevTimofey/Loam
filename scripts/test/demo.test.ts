import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildProcess, lineDiff, loadKb, MemoryStore, parseProcess, planUpdateProfile, planUpdateSection, scanSkill, parseDoc } from '../../packages/loam-core/src';
import { buildDemoBase, buildDemoSummary, DEMO_TODAY, isAuthored, KB_DIR, SUMMARY_FILE, walkDir } from '../lib/demo';

describe('demo base (§13.3)', async () => {
  const base = await buildDemoBase();
  const store = new MemoryStore('demo', Object.fromEntries(base), 'demo');
  const snap = await loadKb(store, DEMO_TODAY);

  it('committed derived files match a fresh rebuild (run `npm run demo:build` if this fails)', () => {
    const onDisk = walkDir(KB_DIR);
    expect(onDisk.sort()).toEqual([...base.keys()].sort());
    for (const rel of onDisk.filter((p) => !isAuthored(p))) {
      expect(readFileSync(path.join(KB_DIR, rel), 'utf8'), rel).toBe(base.get(rel));
    }
  });

  it('the facts the landing page quotes match a fresh rebuild', async () => {
    expect(JSON.parse(readFileSync(SUMMARY_FILE, 'utf8'))).toEqual(await buildDemoSummary(base));
  });

  it('skills are exported for every agent: .claude/skills and .agents/skills carry the same files, GEMINI.md points to AGENTS.md', () => {
    const under = (root: string) => [...base.keys()].filter((k) => k.startsWith(`${root}/`)).map((k) => k.slice(root.length)).sort();
    expect(under('.agents/skills')).toEqual(under('.claude/skills'));
    expect(under('.agents/skills')).toHaveLength(9);
    expect(base.get('GEMINI.md')).toBe('@AGENTS.md\n');
  });

  it("the sample's audit log also shows a refusal", () => {
    const audit = JSON.parse(base.get('.loam/skill-audit.json')!).entries as { action: string; skill: string }[];
    expect(audit.filter((e) => e.action === 'reject').map((e) => e.skill)).toEqual(['inbox-cleaner']);
  });

  it('has the five processes from the spec with the right numbers', () => {
    const by = Object.fromEntries(snap.processes.map((p) => [p.slug, p]));
    expect(Object.keys(by).sort()).toEqual(['client-onboarding-brief', 'contract-negotiation', 'meeting-follow-up', 'monthly-invoice-check', 'weekly-client-report']);
    expect(by['weekly-client-report']).toMatchObject({ hours: 33.3, stable: true });
    expect(by['weekly-client-report']!.fm).toMatchObject({ frequency: 'weekly', minutes_per_run: 40, automation: 'ready', runs: 7, corrections: 4 });
    expect(by['weekly-client-report']!.examples).toHaveLength(2);
    expect(by['weekly-client-report']!.corrections).toHaveLength(4);
    expect(by['client-onboarding-brief']!.fm).toMatchObject({ frequency: 'ad-hoc', minutes_per_run: 90, automation: 'ready' });
    expect(by['client-onboarding-brief']!.examples).toHaveLength(1);
    expect(by['monthly-invoice-check']).toMatchObject({ hours: 24 });
    expect(by['monthly-invoice-check']!.fm).toMatchObject({ frequency: 'monthly', minutes_per_run: 120, automation: 'needs-access' });
    expect(by['meeting-follow-up']).toMatchObject({ hours: 62.5, stable: false });
    expect(by['meeting-follow-up']!.fm).toMatchObject({ frequency: 'daily', minutes_per_run: 15, automation: 'ready', corrections: 1 });
    expect(by['meeting-follow-up']!.examples).toHaveLength(1);
    expect(by['contract-negotiation']!.fm.automation).toBe('manual-only');
    // exactly one process is stable
    expect(snap.processes.filter((p) => p.stable).map((p) => p.slug)).toEqual(['weekly-client-report']);
    // counters in the files agree with the files
    for (const p of snap.processes) expect(p.fm.corrections, p.slug).toBe(p.corrections.length);
    for (const p of snap.processes) expect(p.skillStale, p.slug).toBe(false);
  });

  it('editing leaves the rest of a file alone: only the edited lines show up in the diff', async () => {
    for (const [path, text] of base) {
      if (/^processes\/[^/]+\/process\.md$/.test(path)) expect(buildProcess(parseProcess(text)), path).toBe(text);
    }
    const changed = async (plan: { changes: { before: string | null; after: string | null; path: string }[] }) =>
      plan.changes.flatMap((c) => lineDiff(c.before, c.after).filter((l) => l.type === 'add' || l.type === 'del'));
    const profile = await planUpdateProfile(store, { role: 'Head of accounts' }, DEMO_TODAY);
    expect((await changed(profile)).length, 'profile edit').toBeLessThanOrEqual(8);
    const section = await planUpdateSection(store, { slug: 'weekly-client-report', key: 'constraints', text: 'Only this changes.', today: DEMO_TODAY });
    const lines = await changed(section);
    expect(lines.map((l) => l.text).join('\n')).not.toMatch(/inputs:|frequency:|## Steps/);
    expect(lines.length).toBeLessThanOrEqual(4);
  });

  it('has four skills in the library: three starter, one imported and reviewed', () => {
    const library = snap.skills.filter((s) => s.kind === 'library');
    expect(library.map((s) => `${s.name}:${s.fm.source}`).sort()).toEqual(['client-bad-news-email:starter', 'competitor-snapshot:imported', 'meeting-summary:starter', 'weekly-status-report:starter']);
    expect(library.find((s) => s.name === 'competitor-snapshot')!.fm).toMatchObject({ reviewed: true, review_verdict: 'safe', scanner: 'warn' });
    expect(snap.skills.filter((s) => s.kind === 'process')).toHaveLength(5);
  });

  it('the imported skill really passes the scanner (with a warning, not a red flag)', () => {
    const text = base.get('skills/competitor-snapshot/SKILL.md')!;
    const { data, body } = parseDoc(text);
    const result = scanSkill({ text, body, description: String(data.description), license: undefined, capabilities: ['read'], source: 'imported', frontmatterKeys: Object.keys(data) });
    expect(result.red).toEqual([]);
    expect(result.yellow.map((f) => f.category)).toEqual(expect.arrayContaining(['length', 'license']));
  });

  it('has a believable glossary and three clients', () => {
    expect(base.get('context/glossary.md')!.match(/^- \*\*/gm)).toHaveLength(10);
    expect(base.get('context/entities.md')!.match(/\(client\)/g)).toHaveLength(3);
  });

  it('ships a ready lint report: over budget, a duplicate, a process without examples, and a large reduction', () => {
    const report = JSON.parse(base.get('.loam/lint-report.json')!);
    const rules = new Set(report.findings.map((f: { rule: string }) => f.rule));
    expect(rules).toContain('budget');
    expect(rules).toContain('duplicates');
    expect(rules).toContain('no-examples');
    expect(report.checks).toHaveLength(10);
    console.log(`demo lint: ${report.savings.beforeTokens} → ${report.savings.afterTokens} tokens (${report.savings.percent}%), typical ${report.savings.typicalBefore} → ${report.savings.typicalAfter}`);
  });

  it('the audit log shows imports, a review and a sync', () => {
    const audit = JSON.parse(base.get('.loam/skill-audit.json')!);
    expect(audit.entries.map((e: { action: string }) => e.action)).toEqual(expect.arrayContaining(['import', 'review', 'sync']));
    expect(audit.entries.every((e: { hash: string }) => /^[0-9a-f]{64}$/.test(e.hash))).toBe(true);
  });
});
