import { MAX_NOTE_BYTES } from './constants';
import { normalizeRelPath } from './paths';
import { LoamError } from './types';

/**
 * What an agent may write with `loam_upsert_note`. Everything that has a dedicated, safer path
 * (skills, examples, corrections, the protocol file, derived copies, Loam's own files) is refused
 * here, so a prompt-injected agent cannot plant a skill or loosen AGENTS.md through a "note".
 */
export function assertAgentNotePath(input: string): string {
  const path = normalizeRelPath(input);
  const refuse = (why: string): never => {
    throw new LoamError(`Cannot write ${path}: ${why}`);
  };
  if (!/\.md$/i.test(path)) refuse('only markdown (.md) notes can be written this way.');
  if (path.startsWith('.loam/') || path.startsWith('.claude/') || path.startsWith('.agents/')) refuse("this folder belongs to Loam and is managed by the app.");
  if (path === 'AGENTS.md' || path === 'CLAUDE.md' || path === 'GEMINI.md') refuse('the agent protocol is managed by Loam. Ask the user to change it in the app.');
  if (path.startsWith('skills/') || /(^|\/)SKILL\.md$/i.test(path)) refuse('skills are added through the safety scan (loam_import_skill) or rebuilt with loam_generate_skill.');
  if (/^processes\/[^/]+\/examples\//.test(path)) refuse('examples are never edited. Use loam_add_example to add a new one.');
  if (/^processes\/[^/]+\/corrections\.md$/.test(path)) refuse('use loam_record_correction to add a correction.');
  return path;
}

export function assertNoteSize(content: string): void {
  if (new TextEncoder().encode(content).length > MAX_NOTE_BYTES) {
    throw new LoamError('The note is too large (over 200 KB). Split it into smaller notes.');
  }
}
