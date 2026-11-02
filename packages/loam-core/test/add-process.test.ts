import { describe, expect, it } from 'vitest';
import {
  applyPlan,
  loadKb,
  loadSkills,
  loadState,
  LoamError,
  planAddProcess,
  planLogRun,
  planRecordCorrection,
  planSaveInterview,
  processSlug,
  parseCorrections,
  type AddProcessInput,
} from '../src';
import { freshBase, TODAY } from './helpers';

const invoice = {
  title: 'Monthly invoice check',
  frequency: 'monthly',
  minutes_per_run: 120,
  automation: 'needs-access',
  what: 'Check the invoices against the hours.',
  steps: ['Export the hours', 'Compare them with the invoices'],
  good: 'Nothing is left unexplained.',
  replace: false,
} as AddProcessInput;

describe('adding one process after the interview', () => {
  it('builds the process, an empty corrections file and its skill, and says how many hours a year it is', async () => {
    const store = await freshBase();
    const { plan, saved } = await planAddProcess(store, invoice, TODAY);
    await applyPlan(store, plan);
    expect(saved).toMatchObject({ slug: 'monthly-invoice-check', title: 'Monthly invoice check', created: true, hours: 24, automation: 'needs-access' });
    for (const file of ['process.md', 'corrections.md', 'SKILL.md']) expect(await store.exists(`processes/monthly-invoice-check/${file}`), file).toBe(true);
    const process = await store.readFile('processes/monthly-invoice-check/process.md');
    expect(process).toMatch(/minutes_per_run: 120/);
    expect(process).toMatch(/1\. Export the hours/);
    const skills = (await loadSkills(store)).skills;
    expect(skills.map((s) => s.name)).toContain('monthly-invoice-check');
    const snap = await loadKb(store, TODAY);
    expect(snap.processes.map((p) => p.slug)).toContain('monthly-invoice-check');
    expect(snap.processes.find((p) => p.slug === 'monthly-invoice-check')?.hasSkill).toBe(true);
  });

  it('leaves the interview exactly as it was: a finished interview stays finished', async () => {
    const store = await freshBase();
    await applyPlan(store, (await planSaveInterview(store, { profile: { name: 'Sarah' }, processes: [], complete: true, stage: 'summary' } as never, TODAY)).plan);
    const before = await loadState(store);
    expect(before?.interview).toMatchObject({ status: 'complete', stage: 'summary' });
    await applyPlan(store, (await planAddProcess(store, invoice, TODAY)).plan);
    expect((await loadState(store))?.interview).toEqual(before?.interview);
  });

  it('refuses a name that is taken, whatever the capital letters, and says how to change the process on purpose', async () => {
    const store = await freshBase();
    await applyPlan(store, (await planAddProcess(store, invoice, TODAY)).plan);
    await expect(planAddProcess(store, { ...invoice, title: 'monthly INVOICE check' }, TODAY)).rejects.toThrow(/already a process "monthly-invoice-check".*replace: true/s);
    await expect(planAddProcess(store, { ...invoice, title: 'monthly INVOICE check' }, TODAY)).rejects.toBeInstanceOf(LoamError);
    // a different title is a different process
    const other = await planAddProcess(store, { ...invoice, title: 'Quarterly invoice check', minutes_per_run: 60 }, TODAY);
    expect(other.saved.slug).toBe('quarterly-invoice-check');
  });

  it('with replace it changes the numbers and keeps the runs, the corrections and the examples', async () => {
    const store = await freshBase();
    await applyPlan(store, (await planAddProcess(store, invoice, TODAY)).plan);
    await applyPlan(store, await planLogRun(store, 'monthly-invoice-check', TODAY));
    await applyPlan(store, await planRecordCorrection(store, { slug: 'monthly-invoice-check', note: 'Put the totals first', before: 'a', after: 'b', today: TODAY }));
    await store.writeFile('processes/monthly-invoice-check/examples/good-01.md', '# A good one\n');
    const again = await planAddProcess(store, { ...invoice, minutes_per_run: 90, replace: true }, TODAY);
    expect(again.saved).toMatchObject({ created: false, hours: 18 });
    await applyPlan(store, again.plan);
    const process = await store.readFile('processes/monthly-invoice-check/process.md');
    expect(process).toMatch(/minutes_per_run: 90/);
    expect(process).toMatch(/runs: 1/);
    expect(process).toMatch(/corrections: 1/);
    expect(parseCorrections(await store.readFile('processes/monthly-invoice-check/corrections.md'))).toHaveLength(1);
    expect(await store.readFile('processes/monthly-invoice-check/examples/good-01.md')).toBe('# A good one\n');
  });

  it('knows a task with no fixed rhythm only by the person\'s own estimate of how often', async () => {
    const store = await freshBase();
    const without = await planAddProcess(store, { ...invoice, title: 'Handle a complaint', frequency: 'ad-hoc', minutes_per_run: 45 }, TODAY);
    expect(without.saved.hours).toBeNull();
    expect(without.plan.notes.join(' ')).toMatch(/ad-hoc without runs_per_year/);
    const withRuns = await planAddProcess(store, { ...invoice, title: 'Handle a complaint', frequency: 'ad-hoc', minutes_per_run: 45, runs_per_year: 8 }, TODAY);
    expect(withRuns.saved.hours).toBe(6);
  });

  it('takes the folder name from the title when the one asked for is not valid', () => {
    expect(processSlug({ title: 'Monthly invoice check', slug: 'My Folder!' })).toBe('monthly-invoice-check');
    expect(processSlug({ title: 'Monthly invoice check', slug: 'invoices' })).toBe('invoices');
    expect(processSlug({ title: '!!!' })).toBe('process');
  });
});
