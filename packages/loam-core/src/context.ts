import { z } from 'zod';
import { FILE, PLACEHOLDER } from './constants';
import { countWords } from './frontmatter';
import { newPlan, readOrNull, stage, type Plan } from './plan';
import { LoamError, type KbStore } from './types';

/**
 * What the user's assistant should know about the people and things around their work, in a few small files that all
 * use one line per entry: `- **Name** (what it is) — what to keep in mind`. The files are plain markdown, so a person can
 * read and fix them; the line format is what lets Loam find an entry by name and hand over only the lines a task needs.
 */
export const CONTEXT_KINDS = ['people', 'entities', 'goals', 'metrics', 'glossary'] as const;
export type ContextKind = (typeof CONTEXT_KINDS)[number];

export const CONTEXT_FILE: Record<ContextKind, string> = {
  people: FILE.people,
  entities: FILE.entities,
  goals: FILE.goals,
  metrics: FILE.metrics,
  glossary: FILE.glossary,
};

/** Word budget per file, enforced by Context Lint. A whole file is cheap to read only while it stays small. */
export const CONTEXT_WORD_BUDGET: Record<ContextKind, number> = { people: 600, entities: 500, goals: 250, metrics: 250, glossary: 500 };

/** One entry is a line, not a page. Longer detail belongs in a note that the line names. */
export const MAX_ENTRY_WORDS = 60;

/** What a person sees in the folder, and what the agent is told each kind is for. */
export const CONTEXT_LABEL: Record<ContextKind, { title: string; intro: string; example: string; default: string }> = {
  people: {
    title: 'People',
    intro: 'Colleagues, managers and the people you deal with at clients: who they are to you, and anything an assistant should keep in mind when they come up.',
    example: '- **Marco Rossi** (colleague, creative lead; aka Marco) — needs briefs a day ahead; prefers a call to a long message.',
    default: 'colleague',
  },
  entities: {
    title: 'Entities',
    intro: 'Clients, projects and systems that come up by name, with anything an assistant should know about each.',
    example: '- **Acme Outdoor** (client) — oldest account; wants the numbers first.',
    default: 'other',
  },
  goals: {
    title: 'Goals',
    intro: 'What you are working towards or must get done, with the date if there is one. An assistant uses these to judge what matters most.',
    example: '- **Keep the three biggest accounts** (goal, by 2026-12-31) — no account leaves before renewal; the spring budget is the risk.',
    default: 'goal',
  },
  metrics: {
    title: 'Metrics',
    intro: 'The numbers you are measured on or watch, with the target and where to find them.',
    example: '- **Reports sent on time** (metric) — target every Friday by 15:00; today about 85%; list is in the tracker.',
    default: 'metric',
  },
  glossary: {
    title: 'Glossary',
    intro: 'Terms and abbreviations that would confuse an outsider.',
    example: '- **ROAS** — return on ad spend: revenue divided by what we spent on ads.',
    default: '',
  },
};

export interface ContextEntry {
  kind: ContextKind;
  file: string;
  name: string;
  /** The text in brackets without the aliases, e.g. "colleague, creative lead". */
  label: string;
  notes: string;
  /** Other ways the entry is called in a task: `aka Marco, M. Rossi` inside the brackets. */
  aliases: string[];
  /** For people: the first name, matched only in the same capitalisation, so "will" in a sentence is not "Will". */
  firstName: string | null;
  /** The line as written, without the leading dash. */
  text: string;
  words: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when `name` appears as a word of its own in the text (letters of any language, any case). */
export const mentions = (haystack: string, name: string, caseSensitive = false): boolean =>
  name.length >= 2 && new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, caseSensitive ? 'u' : 'iu').test(haystack);

const BOLD_LINE = /^\s*[-*+]\s+\*\*(.+?)\*\*\s*(?:\(([^)]*)\))?\s*(?:[—–:]|--?)?\s*(.*?)\s*$/;
const PLAIN_LINE = /^\s*[-*+]\s+(.+?)\s*$/;
const ALIAS = /(?:^|[;,]\s*)(?:aka|also)\s+(.+)$/i;

/** Parses one bullet line. Lines written by hand without bold text still work: the name is what stands before the first dash or colon. */
export function parseContextLine(kind: ContextKind, line: string): ContextEntry | null {
  const bold = BOLD_LINE.exec(line);
  let name: string;
  let rawLabel = '';
  let notes: string;
  if (bold?.[1]) {
    name = bold[1];
    rawLabel = bold[2] ?? '';
    notes = bold[3] ?? '';
  } else {
    const plain = PLAIN_LINE.exec(line);
    if (!plain?.[1]) return null;
    const [head = '', ...rest] = plain[1].split(/\s[—–-]\s|:\s/);
    name = head.replace(/\*\*/g, '');
    notes = rest.join(' — ');
  }
  name = name.trim();
  if (!name || name.includes(PLACEHOLDER) || notes.includes(PLACEHOLDER)) return null;
  const alias = ALIAS.exec(rawLabel);
  const aliases = alias?.[1] ? alias[1].split(/[,;]/).map((a) => a.trim()).filter((a) => a.length >= 2) : [];
  const label = (alias ? rawLabel.slice(0, alias.index) : rawLabel).replace(/[;,\s]+$/, '').trim();
  const first = name.split(/\s+/)[0] ?? '';
  // People are mostly spoken of by first name.
  const firstName = kind === 'people' && name.includes(' ') && first.length >= 3 && /^\p{Lu}/u.test(first) ? first : null;
  const text = line.replace(/^\s*[-*+]\s+/, '').trim();
  return { kind, file: CONTEXT_FILE[kind], name, label, notes, aliases, firstName, text, words: countWords(text) };
}

export function parseContextFile(kind: ContextKind, text: string | null): ContextEntry[] {
  if (!text) return [];
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap((line) => {
      const entry = parseContextLine(kind, line);
      return entry ? [entry] : [];
    });
}

/** True when the task text calls the entry by its name or by one of its aliases. */
export const isMentioned = (entry: ContextEntry, text: string): boolean =>
  mentions(text, entry.name) || entry.aliases.some((a) => mentions(text, a)) || (entry.firstName !== null && mentions(text, entry.firstName, true));

export interface LoadedContext {
  entries: ContextEntry[];
  /** Words in each file that exists. */
  words: Partial<Record<ContextKind, number>>;
}

export async function loadContext(store: KbStore): Promise<LoadedContext> {
  const entries: ContextEntry[] = [];
  const words: LoadedContext['words'] = {};
  for (const kind of CONTEXT_KINDS) {
    const text = await readOrNull(store, CONTEXT_FILE[kind]);
    if (text === null) continue;
    words[kind] = countWords(text);
    entries.push(...parseContextFile(kind, text));
  }
  return { entries, words };
}

// ---------------------------------------------------------------- what the agent receives

const SHORT = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * One short paragraph for the overview: how much the base knows, the goals and the names of the metrics, and how to ask for the rest.
 * Null while there is nothing yet. A goal or a metric is named by its title only, so this stays near 100 tokens.
 */
export function contextDigest(ctx: LoadedContext): string | null {
  const count = (k: ContextKind) => ctx.entries.filter((e) => e.kind === k);
  const people = count('people');
  const entities = count('entities');
  const goals = count('goals');
  const metrics = count('metrics');
  const terms = count('glossary');
  if (ctx.entries.length === 0) return null;
  const parts = [
    people.length && `${people.length} ${people.length === 1 ? 'person' : 'people'}`,
    entities.length && `${entities.length} client${entities.length === 1 ? '' : 's'}, project${entities.length === 1 ? '' : 's'} or system${entities.length === 1 ? '' : 's'}`,
    goals.length && `${goals.length} goal${goals.length === 1 ? '' : 's'}`,
    metrics.length && `${metrics.length} metric${metrics.length === 1 ? '' : 's'}`,
    terms.length && `${terms.length} term${terms.length === 1 ? '' : 's'}`,
  ].filter(Boolean);
  const lines = [`Context: ${parts.join(', ')}.`];
  if (goals.length) lines.push(`Goals: ${goals.slice(0, 3).map((g) => SHORT(g.name, 50)).join('; ')}${goals.length > 3 ? '; …' : ''}.`);
  if (metrics.length) lines.push(`Metrics: ${metrics.slice(0, 4).map((m) => SHORT(m.name, 40)).join('; ')}${metrics.length > 4 ? '; …' : ''}.`);
  lines.push('Names, goals and numbers behind a task: call loam_get_context with the task text. It returns only the entries that matter.');
  return lines.join('\n');
}

export const roughTokens = (text: string): number => Math.ceil(text.length / 4);

export interface ContextAnswer {
  text: string;
  /** Entries returned, and entries left out because of the cap. */
  returned: number;
  left: number;
}

/** Picks the entries a task needs: those it names, plus every entry of the kinds asked for. */
export function selectContext(
  ctx: LoadedContext,
  options: { text?: string; kinds?: ContextKind[]; maxTokens: number },
): ContextAnswer {
  const kinds = options.kinds ?? [];
  const text = options.text ?? '';
  const picked = ctx.entries.filter((e) => kinds.includes(e.kind) || (text !== '' && isMentioned(e, text)));
  const order = new Map(CONTEXT_KINDS.map((k, i) => [k, i]));
  picked.sort((a, b) => (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0));
  const out: string[] = [];
  let used = 0;
  let returned = 0;
  let current: ContextKind | null = null;
  for (const e of picked) {
    const heading = e.kind === current ? '' : `${current === null ? '' : '\n'}## ${CONTEXT_LABEL[e.kind].title} (${e.file})\n`;
    const cost = roughTokens(`${heading}- ${e.text}\n`);
    if (returned > 0 && used + cost > options.maxTokens) break;
    out.push(`${heading}- ${e.text}`);
    used += cost;
    returned += 1;
    current = e.kind;
  }
  return { text: out.join('\n'), returned, left: picked.length - returned };
}

// ---------------------------------------------------------------- writing

export const ContextEntryInput = z.object({
  name: z.string().min(1),
  kind: z.string().default('').describe('What it is, in a word or two: client, colleague, goal, metric ...'),
  notes: z.string().default('').describe(`What to keep in mind: one or two sentences, up to ${MAX_ENTRY_WORDS} words`),
});
export type ContextEntryInput = z.infer<typeof ContextEntryInput>;

const clean = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').replace(/\*\*/g, '').trim();
const cleanLabel = (s: string) => clean(s).replace(/[()]/g, '');

export function contextFileMd(kind: ContextKind, lines: string[]): string {
  const meta = CONTEXT_LABEL[kind];
  return `# ${meta.title}\n\n${meta.intro} One per line, like this: \`${meta.example}\`\n\n${lines.join('\n')}${lines.length ? '\n' : ''}`;
}

/** The line for an entry: `- **Name** (label; aka A, B) — notes`. */
export function contextLine(kind: ContextKind, input: { name: string; label?: string; notes?: string; aliases?: string[] }): string {
  const name = clean(input.name);
  const label = cleanLabel(input.label ?? '') || (kind === 'glossary' ? '' : CONTEXT_LABEL[kind].default);
  const aliases = (input.aliases ?? []).map(clean).filter((a) => a.length >= 2 && a.toLowerCase() !== name.toLowerCase());
  const inside = [label, aliases.length ? `aka ${aliases.join(', ')}` : ''].filter(Boolean).join('; ');
  const notes = clean(input.notes ?? '');
  return `- **${name}**${inside ? ` (${inside})` : ''}${notes ? ` — ${notes}` : ''}`;
}

const keyOf = (name: string) => clean(name).toLowerCase();

export interface ContextUpsertResult {
  plan: Plan;
  action: 'added' | 'updated' | 'removed' | 'unchanged' | 'missing';
  file: string;
  fileWords: number;
  budget: number;
}

export const ContextUpsertInput = z.object({
  kind: z.enum(CONTEXT_KINDS),
  name: z.string().min(1).max(80),
  /** What it is to the user, e.g. "colleague, creative lead". When changing an entry, left out means unchanged. */
  label: z.string().max(80).optional(),
  /** What to keep in mind: one or two sentences. When changing an entry, left out means unchanged. */
  notes: z.string().optional(),
  /** Other names it is called by. When changing an entry, left out means unchanged. */
  aliases: z.array(z.string().min(2).max(40)).max(6).optional(),
  remove: z.boolean().default(false),
});
export type ContextUpsertInput = z.infer<typeof ContextUpsertInput>;

/**
 * Adds, replaces or removes ONE entry, found by its name. Every other line stays exactly as it was, so the diff the person
 * sees is the one line they asked for. The first write creates the file.
 */
export async function planUpsertContext(store: KbStore, rawInput: ContextUpsertInput, reason?: string): Promise<ContextUpsertResult> {
  const input = ContextUpsertInput.parse(rawInput);
  const file = CONTEXT_FILE[input.kind];
  const budget = CONTEXT_WORD_BUDGET[input.kind];
  const existing = await readOrNull(store, file);
  const lines = (existing ?? contextFileMd(input.kind, [])).replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  const at = lines.findIndex((l) => {
    const e = parseContextLine(input.kind, l);
    return e !== null && keyOf(e.name) === keyOf(input.name);
  });
  const plan = newPlan();

  if (input.remove) {
    if (at < 0) return { plan, action: 'missing', file, fileWords: countWords(existing ?? ''), budget };
    const next = [...lines.slice(0, at), ...lines.slice(at + 1)].join('\n');
    await stage(plan, store, file, `${next}\n`, reason ?? `Remove "${input.name}"`);
    return { plan, action: 'removed', file, fileWords: countWords(next), budget };
  }

  // Changing one thing (the notes, say) keeps the rest of the entry as it was.
  const previous = at >= 0 ? parseContextLine(input.kind, lines[at]!) : null;
  const line = contextLine(input.kind, {
    name: input.name,
    label: input.label ?? previous?.label,
    notes: input.notes ?? previous?.notes,
    aliases: input.aliases ?? previous?.aliases,
  });
  const entryWords = countWords(line.replace(/^- /, ''));
  if (entryWords > MAX_ENTRY_WORDS) {
    throw new LoamError(
      `The entry for "${clean(input.name)}" is ${entryWords} words; one entry may have up to ${MAX_ENTRY_WORDS}. Keep the part an assistant needs every time and shorten the rest. Longer background belongs in a note that the entry names.`,
    );
  }
  const body = lines.filter((l) => !l.includes(PLACEHOLDER));
  let next: string[];
  let action: ContextUpsertResult['action'];
  if (at >= 0) {
    const index = body.indexOf(lines[at]!);
    next = [...body.slice(0, index), line, ...body.slice(index + 1)];
    action = body[index] === line ? 'unchanged' : 'updated';
  } else {
    next = [...body, line];
    action = 'added';
  }
  const text = `${next.join('\n')}\n`;
  await stage(plan, store, file, text, reason ?? `${action === 'added' ? 'Add' : 'Update'} "${clean(input.name)}"`);
  const fileWords = countWords(text);
  if (fileWords > budget) plan.notes.push(`${file} is now ${fileWords} words; the limit is ${budget}. Trim entries that no longer matter, or the file costs more to read each time.`);
  return { plan, action, file, fileWords, budget };
}

/** Lines for a list of entries from the interview, for the same file format. */
export function contextLines(kind: ContextKind, items: ContextEntryInput[]): string[] {
  return items.map((i) => contextLine(kind, { name: i.name, label: i.kind, notes: i.notes }));
}
