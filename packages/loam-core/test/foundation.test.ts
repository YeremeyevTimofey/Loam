import { describe, expect, it } from 'vitest';
import { daysBetween } from '../src/dates';
import { countWords, parseDoc, stringifyDoc } from '../src/frontmatter';
import { MemoryStore } from '../src/memory-store';
import { normalizeRelPath, slugify } from '../src/paths';
import { parseCorrections, renderCorrections, setSection, getSection, parseProcess, buildProcess } from '../src/process';
import { annualHours, isStable, runsPerYear } from '../src/scoring';
import { parseHistoryName } from '../src/store-base';
import { unifiedDiff, lineDiff } from '../src/diff';

describe('frontmatter', () => {
  it('round-trips and writes dates, lists and quoted strings the way a human would', () => {
    const text = stringifyDoc(
      { type: 'process', slug: 'a-b', title: 'Report: weekly', minutes_per_run: 40, inputs: ['CRM export', 'notes, last week'], updated: '2026-10-11', flag: true, yes: 'yes' },
      '# Body\n\nText.',
    );
    expect(text).toContain('updated: 2026-10-11\n');
    expect(text).toContain('title: "Report: weekly"');
    expect(text).toContain('inputs: [CRM export, "notes, last week"]');
    expect(text).toContain('yes: "yes"');
    const { data, body } = parseDoc(text);
    expect(data.updated).toBe('2026-10-11');
    expect(data.inputs).toEqual(['CRM export', 'notes, last week']);
    expect(data.minutes_per_run).toBe(40);
    expect(body.trim()).toBe('# Body\n\nText.');
  });
  it('refuses the JavaScript front-matter engine that gray-matter ships (code execution)', () => {
    const evil = '---js\n{ x: (globalThis.__pwned = true) }\n---\n\nbody';
    expect(() => parseDoc(evil)).toThrow(/plain/i);
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
    expect(() => parseDoc('---javascript\n{}\n---\n')).toThrow();
    expect(() => parseDoc('---coffee\nx: 1\n---\n')).toThrow();
  });
  it('turns invalid YAML into a readable error', () => {
    expect(() => parseDoc('---\nname: [unclosed\n---\n')).toThrow(/front matter/i);
  });
  it('handles CRLF and a BOM', () => {
    const { data } = parseDoc('\uFEFF---\r\nname: x\r\n---\r\n\r\nHi\r\n');
    expect(data.name).toBe('x');
  });
  it('reports no frontmatter for plain markdown', () => {
    expect(parseDoc('# Just a heading\n').hasFrontmatter).toBe(false);
  });
  it('works in a browser, where there is no global Buffer', () => {
    const real = globalThis.Buffer;
    // @ts-expect-error simulate a browser
    delete globalThis.Buffer;
    try {
      expect(parseDoc('---\nname: x\n---\n\nHi\n').data.name).toBe('x');
      expect(parseDoc('# plain').hasFrontmatter).toBe(false);
    } finally {
      globalThis.Buffer = real;
    }
  });
  it('counts words', () => {
    expect(countWords('one two\nthree')).toBe(3);
    expect(countWords('  ')).toBe(0);
  });
});

describe('paths', () => {
  it('normalises relative paths', () => {
    expect(normalizeRelPath('./a//b\\c.md')).toBe('a/b/c.md');
  });
  it.each(['../x', 'a/../../x', '/etc/passwd', 'C:\\Windows', '~/x', 'a/../b', '', '.', 'a\0b'])('rejects %j', (bad) => {
    expect(() => normalizeRelPath(bad)).toThrow();
  });
  it('makes folder-safe slugs, including from Cyrillic', () => {
    expect(slugify('Weekly Client Report!')).toBe('weekly-client-report');
    expect(slugify('Еженедельный отчёт клиенту')).toBe('ezhenedelnyy-otchet-klientu');
    expect(slugify('***')).toBe('');
  });
});

describe('scoring (§9)', () => {
  it('computes annual hours', () => {
    expect(annualHours({ frequency: 'daily', minutes_per_run: 30 })).toBe(125);
    expect(annualHours({ frequency: 'weekly', minutes_per_run: 40 })).toBe(33.3);
    expect(annualHours({ frequency: 'monthly', minutes_per_run: 120 })).toBe(24);
    expect(annualHours({ frequency: 'ad-hoc', minutes_per_run: 90, runs_per_year: 8 })).toBe(12);
    expect(annualHours({ frequency: 'ad-hoc', minutes_per_run: 90 })).toBeNull();
    expect(runsPerYear({ frequency: 'daily' })).toBe(250);
  });
  it('a daily 30-minute task outweighs a 2-hour monthly one, as the spec says', () => {
    expect(annualHours({ frequency: 'daily', minutes_per_run: 30 })!).toBeGreaterThan(annualHours({ frequency: 'monthly', minutes_per_run: 120 })!);
  });
  const c = (run: number | null) => ({ date: '2026-01-01', run, note: 'x' });
  it('stable: more than 5 runs and no correction in the last 3', () => {
    expect(isStable({ runs: 7 }, [c(4), c(2)])).toBe(true);
    expect(isStable({ runs: 7 }, [c(5)])).toBe(false);
    expect(isStable({ runs: 5 }, [])).toBe(false);
    expect(isStable({ runs: 6 }, [])).toBe(true);
    expect(isStable({ runs: 7 }, [c(7)])).toBe(false);
  });
});

describe('process files', () => {
  const text = stringifyDoc(
    { type: 'process', slug: 'weekly-report', title: 'Weekly report', frequency: 'weekly', minutes_per_run: 40, automation: 'ready', inputs: ['CRM'], output: 'document', runs: 2, corrections: 0, updated: '2026-10-01' },
    '# Weekly report\n\n## What we do\n\nWe write it.\n\n## Steps\n\n1. Pull data\n2. Write\n',
  );
  it('reads and rebuilds without losing sections', () => {
    const doc = parseProcess(text);
    expect(getSection(doc, 'what')).toBe('We write it.');
    expect(getSection(doc, 'steps')).toContain('2. Write');
    const again = parseProcess(buildProcess(doc));
    expect(again.sections).toEqual(doc.sections);
    expect(again.fm).toEqual(doc.fm);
  });
  it('adds a missing section in canonical order and removes an emptied one', () => {
    let doc = parseProcess(text);
    doc = setSection(doc, 'good', 'Short and specific.');
    expect(doc.sections.map((s) => s.heading)).toEqual(['What we do', 'Steps', 'What a good result looks like']);
    doc = setSection(doc, 'constraints', 'No names.');
    expect(doc.sections.map((s) => s.heading)).toEqual(['What we do', 'Steps', 'What a good result looks like', 'Constraints']);
    doc = setSection(doc, 'steps', '');
    expect(doc.sections.map((s) => s.heading)).not.toContain('Steps');
  });
  it('explains an invalid process file in plain words', () => {
    expect(() => parseProcess('---\ntype: process\nslug: x\n---\n', 'processes/x/process.md')).toThrow(/processes\/x\/process\.md cannot be read/);
  });
});

describe('rewriting a file changes only what was edited', () => {
  const original = stringifyDoc(
    { type: 'process', slug: 'weekly-report', title: 'Weekly report', frequency: 'weekly', minutes_per_run: 40, automation: 'ready', inputs: ["CRM export", "last week's notes", 'Q3: plan'], output: 'document', runs: 7, corrections: 4, updated: '2026-10-09' },
    '# Weekly report\n\n## What we do\n\nWe write it.\n\n## Steps\n\n1. Pull data\n',
  );
  it('is stable: parse and build give back the same text (apostrophes do not get quoted)', () => {
    expect(original).toContain("inputs: [CRM export, last week's notes, \"Q3: plan\"]");
    expect(buildProcess(parseProcess(original))).toBe(original);
  });
  it('keeps header fields it does not know, including nested ones', () => {
    const withExtra = original.replace('runs: 7', 'runs: 7\nowner: Lena\nreview: {by: Marco, every: 30}');
    const doc = parseProcess(withExtra);
    expect(doc.extra).toMatchObject({ owner: 'Lena', review: { by: 'Marco', every: 30 } });
    const rebuilt = buildProcess(doc);
    expect(rebuilt).toContain('owner: Lena');
    expect(parseProcess(rebuilt).extra).toMatchObject({ owner: 'Lena', review: { by: 'Marco', every: 30 } });
  });
});

describe('corrections file', () => {
  it('round-trips entries, including a heading-like note', () => {
    const entries = [
      { date: '2026-10-04', run: 4, note: 'Lead with numbers.\n# not a heading', was: 'Overall the week', should: 'Sessions up 12%' },
      { date: '2026-09-20', run: null, note: 'Use "Hi", not "Dear".' },
    ];
    const parsed = parseCorrections(renderCorrections('Weekly report', entries));
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ date: '2026-10-04', run: 4, was: 'Overall the week', should: 'Sessions up 12%' });
    expect(parsed[0]?.note).toContain('Lead with numbers.');
    expect(parsed[1]).toMatchObject({ date: '2026-09-20', run: null, note: 'Use "Hi", not "Dear".' });
  });
  it('ignores a file with no entries', () => {
    expect(parseCorrections('# Corrections\n\nNothing yet.\n')).toEqual([]);
  });
});

describe('dates and diffs', () => {
  it('counts days', () => {
    expect(daysBetween('2026-10-01', '2026-10-11')).toBe(10);
    expect(daysBetween('2026-10-11', '2026-10-01')).toBe(-10);
  });
  it('produces a unified diff and a collapsed line diff', () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const after = before.replace('line 10', 'line ten');
    expect(unifiedDiff('a.md', before, after)).toMatch(/-line 10\n\+line ten/);
    const lines = lineDiff(before, after);
    expect(lines.some((l) => l.type === 'gap')).toBe(true);
    expect(lines.filter((l) => l.type === 'add')).toEqual([{ type: 'add', text: 'line ten' }]);
    expect(unifiedDiff('a.md', 'x', 'x')).toContain('no changes');
  });
});

describe('store: history and safety (§5)', () => {
  const make = async () => {
    const s = new MemoryStore('t', {}, 'fs');
    await s.init();
    return s;
  };
  it('copies the old content to .loam/history before overwriting', async () => {
    const s = await make();
    await s.writeFile('processes/a/corrections.md', 'one');
    expect(await s.listHistory()).toHaveLength(0);
    await s.writeFile('processes/a/corrections.md', 'two');
    const history = await s.listHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.originalPath).toBe('processes/a/corrections.md');
    expect(await s.readFile(history[0]!.path)).toBe('one');
    expect(history[0]!.id).toMatch(/^\d{8}T\d{9}Z-processes%2Fa%2Fcorrections\.md$/);
  });
  it('does nothing when the content is unchanged', async () => {
    const s = await make();
    await s.writeFile('a.md', 'same');
    await s.writeFile('a.md', 'same');
    expect(await s.listHistory()).toHaveLength(0);
  });
  it('keeps distinct, ordered history entries for writes in the same millisecond', async () => {
    const s = await make();
    await s.writeFile('a.md', '0');
    for (let i = 1; i <= 5; i++) await s.writeFile('a.md', String(i));
    const h = await s.listHistory();
    expect(h).toHaveLength(5);
    expect(new Set(h.map((e) => e.id)).size).toBe(5);
    expect(await s.readFile(h[0]!.path)).toBe('4');
  });
  it('restores the last version and keeps the replaced one in history too', async () => {
    const s = await make();
    await s.writeFile('a.md', 'v1');
    await s.writeFile('a.md', 'v2');
    await s.restore((await s.listHistory())[0]!);
    expect(await s.readFile('a.md')).toBe('v1');
    expect(await s.listHistory()).toHaveLength(2);
  });
  it('saves deleted files to history and prunes empty folders but not top-level ones', async () => {
    const s = await make();
    await s.writeFile('processes/a/examples/good-01.md', 'x');
    await s.deleteFile('processes/a/examples/good-01.md');
    expect(await s.exists('processes/a/examples/good-01.md')).toBe(false);
    expect((await s.listFiles('processes')).map((e) => e.name)).toEqual([]);
    expect((await s.listFiles('')).map((e) => e.name)).toContain('processes');
    const h = await s.listHistory();
    expect(await s.readFile(h[0]!.path)).toBe('x');
  });
  it('rejects paths that leave the base', async () => {
    const s = await make();
    await expect(s.writeFile('../outside.md', 'x')).rejects.toThrow(/leave/);
    await expect(s.readFile('/etc/passwd')).rejects.toThrow(/outside/);
  });
  it('does not keep history for machine-written files', async () => {
    const s = await make();
    await s.writeFile('.loam/skill-audit.json', '1');
    await s.writeFile('.loam/skill-audit.json', '2');
    expect(await s.listHistory()).toHaveLength(0);
  });
  it('parses history names, and rejects damaged ones', () => {
    expect(parseHistoryName('20261011T102030123Z-a%2Fb.md')).toEqual({ timestamp: '2026-10-11T10:20:30.123Z', originalPath: 'a/b.md' });
    expect(parseHistoryName('garbage')).toBeNull();
    expect(parseHistoryName('20261011T102030123Z-..%2F..%2Fx')).toBeNull();
  });
});
