export const SCHEMA_VERSION = 1;

/** Word budgets from the spec (§5). Enforced by Context Lint. */
export const BUDGET_WORDS = {
  profile: 400,
  process: 600,
  agents: 500,
  skill: 1000,
} as const;

/** Runs per year for fixed frequencies (§9). Ad-hoc processes carry their own `runs_per_year`. */
export const RUNS_PER_YEAR = { daily: 250, weekly: 50, monthly: 12 } as const;

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'ad-hoc'] as const;
export const AUTOMATIONS = ['ready', 'needs-access', 'manual-only'] as const;
export const CAPABILITIES = ['read', 'write', 'network'] as const;
export const SKILL_SOURCES = ['starter', 'imported', 'generated'] as const;

/** Estimated input price used for the monthly cost line in the health report (USD per million tokens). */
export const PRICE_PER_MTOK_USD = 3;

/** A process is `stable` after more than this many runs ... */
export const STABLE_MIN_RUNS = 5;
/** ... when none of its last this-many runs needed a correction. */
export const STABLE_CLEAN_RUNS = 3;

/** Every N-th new correction the server suggests rebuilding the process skill. */
export const REGENERATE_EVERY = 3;

/** Files older than this (days) are flagged for daily/weekly processes. */
export const STALE_DAYS = 30;

/** Hard cap on imported skill size. Anything bigger is refused before scanning. */
export const MAX_SKILL_BYTES = 100_000;
/** Cap for a single note written by an agent. */
export const MAX_NOTE_BYTES = 200_000;
/** Newest corrections turned into rules in a generated skill. */
export const MAX_SKILL_RULES = 25;

export const DIR = {
  processes: 'processes',
  skills: 'skills',
  context: 'context',
  templates: 'context/templates',
  agentSkills: '.claude/skills',
  agentsSkills: '.agents/skills',
  loam: '.loam',
  history: '.loam/history',
} as const;

export const FILE = {
  readme: 'README.md',
  agents: 'AGENTS.md',
  claude: 'CLAUDE.md',
  gemini: 'GEMINI.md',
  profile: 'profile.md',
  glossary: 'context/glossary.md',
  entities: 'context/entities.md',
  state: '.loam/state.json',
  interview: '.loam/interview.json',
  index: '.loam/index.sqlite',
  lintReport: '.loam/lint-report.json',
  audit: '.loam/skill-audit.json',
} as const;

/**
 * Where agents that read files look for skills. `.claude/skills` is read by Claude Code (and VS Code Copilot, OpenCode);
 * `.agents/skills` is the shared convention read by Codex, Cursor, Gemini CLI, Copilot, Windsurf and others.
 * Loam keeps a copy in both.
 */
export const AGENT_SKILL_ROOTS = ['.claude/skills', '.agents/skills'] as const;

/** Prefix of every folder Loam owns inside the agent skill folders. Other folders there belong to the user. */
export const AGENT_SKILL_PREFIX = 'loam-';

/** Marker left in template files. Context Lint reports any file that still contains it. */
export const PLACEHOLDER = 'Not filled in yet';

/** The sentence every generated skill ends with. Ignored by the duplicate check. */
export const NO_INVENTING =
  'Do not invent facts, names or numbers that are not in the knowledge base or in the user\'s message.';

/** Where people open the app. Used in messages for people and agents. */
export const APP_URL = 'https://loam.dev/app';
