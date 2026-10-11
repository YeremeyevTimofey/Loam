import { RUNS_PER_YEAR, STABLE_CLEAN_RUNS, STABLE_MIN_RUNS } from './constants';
import type { ProcessFrontmatter } from './schema';
import type { Correction } from './process';

/** How many times a year the process happens; null when unknown (ad-hoc without an estimate). */
export function runsPerYear(fm: Pick<ProcessFrontmatter, 'frequency' | 'runs_per_year'>): number | null {
  if (fm.frequency === 'ad-hoc') return fm.runs_per_year ?? null;
  return RUNS_PER_YEAR[fm.frequency];
}

/** minutes_per_run × runs_per_year / 60, one decimal. Null when the frequency is unknown. */
export function annualHours(
  fm: Pick<ProcessFrontmatter, 'frequency' | 'runs_per_year' | 'minutes_per_run'>,
): number | null {
  const runs = runsPerYear(fm);
  if (runs === null) return null;
  return Math.round(((fm.minutes_per_run * runs) / 60) * 10) / 10;
}

/**
 * `stable`: more than 5 runs and none of the last 3 runs needed a correction.
 * A correction remembers how many runs had happened when it was recorded (`run`).
 */
export function isStable(fm: Pick<ProcessFrontmatter, 'runs'>, corrections: Correction[]): boolean {
  if (fm.runs <= STABLE_MIN_RUNS) return false;
  const since = fm.runs - STABLE_CLEAN_RUNS;
  return !corrections.some((c) => c.run !== null && c.run > since);
}

export function lastCorrectionDate(corrections: Correction[]): string | null {
  return corrections.reduce<string | null>((latest, c) => (latest === null || c.date > latest ? c.date : latest), null);
}

/** Processes worth automating first: `ready`, most hours per year first. Unknown hours go last. */
export function priorityOrder<T extends { fm: ProcessFrontmatter; hours: number | null }>(items: T[]): T[] {
  const rank = (t: T) => (t.fm.automation === 'ready' ? 0 : t.fm.automation === 'needs-access' ? 1 : 2);
  return [...items].sort((a, b) => rank(a) - rank(b) || (b.hours ?? -1) - (a.hours ?? -1));
}

export const AUTOMATION_LABEL = {
  ready: 'Ready to automate',
  'needs-access': 'Needs access',
  'manual-only': 'Manual only',
} as const;

export const FREQUENCY_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', 'ad-hoc': 'Ad hoc' } as const;
