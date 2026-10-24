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

describe('the onboarding interview (version 2)', () => {
  const stages = DEFAULT_INTERVIEW.stages;
  const questions = stages.flatMap((s) => s.questions);

  it('is short: five minutes at most, four questions and a confirmation, nothing by kind of role', () => {
    expect(DEFAULT_INTERVIEW.version).toBe(2);
    expect(DEFAULT_INTERVIEW.minutes).toBe('3–5');
    expect(DEFAULT_INTERVIEW.branches).toEqual([]);
    expect(stages.map((s) => s.id)).toEqual(['you', 'tasks', 'focus', 'voice', 'summary']);
    expect(questions).toHaveLength(4);
    expect(stages.at(-1)!.questions).toEqual([]); // the last stage asks for a confirmation, not a question
  });

  it('asks for what decides whether a task can be automated, and nothing the person already told us', () => {
    const all = JSON.stringify(DEFAULT_INTERVIEW);
    // how often, how long, the steps, a good result, what must never happen, where mistakes creep in
    expect(questions[1]).toMatch(/how often/);
    expect(questions[1]).toMatch(/how many minutes/);
    expect(questions[2]).toMatch(/steps/);
    expect(questions[2]).toMatch(/good result/);
    expect(questions[2]).toMatch(/never happen/);
    expect(stages[2]!.instructions.join(' ')).toMatch(/mistakes/);
    // the questions that made the old interview long are gone
    expect(all).not.toMatch(/between 10 and 12|yesterday|explain to a colleague twice|mechanically/i);
  });

  it('tells the agent to guess and let the person correct, to ask for numbers once, and not to ask for files', () => {
    const rules = DEFAULT_INTERVIEW.rules.join('\n');
    expect(rules).toMatch(/Offer your guess/);
    expect(rules).toMatch(/Ask once, in one message/);
    expect(rules).toMatch(/No files during the interview/);
    expect(rules).toMatch(/One question at a time/);
    expect(stages.at(-1)!.instructions.join(' ')).toMatch(/in one reply/);
  });

  it('is cheap for the agent to read: the whole script is a small number of tokens', () => {
    const progress = { status: 'not_started' as const };
    const saved = { profile: '', processes: [] };
    const everything = [undefined, ...stages.map((s) => s.id)].map((id) => renderInterview(DEFAULT_INTERVIEW, id, progress, saved)).join('\n');
    // the old script cost about 3,400 tokens for the same run (27 questions, seven stages); the rules repeat in every call, on purpose
    expect(countTokens(everything)).toBeLessThan(2500);
  });

  it('is what a new folder gets, and parses back', async () => {
    const store = await freshBase();
    expect(parseInterview(await store.readFile(FILE.interview))).toEqual(DEFAULT_INTERVIEW);
  });
});

describe('folders created before version 2', () => {
  it('their script (with branches) still loads and still serves its branch questions', () => {
    const old = parseInterview(JSON.stringify(VERSION_1));
    expect(old.version).toBe(1);
    expect(old.branches).toHaveLength(1);
    const text = renderInterview(old, 'day-map', undefined, { profile: '', processes: [] });
    expect(text).toContain('Which documents do you write for clients?');
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
    expect(parseInterview(await store.readFile(FILE.interview)).version).toBe(2);
    const history = await store.listHistory();
    expect(history.some((h) => h.originalPath === FILE.interview)).toBe(true);
    // nothing to do the second time
    expect((await planUpdateInterviewScript(store)).changes).toHaveLength(0);
  });
});
