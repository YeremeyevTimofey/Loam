import { z } from 'zod';
import { AUTOMATIONS, FILE, FREQUENCIES } from './constants';
import { CONTEXT_FILE, contextFileMd, contextLines, ContextEntryInput, type ContextKind } from './context';
import { DEFAULT_INTERVIEW, defaultInterviewJson, parseInterview } from './interview';
import { loadProcess, loadState } from './kb';
import { newPlan, mergePlans, readOrNull, stage, type Plan } from './plan';
import { planUpdateProfile } from './ops-process';
import { buildProcess, emptyCorrections, parseCorrections, setSection, type ProcessDoc, type SectionKey } from './process';
import { isSlug, slugify } from './paths';
import { annualHours } from './scoring';
import type { ProcessFrontmatter } from './schema';
import { exampleInfo, generateProcessSkill, sortExamples } from './skillgen';
import { ENTITIES_TEMPLATE, entitiesMd, GLOSSARY_TEMPLATE, glossaryMd } from './templates';
import type { KbStore } from './types';
import { walk } from './walk';

export const InterviewProcessInput = z.object({
  title: z.string().min(1).describe('Name of the process, e.g. "Weekly client report"'),
  slug: z.string().optional().describe('Folder name: lowercase latin letters, digits, hyphens. Derived from the title if omitted'),
  frequency: z.enum(FREQUENCIES),
  minutes_per_run: z.number().positive().describe('Minutes one run takes the user today'),
  automation: z.enum(AUTOMATIONS),
  runs_per_year: z.number().nonnegative().optional().describe('Only for ad-hoc: how many times a year it happens'),
  inputs: z.array(z.string()).default([]),
  output: z.string().default('document'),
  what: z.string().default('').describe('What we do: two or three sentences'),
  steps: z.array(z.string()).default([]),
  good: z.string().default('').describe('What a good result looks like'),
  constraints: z.string().default(''),
  takes: z.string().default('').describe('What automating it takes: access, human review, risk of error'),
});
export type InterviewProcessInput = z.infer<typeof InterviewProcessInput>;

export const InterviewInput = z.object({
  profile: z.object({
    name: z.string().default(''),
    role: z.string().default(''),
    company: z.string().default(''),
    industry: z.string().default(''),
    tools: z.array(z.string()).default([]),
    context: z.string().optional().describe('Working context: who they deal with, how the work is organised'),
    style: z.string().optional().describe('Style and tone they use'),
    quality: z.string().optional().describe('What good work looks like to them'),
  }),
  processes: z.array(InterviewProcessInput).default([]),
  people: z.array(ContextEntryInput).default([]).describe('Colleagues, managers and client contacts the user named: name, how they relate to the user (kind), and what to keep in mind (notes)'),
  goals: z.array(ContextEntryInput).default([]).describe('What the user is working towards or must get done, with the date if they gave one (in notes)'),
  metrics: z.array(ContextEntryInput).default([]).describe('Numbers the user is measured on or watches: name, and the target and where to find it (in notes)'),
  glossary: z.array(z.object({ term: z.string(), meaning: z.string() })).default([]),
  entities: z.array(z.object({ name: z.string(), kind: z.string().default('other'), notes: z.string().default('') })).default([]).describe('Clients, projects and systems that come up by name (not people: those go in people)'),
  stage: z.string().optional().describe('Last interview stage completed, so the interview can be resumed'),
  complete: z.boolean().default(false).describe('True on the final save, after the user confirmed the process map'),
});
export type InterviewInput = z.infer<typeof InterviewInput>;

export interface SavedProcess {
  slug: string;
  title: string;
  created: boolean;
  hours: number | null;
  automation: ProcessFrontmatter['automation'];
}

const ITEM = /^- \*\*(.+?)\*\*/;

/** Adds items to a glossary/entities file without losing anything the user wrote there. */
function mergeList(existing: string | null, template: string, items: string[], keyOf: (line: string) => string, render: () => string): string {
  if (existing === null || existing === template) return render();
  const have = new Set(existing.split('\n').map((l) => ITEM.exec(l)?.[1]?.toLowerCase()).filter(Boolean));
  const fresh = items.filter((line) => !have.has(keyOf(line).toLowerCase()));
  if (fresh.length === 0) return existing;
  const base = existing.replace(/\n*_Not filled in yet\._\n*/g, '\n').trimEnd();
  return `${base}\n${fresh.join('\n')}\n`;
}

export async function planSaveInterview(
  store: KbStore,
  rawInput: InterviewInput,
  today: string,
): Promise<{ plan: Plan; saved: SavedProcess[] }> {
  const input = InterviewInput.parse(rawInput);
  const plans: Plan[] = [];
  const saved: SavedProcess[] = [];
  const used = new Set<string>();

  // Profile (+ owner line in AGENTS.md)
  const p = input.profile;
  plans.push(
    await planUpdateProfile(
      store,
      {
        ...(p.name ? { name: p.name } : {}),
        ...(p.role ? { role: p.role } : {}),
        ...(p.company ? { company: p.company } : {}),
        ...(p.industry ? { industry: p.industry } : {}),
        ...(p.tools.length ? { tools: p.tools } : {}),
        ...(p.context ? { context: p.context } : {}),
        ...(p.style ? { style: p.style } : {}),
        ...(p.quality ? { quality: p.quality } : {}),
      },
      today,
    ),
  );

  // Processes
  const processPlan = newPlan();
  for (const item of input.processes) {
    let slug = item.slug && isSlug(item.slug) ? item.slug : slugify(item.title) || 'process';
    const base = slug;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);

    const path = `processes/${slug}/process.md`;
    const exists = await store.exists(path);
    let doc: ProcessDoc;
    if (exists) {
      const old = await loadProcess(store, slug, today);
      doc = { ...old.doc, fm: { ...old.fm } };
    } else {
      doc = {
        fm: { type: 'process', slug, title: item.title, frequency: item.frequency, minutes_per_run: item.minutes_per_run, automation: item.automation, inputs: [], output: 'document', runs: 0, corrections: 0, updated: today },
        sections: [],
      };
    }
    doc.fm = {
      ...doc.fm,
      title: item.title,
      frequency: item.frequency,
      minutes_per_run: item.minutes_per_run,
      automation: item.automation,
      inputs: item.inputs.length ? item.inputs : doc.fm.inputs,
      output: item.output || doc.fm.output,
      updated: today,
    };
    if (item.frequency === 'ad-hoc' && item.runs_per_year !== undefined) doc.fm.runs_per_year = item.runs_per_year;
    if (item.frequency !== 'ad-hoc') delete doc.fm.runs_per_year;

    const text: Record<SectionKey, string> = {
      what: item.what,
      steps: item.steps.map((s, i) => `${i + 1}. ${s.replace(/^\s*\d+[.)]\s*/, '')}`).join('\n'),
      good: item.good,
      constraints: item.constraints,
      takes: item.takes,
    };
    for (const key of Object.keys(text) as SectionKey[]) {
      if (text[key].trim()) doc = setSection(doc, key, text[key]);
    }

    await stage(processPlan, store, path, buildProcess(doc), `${exists ? 'Update' : 'Add'} process "${item.title}"`);
    const corrPath = `processes/${slug}/corrections.md`;
    const corrExisting = await readOrNull(store, corrPath);
    if (corrExisting === null) await stage(processPlan, store, corrPath, emptyCorrections(item.title));
    const examples = sortExamples((await walk(store, `processes/${slug}/examples`)).map((f) => exampleInfo(f.path)));
    await stage(
      processPlan,
      store,
      `processes/${slug}/SKILL.md`,
      generateProcessSkill({ doc, corrections: parseCorrections(corrExisting ?? ''), examples, today }),
      `Build the skill for "${item.title}"`,
    );
    saved.push({ slug, title: item.title, created: !exists, hours: annualHours(doc.fm), automation: doc.fm.automation });
    if (item.frequency === 'ad-hoc' && item.runs_per_year === undefined) {
      processPlan.notes.push(`"${item.title}" is ad-hoc without runs_per_year, so its hours per year are unknown.`);
    }
  }
  plans.push(processPlan);

  // Glossary and entities
  const glossaryPlan = newPlan();
  if (input.glossary.length) {
    const lines = input.glossary.map((g) => `- **${g.term.trim()}** — ${g.meaning.trim().replace(/\s+/g, ' ')}`);
    const next = mergeList(await readOrNull(store, FILE.glossary), GLOSSARY_TEMPLATE, lines, (l) => ITEM.exec(l)?.[1] ?? l, () => glossaryMd(input.glossary));
    await stage(glossaryPlan, store, FILE.glossary, next, 'Add glossary terms');
  }
  if (input.entities.length) {
    const lines = input.entities.map((e) => `- **${e.name.trim()}** (${e.kind.trim() || 'other'}) — ${e.notes.trim().replace(/\s+/g, ' ')}`);
    const next = mergeList(await readOrNull(store, FILE.entities), ENTITIES_TEMPLATE, lines, (l) => ITEM.exec(l)?.[1] ?? l, () => entitiesMd(input.entities));
    await stage(glossaryPlan, store, FILE.entities, next, 'Add clients, projects and systems');
  }
  // People, goals and metrics: one line each in their own file, which is created by the first entry
  const contextPlan = newPlan();
  const stageContext = async (kind: ContextKind, items: ContextEntryInput[], reason: string) => {
    if (items.length === 0) return;
    const lines = contextLines(kind, items);
    const next = mergeList(await readOrNull(store, CONTEXT_FILE[kind]), '', lines, (l) => ITEM.exec(l)?.[1] ?? l, () => contextFileMd(kind, lines));
    await stage(contextPlan, store, CONTEXT_FILE[kind], next, reason);
  };
  await stageContext('people', input.people, 'Add the people around the user');
  await stageContext('goals', input.goals, 'Add goals');
  await stageContext('metrics', input.metrics, 'Add metrics');
  plans.push(glossaryPlan, contextPlan);

  // Progress
  const statePlan = newPlan();
  const state = (await loadState(store)) ?? { schema_version: 1, created: today, interview: { status: 'not_started' as const } };
  const script = await readOrNull(store, FILE.interview);
  let scriptVersion: number = DEFAULT_INTERVIEW.version;
  try {
    if (script) scriptVersion = parseInterview(script).version;
  } catch {
    /* keep default */
  }
  state.interview = {
    status: input.complete ? 'complete' : 'in_progress',
    stage: input.stage ?? (input.complete ? 'summary' : state.interview.stage),
    script_version: scriptVersion,
    updated: today,
  };
  await stage(statePlan, store, FILE.state, `${JSON.stringify(state, null, 2)}\n`);
  plans.push(statePlan);

  return { plan: mergePlans(...plans), saved };
}

/** Replaces .loam/interview.json with the version bundled with the app. */
export async function planUpdateInterviewScript(store: KbStore): Promise<Plan> {
  const plan = newPlan();
  await stage(plan, store, FILE.interview, defaultInterviewJson(), 'Update the interview script');
  return plan;
}

