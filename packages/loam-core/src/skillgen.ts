import { BUDGET_WORDS, MAX_SKILL_RULES, NO_INVENTING } from './constants';
import { countWords } from './frontmatter';
import { getSection, listItems, type Correction, type ProcessDoc } from './process';
import { buildSkill } from './skills';
import type { SkillFrontmatter } from './schema';

export interface ExampleInfo {
  /** File name, e.g. good-02.md */
  name: string;
  path: string;
  kind: 'good' | 'bad';
  /** Number in the file name (good-02 → 2); 0 when absent. */
  n: number;
}

/** good-01.md / bad-02.md → info. Other .md files in examples/ count as good examples. */
export function exampleInfo(path: string): ExampleInfo {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const m = /^(good|bad)-(\d+)/i.exec(name);
  return { name, path, kind: m?.[1]?.toLowerCase() === 'bad' ? 'bad' : 'good', n: m?.[2] ? Number(m[2]) : 0 };
}

/** Newest first: highest number, then name. */
export const sortExamples = (examples: ExampleInfo[]): ExampleInfo[] =>
  [...examples].sort((a, b) => b.n - a.n || b.name.localeCompare(a.name));

const quote = (s: string, n = 200) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

/** Newest first, dropping repeats of the same rule. The order a person's corrections are applied in. */
export function newestFirstUnique(corrections: Correction[]): Correction[] {
  const seen = new Set<string>();
  return [...corrections]
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
    .filter((c) => {
      const key = c.note.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function ruleText(c: Correction): string {
  const extra = c.was && c.should ? ` Was: "${quote(c.was)}". Should be: "${quote(c.should)}".` : '';
  return `${c.note.replace(/\s+/g, ' ').trim()}${extra}`;
}

/** Deterministic SKILL.md for a process (§10): no model involved, same input → same output. */
export function generateProcessSkill(input: {
  doc: ProcessDoc;
  corrections: Correction[];
  examples: ExampleInfo[];
  today: string;
}): string {
  const { doc, corrections, today } = input;
  const slug = doc.fm.slug;
  const examples = sortExamples(input.examples);
  const newestGood = examples.find((e) => e.kind === 'good');

  const rules = newestFirstUnique(corrections).slice(0, MAX_SKILL_RULES);

  const fm: SkillFrontmatter = {
    name: slug,
    description: `Produce "${doc.fm.title}" the way this user wants it, using their examples and corrections.`,
    source: 'generated',
    capabilities: ['read'],
    reviewed: false,
    updated: today,
  };

  const build = (ruleCount: number): string => {
    const what = getSection(doc, 'what');
    const steps = listItems(getSection(doc, 'steps'));
    const good = getSection(doc, 'good');
    const constraints = getSection(doc, 'constraints');
    const parts: string[] = [`# ${doc.fm.title}`];
    if (what) parts.push(what);
    parts.push(
      [
        '## Before you write',
        '',
        newestGood
          ? `1. Read the newest good example, \`${newestGood.path}\`, and match its structure, length and tone.`
          : `1. There is no example yet in \`processes/${slug}/examples/\`. Ask the user for one if the result matters.`,
        `2. Read \`processes/${slug}/corrections.md\`. Corrections override everything else, including the example.`,
        '3. Take tone and constraints from `profile.md`. For the people, clients, goals and terms the task involves, call `loam_get_context` with the task text.',
      ].join('\n'),
    );
    if (steps.length) parts.push(['## Steps', '', ...steps.map((s, i) => `${i + 1}. ${s}`)].join('\n'));
    if (good) parts.push(`## What a good result looks like\n\n${good}`);
    if (constraints) parts.push(`## Constraints\n\n${constraints}`);
    const used = rules.slice(0, ruleCount);
    parts.push(
      [
        '## Rules from corrections (newest first)',
        '',
        ...(used.length
          ? used.map((c, i) => `${i + 1}. ${ruleText(c)}`)
          : ['No corrections yet. After the first run, ask the user whether anything should change.']),
        ...(rules.length > used.length ? ['', `Older corrections are in \`processes/${slug}/corrections.md\`.`] : []),
      ].join('\n'),
    );
    if (examples.length) {
      parts.push(
        [
          '## Examples',
          '',
          ...examples.map((e, i) => `- \`${e.path}\` — ${e.kind === 'bad' ? 'what to avoid' : i === 0 || e === newestGood ? 'good example (newest)' : 'good example'}`),
        ].join('\n'),
      );
    }
    parts.push(`## Do not\n\n${NO_INVENTING}`);
    return buildSkill(fm, parts.join('\n\n'));
  };

  // Keep the skill inside its word budget by dropping the oldest rules first.
  let count = rules.length;
  let text = build(count);
  while (count > 5 && countWords(text) > BUDGET_WORDS.skill) text = build(--count);
  return text;
}
