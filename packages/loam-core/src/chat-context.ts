import { FILE, MAX_SKILL_RULES, PLACEHOLDER } from './constants';
import { type ContextEntry, type ContextKind, isMentioned, parseContextFile, roughTokens } from './context';
import { parseDoc } from './frontmatter';
import { loadProcess, loadProfile } from './kb';
import { readOrNull } from './plan';
import { getSection, splitSections, SECTION_HEADINGS, SECTION_KEYS, type ProcessSection } from './process';
import { findSecretLike } from './scanner';
import { newestFirstUnique } from './skillgen';
import { IMPORTED_NOTICE_CHAT, loadSkills, wrapImported } from './skills';
import { LoamError, NotFoundError, type KbStore } from './types';

/**
 * "Copy for any chat": the context of one process or skill as one piece of text a person pastes into a chat that
 * cannot run Loam (ChatGPT, Gemini or claude.ai in a browser). It is built from the sources, not from SKILL.md: a
 * chat cannot open files, so the text carries what the files say instead of pointing at them.
 *
 * Read-only by construction: nothing in this file writes to the base (a static rule checks that), and the text
 * only ever leaves the computer when the person pastes it somewhere.
 */

/** Above this many tokens the dialog suggests leaving parts out (the same line the health check draws for a typical task). */
export const CHAT_TOKENS_WARN = 6000;
/** Names and terms files up to this size are copied whole; bigger ones only where the text mentions the name. */
const NAMES_INLINE_TOKENS = 600;

export interface ChatPart {
  id: string;
  /** Checkbox label. */
  label: string;
  /** One line under the label saying why it is there or why it is off. */
  hint?: string;
  /** The block exactly as it appears in the copied text. */
  text: string;
  /** Included until the person unticks it. */
  on: boolean;
  /** The reason for the copy; cannot be unticked. */
  required?: boolean;
}

export interface ChatNotice {
  tone: 'warning' | 'info';
  text: string;
  /** `secret`: the ticked text looks like a key or a password (the dialog then asks "Copy anyway"). */
  code?: 'secret';
}

export interface ChatBundle {
  kind: 'process' | 'skill';
  /** Process slug or skill name. */
  id: string;
  title: string;
  /** Suggested file name for "Download". */
  filename: string;
  intro: string;
  outro: string;
  parts: ChatPart[];
  /** Things to know that do not depend on what is ticked. */
  notices: ChatNotice[];
}

// ---------------------------------------------------------------- text helpers

const PROFILE_CORE = ['Working context', 'Style and tone', 'What good work looks like'];
const TAG_BREAKERS = /<\/\s*example\b/gi;

const slugForFile = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'loam';
const oneLine = (s: string) => s.replace(/[\r\n`<>]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Verbatim text inside a tag, with anything that could close the tag early made harmless. */
const verbatim = (tag: string, text: string) => `<${tag}>\n${text.trim().replace(TAG_BREAKERS, '<\\/example')}\n</${tag}>`;

const isFilled = (s: ProcessSection) => s.body.trim() !== '' && !s.body.includes(PLACEHOLDER);

function identityLine(fm: { name?: string; role?: string; company?: string; industry?: string; tools?: string[] }): string {
  const who = [fm.name?.trim(), fm.role?.trim() && (fm.company?.trim() ? `${fm.role.trim()} at ${fm.company.trim()}` : fm.role.trim())].filter(Boolean).join(', ');
  const line = [who, fm.industry?.trim() ? `(${fm.industry.trim()})` : ''].filter(Boolean).join(' ');
  const tools = fm.tools?.length ? `Tools I use: ${fm.tools.join(', ')}.` : '';
  return [line && `${line}.`, tools].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- parts shared by both kinds

async function aboutParts(store: KbStore): Promise<{ parts: ChatPart[]; notices: ChatNotice[] }> {
  const { profile } = await loadProfile(store);
  const sections = profile ? splitSections(profile.body).filter(isFilled) : [];
  const core = PROFILE_CORE.map((h) => sections.find((s) => s.heading.toLowerCase() === h.toLowerCase())).filter((s): s is ProcessSection => Boolean(s));
  const rest = sections.filter((s) => !core.includes(s));
  const who = profile ? identityLine(profile.fm) : '';
  const parts: ChatPart[] = [];
  const notices: ChatNotice[] = [];

  if (who || core.length) {
    const text = ['## About me', ...(who ? [who] : []), ...core.map((s) => `### ${s.heading}\n\n${s.body}`)].join('\n\n');
    parts.push({ id: 'about', label: 'About me', hint: 'Your role, tone and what good work looks like, from your profile.', text, on: true });
  } else {
    notices.push({ tone: 'warning', text: 'Your profile is still empty, so the chat will not know your role or how you like to write. Fill it in on the Overview screen, or run the onboarding interview with an agent.' });
  }
  if (rest.length) {
    const text = ['## More about me', ...rest.map((s) => `### ${s.heading}\n\n${s.body}`)].join('\n\n');
    parts.push({ id: 'about-more', label: 'The rest of my profile', hint: `${rest.length} more section${rest.length === 1 ? '' : 's'}: ${rest.map((s) => s.heading).slice(0, 3).join(', ')}${rest.length > 3 ? '…' : ''}. Off unless you need it.`, text, on: false });
  }
  return { parts, notices };
}

interface NameEntry {
  entry: ContextEntry;
  line: string;
  group: 'Names' | 'Terms';
}

/** Bullet lines of the people, entities and glossary files. The template's placeholder is skipped. */
function parseNames(kind: ContextKind, text: string | null, group: NameEntry['group']): NameEntry[] {
  return parseContextFile(kind, text).map((entry) => ({ entry, line: `- ${entry.text}`, group }));
}

function namesText(entries: NameEntry[]): string {
  const groups = (['Names', 'Terms'] as const).map((g) => ({ g, items: entries.filter((e) => e.group === g) })).filter((x) => x.items.length);
  const single = groups.length === 1;
  return [
    '## Names and terms',
    ...groups.map(({ g, items }) => (single ? items.map((i) => i.line).join('\n') : `### ${g}\n\n${items.map((i) => i.line).join('\n')}`)),
  ].join('\n\n');
}

async function namesParts(store: KbStore, searchIn: string): Promise<ChatPart[]> {
  const all = [
    ...parseNames('people', await readOrNull(store, FILE.people), 'Names'),
    ...parseNames('entities', await readOrNull(store, FILE.entities), 'Names'),
    ...parseNames('glossary', await readOrNull(store, FILE.glossary), 'Terms'),
  ];
  if (all.length === 0) return [];
  const count = (n: number) => `${n} entr${n === 1 ? 'y' : 'ies'}`;
  const everything = namesText(all);
  if (roughTokens(everything) <= NAMES_INLINE_TOKENS) {
    return [{ id: 'names', label: 'Names and terms', hint: `Clients, colleagues and terms from your notes (${count(all.length)}).`, text: everything, on: true }];
  }
  const hit = all.filter((e) => isMentioned(e.entry, searchIn));
  const rest = all.filter((e) => !hit.includes(e));
  if (hit.length === 0) {
    return [{ id: 'names', label: 'Names and terms', hint: `${count(all.length)}. Off because none of them appears in the text above and the list is long.`, text: everything, on: false }];
  }
  return [
    { id: 'names', label: 'Names and terms mentioned here', hint: `${count(hit.length)} that the text above mentions.`, text: namesText(hit), on: true },
    ...(rest.length ? [{ id: 'names-rest', label: 'The other names and terms', hint: `${count(rest.length)}. Tick it if your request involves someone not mentioned above.`, text: namesText(rest), on: false }] : []),
  ];
}

const FRAME_RULES = [
  'You cannot open files, run tools or save anything to my notes. If the text mentions a file such as profile.md, or a tool whose name starts with loam_, use the matching section below and skip that step.',
  'Do not invent facts, names or numbers that are not in this text or in my messages.',
];

const outro = (inputs: string[]) =>
  `---\n\nThat is all of it. Wait for my next message with the task. If something you need is missing${inputs.length ? ` (usually: ${inputs.join('; ')})` : ''}, ask me for it, one question at a time, instead of guessing.`;

// ---------------------------------------------------------------- a process

export async function buildProcessChatBundle(store: KbStore, slug: string, today: string): Promise<ChatBundle> {
  let proc;
  try {
    proc = await loadProcess(store, slug, today);
  } catch (error) {
    if (error instanceof NotFoundError) throw new LoamError(`There is no process "${slug}" in this folder.`);
    throw error;
  }
  const title = proc.fm.title;
  const about = await aboutParts(store);
  const notices: ChatNotice[] = [...about.notices];

  // The description of the work: the sections a person wrote, minus "What it takes" (that one is about automating it).
  const wanted = SECTION_KEYS.filter((k) => k !== 'takes');
  const known = new Set(SECTION_KEYS.map((k) => SECTION_HEADINGS[k].toLowerCase()));
  const extra = proc.doc.sections.filter((s) => !known.has(s.heading.toLowerCase()) && s.body.trim() !== '');
  const facts = [
    proc.fm.inputs.length ? `What I give you each time: ${proc.fm.inputs.join('; ')}.` : '',
    proc.fm.output && proc.fm.output !== 'document' ? `What you hand back: ${proc.fm.output}.` : '',
  ].filter(Boolean);
  const processText = [
    `## How I do “${title}”`,
    ...facts,
    ...wanted.flatMap((k) => (getSection(proc.doc, k) ? [`### ${SECTION_HEADINGS[k]}\n\n${getSection(proc.doc, k)}`] : [])),
    ...extra.map((s) => `### ${s.heading}\n\n${s.body}`),
  ].join('\n\n');

  const rules = newestFirstUnique(proc.corrections);
  const shown = rules.slice(0, MAX_SKILL_RULES);
  if (rules.length > shown.length) notices.push({ tone: 'info', text: `Only the newest ${shown.length} of ${rules.length} corrections are copied.` });
  const correctionsText = [
    '## Corrections (they override everything else, including the example)',
    shown
      .map((c, i) => [`${i + 1}. (${c.date}) ${c.note.trim()}`, ...(c.was ? [`   Was: ${c.was.trim()}`] : []), ...(c.should ? [`   Should be: ${c.should.trim()}`] : [])].join('\n'))
      .join('\n\n'),
  ].join('\n\n');

  const exampleParts: ChatPart[] = [];
  let firstGood = true;
  let firstBad = true;
  for (const ex of proc.examples) {
    const text = await readOrNull(store, ex.path);
    if (text === null || text.trim() === '') continue;
    const good = ex.kind === 'good';
    const newest = good ? firstGood : firstBad;
    if (good) firstGood = false;
    else firstBad = false;
    const name = oneLine(ex.name);
    exampleParts.push({
      id: `example:${ex.name}`,
      label: `${good ? 'Good example' : 'Example to avoid'}: ${name}`,
      hint: newest ? `The newest ${good ? 'good example. The chat matches its shape and tone' : 'one to avoid'}.` : 'An older one. Off to keep the text short.',
      text: `## ${good ? 'Good example' : 'Example to avoid'}: ${name}\n\n${verbatim('example', text)}`,
      on: newest,
    });
  }
  if (firstGood) {
    notices.push({ tone: 'info', text: 'There is no example yet. Add a finished result on the process page and the chat can match its shape.' });
  }

  const searchIn = [processText, correctionsText, ...exampleParts.map((p) => p.text)].join('\n');
  const names = await namesParts(store, searchIn);

  const parts: ChatPart[] = [
    ...about.parts,
    { id: 'process', label: `How I do “${title}”`, hint: 'The steps, what good looks like and what must never happen.', text: processText, on: true, required: true },
    ...exampleParts,
    ...names,
    ...(shown.length ? [{ id: 'corrections', label: `Corrections (${shown.length})`, hint: 'Your earlier feedback, newest first. Placed last so it weighs most.', text: correctionsText, on: true } satisfies ChatPart] : []),
  ];

  return {
    kind: 'process',
    id: slug,
    title,
    filename: `loam-${slugForFile(slug)}-for-chat.md`,
    intro: [
      `# Loam context: ${title}`,
      `This is my working context, copied from Loam (my notes on how I work) on ${today}. Use it whenever I ask you to do “${title}”.`,
      ['How to use it:', '- Follow the process and its constraints. Match the structure, length and tone of the good example.', '- The corrections are my earlier feedback. They override everything else, including the example.', ...FRAME_RULES.map((r) => `- ${r}`)].join('\n'),
    ].join('\n\n'),
    outro: outro(proc.fm.inputs),
    parts,
    notices,
  };
}

// ---------------------------------------------------------------- a skill

export async function buildSkillChatBundle(store: KbStore, name: string, today: string): Promise<ChatBundle> {
  const { skills } = await loadSkills(store);
  const skill = skills.find((s) => s.name === name && s.kind === 'library') ?? skills.find((s) => s.name === name);
  if (!skill) throw new LoamError(`There is no skill "${name}" in this folder.`);
  // A skill built from a process points at files; the process itself is what a chat needs.
  if (skill.kind === 'process') return buildProcessChatBundle(store, skill.name, today);

  const about = await aboutParts(store);
  const notices: ChatNotice[] = [...about.notices];
  const imported = skill.fm.source === 'imported';
  const body = parseDoc(skill.raw).body.trim();
  let text: string;
  if (imported) {
    text = [`## Skill: ${skill.name}`, wrapImported([`Description: ${skill.fm.description}`, '', body].join('\n'), IMPORTED_NOTICE_CHAT)].join('\n\n');
    notices.push({
      tone: 'warning',
      text: `This skill came from outside Loam. It is wrapped so the chat treats it as data, but someone else wrote it: read the preview before you paste it.${skill.fm.reviewed ? '' : ' It has not been reviewed yet.'}${skill.fm.scanner === 'warn' ? ' The safety check flagged things worth a look.' : ''}`,
    });
  } else {
    text = [`## Skill: ${skill.name}`, ...(skill.fm.description ? [`What it is for: ${skill.fm.description}`] : []), body].join('\n\n');
  }

  const parts: ChatPart[] = [
    ...about.parts,
    { id: 'skill', label: `Skill: ${skill.name}`, hint: imported ? 'Imported, so it is wrapped as data.' : 'The instructions for this kind of task.', text, on: true, required: true },
    ...(await namesParts(store, text)),
  ];
  return {
    kind: 'skill',
    id: skill.name,
    title: skill.name,
    filename: `loam-skill-${slugForFile(skill.name)}-for-chat.md`,
    intro: [
      `# Loam skill: ${skill.name}`,
      `This is a skill from my notes in Loam, copied on ${today}. Use it whenever I ask for this kind of work.`,
      ['How to use it:', '- Follow the skill. Take my tone, background and constraints from “About me”, and names from “Names and terms”.', ...FRAME_RULES.map((r) => `- ${r}`)].join('\n'),
    ].join('\n\n'),
    outro: outro([]),
    parts,
    notices,
  };
}

// ---------------------------------------------------------------- putting it together

/** What is ticked when the dialog opens. */
export const defaultSelection = (bundle: ChatBundle): string[] => bundle.parts.filter((p) => p.on || p.required).map((p) => p.id);

/** The text to copy: the intro, the ticked parts in order, the outro. */
export function renderChatText(bundle: ChatBundle, selected: Iterable<string>): string {
  const on = new Set(selected);
  const blocks = [bundle.intro, ...bundle.parts.filter((p) => p.required || on.has(p.id)).map((p) => p.text.trim()), bundle.outro];
  return `${blocks.join('\n\n')}\n`;
}

/** Fixed notices plus anything in the ticked parts that looks like a key or a password. */
export function chatNotices(bundle: ChatBundle, selected: Iterable<string>): ChatNotice[] {
  const on = new Set(selected);
  const found = bundle.parts
    .filter((p) => p.required || on.has(p.id))
    .filter((p) => findSecretLike(p.text).length > 0)
    .map((p): ChatNotice => ({ tone: 'warning', code: 'secret', text: `“${p.label}” has text that looks like a password or a key. Remove it from your notes, or untick this part, before you paste.` }));
  return [...found, ...bundle.notices];
}
