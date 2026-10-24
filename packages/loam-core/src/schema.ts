import { z } from 'zod';
import { AUTOMATIONS, CAPABILITIES, FREQUENCIES, SCHEMA_VERSION, SKILL_SOURCES } from './constants';
import { SLUG_RE } from './paths';

export const Slug = z
  .string()
  .max(64)
  .regex(SLUG_RE, 'must be lowercase letters, numbers and hyphens (e.g. weekly-client-report)');

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-10-11');

/** YAML turns 2026-10-11 into a Date; parseDoc already converts it back, this accepts either. */
const DateLike = z.preprocess((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v), IsoDate);

export const ProcessFrontmatter = z.object({
  type: z.literal('process'),
  slug: Slug,
  title: z.string().min(1),
  frequency: z.enum(FREQUENCIES),
  minutes_per_run: z.number().nonnegative(),
  automation: z.enum(AUTOMATIONS),
  inputs: z.array(z.string()).default([]),
  output: z.string().default('document'),
  runs: z.number().int().nonnegative().default(0),
  corrections: z.number().int().nonnegative().default(0),
  /** Only meaningful for `ad-hoc`: the user's own estimate of how often it happens. */
  runs_per_year: z.number().nonnegative().optional(),
  updated: DateLike,
});
export type ProcessFrontmatter = z.infer<typeof ProcessFrontmatter>;

export const ProfileFrontmatter = z.object({
  type: z.literal('profile'),
  name: z.string().default(''),
  role: z.string().default(''),
  company: z.string().default(''),
  industry: z.string().default(''),
  tools: z.array(z.string()).default([]),
  updated: DateLike,
});
export type ProfileFrontmatter = z.infer<typeof ProfileFrontmatter>;

export const Capability = z.enum(CAPABILITIES);
export type Capability = z.infer<typeof Capability>;
export const SkillSource = z.enum(SKILL_SOURCES);
export type SkillSource = z.infer<typeof SkillSource>;
export const ReviewVerdict = z.enum(['safe', 'suspicious', 'unsafe']);
export type ReviewVerdict = z.infer<typeof ReviewVerdict>;

/** The stored frontmatter of every SKILL.md the product writes (§14.2). */
export const SkillFrontmatter = z.object({
  name: Slug,
  description: z.string(),
  source: SkillSource,
  capabilities: z.array(Capability).default(['read']),
  license: z.string().optional(),
  origin: z.enum(['bundled', 'file', 'paste']).optional(),
  imported_at: DateLike.optional(),
  reviewed: z.boolean().default(false),
  review_note: z.string().optional(),
  /** What the user's agent concluded. Informational only: it never grants anything (see §14.5). */
  review_verdict: ReviewVerdict.optional(),
  scanner: z.enum(['pass', 'warn']).optional(),
  updated: DateLike.optional(),
});
export type SkillFrontmatter = z.infer<typeof SkillFrontmatter>;

/**
 * What we read from a stranger's skill. Only name, description, license and capabilities are
 * taken at face value; `source`, `reviewed`, `scanner` etc. in the file are ignored and overwritten.
 */
export const ImportedSkillInput = z.object({
  name: z.string().min(1, 'is missing'),
  description: z.string().default(''),
  license: z.string().optional(),
  capabilities: z
    .preprocess((v) => (typeof v === 'string' ? v.split(/[,\s]+/).filter(Boolean) : v), z.array(z.string()))
    .default(['read']),
});
export type ImportedSkillInput = z.infer<typeof ImportedSkillInput>;

export const InterviewScript = z.object({
  version: z.number().int().positive(),
  title: z.string(),
  minutes: z.string(),
  rules: z.array(z.string()).min(1),
  branches: z
    .array(
      z.object({
        id: Slug,
        label: z.string(),
        recognise: z.string(),
        questions: z.array(z.string()).min(1),
      }),
    )
    // Scripts from before version 2 have branches (questions by kind of role); the current script has none.
    .default([]),
  stages: z
    .array(
      z.object({
        id: Slug,
        title: z.string(),
        goal: z.string(),
        questions: z.array(z.string()).default([]),
        /** When true the agent adds the questions of the matching branch to this stage. */
        uses_branch: z.boolean().default(false),
        instructions: z.array(z.string()).default([]),
      }),
    )
    .min(1),
});
export type InterviewScript = z.infer<typeof InterviewScript>;

export const KbState = z.object({
  schema_version: z.number().int(),
  created: IsoDate,
  interview: z
    .object({
      status: z.enum(['not_started', 'in_progress', 'complete']).default('not_started'),
      stage: z.string().optional(),
      script_version: z.number().int().optional(),
      updated: IsoDate.optional(),
    })
    .default({ status: 'not_started' }),
});
export type KbState = z.infer<typeof KbState>;

export const AuditEntry = z.object({
  time: z.string(),
  action: z.enum(['import', 'reject', 'review', 'delete', 'sync']),
  skill: z.string(),
  source: z.string(),
  scanner: z.enum(['pass', 'warn', 'fail']).nullable(),
  verdict: z.string().nullable().default(null),
  hash: z.string(),
  detail: z.string().optional(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

export const AuditLog = z.object({ version: z.literal(1), entries: z.array(AuditEntry) });
export type AuditLog = z.infer<typeof AuditLog>;

export const newState = (today: string): KbState => ({
  schema_version: SCHEMA_VERSION,
  created: today,
  interview: { status: 'not_started' },
});

/** "role: is missing" style summary of a failed parse, for people and agents. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => {
      const where = i.path.length ? `"${i.path.join('.')}"` : 'the file';
      return `${where} ${i.message}`;
    })
    .join('; ');
}
