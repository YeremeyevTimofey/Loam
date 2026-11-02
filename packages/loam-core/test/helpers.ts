import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MemoryStore } from '../src/memory-store';
import { buildSkill } from '../src/skills';
import { ensureBase } from './ensure';

export const TODAY = '2026-10-11';
export const ROOT = resolve(__dirname, '../../..');

export const fixture = (group: 'malicious' | 'benign', name: string): string =>
  readFileSync(join(__dirname, 'fixtures', group, name), 'utf8');

/** What the sample skills say, by name: a description and a short body. */
const SAMPLE_SKILLS: Record<string, [string, string]> = {
  'meeting-summary': ['Turn raw meeting notes into a structured summary with decisions, owners, deadlines and open questions', 'Write the summary in four parts: decisions, owners, deadlines and open questions.'],
  'task-handoff': ['Hand a task over to a colleague - what is done, what remains, where things are and what to watch out for', 'Write what is done, what remains, where the files are and what to watch out for.'],
  'meeting-prep': ['Prepare for a meeting - context on the participants from the knowledge base, the goal, and three questions to ask', 'Say what the goal of the meeting is and propose three questions to ask.'],
  'weekly-status-report': ['Write a weekly status report - done, in progress, risks and what is needed from the reader', 'Write what is done, what is in progress, the risks and what you need from the reader.'],
  'client-bad-news-email': ['Draft an email telling a client about a delay or a problem - the fact, the reason without excuses, what we do, when they hear next', 'Write four short paragraphs: the fact, the reason, what we do, when they hear next.'],
  'incoming-doc-review': ['Break down an incoming document - what it is about, what it asks of me, what is unclear and which deadlines it sets', 'Say what the document is about, what it asks, what is unclear and which deadlines it sets.'],
};

/**
 * A small valid skill, written straight into the library. By default it looks like one an older Loam added from its starter
 * pack (`source: starter`), which is what folders of people who used that pack still hold; pass `imported` for one that came from outside.
 */
export async function addSampleSkill(store: MemoryStore, name: string, source: 'starter' | 'imported' = 'starter'): Promise<void> {
  const [description, body] = SAMPLE_SKILLS[name] ?? [`A skill called ${name}`, 'Do the task in the way the user describes.'];
  await store.writeFile(
    `skills/${name}/SKILL.md`,
    buildSkill(
      {
        name,
        description,
        source,
        capabilities: ['read'],
        license: 'MIT',
        origin: source === 'starter' ? 'bundled' : 'paste',
        imported_at: TODAY,
        reviewed: source === 'starter',
        ...(source === 'starter' ? { review_note: 'Written and reviewed by the Loam team' } : {}),
        scanner: 'pass',
      },
      `# ${name}\n\n${body}\n\nDo not invent facts, names or numbers that are not in the knowledge base or in the user's message.\n`,
    ),
  );
}

/** A fresh base with the files a new folder starts with in place. */
export async function freshBase(): Promise<MemoryStore> {
  const store = new MemoryStore('test', {}, 'fs');
  await store.init();
  await ensureBase(store, TODAY);
  return store;
}
