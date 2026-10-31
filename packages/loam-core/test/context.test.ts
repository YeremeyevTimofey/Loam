import { describe, expect, it } from 'vitest';
import {
  agentsMd,
  applyPlan,
  CONTEXT_FILE,
  CONTEXT_KINDS,
  CONTEXT_WORD_BUDGET,
  contextDigest,
  countWords,
  FILE,
  isMentioned,
  LoamError,
  loadContext,
  MAX_ENTRY_WORDS,
  mentions,
  parseContextFile,
  parseContextLine,
  PLACEHOLDER,
  planSaveInterview,
  planUpsertContext,
  README_MD,
  roughTokens,
  selectContext,
  type ContextEntry,
  type LoadedContext,
} from '../src';
import { runLint } from '../src/lint';
import { freshBase, TODAY } from './helpers';

const PEOPLE = `# People

Colleagues.

- **Marco Rossi** (colleague, creative lead; aka M. Rossi) — needs briefs a day ahead; prefers a call to a long message.
- **Dana Okoye** (colleague, paid media) — owns the ad budgets.
- **Will Smith** (client contact) — decides on the spring budget.
- Pieter: runs finance and sends the invoices
`;
const ENTITIES = `# Entities

- **Acme Outdoor** (client) — oldest account; wants the numbers first.
- **HubSpot** (system) — the source of truth for contacts.
`;
const GOALS = `# Goals

- **Keep the three biggest accounts** (goal, by 2026-12-31) — the spring budget is the risk.
- **Cut report time in half** (goal) — by automating the weekly report.
`;
const METRICS = `# Metrics

- **Reports sent on time** (metric) — target: every Friday by 15:00; about 85% today.
`;
const GLOSSARY = `# Glossary

- **ROAS** — return on ad spend: revenue divided by what we spent on ads.
`;

function loaded(): LoadedContext {
  const entries = [
    ...parseContextFile('people', PEOPLE),
    ...parseContextFile('entities', ENTITIES),
    ...parseContextFile('goals', GOALS),
    ...parseContextFile('metrics', METRICS),
    ...parseContextFile('glossary', GLOSSARY),
  ];
  return { entries, words: {} };
}

const byName = (entries: ContextEntry[], name: string) => entries.find((e) => e.name === name)!;

describe('context entries: one line each', () => {
  it('reads a line into a name, what it is, other names and what to keep in mind', () => {
    const e = parseContextLine('people', '- **Marco Rossi** (colleague, creative lead; aka M. Rossi, Marc) — needs briefs a day ahead.')!;
    expect(e).toMatchObject({ name: 'Marco Rossi', label: 'colleague, creative lead', aliases: ['M. Rossi', 'Marc'], firstName: 'Marco', notes: 'needs briefs a day ahead.' });
    expect(e.text).toBe('**Marco Rossi** (colleague, creative lead; aka M. Rossi, Marc) — needs briefs a day ahead.');
    expect(parseContextLine('entities', '- **Acme Outdoor** (client) — oldest account.')).toMatchObject({ label: 'client', aliases: [], firstName: null });
    expect(parseContextLine('glossary', '- **ROAS** — return on ad spend.')).toMatchObject({ name: 'ROAS', label: '', notes: 'return on ad spend.' });
  });

  it('reads lines a person wrote by hand, without bold text', () => {
    expect(parseContextLine('people', '- Pieter: runs finance')).toMatchObject({ name: 'Pieter', notes: 'runs finance' });
    expect(parseContextLine('people', '* Dana - paid media')).toMatchObject({ name: 'Dana', notes: 'paid media' });
  });

  it('skips everything that is not an entry: headings, sentences, and the template placeholder', () => {
    const entries = parseContextFile('people', `# People\n\nSome sentence about the file.\n\n_${PLACEHOLDER}._\n\n- **Marco** (colleague)\n- _${PLACEHOLDER}._\n`);
    expect(entries.map((e) => e.name)).toEqual(['Marco']);
    expect(parseContextFile('people', null)).toEqual([]);
  });

  it('matches whole words only, in any alphabet', () => {
    expect(mentions('Send it to Marco today', 'Marco')).toBe(true);
    expect(mentions('send it to marco', 'Marco')).toBe(true);
    expect(mentions('Marcos called', 'Marco')).toBe(false);
    expect(mentions('Письмо для Марко готово', 'Марко')).toBe(true);
    expect(mentions('Письмо для Маркома', 'Марко')).toBe(false);
  });

  it('knows a person by first name too, but only as a name, so "will" in a sentence is not Will', () => {
    const will = byName(loaded().entries, 'Will Smith');
    expect(isMentioned(will, 'Will asked for the report')).toBe(true);
    expect(isMentioned(will, 'I will send the report')).toBe(false);
    expect(isMentioned(will, 'Ask Will Smith')).toBe(true);
    const marco = byName(loaded().entries, 'Marco Rossi');
    expect(isMentioned(marco, 'Message M. Rossi')).toBe(true); // an alias
    expect(isMentioned(marco, 'Marco is out')).toBe(true);
    // an entity is not a person: no first-name shortcut
    expect(isMentioned(byName(loaded().entries, 'Acme Outdoor'), 'Outdoor sale')).toBe(false);
  });
});

describe('selecting what a task needs', () => {
  it('returns only the entries the task names, grouped by file, in a fixed order', () => {
    const answer = selectContext(loaded(), { text: 'Draft a note to Acme Outdoor about the plan; Dana and Marco join the call.', maxTokens: 800 });
    expect(answer.returned).toBe(3);
    expect(answer.text).toContain('## People (context/people.md)');
    expect(answer.text).toContain('## Entities (context/entities.md)');
    expect(answer.text.indexOf('People')).toBeLessThan(answer.text.indexOf('Entities'));
    expect(answer.text).toContain('**Dana Okoye**');
    expect(answer.text).not.toContain('Pieter');
    expect(answer.text).not.toContain('HubSpot');
  });

  it('returns every goal and metric when asked for those kinds, with or without names', () => {
    const answer = selectContext(loaded(), { text: 'Who is Dana?', kinds: ['goals', 'metrics'], maxTokens: 800 });
    expect(answer.returned).toBe(1 + 2 + 1);
    expect(answer.text).toContain('Keep the three biggest accounts');
    expect(answer.text).toContain('Reports sent on time');
    expect(selectContext(loaded(), { kinds: ['goals'], maxTokens: 800 }).returned).toBe(2);
  });

  it('returns nothing for a name nobody wrote down, so the agent can say so', () => {
    expect(selectContext(loaded(), { text: 'Write to Jonas about it', maxTokens: 800 }).returned).toBe(0);
    expect(selectContext(loaded(), { text: '', maxTokens: 800 }).returned).toBe(0);
  });

  it('stays under the token cap, says how many it left out, and always returns at least one', () => {
    const many = { entries: Array.from({ length: 40 }, (_, i) => parseContextLine('people', `- **Person${i} Name** (colleague) — ${'works on a long thing and needs care '.repeat(3)}`)!), words: {} };
    const text = many.entries.map((e) => e.name).join(' ');
    const answer = selectContext(many, { text, maxTokens: 300 });
    expect(answer.returned).toBeGreaterThan(0);
    expect(answer.left).toBe(40 - answer.returned);
    expect(roughTokens(answer.text)).toBeLessThanOrEqual(300 + 80);
    expect(selectContext(many, { text, maxTokens: 1 }).returned).toBe(1);
  });
});

describe('the digest in the overview', () => {
  it('is nothing while nothing is saved', () => {
    expect(contextDigest({ entries: [], words: {} })).toBeNull();
  });

  it('counts what is known, names the goals and metrics, and says how to ask for the rest', () => {
    const digest = contextDigest(loaded())!;
    expect(digest).toMatch(/Context: 4 people, 2 clients, projects or systems, 2 goals, 1 metric, 1 term\./);
    expect(digest).toMatch(/Goals: Keep the three biggest accounts; Cut report time in half\./);
    expect(digest).toMatch(/Metrics: Reports sent on time\./);
    expect(digest).toMatch(/call loam_get_context with the task text/);
  });

  it('stays small however much is saved: three goals and four metrics at most, names cut short', () => {
    const many = (kind: 'goals' | 'metrics', n: number) =>
      Array.from({ length: n }, (_, i) => parseContextLine(kind, `- **A rather long name for number ${i} that goes on and on and on** (${kind}) — notes`)!);
    const digest = contextDigest({ entries: [...many('goals', 20), ...many('metrics', 20)], words: {} })!;
    expect(roughTokens(digest)).toBeLessThanOrEqual(170);
    expect(digest).toMatch(/Goals: .*; …\./);
    expect(digest.match(/;/g)!.length).toBeLessThanOrEqual(12);
  });
});

describe('remembering one entry (loam_upsert_context)', () => {
  it('the first entry creates the file, with an explanation and no template text', async () => {
    const store = await freshBase();
    expect(await store.exists(FILE.people)).toBe(false);
    const result = await planUpsertContext(store, { kind: 'people', name: 'Marco Rossi', label: 'colleague, creative lead', notes: 'Needs briefs a day ahead.', aliases: ['Marc'], remove: false });
    expect(result.action).toBe('added');
    await applyPlan(store, result.plan);
    const text = await store.readFile(FILE.people);
    expect(text).toContain('# People');
    expect(text).toContain('- **Marco Rossi** (colleague, creative lead; aka Marc) — Needs briefs a day ahead.');
    expect(text).not.toContain(PLACEHOLDER);
    expect(parseContextFile('people', text).map((e) => e.name)).toEqual(['Marco Rossi']);
  });

  it('changes one line by name, whatever the capitals, and leaves every other line exactly as it was', async () => {
    const store = await freshBase();
    await store.writeFile(FILE.people, PEOPLE);
    const result = await planUpsertContext(store, { kind: 'people', name: 'dana okoye', label: 'colleague, head of paid media', notes: 'Owns the ad budgets and the weekly pacing check.', aliases: [], remove: false });
    expect(result.action).toBe('updated');
    await applyPlan(store, result.plan);
    const after = (await store.readFile(FILE.people)).split('\n');
    const before = PEOPLE.split('\n');
    const changed = after.filter((l, i) => l !== before[i]);
    expect(changed).toEqual(['- **dana okoye** (colleague, head of paid media) — Owns the ad budgets and the weekly pacing check.']);
    expect(after).toHaveLength(before.length);
  });

  it('keeps what the change does not mention: the notes alone, or the label alone', async () => {
    const store = await freshBase();
    await store.writeFile(FILE.people, PEOPLE);
    await applyPlan(store, (await planUpsertContext(store, { kind: 'people', name: 'Marco Rossi', notes: 'Now needs briefs two days ahead.', remove: false })).plan);
    let marco = byName(parseContextFile('people', await store.readFile(FILE.people)), 'Marco Rossi');
    expect(marco).toMatchObject({ label: 'colleague, creative lead', aliases: ['M. Rossi'], notes: 'Now needs briefs two days ahead.' });
    await applyPlan(store, (await planUpsertContext(store, { kind: 'people', name: 'Marco Rossi', label: 'colleague, head of creative', remove: false })).plan);
    marco = byName(parseContextFile('people', await store.readFile(FILE.people)), 'Marco Rossi');
    expect(marco).toMatchObject({ label: 'colleague, head of creative', aliases: ['M. Rossi'], notes: 'Now needs briefs two days ahead.' });
    // an empty list is a choice too: it clears the other names
    await applyPlan(store, (await planUpsertContext(store, { kind: 'people', name: 'Marco Rossi', aliases: [], remove: false })).plan);
    expect(byName(parseContextFile('people', await store.readFile(FILE.people)), 'Marco Rossi').aliases).toEqual([]);
  });

  it('finds a line written by hand and replaces it with the standard line instead of adding a second one', async () => {
    const store = await freshBase();
    await store.writeFile(FILE.people, PEOPLE);
    const result = await planUpsertContext(store, { kind: 'people', name: 'Pieter', label: 'colleague, finance', notes: 'Runs finance and sends the invoices.', aliases: [], remove: false });
    await applyPlan(store, result.plan);
    const entries = parseContextFile('people', await store.readFile(FILE.people));
    expect(entries.filter((e) => e.name === 'Pieter')).toHaveLength(1);
    expect(byName(entries, 'Pieter').label).toBe('colleague, finance');
  });

  it('removes one entry, says so when there is nothing to remove, and does nothing when nothing changes', async () => {
    const store = await freshBase();
    await store.writeFile(FILE.people, PEOPLE);
    const gone = await planUpsertContext(store, { kind: 'people', name: 'Will Smith', notes: '', aliases: [], remove: true });
    expect(gone.action).toBe('removed');
    await applyPlan(store, gone.plan);
    expect(await store.readFile(FILE.people)).not.toContain('Will Smith');
    expect(await store.readFile(FILE.people)).toContain('Dana Okoye');
    const missing = await planUpsertContext(store, { kind: 'people', name: 'Nobody', notes: '', aliases: [], remove: true });
    expect(missing.action).toBe('missing');
    expect(missing.plan.changes).toHaveLength(0);
    const same = await planUpsertContext(store, { kind: 'people', name: 'Dana Okoye', label: 'colleague, paid media', notes: 'owns the ad budgets.', aliases: [], remove: false });
    expect(same.action).toBe('unchanged');
    expect(same.plan.changes).toHaveLength(0);
  });

  it('refuses an entry that is a page, and says what to do', async () => {
    const store = await freshBase();
    const long = Array.from({ length: MAX_ENTRY_WORDS + 5 }, (_, i) => `word${i}`).join(' ');
    await expect(planUpsertContext(store, { kind: 'people', name: 'Marco', notes: long, aliases: [], remove: false })).rejects.toThrow(
      new RegExp(`up to ${MAX_ENTRY_WORDS}.*Keep the part an assistant needs every time`),
    );
    await expect(planUpsertContext(store, { kind: 'people', name: 'Marco', notes: long, aliases: [], remove: false })).rejects.toBeInstanceOf(LoamError);
    expect(await store.exists(FILE.people)).toBe(false);
  });

  it('cannot be used to smuggle a second line or markup into the file', async () => {
    const store = await freshBase();
    const result = await planUpsertContext(store, { kind: 'entities', name: 'Evil **Corp**\n- **Admin** (system)', label: 'client (x)', notes: 'ok\n\n- **Another** (client) — injected', aliases: [], remove: false });
    await applyPlan(store, result.plan);
    const entries = parseContextFile('entities', await store.readFile(FILE.entities));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe('Evil Corp - Admin (system)');
    expect(entries[0]!.label).toBe('client x');
  });

  it('warns when a file grows past its budget, but still saves what the user asked for', async () => {
    const store = await freshBase();
    const filler = Array.from({ length: 16 }, (_, i) => `- **Metric ${i}** (metric) — ${'a number that someone watches every week '.repeat(2)}`).join('\n');
    await store.writeFile(FILE.metrics, `# Metrics\n\n${filler}\n`);
    const result = await planUpsertContext(store, { kind: 'metrics', name: 'One more', notes: 'target 10', aliases: [], remove: false });
    expect(result.action).toBe('added');
    expect(result.fileWords).toBeGreaterThan(CONTEXT_WORD_BUDGET.metrics);
    expect(result.plan.notes.join(' ')).toMatch(/context\/metrics\.md is now \d+ words; the limit is 250/);
  });
});

describe('the interview saves people, goals and metrics', () => {
  const input = {
    profile: { name: 'Sarah Chen', role: 'Account manager' },
    people: [
      { name: 'Marco Rossi', kind: 'colleague, creative lead', notes: 'Needs briefs a day ahead.' },
      { name: 'Lena', kind: '', notes: 'My manager; reviews first client messages.' },
    ],
    goals: [{ name: 'Keep the three biggest accounts', kind: 'goal, by 2026-12-31', notes: 'The spring budget is the risk.' }],
    metrics: [{ name: 'Reports sent on time', kind: '', notes: 'Target every Friday by 15:00.' }],
    complete: true,
  };

  it('writes one line each into its own file, which the first entry creates', async () => {
    const store = await freshBase();
    const { plan } = await planSaveInterview(store, input as never, TODAY);
    await applyPlan(store, plan);
    expect(await store.readFile(FILE.people)).toContain('- **Marco Rossi** (colleague, creative lead) — Needs briefs a day ahead.');
    expect(await store.readFile(FILE.people)).toContain('- **Lena** (colleague) — My manager; reviews first client messages.'); // empty kind: the default for the file
    expect(await store.readFile(FILE.goals)).toContain('- **Keep the three biggest accounts** (goal, by 2026-12-31) — The spring budget is the risk.');
    expect(await store.readFile(FILE.metrics)).toContain('- **Reports sent on time** (metric) — Target every Friday by 15:00.');
    expect(await store.exists(CONTEXT_FILE.entities)).toBe(true); // the starter template is still there, untouched
    expect(await store.readFile(FILE.entities)).toContain(PLACEHOLDER);
  });

  it('saves nothing for kinds the person did not talk about, so there are no empty files to tidy', async () => {
    const store = await freshBase();
    const { plan } = await planSaveInterview(store, { profile: { name: 'A' }, people: [{ name: 'Marco', kind: '', notes: '' }], complete: true } as never, TODAY);
    expect(plan.changes.map((c) => c.path)).toContain(FILE.people);
    expect(plan.changes.map((c) => c.path)).not.toContain(FILE.goals);
    expect(plan.changes.map((c) => c.path)).not.toContain(FILE.metrics);
  });

  it('saving again adds only what is new and never overwrites a line the user has since edited', async () => {
    const store = await freshBase();
    await applyPlan(store, (await planSaveInterview(store, input as never, TODAY)).plan);
    const edited = (await store.readFile(FILE.people)).replace('Needs briefs a day ahead.', 'Needs briefs two days ahead.');
    await store.writeFile(FILE.people, edited);
    const again = await planSaveInterview(store, { ...input, people: [...input.people, { name: 'Dana Okoye', kind: 'colleague, paid media', notes: 'Owns the ad budgets.' }] } as never, TODAY);
    await applyPlan(store, again.plan);
    const entries = parseContextFile('people', await store.readFile(FILE.people));
    expect(entries.map((e) => e.name)).toEqual(['Marco Rossi', 'Lena', 'Dana Okoye']);
    expect(byName(entries, 'Marco Rossi').notes).toBe('Needs briefs two days ahead.');
  });

  it('is found afterwards by name, with nothing else read', async () => {
    const store = await freshBase();
    await applyPlan(store, (await planSaveInterview(store, input as never, TODAY)).plan);
    const ctx = await loadContext(store);
    expect(ctx.entries.filter((e) => e.kind === 'people')).toHaveLength(2);
    expect(selectContext(ctx, { text: 'Brief Marco on the plan', maxTokens: 500 }).text).toContain('Needs briefs a day ahead.');
  });
});

describe('budgets and the protocol file', () => {
  it('Context Lint flags a context file over its word budget, and not one under it', async () => {
    const store = await freshBase();
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `- **Person ${i}** (colleague) — ${'someone you work with every single day '.repeat(1)}`).join('\n');
    await store.writeFile(FILE.people, `# People\n\n${lines(10)}\n`);
    expect((await runLint(store, { today: TODAY })).findings.filter((f) => f.rule === 'budget' && f.files.includes(FILE.people))).toHaveLength(0);
    await store.writeFile(FILE.people, `# People\n\n${lines(120)}\n`);
    const finding = (await runLint(store, { today: TODAY })).findings.find((f) => f.rule === 'budget' && f.files.includes(FILE.people));
    expect(finding?.title).toMatch(/context\/people\.md is [\d,]+ words — the limit is 600/);
    expect(finding?.detail).toMatch(/one short line per entry/);
  });

  it('every context file has a budget and a place', () => {
    expect(Object.keys(CONTEXT_WORD_BUDGET).sort()).toEqual([...CONTEXT_KINDS].sort());
    expect(Object.values(CONTEXT_FILE).every((f) => /^context\/[a-z]+\.md$/.test(f))).toBe(true);
  });

  it('AGENTS.md points the agent at the lookup, tells it how to remember, and stays within its budget', () => {
    const text = agentsMd({ name: 'Sarah Chen', role: 'Account manager' });
    expect(text).toMatch(/call `loam_get_context` with the task text/);
    expect(text).toMatch(/`loam_upsert_context` \(one person, client, goal, metric or term\)/);
    expect(countWords(text)).toBeLessThanOrEqual(500);
  });

  it('the README in the folder explains the files, and that a file appears with its first entry', () => {
    expect(README_MD).toMatch(/people\.md.*entities\.md.*goals\.md.*metrics\.md.*glossary\.md/s);
    expect(README_MD).toMatch(/A file appears when its first entry is saved/);
  });
});
