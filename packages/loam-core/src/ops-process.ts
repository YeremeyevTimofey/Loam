import { FILE, MAX_NOTE_BYTES, REGENERATE_EVERY } from './constants';
import { parseDoc, stringifyDoc } from './frontmatter';
import { loadProcess, type ProcessInfo } from './kb';
import { newPlan, readOrNull, stage, type Plan } from './plan';
import {
  buildProcess,
  emptyCorrections,
  parseProcess,
  renderCorrections,
  setSection,
  type SectionKey,
} from './process';
import { describeIssues, ProfileFrontmatter, type ProcessFrontmatter } from './schema';
import { assertAgentNotePath, assertNoteSize } from './policy';
import { exampleInfo, generateProcessSkill, sortExamples } from './skillgen';
import { agentsMd, profileMd } from './templates';
import { LoamError, type KbStore } from './types';
import { isSlug } from './paths';
import { walk } from './walk';

const requireSlug = (slug: string) => {
  if (!isSlug(slug)) throw new LoamError(`"${slug}" is not a valid process name. Use the folder name, e.g. weekly-client-report.`);
};

async function requireProcess(store: KbStore, slug: string, today: string) {
  requireSlug(slug);
  if (!(await store.exists(`processes/${slug}/process.md`))) {
    const known = (await store.listFiles('processes').catch(() => [])).filter((e) => e.kind === 'dir').map((e) => e.name);
    throw new LoamError(`There is no process "${slug}". ${known.length ? `Known processes: ${known.join(', ')}.` : 'There are no processes yet — run the onboarding interview first.'}`);
  }
  return loadProcess(store, slug, today);
}

/** Examples are listed in the process skill, so adding or removing one rebuilds it in the same plan. */
async function stageSkillRebuild(plan: Plan, store: KbStore, proc: ProcessInfo, examplePaths: string[], today: string) {
  const examples = sortExamples(examplePaths.map(exampleInfo));
  await stage(
    plan,
    store,
    `processes/${proc.slug}/SKILL.md`,
    generateProcessSkill({ doc: proc.doc, corrections: proc.corrections, examples, today }),
    `Rebuild the skill for "${proc.fm.title}"`,
  );
}

const tooBig = (text: string) => new TextEncoder().encode(text).length > MAX_NOTE_BYTES;

// ---------------------------------------------------------------- examples

export type ExampleKind = 'good' | 'bad';

/** Adds an example exactly as given. Existing examples are never edited. */
export async function planAddExample(
  store: KbStore,
  input: { slug: string; content: string; kind: ExampleKind; today: string },
): Promise<{ plan: Plan; path: string }> {
  const proc = await requireProcess(store, input.slug, input.today);
  if (input.content.trim() === '') throw new LoamError('The example is empty. Paste the text of a finished result.');
  if (tooBig(input.content)) throw new LoamError('The example is too large (over 200 KB). Use a shorter excerpt.');
  const files = (await walk(store, `processes/${input.slug}/examples`)).map((f) => exampleInfo(f.path));
  const highest = files.filter((e) => e.kind === input.kind).reduce((m, e) => Math.max(m, e.n), 0);
  const name = `${input.kind}-${String(highest + 1).padStart(2, '0')}.md`;
  const path = `processes/${input.slug}/examples/${name}`;
  const plan = newPlan();
  await stage(plan, store, path, input.content.endsWith('\n') ? input.content : `${input.content}\n`, `Add a ${input.kind} example to "${proc.fm.title}"`);
  await stageSkillRebuild(plan, store, proc, [...proc.examples.map((e) => e.path), path], input.today);
  plan.notes.push(`Saved ${path} and rebuilt the process skill so it points to the new example.`);
  return { plan, path };
}

export async function planDeleteExample(store: KbStore, slug: string, name: string, today: string): Promise<Plan> {
  const proc = await requireProcess(store, slug, today);
  const example = proc.examples.find((e) => e.name === name);
  if (!example) throw new LoamError(`There is no example "${name}" in "${proc.fm.title}".`);
  const plan = newPlan();
  await stage(plan, store, example.path, null, `Delete example ${name}`);
  await stageSkillRebuild(plan, store, proc, proc.examples.filter((e) => e.path !== example.path).map((e) => e.path), today);
  return plan;
}

// ---------------------------------------------------------------- corrections

export async function planRecordCorrection(
  store: KbStore,
  input: { slug: string; note: string; before?: string; after?: string; today: string },
): Promise<Plan> {
  const proc = await requireProcess(store, input.slug, input.today);
  const note = input.note.trim();
  if (note === '') throw new LoamError('The correction is empty. Say what should be different next time.');
  if (tooBig(note)) throw new LoamError('The correction is too long. Keep it to a few sentences.');
  const entries = [
    { date: input.today, run: proc.fm.runs, note, was: input.before?.trim() || undefined, should: input.after?.trim() || undefined },
    ...proc.corrections,
  ];
  const fm: ProcessFrontmatter = { ...proc.fm, corrections: entries.length, updated: input.today };
  const plan = newPlan();
  await stage(plan, store, `processes/${input.slug}/corrections.md`, renderCorrections(proc.fm.title, entries), `Remember a correction for "${proc.fm.title}"`);
  await stage(plan, store, proc.path, buildProcess({ ...proc.doc, fm }), 'Update the corrections counter');
  if (fm.corrections % REGENERATE_EVERY === 0) {
    plan.notes.push(`That is correction number ${fm.corrections}. Call loam_generate_skill with slug "${input.slug}" to fold the latest corrections into the process skill.`);
  }
  return plan;
}

export async function planDeleteCorrection(store: KbStore, slug: string, index: number, today: string): Promise<Plan> {
  const proc = await requireProcess(store, slug, today);
  if (index < 0 || index >= proc.corrections.length) throw new LoamError('That correction no longer exists. Refresh and try again.');
  const entries = proc.corrections.filter((_, i) => i !== index);
  const plan = newPlan();
  await stage(plan, store, `processes/${slug}/corrections.md`, renderCorrections(proc.fm.title, entries), 'Delete a correction');
  await stage(plan, store, proc.path, buildProcess({ ...proc.doc, fm: { ...proc.fm, corrections: entries.length, updated: today } }), 'Update the corrections counter');
  return plan;
}

// ---------------------------------------------------------------- runs, skill, sections

export async function planLogRun(store: KbStore, slug: string, today: string): Promise<Plan> {
  const proc = await requireProcess(store, slug, today);
  const plan = newPlan();
  await stage(plan, store, proc.path, buildProcess({ ...proc.doc, fm: { ...proc.fm, runs: proc.fm.runs + 1 } }), 'Count a run');
  plan.notes.push(`"${proc.fm.title}" has now run ${proc.fm.runs + 1} time${proc.fm.runs + 1 === 1 ? '' : 's'}.`);
  return plan;
}

export async function planGenerateProcessSkill(store: KbStore, slug: string, today: string): Promise<Plan> {
  const proc = await requireProcess(store, slug, today);
  const text = generateProcessSkill({ doc: proc.doc, corrections: proc.corrections, examples: sortExamples(proc.examples), today });
  const plan = newPlan();
  await stage(plan, store, `processes/${slug}/SKILL.md`, text, `Rebuild the skill for "${proc.fm.title}"`);
  return plan;
}

export async function planUpdateSection(
  store: KbStore,
  input: { slug: string; key: SectionKey; text: string; today: string },
): Promise<Plan> {
  const proc = await requireProcess(store, input.slug, input.today);
  const doc = setSection({ ...proc.doc, fm: { ...proc.fm, updated: input.today } }, input.key, input.text);
  const plan = newPlan();
  await stage(plan, store, proc.path, buildProcess(doc), `Edit "${proc.fm.title}"`);
  return plan;
}

export type ProcessMetaPatch = Partial<
  Pick<ProcessFrontmatter, 'title' | 'frequency' | 'minutes_per_run' | 'automation' | 'inputs' | 'output' | 'runs_per_year'>
>;

export async function planUpdateProcessMeta(
  store: KbStore,
  input: { slug: string; patch: ProcessMetaPatch; today: string },
): Promise<Plan> {
  const proc = await requireProcess(store, input.slug, input.today);
  const fm: ProcessFrontmatter = { ...proc.fm, ...input.patch, updated: input.today };
  if (fm.frequency !== 'ad-hoc') delete fm.runs_per_year;
  const plan = newPlan();
  await stage(plan, store, proc.path, buildProcess({ ...proc.doc, fm }), `Edit "${fm.title}"`);
  return plan;
}

// ---------------------------------------------------------------- profile

export interface ProfilePatch {
  name?: string;
  role?: string;
  company?: string;
  industry?: string;
  tools?: string[];
  context?: string;
  style?: string;
  quality?: string;
}

const PROFILE_SECTIONS = {
  context: 'Working context',
  style: 'Style and tone',
  quality: 'What good work looks like',
} as const;

/** Edits profile.md and keeps the owner line in AGENTS.md in step with name and role. */
export async function planUpdateProfile(store: KbStore, patch: ProfilePatch, today: string): Promise<Plan> {
  const raw = (await readOrNull(store, FILE.profile)) ?? profileMd({ name: '', role: '', company: '', industry: '', tools: [] }, today);
  const { data, body } = parseDoc(raw);
  const current = ProfileFrontmatter.parse({ ...data, type: 'profile', updated: data.updated ?? today });
  const sections: Record<string, string> = {};
  let key: string | null = null;
  for (const line of body.split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m && m[1]) {
      key = m[1];
      sections[key] = '';
    } else if (key) sections[key] += `${line}\n`;
  }
  const knownHeader = new Set(Object.keys(ProfileFrontmatter.shape));
  const extraHeader = Object.fromEntries(Object.entries(data).filter(([k]) => !knownHeader.has(k)));
  const known = new Set<string>(Object.values(PROFILE_SECTIONS));
  const extra = Object.entries(sections)
    .filter(([heading]) => !known.has(heading))
    .map(([heading, text]) => `## ${heading}\n\n${text.trim()}`)
    .join('\n\n');
  const section = (k: keyof typeof PROFILE_SECTIONS) => {
    const text = (patch[k] ?? sections[PROFILE_SECTIONS[k]] ?? '').trim();
    return text.startsWith('_Not filled in yet') ? '' : text;
  };
  const next = {
    name: patch.name ?? current.name,
    role: patch.role ?? current.role,
    company: patch.company ?? current.company,
    industry: patch.industry ?? current.industry,
    tools: patch.tools ?? current.tools,
    context: section('context'),
    style: section('style'),
    quality: section('quality'),
    extra,
    extraHeader,
  };
  const plan = newPlan();
  await stage(plan, store, FILE.profile, profileMd(next, today), 'Update your profile');
  const agents = await readOrNull(store, FILE.agents);
  if (agents !== null) {
    const owner = agentsMd(next).split('\n')[2];
    const updated = agents.replace(/^Personal work context for .*$/m, owner ?? '');
    await stage(plan, store, FILE.agents, updated, 'Keep AGENTS.md in step with your name and role');
  }
  return plan;
}


// ---------------------------------------------------------------- agent notes

/** Writes a markdown note on behalf of the agent. Profile and process files must stay valid. */
export async function planUpsertNote(
  store: KbStore,
  input: { path: string; content: string; reason: string },
): Promise<Plan> {
  const path = assertAgentNotePath(input.path);
  assertNoteSize(input.content);
  if (input.content.trim() === '') throw new LoamError('The note is empty. To remove a file, ask the user to do it in the app.');
  const text = input.content.endsWith('\n') ? input.content : `${input.content}\n`;
  if (path === FILE.profile) {
    const { data } = parseDoc(text);
    const result = ProfileFrontmatter.safeParse(data);
    if (!result.success) throw new LoamError(`profile.md must keep its header (type, name, role, company, tools, updated): ${describeIssues(result.error)}.`);
  }
  const m = /^processes\/([^/]+)\/process\.md$/.exec(path);
  if (m) {
    const doc = parseProcess(text, path);
    if (doc.fm.slug !== m[1]) throw new LoamError(`The slug in the header (${doc.fm.slug}) must match the folder name (${m[1]}).`);
  }
  const plan = newPlan();
  await stage(plan, store, path, text, input.reason.trim() || 'Update a note');
  return plan;
}
