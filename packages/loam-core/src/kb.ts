import { readAudit } from './audit';
import { FILE, PLACEHOLDER } from './constants';
import { daysBetween } from './dates';
import { countWords, parseDoc } from './frontmatter';
import { defaultInterviewJson, DEFAULT_INTERVIEW } from './interview';
import { parseCorrections, parseProcess, type Correction, type ProcessDoc } from './process';
import { newPlan, readOrNull, stage, type Plan } from './plan';
import { annualHours, isStable, lastCorrectionDate, priorityOrder } from './scoring';
import {
  describeIssues,
  KbState,
  newState,
  ProfileFrontmatter,
  type AuditEntry,
  type ProcessFrontmatter,
} from './schema';
import { exampleInfo, generateProcessSkill, sortExamples, type ExampleInfo } from './skillgen';
import { loadSkills, type Skill, type SkillLoad } from './skills';
import { agentsMd, CLAUDE_MD, emptyProfile, ENTITIES_TEMPLATE, GEMINI_MD, GLOSSARY_TEMPLATE, README_MD } from './templates';
import type { KbStore } from './types';
import { walk } from './walk';

/** A base is a base once it has .loam/state.json. */
export const isKnowledgeBase = (store: KbStore): Promise<boolean> => store.exists(FILE.state);

/** Plan that creates every missing starter file. Existing files are never touched. */
export async function planScaffold(store: KbStore, today: string): Promise<Plan> {
  const plan = newPlan();
  const files: [string, string][] = [
    [FILE.readme, README_MD],
    [FILE.agents, agentsMd()],
    [FILE.claude, CLAUDE_MD],
    [FILE.gemini, GEMINI_MD],
    [FILE.profile, emptyProfile(today)],
    [FILE.glossary, GLOSSARY_TEMPLATE],
    [FILE.entities, ENTITIES_TEMPLATE],
    [FILE.interview, defaultInterviewJson()],
    [FILE.state, `${JSON.stringify({ ...newState(today), interview: { status: 'not_started', script_version: DEFAULT_INTERVIEW.version } }, null, 2)}\n`],
  ];
  for (const [path, content] of files) {
    if (!(await store.exists(path))) await stage(plan, store, path, content);
  }
  return plan;
}

// ---------------------------------------------------------------- snapshot

export interface ProcessInfo {
  slug: string;
  path: string;
  doc: ProcessDoc;
  fm: ProcessFrontmatter;
  words: number;
  hours: number | null;
  corrections: Correction[];
  lastCorrection: string | null;
  stable: boolean;
  examples: ExampleInfo[];
  hasSkill: boolean;
  /** The saved SKILL.md differs from what would be generated now. */
  skillStale: boolean;
}

export interface ProfileInfo {
  fm: ProfileFrontmatter;
  body: string;
  raw: string;
  words: number;
  /** Still the unfilled template. */
  empty: boolean;
}

export interface KbSnapshot {
  today: string;
  state: KbState | null;
  profile: ProfileInfo | null;
  profileError: string | null;
  processes: ProcessInfo[];
  invalidProcesses: { path: string; error: string }[];
  skills: Skill[];
  invalidSkills: SkillLoad['invalid'];
  audit: AuditEntry[];
}

export async function loadState(store: KbStore): Promise<KbState | null> {
  const raw = await readOrNull(store, FILE.state);
  if (raw === null) return null;
  try {
    const parsed = KbState.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function loadProfile(store: KbStore): Promise<{ profile: ProfileInfo | null; error: string | null }> {
  const raw = await readOrNull(store, FILE.profile);
  if (raw === null) return { profile: null, error: null };
  try {
    const { data, body } = parseDoc(raw);
    const parsed = ProfileFrontmatter.safeParse(data);
    if (!parsed.success) return { profile: null, error: `profile.md cannot be read: ${describeIssues(parsed.error)}.` };
    return {
      profile: { fm: parsed.data, body, raw, words: countWords(body), empty: raw.includes(PLACEHOLDER) && !parsed.data.role && !parsed.data.name },
      error: null,
    };
  } catch (error) {
    return { profile: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function loadProcess(store: KbStore, slug: string, today: string): Promise<ProcessInfo> {
  const path = `processes/${slug}/process.md`;
  const raw = await store.readFile(path);
  const doc = parseProcess(raw, path);
  const corrections = parseCorrections((await readOrNull(store, `processes/${slug}/corrections.md`)) ?? '');
  const examplePaths = (await walk(store, `processes/${slug}/examples`)).filter((f) => !f.name.startsWith('.'));
  const examples = sortExamples(examplePaths.map((f) => exampleInfo(f.path)));
  const skillRaw = await readOrNull(store, `processes/${slug}/SKILL.md`);
  let skillStale = false;
  if (skillRaw !== null) {
    const updated = /^updated:\s*(\d{4}-\d{2}-\d{2})/m.exec(skillRaw)?.[1] ?? today;
    skillStale = generateProcessSkill({ doc, corrections, examples, today: updated }) !== skillRaw;
  }
  const { body } = parseDoc(raw);
  return {
    slug,
    path,
    doc,
    fm: doc.fm,
    words: countWords(body),
    hours: annualHours(doc.fm),
    corrections,
    lastCorrection: lastCorrectionDate(corrections),
    stable: isStable(doc.fm, corrections),
    examples,
    hasSkill: skillRaw !== null,
    skillStale,
  };
}

export async function loadKb(store: KbStore, today: string): Promise<KbSnapshot> {
  const { profile, error: profileError } = await loadProfile(store);
  const processes: ProcessInfo[] = [];
  const invalidProcesses: KbSnapshot['invalidProcesses'] = [];
  let dirs: { name: string; path: string }[] = [];
  try {
    dirs = (await store.listFiles('processes')).filter((e) => e.kind === 'dir');
  } catch {
    /* no processes yet */
  }
  for (const dir of dirs) {
    if (!(await store.exists(`${dir.path}/process.md`))) continue;
    try {
      processes.push(await loadProcess(store, dir.name, today));
    } catch (error) {
      invalidProcesses.push({ path: `${dir.path}/process.md`, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const { skills, invalid } = await loadSkills(store);
  return {
    today,
    state: await loadState(store),
    profile,
    profileError,
    processes: priorityOrder(processes),
    invalidProcesses,
    skills,
    invalidSkills: invalid,
    audit: await readAudit(store),
  };
}

/** Days since the file's `updated` date, or null when it has none. */
export const ageInDays = (updated: string | undefined, today: string): number | null =>
  updated ? daysBetween(updated, today) : null;
