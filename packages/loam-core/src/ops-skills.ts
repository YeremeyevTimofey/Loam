import { makeAuditEntry } from './audit';
import { FILE } from './constants';
import { normalizeText, parseDoc } from './frontmatter';
import { newPlan, readOrNull, stage, type Plan } from './plan';
import { describeIssues, ImportedSkillInput, ReviewVerdict, SkillFrontmatter } from './schema';
import { scanSkill, type ScanResult } from './scanner';
import {
  buildSkill,
  expectedAgentFiles,
  listAgentSkillFiles,
  loadSkills,
  parseSkill,
} from './skills';
import { slugify } from './paths';
import { LoamError, type KbStore } from './types';

export interface ImportResult {
  accepted: boolean;
  /** Folder name the skill would get; null when the file could not even be read. */
  name: string | null;
  scan: ScanResult | null;
  /** A problem that is not a security finding: unreadable header, name already taken. */
  error: string | null;
  /** What the preview shows. */
  preview: { description: string; license: string | null; capabilities: string[]; body: string; words: number } | null;
  /** Writing the skill (if accepted) and the audit entry. Always has an audit entry. */
  plan: Plan;
}

const wordsOf = (t: string) => (t.trim() === '' ? 0 : t.trim().split(/\s+/).length);

/**
 * Reads and scans a stranger's skill. Nothing is written until the returned plan is applied.
 * A red scan result means the plan only carries the "reject" audit entry: there is no override.
 */
export async function planImportSkill(
  store: KbStore,
  input: { content: string; origin: 'file' | 'paste'; today: string },
): Promise<ImportResult> {
  const plan = newPlan();
  const text = normalizeText(input.content);
  const result: ImportResult = { accepted: false, name: null, scan: null, error: null, preview: null, plan };
  const reject = async (scan: ScanResult | null, detail: string) => {
    plan.audit.push(
      await makeAuditEntry({ action: 'reject', skill: result.name ?? '(unreadable)', source: 'imported', scanner: scan ? 'fail' : null, verdict: null, content: input.content, detail }),
    );
    return result;
  };

  let parsed;
  try {
    parsed = parseDoc(text);
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'The file header could not be read.';
    return reject(null, result.error);
  }
  if (!parsed.hasFrontmatter) {
    result.error = 'This file has no header. A skill starts with a block between two --- lines that gives its name and description.';
    return reject(null, result.error);
  }
  const fields = ImportedSkillInput.safeParse(parsed.data);
  if (!fields.success) {
    result.error = `The skill header is not valid: ${describeIssues(fields.error)}.`;
    return reject(null, result.error);
  }
  const name = slugify(fields.data.name);
  if (!name) {
    result.error = 'The skill name has no usable letters or digits.';
    return reject(null, result.error);
  }
  result.name = name;
  const capabilities = fields.data.capabilities.length ? fields.data.capabilities : ['read'];
  result.preview = {
    description: fields.data.description,
    license: fields.data.license ?? null,
    capabilities,
    body: parsed.body,
    words: wordsOf(parsed.body),
  };

  const profileText = (await readOrNull(store, FILE.profile)) ?? undefined;
  const scan = scanSkill({
    text,
    body: parsed.body,
    description: fields.data.description,
    license: fields.data.license,
    capabilities,
    source: 'imported',
    frontmatterKeys: Object.keys(parsed.data),
    profileText,
  });
  result.scan = scan;
  if (scan.verdict === 'fail') return reject(scan, scan.red.map((f) => f.category).join(', '));

  if ((await store.exists(`skills/${name}/SKILL.md`)) || (await store.exists(`processes/${name}/process.md`))) {
    result.error = `A skill or process called "${name}" already exists. Rename the skill in its header and try again.`;
    return reject(scan, 'name already taken');
  }

  const fm: SkillFrontmatter = {
    name,
    description: fields.data.description,
    source: 'imported',
    capabilities: ['read'],
    license: fields.data.license,
    origin: input.origin,
    imported_at: input.today,
    reviewed: false,
    scanner: scan.verdict === 'pass' ? 'pass' : 'warn',
  };
  await stage(plan, store, `skills/${name}/SKILL.md`, buildSkill(fm, parsed.body), `Add the skill "${name}"`);
  plan.audit.push(
    await makeAuditEntry({ action: 'import', skill: name, source: 'imported', scanner: fm.scanner ?? 'pass', verdict: null, content: input.content, detail: `origin: ${input.origin}` }),
  );
  result.accepted = true;
  return result;
}

/** Adds one of the bundled starter skills. It still goes through the scanner as a safety net. */
export async function planAddStarterSkill(
  store: KbStore,
  starter: { name: string; text: string },
  today: string,
): Promise<Plan> {
  const plan = newPlan();
  const skill = parseSkill(`starter/${starter.name}.md`, starter.text, 'library');
  if (skill.fm.source !== 'starter') throw new LoamError(`"${starter.name}" is not a starter skill.`);
  if (await store.exists(`skills/${skill.name}/SKILL.md`)) throw new LoamError(`"${skill.name}" is already in your skills.`);
  const scan = scanSkill({ text: starter.text, body: skill.body, description: skill.fm.description, license: skill.fm.license, capabilities: skill.fm.capabilities, source: 'starter', frontmatterKeys: Object.keys(parseDoc(starter.text).data) });
  if (scan.verdict === 'fail') throw new LoamError(`The starter skill "${starter.name}" failed the safety scan. This is a bug in Loam.`);
  const fm: SkillFrontmatter = { ...skill.fm, origin: 'bundled', imported_at: today, reviewed: true, scanner: 'pass' };
  const text = buildSkill(fm, skill.body);
  await stage(plan, store, `skills/${skill.name}/SKILL.md`, text, `Add the starter skill "${skill.name}"`);
  plan.audit.push(await makeAuditEntry({ action: 'import', skill: skill.name, source: 'starter', scanner: 'pass', verdict: null, content: text, detail: 'origin: bundled' }));
  return plan;
}

export async function planDeleteSkill(store: KbStore, name: string): Promise<Plan> {
  const path = `skills/${name}/SKILL.md`;
  const raw = await readOrNull(store, path);
  if (raw === null) throw new LoamError(`There is no skill called "${name}" in your library. Skills built from processes are rebuilt from the process itself.`);
  const plan = newPlan();
  await stage(plan, store, path, null, `Delete the skill "${name}"`);
  let source = 'unknown';
  try {
    source = parseSkill(path, raw, 'library').fm.source;
  } catch {
    /* damaged file: still deletable */
  }
  plan.audit.push(await makeAuditEntry({ action: 'delete', skill: name, source, scanner: null, verdict: null, content: raw }));
  return plan;
}

/**
 * Records what the user's agent concluded about an imported skill.
 *
 * IMPORTANT: the verdict is information for the user. It must never be used as an access check
 * and it never changes `capabilities`. Even "safe" grants nothing; the rules in AGENTS.md and the
 * scanner decide what a skill may do. Do not build logic on `review_verdict` or `reviewed`.
 */
export async function planSetSkillReview(
  store: KbStore,
  input: { name: string; verdict: string; note: string; today: string },
): Promise<Plan> {
  const verdict = ReviewVerdict.safeParse(input.verdict);
  if (!verdict.success) throw new LoamError('The verdict must be one of: safe, suspicious, unsafe.');
  const path = `skills/${input.name}/SKILL.md`;
  const raw = await readOrNull(store, path);
  if (raw === null) throw new LoamError(`There is no imported skill called "${input.name}".`);
  const skill = parseSkill(path, raw, 'library');
  if (skill.fm.source !== 'imported') throw new LoamError(`"${input.name}" is not an imported skill, so it has no review.`);
  const note = input.note.replace(/\s+/g, ' ').trim().slice(0, 300);
  const fm: SkillFrontmatter = { ...skill.fm, reviewed: true, review_verdict: verdict.data, review_note: note };
  const plan = newPlan();
  await stage(plan, store, path, buildSkill(fm, skill.body), `Record the review of "${input.name}"`);
  plan.audit.push(await makeAuditEntry({ action: 'review', skill: input.name, source: 'imported', scanner: skill.fm.scanner ?? null, verdict: verdict.data, content: raw, detail: note }));
  return plan;
}

/**
 * Rebuilds the Loam-owned part of the agent skill folders (.claude/skills and .agents/skills) from skills/ and
 * processes/. Folders without the loam- prefix are never touched.
 */
export async function planSyncAgentSkills(store: KbStore): Promise<Plan> {
  const plan = newPlan();
  const { skills } = await loadSkills(store);
  const expected = expectedAgentFiles(skills);
  for (const [path, text] of expected) await stage(plan, store, path, text);
  for (const path of await listAgentSkillFiles(store)) {
    if (!expected.has(path)) await stage(plan, store, path, null, 'Remove a copy of a skill that no longer exists');
  }
  const n = plan.changes.length;
  plan.notes.push(n === 0 ? 'Agent skills are already up to date.' : `${n} file${n === 1 ? '' : 's'} updated in .claude/skills and .agents/skills.`);
  if (n > 0) {
    plan.audit.push(await makeAuditEntry({ action: 'sync', skill: '*', source: 'sync', scanner: null, verdict: null, content: [...expected.values()].join('\n'), detail: `${n} file${n === 1 ? '' : 's'} updated` }));
  }
  return plan;
}
