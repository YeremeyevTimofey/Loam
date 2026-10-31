import { describe, expect, it } from 'vitest';
import {
  applyPlan,
  defaultInterviewJson,
  DEFAULT_INTERVIEW,
  FILE,
  parseInterview,
  planUpdateInterviewScript,
  renderInterview,
} from '../src';
import { countTokens } from '../src/tokens';
import { freshBase } from './helpers';

/** What a folder created before version 2 holds: questions by kind of role, a day map, many stages. */
const VERSION_1 = {
  version: 1,
  title: 'Loam onboarding interview',
  minutes: '15–20',
  rules: ['Ask about specifics.', 'Ask one question at a time.'],
  branches: [{ id: 'client-work', label: 'Client work', recognise: 'External clients.', questions: ['Which documents do you write for clients?'] }],
  stages: [
    { id: 'role', title: 'Role and context', goal: 'Who the user is.', questions: ["What's your role?"] },
    { id: 'day-map', title: 'Map of the day', goal: 'What the user does.', uses_branch: true, questions: ['Walk me through yesterday between 10 and 12.'] },
  ],
};

/** What the first release wrote (version 2): the figures a shorter script is measured against. */
const VERSION_2 = { words: 610, tokens: 808, renderedTokens: 2268 };

/** A version 2 folder: same shape as today, the words differ. */
const VERSION_2_SCRIPT = {
  version: 2,
  title: 'Loam onboarding interview',
  minutes: '3–5',
  rules: ['One question at a time: four questions and one confirmation, about four minutes.'],
  branches: [],
  stages: [
    { id: 'you', title: 'Who you are', goal: 'Role and tools.', questions: ['Who are you at work?'] },
    { id: 'summary', title: 'Confirm and save', goal: 'Save it.', instructions: ['Call loam_save_interview.'] },
  ],
};

const wordsOf = (script: typeof DEFAULT_INTERVIEW) =>
  [script.rules, script.stages.map((s) => s.goal), script.stages.flatMap((s) => s.questions), script.stages.flatMap((s) => s.instructions)]
    .flat()
    .join('\n')
    .split(/\s+/)
    .filter(Boolean).length;

describe('the onboarding interview (version 3)', () => {
  const stages = DEFAULT_INTERVIEW.stages;
  const questions = stages.flatMap((s) => s.questions);

  it('is short: five minutes at most, four open questions and a confirmation, nothing by kind of role', () => {
    expect(DEFAULT_INTERVIEW.version).toBe(3);
    expect(DEFAULT_INTERVIEW.minutes).toBe('3–5');
    expect(DEFAULT_INTERVIEW.branches).toEqual([]);
    expect(stages.map((s) => s.id)).toEqual(['you', 'tasks', 'focus', 'voice', 'summary']);
    expect(questions).toHaveLength(4);
    expect(stages.at(-1)!.questions).toEqual([]); // the last stage asks for a confirmation, not a question
  });

  it('is about 15% shorter than version 2, in words and in tokens, although it asks for more', () => {
    const all = [DEFAULT_INTERVIEW.rules, stages.map((s) => s.goal), questions, stages.flatMap((s) => s.instructions)].flat().join('\n');
    expect(wordsOf(DEFAULT_INTERVIEW)).toBeLessThanOrEqual(Math.round(VERSION_2.words * 0.87));
    expect(wordsOf(DEFAULT_INTERVIEW)).toBeGreaterThanOrEqual(Math.round(VERSION_2.words * 0.8)); // shorter, not stripped
    expect(countTokens(all)).toBeLessThanOrEqual(Math.round(VERSION_2.tokens * 0.87));
  });

  it('asks open questions that also gather the people, goals and metrics around the person', () => {
    expect(questions[0]).toMatch(/who you work with/);
    expect(questions[0]).toMatch(/aim for|measured on/);
    expect(stages[0]!.instructions.join(' ')).toMatch(/people .*goals and metrics/);
    // none of the questions is a form: no "list", no "three to six", no numbers to fill in
    expect(questions.join(' ')).not.toMatch(/\bList\b|three to six/);
  });

  it('asks for what decides whether a task can be automated', () => {
    const all = JSON.stringify(DEFAULT_INTERVIEW);
    expect(questions[1]).toMatch(/how often/);
    expect(questions[1]).toMatch(/how long/);
    expect(questions[2]).toMatch(/steps/);
    expect(questions[2]).toMatch(/good result/);
    expect(questions[2]).toMatch(/never happen/);
    expect(stages[2]!.instructions.join(' ')).toMatch(/mistakes/);
    // the questions that made the old interview long are gone
    expect(all).not.toMatch(/between 10 and 12|yesterday|explain to a colleague twice|mechanically/i);
  });

  it('tells the person, once and early, to talk instead of typing and to answer as fully as they like', () => {
    const rules = DEFAULT_INTERVIEW.rules;
    expect(rules[0]).toMatch(/Before the first question/);
    expect(rules[0]).toMatch(/voice input/);
    expect(rules[0]).toMatch(/dictation/);
    expect(rules[0]).toMatch(/as fully as you like, in any order/);
    expect(rules.join('\n')).toMatch(/never ask for a structured answer or cut a long one short/i);
    expect(rules.filter((r) => /voice input/.test(r))).toHaveLength(1);
  });

  it('asks, once and optionally, for an example of a good result or the documents they work from', () => {
    expect(questions[2]).toMatch(/If you can, share an example of a good result or the documents you work from/);
    const instructions = stages[2]!.instructions.join(' ');
    expect(instructions).toMatch(/loam_add_example after the final save, once the process exists/);
    expect(instructions).toMatch(/documents they only work from, note their names in the process inputs/);
    // no stage makes it a requirement
    expect(JSON.stringify(DEFAULT_INTERVIEW)).not.toMatch(/must (share|attach|upload)|required example/i);
  });

  it('tells the agent to guess and let the person correct, and to ask for numbers once', () => {
    const rules = DEFAULT_INTERVIEW.rules.join('\n');
    expect(rules).toMatch(/Offer a guess/);
    expect(rules).toMatch(/once, in one message/);
    expect(rules).toMatch(/one at a time/);
    expect(stages.at(-1)!.instructions.join(' ')).toMatch(/in one reply/);
    expect(stages.at(-1)!.instructions.join(' ')).toMatch(/people, goals and metrics/);
  });

  it('is cheap for the agent to read: the whole run costs fewer tokens than version 2 did', () => {
    const progress = { status: 'not_started' as const };
    const saved = { profile: '', processes: [] };
    const everything = [undefined, ...stages.map((s) => s.id)].map((id) => renderInterview(DEFAULT_INTERVIEW, id, progress, saved)).join('\n');
    // The rules repeat in every call, on purpose, so the whole run shrinks less than the script does.
    expect(countTokens(everything)).toBeLessThan(VERSION_2.renderedTokens);
    expect(countTokens(everything)).toBeLessThan(2200);
  });

  it('is what a new folder gets, and parses back', async () => {
    const store = await freshBase();
    expect(parseInterview(await store.readFile(FILE.interview))).toEqual(DEFAULT_INTERVIEW);
  });
});

describe('folders created before version 3', () => {
  it('their script (with branches) still loads and still serves its branch questions', () => {
    const old = parseInterview(JSON.stringify(VERSION_1));
    expect(old.version).toBe(1);
    expect(old.branches).toHaveLength(1);
    const text = renderInterview(old, 'day-map', undefined, { profile: '', processes: [] });
    expect(text).toContain('Which documents do you write for clients?');
  });

  it('a version 2 script still loads, and "Update interview script" brings it to version 3', async () => {
    const old = parseInterview(JSON.stringify(VERSION_2_SCRIPT));
    expect(old.version).toBe(2);
    expect(old.stages.at(-1)!.questions).toEqual([]);
    const store = await freshBase();
    await store.writeFile(FILE.interview, `${JSON.stringify(VERSION_2_SCRIPT, null, 2)}\n`);
    await applyPlan(store, await planUpdateInterviewScript(store));
    expect(parseInterview(await store.readFile(FILE.interview))).toEqual(DEFAULT_INTERVIEW);
  });

  it('a progress marker from an old stage does not break the new script: it starts from the first stage', () => {
    const text = renderInterview(DEFAULT_INTERVIEW, undefined, { status: 'in_progress', stage: 'pain' }, { profile: '', processes: [] });
    expect(text).toMatch(/Start with stage "you"/);
  });

  it('"Update interview script" swaps the old script for the new one and keeps the old one in history', async () => {
    const store = await freshBase();
    await store.writeFile(FILE.interview, `${JSON.stringify(VERSION_1, null, 2)}\n`);
    const plan = await planUpdateInterviewScript(store);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.after).toBe(defaultInterviewJson());
    await applyPlan(store, plan);
    expect(parseInterview(await store.readFile(FILE.interview)).version).toBe(3);
    const history = await store.listHistory();
    expect(history.some((h) => h.originalPath === FILE.interview)).toBe(true);
    // nothing to do the second time
    expect((await planUpdateInterviewScript(store)).changes).toHaveLength(0);
  });
});
