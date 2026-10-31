import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ContextUpsertInput, isKnowledgeBase, planAddExample, planGenerateProcessSkill, planLogRun, planRecordCorrection, planScaffold, planUpsertContext, planUpsertNote } from '@loam/core';
import { z } from 'zod';
import type { Ctx } from '../context';
import { commit, defineTool, renderDiff } from './define';
import { requireBase } from './read';

export function registerWriteTools(server: McpServer, ctx: Ctx): void {
  defineTool(server, ctx, {
    name: 'loam_init',
    title: 'Set up Loam in this folder',
    description:
      'Sets up the knowledge base in the folder the user chose when it is not one yet: README.md, AGENTS.md, profile.md, the context files and the interview script. Say which folder and ask the user first; call with confirm: true only after they agree. Never overwrites a file. If the folder already holds other files, ask again and pass allow_existing_files: true only if the user agrees. Does nothing when the knowledge base exists. Afterwards offer to run the onboarding interview.',
    input: {
      confirm: z.boolean().describe('true only after the user agreed to set up Loam in this folder'),
      allow_existing_files: z.boolean().default(false).describe('true only if the folder is not empty and the user agreed to add Loam files next to what is there'),
    },
    kind: 'write',
    handler: async ({ confirm, allow_existing_files }, ready) => {
      if (await isKnowledgeBase(ready.store)) return 'This folder is already a Loam knowledge base. Nothing to set up. Offer to run the onboarding interview if the profile is empty.';
      const folder = ready.store.root;
      if (!confirm) return { text: `Do not set anything up yet. Ask the user: "Set up Loam in the folder ${folder}?" and call loam_init again with confirm: true if they agree.`, isError: true };
      // Hidden entries (.DS_Store, .git, ...) do not count as content.
      const existing = (await ready.store.listFiles('')).filter((e) => !e.name.startsWith('.'));
      if (existing.length > 0 && !allow_existing_files) {
        const names = existing.slice(0, 6).map((e) => e.name).join(', ');
        return {
          text: `The folder ${folder} is not empty (${names}${existing.length > 6 ? ', …' : ''}). Tell the user, and ask whether to add the Loam files next to them (nothing existing is changed) or to choose an empty folder. Call loam_init again with confirm: true and allow_existing_files: true only if they agree.`,
          isError: true,
        };
      }
      const plan = await planScaffold(ready.store, ready.today());
      await commit(ready, plan);
      return [
        `Loam is set up in ${folder}. Created ${plan.changes.length} files:`,
        ...plan.changes.map((c) => `- ${c.path}`),
        '',
        'Next: offer to run the onboarding interview (it takes about four minutes), or the user can say "Run my Loam onboarding interview" any time.',
      ].join('\n');
    },
  });

  defineTool(server, ctx, {
    name: 'loam_upsert_note',
    title: 'Write a note',
    description:
      'Creates or replaces a markdown note (profile, process description, context notes) ONLY when the user explicitly asks you to save or change something. Keeps the previous version in history and returns the diff: show it to the user and say which file changed. Skills, examples, corrections, AGENTS.md and the .loam and .claude folders cannot be written here; use the dedicated tools.',
    input: {
      path: z.string().describe('Markdown path relative to the folder, e.g. context/glossary.md'),
      content: z.string().describe('The complete new content of the file'),
      reason: z.string().describe('One short sentence: why this change'),
    },
    kind: 'write',
    handler: async ({ path, content, reason }, ready) => {
      await requireBase(ready);
      const plan = await planUpsertNote(ready.store, { path, content, reason });
      await commit(ready, plan);
      return `${plan.changes.length ? 'Saved' : 'Nothing to change'} (${reason}).\n\n${renderDiff(plan)}\n\nShow this diff to the user and say which file changed.`;
    },
  });

  defineTool(server, ctx, {
    name: 'loam_upsert_context',
    title: 'Remember a person, client, goal, metric or term',
    description:
      'Adds, updates or removes ONE entry (a line) about a person, a client, project or system, a goal, a metric or a term, ONLY when the user explicitly asks you to remember or change it. Entries are found by name, every other line stays as it was, and the diff is returned. Keep an entry to one or two sentences (up to 60 words); label is what it is to the user ("colleague, creative lead", "client", "goal, by 2026-12-31"); aliases are other names it is called by.',
    input: { ...ContextUpsertInput.shape, reason: z.string().optional().describe('One short sentence: why this change') },
    kind: 'write',
    handler: async ({ reason, ...entry }, ready) => {
      await requireBase(ready);
      const result = await planUpsertContext(ready.store, entry, reason);
      if (result.action === 'missing') return `There is no entry called "${entry.name}" in ${result.file}, so nothing was removed.`;
      if (result.action === 'unchanged') return `${result.file} already has this entry exactly as given. Nothing to change.`;
      await commit(ready, result.plan);
      const verb = { added: 'Added', updated: 'Updated', removed: 'Removed' }[result.action];
      return `${verb} "${entry.name}" in ${result.file} (${result.fileWords} of ${result.budget} words).\n${result.plan.notes.map((n) => `Note: ${n}\n`).join('')}\n${renderDiff(result.plan)}\n\nShow this diff to the user and say which file changed.`;
    },
  });

  defineTool(server, ctx, {
    name: 'loam_record_correction',
    title: 'Remember a correction',
    description:
      'Call when the user says "remember this correction" (or similar) about a process result. Adds it to the process\'s corrections, which override everything else from now on, and raises the correction counter. Returns the diff: show it to the user. Include before/after fragments when you have them.',
    input: {
      slug: z.string().describe('Process folder name'),
      note: z.string().describe('The rule, written so it can be followed next time, e.g. "Put the traffic numbers in the first paragraph"'),
      before: z.string().optional().describe('The fragment as it was'),
      after: z.string().optional().describe('The fragment as it should be'),
    },
    kind: 'write',
    handler: async ({ slug, note, before, after }, ready) => {
      await requireBase(ready);
      const plan = await planRecordCorrection(ready.store, { slug, note, before, after, today: ready.today() });
      await commit(ready, plan);
      const extra = plan.notes.length ? `\n\n${plan.notes.join('\n')}` : '';
      return `Correction saved for "${slug}".\n\n${renderDiff(plan)}${extra}\n\nShow this diff to the user and say which files changed.`;
    },
  });

  defineTool(server, ctx, {
    name: 'loam_add_example',
    title: 'Save an example',
    description:
      'Saves a finished result as an example of what good (or bad) looks like for a process. The text is stored exactly as given and never edited afterwards. Use when the user hands you a real finished document and says it is a good example.',
    input: {
      slug: z.string().describe('Process folder name'),
      content: z.string().describe('The example, exactly as the user gave it'),
      kind: z.enum(['good', 'bad']).describe('good = copy this; bad = avoid this'),
    },
    kind: 'write',
    handler: async ({ slug, content, kind }, ready) => {
      await requireBase(ready);
      const { plan, path } = await planAddExample(ready.store, { slug, content, kind, today: ready.today() });
      await commit(ready, plan);
      return `Saved the ${kind} example as ${path}. ${plan.notes.join(' ')}`;
    },
  });

  defineTool(server, ctx, {
    name: 'loam_generate_skill',
    title: 'Rebuild a process skill',
    description:
      'Rebuilds processes/<slug>/SKILL.md from the process description, its examples and all its corrections (newest rules first). Deterministic: no model is involved. Suggested after every third correction.',
    input: { slug: z.string().describe('Process folder name') },
    kind: 'write',
    handler: async ({ slug }, ready) => {
      await requireBase(ready);
      const plan = await planGenerateProcessSkill(ready.store, slug, ready.today());
      await commit(ready, plan);
      return plan.changes.length ? `Rebuilt the skill for "${slug}".\n\n${renderDiff(plan)}` : `The skill for "${slug}" is already up to date.`;
    },
  });

  defineTool(server, ctx, {
    name: 'loam_log_run',
    title: 'Count a run',
    description:
      'Raises the run counter of a process by one. Call it once after you have delivered the result of a process the user asked you to run. It only changes a number and is the one write you may do without being asked.',
    input: { slug: z.string().describe('Process folder name') },
    kind: 'write',
    handler: async ({ slug }, ready) => {
      await requireBase(ready);
      const plan = await planLogRun(ready.store, slug, ready.today());
      await commit(ready, plan);
      return plan.notes.join(' ');
    },
  });
}
