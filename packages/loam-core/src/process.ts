import { parseDoc, stringifyDoc } from './frontmatter';
import { describeIssues, ProcessFrontmatter } from './schema';
import { LoamError } from './types';

export const SECTION_KEYS = ['what', 'steps', 'good', 'constraints', 'takes'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_HEADINGS: Record<SectionKey, string> = {
  what: 'What we do',
  steps: 'Steps',
  good: 'What a good result looks like',
  constraints: 'Constraints',
  takes: 'What it takes',
};

export interface ProcessSection {
  heading: string;
  body: string;
}

export interface ProcessDoc {
  fm: ProcessFrontmatter;
  sections: ProcessSection[];
  /** Header fields Loam does not know (added by hand). Kept when the file is rewritten. */
  extra?: Record<string, unknown>;
}

const canonical = (heading: string): SectionKey | null =>
  SECTION_KEYS.find((k) => SECTION_HEADINGS[k].toLowerCase() === heading.trim().toLowerCase()) ?? null;

/** Splits "## Heading" sections out of a markdown body. Text before the first "##" (the title) is dropped. */
export function splitSections(body: string): ProcessSection[] {
  const sections: ProcessSection[] = [];
  let current: ProcessSection | null = null;
  for (const line of body.split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m && m[1]) {
      current = { heading: m[1], body: '' };
      sections.push(current);
    } else if (current) {
      current.body += `${line}\n`;
    }
  }
  return sections.map((s) => ({ heading: s.heading, body: s.body.trim() }));
}

export function parseProcess(text: string, path = 'process.md'): ProcessDoc {
  const { data, body } = parseDoc(text);
  const result = ProcessFrontmatter.safeParse(data);
  if (!result.success) {
    throw new LoamError(`${path} cannot be read: ${describeIssues(result.error)}.`);
  }
  const known = new Set(Object.keys(ProcessFrontmatter.shape));
  const extra = Object.fromEntries(Object.entries(data).filter(([k]) => !known.has(k)));
  return { fm: result.data, sections: splitSections(body), ...(Object.keys(extra).length ? { extra } : {}) };
}

export function getSection(doc: ProcessDoc, key: SectionKey): string {
  return doc.sections.find((s) => canonical(s.heading) === key)?.body ?? '';
}

/** Returns a new doc with the section replaced (or added in canonical order). Empty text removes it. */
export function setSection(doc: ProcessDoc, key: SectionKey, text: string): ProcessDoc {
  const body = text.trim();
  const others = doc.sections.filter((s) => canonical(s.heading) !== key);
  if (body === '') return { ...doc, sections: others };
  const sections: ProcessSection[] = [];
  let placed = false;
  const order = (s: ProcessSection) => {
    const k = canonical(s.heading);
    return k === null ? SECTION_KEYS.length : SECTION_KEYS.indexOf(k);
  };
  const target = SECTION_KEYS.indexOf(key);
  for (const s of others) {
    if (!placed && order(s) > target) {
      sections.push({ heading: SECTION_HEADINGS[key], body });
      placed = true;
    }
    sections.push(s);
  }
  if (!placed) sections.push({ heading: SECTION_HEADINGS[key], body });
  return { ...doc, sections };
}

/** Fixed key order so files stay readable and diffs stay small. */
export function orderProcessFrontmatter(fm: ProcessFrontmatter): Record<string, unknown> {
  return {
    type: 'process',
    slug: fm.slug,
    title: fm.title,
    frequency: fm.frequency,
    minutes_per_run: fm.minutes_per_run,
    automation: fm.automation,
    inputs: fm.inputs,
    output: fm.output,
    runs: fm.runs,
    corrections: fm.corrections,
    runs_per_year: fm.runs_per_year,
    updated: fm.updated,
  };
}

export function buildProcess(doc: ProcessDoc): string {
  const body = [`# ${doc.fm.title}`]
    .concat(doc.sections.map((s) => `## ${s.heading}\n\n${s.body}`))
    .join('\n\n');
  return stringifyDoc({ ...orderProcessFrontmatter(doc.fm), ...doc.extra }, body);
}

/** Numbered or bulleted lines → plain step texts. */
export function listItems(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*+])\s+/, '').trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------- corrections

export interface Correction {
  date: string;
  /** How many runs had happened when this was recorded. Drives the `stable` badge. */
  run: number | null;
  note: string;
  was?: string;
  should?: string;
}

const clip = (s: string, n = 600) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

const escapeHeadings = (s: string) => s.replace(/^(#{1,6})\s/gm, '\\$1 ');

export function parseCorrections(text: string): Correction[] {
  const entries: Correction[] = [];
  const blocks = text.replace(/\r\n?/g, '\n').split(/^## /m).slice(1);
  for (const block of blocks) {
    const [header = '', ...rest] = block.split('\n');
    const h = /^(\d{4}-\d{2}-\d{2})(?:\s*·\s*after run (\d+))?/.exec(header.trim());
    if (!h || !h[1]) continue;
    let was: string | undefined;
    let should: string | undefined;
    const noteLines: string[] = [];
    for (const line of rest) {
      const w = /^-\s*Was:\s*(.*)$/.exec(line);
      const s = /^-\s*Should be:\s*(.*)$/.exec(line);
      if (w) was = w[1] ?? '';
      else if (s) should = s[1] ?? '';
      else noteLines.push(line);
    }
    const note = noteLines.join('\n').trim();
    if (note === '') continue;
    entries.push({ date: h[1], run: h[2] ? Number(h[2]) : null, note, was, should });
  }
  return entries;
}

export function renderCorrections(title: string, entries: Correction[]): string {
  const head = `# Corrections: ${title}\n\nNewest first. These override everything else.\n`;
  const blocks = entries.map((e) => {
    const lines = [`## ${e.date}${e.run !== null ? ` · after run ${e.run}` : ''}`, '', escapeHeadings(e.note.trim())];
    if (e.was || e.should) lines.push('');
    if (e.was) lines.push(`- Was: ${clip(e.was)}`);
    if (e.should) lines.push(`- Should be: ${clip(e.should)}`);
    return lines.join('\n');
  });
  return `${[head.trimEnd(), ...blocks].join('\n\n')}\n`;
}

export function emptyCorrections(title: string): string {
  return renderCorrections(title, []);
}
