import { BUDGET_WORDS, FILE, NO_INVENTING, PLACEHOLDER, PRICE_PER_MTOK_USD, STALE_DAYS } from './constants';
import { CONTEXT_FILE, CONTEXT_KINDS, CONTEXT_WORD_BUDGET, MAX_ENTRY_WORDS } from './context';
import { daysBetween } from './dates';
import { countWords, parseDoc } from './frontmatter';
import { loadKb, type KbSnapshot, type ProcessInfo } from './kb';
import { newPlan, stage, type Plan } from './plan';
import { buildProcess } from './process';
import { isWeakDescription } from './scanner';
import { expectedProtocol } from './ops-protocol';
import { runsPerYear } from './scoring';
import {
  expectedAgentFiles,
  listAgentSkillFiles,
  renderSkillList,
  type Skill,
} from './skills';
import { countTokens } from './tokens';
import type { KbStore } from './types';
import { walk } from './walk';

export type LintRule =
  | 'cost'
  | 'budget'
  | 'duplicates'
  | 'contradictions'
  | 'stale'
  | 'placeholders'
  | 'no-examples'
  | 'unreviewed'
  | 'no-description'
  | 'layout'
  | 'unreadable';
export type Severity = 'high' | 'medium' | 'low';

export interface LintFinding {
  rule: LintRule;
  severity: Severity;
  /** Plain-language headline. */
  title: string;
  /** What it means and what to do. */
  detail: string;
  files: string[];
  /** A deterministic fix the app can offer. The change is always shown as a diff first. */
  fix?: { kind: 'sync' | 'dedupe' | 'touch' | 'protocol'; label: string; slug?: string };
  /** Where to go to fix it by hand. */
  goto?: { screen: 'process' | 'skills'; slug?: string; label: string };
}

export interface LintCheck {
  rule: Exclude<LintRule, 'unreadable'>;
  name: string;
  status: 'ok' | 'attention';
  summary: string;
}

export interface SavingItem {
  label: string;
  tokens: number;
}

export interface LintReport {
  generated: string;
  files: { path: string; tokens: number; words: number }[];
  totalTokens: number;
  typical: { files: string[]; tokens: number; runsPerMonth: number | null; monthlyUsd: number | null };
  checks: LintCheck[];
  findings: LintFinding[];
  savings: {
    beforeTokens: number;
    afterTokens: number;
    percent: number;
    typicalBefore: number;
    typicalAfter: number;
    typicalPercent: number;
    items: SavingItem[];
  };
}

type Kind = 'agents' | 'profile' | 'process' | 'skill' | 'generated-skill' | 'corrections' | 'context' | 'other';

function kindOf(path: string, generated: Set<string>): Kind {
  if (path === FILE.agents) return 'agents';
  if (path === FILE.profile) return 'profile';
  if (/^processes\/[^/]+\/process\.md$/.test(path)) return 'process';
  if (/^processes\/[^/]+\/corrections\.md$/.test(path)) return 'corrections';
  if (/^(skills|processes)\/[^/]+\/SKILL\.md$/.test(path)) return generated.has(path) ? 'generated-skill' : 'skill';
  if (/^context\/[^/]+\.md$/.test(path)) return 'context';
  return 'other';
}

const BUDGET: Partial<Record<Kind, number>> = {
  agents: BUDGET_WORDS.agents,
  profile: BUDGET_WORDS.profile,
  process: BUDGET_WORDS.process,
  skill: BUDGET_WORDS.skill,
  'generated-skill': BUDGET_WORDS.skill,
};

const BUDGET_HINT: Partial<Record<Kind, string>> = {
  profile: 'Keep only your role, tools and tone here. Move details about people, clients, projects, goals and metrics to the files in context/.',
  process: 'Keep the description short. Move long reference material into a file in context/ and mention it by name.',
  skill: 'Cut repeated rules and long examples. Move reference text into context/ and point to it.',
  context: `Keep one short line per entry (up to ${MAX_ENTRY_WORDS} words) and remove entries that no longer matter.`,
  'generated-skill': 'Delete older corrections that no longer apply, then rebuild the skill.',
  agents: 'AGENTS.md is written by Loam. Restore it from the app instead of editing it by hand.',
};

const n = (x: number) => x.toLocaleString('en-US');

/** Word limit of the people, entities, goals, metrics and glossary files. */
const contextLimit = (path: string): number | undefined => {
  const kind = CONTEXT_KINDS.find((k) => CONTEXT_FILE[k] === path);
  return kind ? CONTEXT_WORD_BUDGET[kind] : undefined;
};

// ---------------------------------------------------------------- paragraphs

interface Para {
  raw: string;
  norm: string;
  words: number;
}

const MIN_DUP_WORDS = 12;

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

function bodyOf(text: string): string {
  try {
    return parseDoc(text).body;
  } catch {
    return text;
  }
}

function paragraphsOf(text: string): Para[] {
  return bodyOf(text)
    .split(/\n{2,}/)
    .map((raw) => raw.trim())
    .filter((raw) => raw && !raw.startsWith('#') && !raw.includes(PLACEHOLDER))
    .map((raw) => ({ raw, norm: normalise(raw), words: countWords(raw) }))
    .filter((p) => p.words >= MIN_DUP_WORDS && p.norm !== normalise(NO_INVENTING));
}

const DUP_ORDER: Kind[] = ['profile', 'process', 'context', 'corrections', 'skill'];

interface DupGroup {
  norm: string;
  raw: string;
  occurrences: { path: string; raw: string }[];
}

function findDuplicates(files: Map<string, string>, kinds: Map<string, Kind>): DupGroup[] {
  const groups = new Map<string, DupGroup>();
  const ordered = [...files.keys()]
    .filter((p) => DUP_ORDER.includes(kinds.get(p) ?? 'other'))
    .sort((a, b) => DUP_ORDER.indexOf(kinds.get(a)!) - DUP_ORDER.indexOf(kinds.get(b)!) || a.localeCompare(b));
  for (const path of ordered) {
    for (const para of paragraphsOf(files.get(path) ?? '')) {
      const g = groups.get(para.norm) ?? { norm: para.norm, raw: para.raw, occurrences: [] };
      g.occurrences.push({ path, raw: para.raw });
      groups.set(para.norm, g);
    }
  }
  return [...groups.values()].filter((g) => g.occurrences.length > 1);
}

/** The text of a file with its repeated paragraphs (all but the first occurrence in the group) removed. */
function withoutDuplicates(path: string, text: string, groups: DupGroup[]): string {
  let out = text;
  for (const g of groups) {
    const [first, ...rest] = g.occurrences;
    for (const occ of rest) {
      if (occ.path !== path) continue;
      // Same file twice: keep the first block, drop later ones.
      const sameFile = first?.path === path;
      let idx = out.indexOf(occ.raw);
      if (sameFile) idx = out.indexOf(occ.raw, idx + occ.raw.length);
      if (idx >= 0) out = `${out.slice(0, idx)}${out.slice(idx + occ.raw.length)}`;
    }
  }
  return out.replace(/\n{3,}/g, '\n\n');
}

// ---------------------------------------------------------------- contradictions

const KV = /^\s*(?:[-+]\s+)?([A-Za-z][A-Za-z ]{2,28}):\s+(.{1,80})$/;
const IGNORED_KEYS = new Set([
  'was', 'should be', 'rule', 'example', 'note', 'tip', 'step', 'input', 'output', 'why', 'when', 'goal', 'name',
  'title', 'description', 'source', 'license', 'origin', 'status', 'type', 'context', 'result', 'format', 'subject',
  'notice', 'important', 'warning', 'question', 'answer', 'steps', 'inputs', 'outputs', 'owner', 'to', 'from',
]);

function keyValues(text: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of bodyOf(text).split('\n')) {
    const m = KV.exec(line.replace(/[*_`]/g, ''));
    if (!m || !m[1] || !m[2]) continue;
    const key = m[1].trim().toLowerCase();
    const value = m[2].trim().toLowerCase().replace(/[.;,]+$/, '');
    if (IGNORED_KEYS.has(key) || key.split(' ').length > 4 || countWords(value) > 8) continue;
    if (!result.has(key)) result.set(key, value);
  }
  return result;
}

// ---------------------------------------------------------------- report

export interface LintOptions {
  today: string;
  /** Override the tokenizer (tests). */
  tokens?: (text: string) => number;
}

export async function runLint(store: KbStore, options: LintOptions): Promise<LintReport> {
  const tokens = options.tokens ?? countTokens;
  const today = options.today;
  const snap = await loadKb(store, today);

  const all = await walk(store);
  const files = new Map<string, string>();
  for (const f of all) {
    if (f.path.startsWith('.loam/') || f.path.startsWith('.claude/') || f.path.startsWith('.agents/') || !/\.(md|txt|csv)$/i.test(f.name)) continue;
    files.set(f.path, await store.readFile(f.path));
  }
  const generated = new Set(snap.skills.filter((s) => s.fm.source === 'generated').map((s) => s.path));
  const kinds = new Map<string, Kind>();
  for (const p of files.keys()) kinds.set(p, kindOf(p, generated));
  const CONTEXT: Kind[] = ['agents', 'profile', 'process', 'skill', 'generated-skill', 'corrections', 'context'];
  const contextPaths = [...files.keys()].filter((p) => CONTEXT.includes(kinds.get(p) ?? 'other')).sort();

  const findings: LintFinding[] = [];
  const add = (f: LintFinding) => findings.push(f);

  // Unreadable files are not one of the ten checks, but nobody should miss them.
  for (const bad of [...snap.invalidProcesses, ...snap.invalidSkills]) {
    add({ rule: 'unreadable', severity: 'high', title: `${bad.path} cannot be read`, detail: `${bad.error} Your agent will ignore this file until it is fixed.`, files: [bad.path] });
  }
  if (snap.profileError) {
    add({ rule: 'unreadable', severity: 'high', title: 'profile.md cannot be read', detail: snap.profileError, files: [FILE.profile] });
  }

  // 1. cost ------------------------------------------------------------
  const fileInfo = contextPaths.map((path) => {
    const text = files.get(path) ?? '';
    return { path, tokens: tokens(text), words: countWords(bodyOf(text)) };
  });
  const tokenOf = new Map(fileInfo.map((f) => [f.path, f.tokens]));
  const totalTokens = fileInfo.reduce((sum, f) => sum + f.tokens, 0);

  const skillListTokens = tokens(renderSkillList(snap.skills));
  // A typical task reads AGENTS.md, the skill list, one skill and its example (§11.1), plus profile.md:
  // step 3 of the reading order loads it for tone and background on almost every deliverable.
  const typicalFor = (proc: ProcessInfo | null, lib: Skill | null) => {
    const skillPath = proc ? `processes/${proc.slug}/SKILL.md` : (lib?.path ?? null);
    const example = proc?.examples.find((e) => e.kind === 'good') ?? null;
    const paths = [FILE.agents, FILE.profile, skillPath].filter((p): p is string => Boolean(p) && files.has(p!));
    let total =
      (tokenOf.get(FILE.agents) ?? 0) + skillListTokens + (tokenOf.get(FILE.profile) ?? 0) + (skillPath ? (tokenOf.get(skillPath) ?? 0) : 0);
    if (example) {
      total += tokens(files.get(example.path) ?? '');
      paths.push(example.path);
    }
    return { paths, total };
  };
  let typical = typicalFor(null, null);
  for (const proc of snap.processes) {
    const t = typicalFor(proc, null);
    if (t.total > typical.total) typical = t;
  }
  if (snap.processes.length === 0) {
    for (const lib of snap.skills) {
      const t = typicalFor(null, lib);
      if (t.total > typical.total) typical = t;
    }
  }
  const monthlyRuns = snap.processes.reduce((sum, p) => sum + (runsPerYear(p.fm) ?? 0) / 12, 0);
  const monthlyUsd = monthlyRuns > 0 ? (typical.total * monthlyRuns * PRICE_PER_MTOK_USD) / 1_000_000 : null;

  // 2. budget ----------------------------------------------------------
  for (const f of fileInfo) {
    const kind = kinds.get(f.path)!;
    const limit = BUDGET[kind] ?? contextLimit(f.path);
    if (!limit || f.words <= limit) continue;
    add({
      rule: 'budget',
      severity: f.words > limit * 2 ? 'high' : 'medium',
      title: `${f.path} is ${n(f.words)} words — the limit is ${n(limit)}`,
      detail:
        kind === 'context'
          ? `This file costs ${n(f.tokens)} tokens whenever it is read in full, which is what an agent without Loam does. ${BUDGET_HINT[kind] ?? ''}`.trim()
          : `Your AI reads this file in full, so it costs ${n(f.tokens)} tokens each time and buries what matters. ${BUDGET_HINT[kind] ?? ''}`.trim(),
      files: [f.path],
      goto: kind === 'process' ? { screen: 'process', slug: f.path.split('/')[1], label: 'Open process' } : undefined,
    });
  }

  // 3. duplicates ------------------------------------------------------
  const dupGroups = findDuplicates(files, kinds);
  // Paragraphs that are repeated in the same set of files belong together: one card, not one per paragraph.
  const bySet = new Map<string, { paths: string[]; groups: DupGroup[] }>();
  for (const g of dupGroups) {
    const paths = [...new Set(g.occurrences.map((o) => o.path))];
    const key = paths.join('|');
    const entry = bySet.get(key) ?? { paths, groups: [] };
    entry.groups.push(g);
    bySet.set(key, entry);
  }
  for (const { paths, groups } of bySet.values()) {
    const first = groups[0]!.raw;
    const quote = first.length > 110 ? `${first.slice(0, 107)}…` : first;
    const where = paths.length > 1 ? ` across ${paths.length} files` : ' within one file';
    add({
      rule: 'duplicates',
      severity: 'medium',
      title: groups.length === 1 ? `The same paragraph appears ${groups[0]!.occurrences.length} times${paths.length > 1 ? ` in ${paths.length} files` : ''}` : `${groups.length} paragraphs are repeated${where}`,
      detail: `“${quote}”${groups.length > 1 ? ` and ${groups.length - 1} more.` : ''} Repeated text is paid for every time it is read. Keep it in one place.`,
      files: paths,
      fix: { kind: 'dedupe', label: 'Remove the repeats' },
    });
  }

  // 4. contradictions --------------------------------------------------
  const perFile = new Map<string, Map<string, string>>();
  for (const p of files.keys()) {
    const k = kinds.get(p)!;
    if (k === 'profile' || k === 'process' || k === 'context' || k === 'skill') perFile.set(p, keyValues(files.get(p) ?? ''));
  }
  const byKey = new Map<string, { path: string; value: string }[]>();
  for (const [path, kv] of perFile) for (const [key, value] of kv) byKey.set(key, [...(byKey.get(key) ?? []), { path, value }]);
  let contradictionCount = 0;
  for (const [key, entries] of byKey) {
    const values = new Set(entries.map((e) => e.value));
    const distinctFiles = new Set(entries.map((e) => e.path));
    const overlapping = [...values].some((a) => [...values].some((b) => a !== b && (a.includes(b) || b.includes(a))));
    if (values.size < 2 || distinctFiles.size < 2 || overlapping || contradictionCount >= 8) continue;
    contradictionCount += 1;
    add({
      rule: 'contradictions',
      severity: 'low',
      title: `“${key}” says different things in ${distinctFiles.size} files — please check`,
      detail: entries.map((e) => `${e.path}: ${e.value}`).join(' · ') + '. These may be fine, but your AI will not know which one wins.',
      files: [...distinctFiles],
    });
  }

  // 5. stale -----------------------------------------------------------
  for (const p of snap.processes) {
    if (p.fm.frequency !== 'daily' && p.fm.frequency !== 'weekly') continue;
    const age = daysBetween(p.fm.updated, today);
    if (age <= STALE_DAYS) continue;
    add({
      rule: 'stale',
      severity: 'medium',
      title: `“${p.fm.title}” has not been updated for ${age} days`,
      detail: `It is a ${p.fm.frequency} process, so it is used often, and its date is old: the agent can't tell if it is still current. If it is still accurate, mark it as up to date.`,
      files: [p.path],
      fix: { kind: 'touch', label: 'Mark as up to date', slug: p.slug },
      goto: { screen: 'process', slug: p.slug, label: 'Open process' },
    });
  }

  // 6. placeholders ----------------------------------------------------
  const TEMPLATE = new RegExp(`${PLACEHOLDER}|\\bTODO\\b|\\bTBD\\b|lorem ipsum|\\[describe|<describe|\\{\\{`, 'i');
  for (const path of files.keys()) {
    const k = kinds.get(path)!;
    if (!['profile', 'context', 'process', 'skill'].includes(k)) continue;
    const text = files.get(path) ?? '';
    if (!TEMPLATE.test(bodyOf(text))) continue;
    add({
      rule: 'placeholders',
      severity: path === FILE.profile ? 'medium' : 'low',
      title: `${path} still has template text`,
      detail: 'Part of this file was never filled in. Your AI will read the placeholder as if it were real information. Run the interview, or fill it in.',
      files: [path],
    });
  }

  // 7. no examples: "ready" processes need something to copy. "needs-access" ones are included because an
  //    example can be prepared now, so the process is ready the day access arrives.
  for (const p of snap.processes) {
    if ((p.fm.automation === 'ready' || p.fm.automation === 'needs-access') && p.examples.length === 0) {
      add({
        rule: 'no-examples',
        severity: p.fm.automation === 'ready' ? 'medium' : 'low',
        title: `“${p.fm.title}” has no examples yet`,
        detail:
          p.fm.automation === 'ready'
            ? 'It is marked ready to automate, but your agent has nothing to copy. Add one real finished result and the first run will be much closer to what you want.'
            : 'It still needs access before it can be automated. Add one real finished result now, so it is ready the day access arrives.',
        files: [`processes/${p.slug}/examples/`],
        goto: { screen: 'process', slug: p.slug, label: 'Add an example' },
      });
    }
  }

  // 8. unreviewed imports ----------------------------------------------
  for (const s of snap.skills) {
    if (s.fm.source === 'imported' && !s.fm.reviewed) {
      add({
        rule: 'unreviewed',
        severity: s.fm.scanner === 'warn' ? 'medium' : 'low',
        title: `The imported skill “${s.name}” has not been reviewed`,
        detail: 'It passed the safety scan, but nobody has read it closely. Ask your agent to review it; you will get a verdict you can judge for yourself.',
        files: [s.path],
        goto: { screen: 'skills', label: 'Go to skills' },
      });
    }
  }

  // 9. skills without a description ------------------------------------
  for (const s of snap.skills) {
    if (isWeakDescription(s.fm.description)) {
      add({
        rule: 'no-description',
        severity: 'low',
        title: `The skill “${s.name}” has no real description`,
        detail: 'Your agent reads the description to decide when to use a skill. Without one it will rarely pick it.',
        files: [s.path],
        goto: { screen: 'skills', label: 'Go to skills' },
      });
    }
  }

  // 10. layout ---------------------------------------------------------
  const expected = expectedAgentFiles(snap.skills);
  const actual = await listAgentSkillFiles(store);
  const drift: string[] = [];
  for (const [path, text] of expected) {
    if (!actual.includes(path) || (await store.readFile(path)) !== text) drift.push(path);
  }
  for (const path of actual) if (!expected.has(path)) drift.push(path);
  if (drift.length) {
    add({
      rule: 'layout',
      severity: 'medium',
      title: `Your agent's copy of the skills is out of date (${drift.length} file${drift.length === 1 ? '' : 's'})`,
      detail: 'Agents that read files (Claude Code, Cursor, Codex, Gemini CLI, Copilot) use the copies in .claude/skills and .agents/skills, and they no longer match your skills. Sync them.',
      files: drift,
      fix: { kind: 'sync', label: 'Sync to agents' },
      goto: { screen: 'skills', label: 'Go to skills' },
    });
  }

  const protocol = await expectedProtocol(store);
  if (protocol.length) {
    add({
      rule: 'layout',
      severity: 'medium',
      title: 'The instructions for your agents are out of date',
      detail: `${protocol.map((p) => p.path).join(' and ')} ${protocol.length === 1 ? 'does' : 'do'} not match this version of Loam. Agents like Cursor, Codex and Gemini CLI read these files first, so they may not use your base the way it is meant to be used. Update them (you see the changes first).`,
      files: protocol.map((p) => p.path),
      fix: { kind: 'protocol', label: 'Update the instructions' },
    });
  }

  // checks ---------------------------------------------------------------
  const count = (rule: LintRule) => findings.filter((f) => f.rule === rule).length;
  const check = (rule: LintCheck['rule'], name: string, ok: string, bad: (c: number) => string): LintCheck => {
    const c = count(rule);
    return { rule, name, status: c === 0 ? 'ok' : 'attention', summary: c === 0 ? ok : bad(c) };
  };
  const costHigh = typical.total > 6000;
  const checks: LintCheck[] = [
    {
      rule: 'cost',
      name: 'What a typical task costs',
      status: costHigh ? 'attention' : 'ok',
      summary: `A typical task (instructions, profile, one skill, one example) reads about ${n(typical.total)} tokens${monthlyUsd !== null ? ` — roughly $${monthlyUsd < 0.01 ? '<0.01' : monthlyUsd.toFixed(2)} a month at your usage (at $${PRICE_PER_MTOK_USD} per million tokens)` : ''}.`,
    },
    check('budget', 'File size limits', 'Every file is within its limit.', (c) => `${c} file${c === 1 ? ' is' : 's are'} longer than recommended.`),
    check('duplicates', 'Repeated text', 'No repeated paragraphs.', (c) => `${c} paragraph${c === 1 ? ' is' : 's are'} repeated.`),
    check('contradictions', 'Possible contradictions', 'Nothing contradicts anything else.', (c) => `${c} thing${c === 1 ? '' : 's'} to double-check.`),
    check('stale', 'Out-of-date processes', 'Your frequent processes are up to date.', (c) => `${c} process${c === 1 ? '' : 'es'} not updated for over ${STALE_DAYS} days.`),
    check('placeholders', 'Unfilled templates', 'No template text left behind.', (c) => `${c} file${c === 1 ? ' has' : 's have'} template text.`),
    check('no-examples', 'Processes without examples', 'Every process that can be automated has an example.', (c) => `${c} process${c === 1 ? '' : 'es'} without an example.`),
    check('unreviewed', 'Unreviewed imported skills', 'No unreviewed imports.', (c) => `${c} imported skill${c === 1 ? ' is' : 's are'} unreviewed.`),
    check('no-description', 'Skills without a description', 'Every skill has a description.', (c) => `${c} skill${c === 1 ? ' has' : 's have'} no real description.`),
    check('layout', 'Agent skill copies and instructions', 'The copies in .claude/skills and .agents/skills, and the instructions for your agents, are in step.', (c) => `${c} thing${c === 1 ? '' : 's'} out of step with your skills or instructions.`),
  ];
  if (costHigh) {
    add({
      rule: 'cost',
      severity: 'medium',
      title: `A typical task reads ${n(typical.total)} tokens`,
      detail: 'That is a lot for one task. The biggest files below are the place to start.',
      files: typical.paths,
    });
  }

  // before / after -------------------------------------------------------
  const afterOf = new Map<string, number>();
  const items: SavingItem[] = [];
  let dupSaved = 0;
  let trimSaved = 0;
  let placeholderSaved = 0;
  for (const path of contextPaths) {
    const before = tokenOf.get(path) ?? 0;
    const deduped = withoutDuplicates(path, files.get(path) ?? '', dupGroups);
    const clean = deduped
      .split('\n')
      .filter((l) => !l.includes(PLACEHOLDER))
      .join('\n');
    const dedupedTokens = tokens(deduped);
    let after = tokens(clean);
    dupSaved += Math.max(0, before - dedupedTokens);
    placeholderSaved += Math.max(0, dedupedTokens - after);
    const limit = BUDGET[kinds.get(path)!];
    const words = countWords(bodyOf(clean));
    if (limit && words > limit) {
      const trimmed = Math.round(after * (limit / words));
      trimSaved += after - trimmed;
      after = trimmed;
    }
    afterOf.set(path, after);
  }
  if (dupSaved > 0) items.push({ label: 'Remove repeated paragraphs', tokens: dupSaved });
  if (trimSaved > 0) items.push({ label: 'Bring oversized files down to their limit', tokens: trimSaved });
  if (placeholderSaved > 0) items.push({ label: 'Remove leftover template text', tokens: placeholderSaved });
  const afterTokens = [...afterOf.values()].reduce((a, b) => a + b, 0);
  const typicalAfter = typical.total - typical.paths.reduce((sum, p) => sum + ((tokenOf.get(p) ?? 0) - (afterOf.get(p) ?? tokenOf.get(p) ?? 0)), 0);
  const pct = (before: number, after: number) => (before > 0 ? Math.round(((before - after) / before) * 100) : 0);

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    generated: today,
    files: fileInfo,
    totalTokens,
    typical: { files: typical.paths, tokens: typical.total, runsPerMonth: monthlyRuns > 0 ? Math.round(monthlyRuns * 10) / 10 : null, monthlyUsd },
    checks,
    findings,
    savings: {
      beforeTokens: totalTokens,
      afterTokens,
      percent: pct(totalTokens, afterTokens),
      typicalBefore: typical.total,
      typicalAfter,
      typicalPercent: pct(typical.total, typicalAfter),
      items,
    },
  };
}

// ---------------------------------------------------------------- fixes

/** Removes repeated paragraphs, keeping the first occurrence (profile, then processes, then context, then skills). */
export async function planFixDuplicates(store: KbStore, today: string): Promise<Plan> {
  const snap = await loadKb(store, today);
  const generated = new Set(snap.skills.filter((s) => s.fm.source === 'generated').map((s) => s.path));
  const files = new Map<string, string>();
  const kinds = new Map<string, Kind>();
  for (const f of await walk(store)) {
    if (f.path.startsWith('.loam/') || f.path.startsWith('.claude/') || f.path.startsWith('.agents/') || !/\.md$/i.test(f.name)) continue;
    files.set(f.path, await store.readFile(f.path));
    kinds.set(f.path, kindOf(f.path, generated));
  }
  const groups = findDuplicates(files, kinds);
  const plan = newPlan();
  for (const path of new Set(groups.flatMap((g) => g.occurrences.map((o) => o.path)))) {
    await stage(plan, store, path, withoutDuplicates(path, files.get(path) ?? '', groups), 'Remove repeated paragraphs');
  }
  return plan;
}

/** "Still accurate": sets `updated` to today. */
export async function planTouchProcess(store: KbStore, slug: string, today: string): Promise<Plan> {
  const snap = await loadKb(store, today);
  const proc = snap.processes.find((p) => p.slug === slug);
  const plan = newPlan();
  if (proc) await stage(plan, store, proc.path, buildProcess({ ...proc.doc, fm: { ...proc.fm, updated: today } }), `Mark “${proc.fm.title}” as up to date`);
  return plan;
}

export const LINT_REPORT_PATH = FILE.lintReport;
