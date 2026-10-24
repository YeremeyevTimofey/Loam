import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  AUTOMATION_LABEL,
  FILE,
  FREQUENCY_LABEL,
  InterviewInput,
  LoamError,
  loadKb,
  loadState,
  parseInterview,
  planSaveInterview,
  renderInterview,
} from '@loam/core';
import { z } from 'zod';
import type { Ctx } from '../context';
import { commit, defineTool } from '../tools/define';
import { requireBase } from '../tools/read';

export function registerInterviewTools(server: McpServer, ctx: Ctx): void {
  defineTool(server, ctx, {
    name: 'loam_get_interview_script',
    title: 'Get the onboarding interview script',
    description:
      'Call this when the user says "Run my Loam onboarding interview" (or wants to redo it). Returns how to run the interview, the stage to run, and what is already saved. Without a stage it returns the outline; call it again with a stage id to get that stage\'s questions. It is short (about four minutes): ask one question at a time.',
    input: { stage: z.string().optional().describe('Stage id from the outline, e.g. you, tasks, focus, voice, summary') },
    kind: 'read',
    handler: async ({ stage }, ready) => {
      await requireBase(ready);
      let script;
      try {
        script = parseInterview(await ready.store.readFile(FILE.interview));
      } catch {
        throw new LoamError('The interview script (.loam/interview.json) is missing or damaged. Ask the user to open the Loam app and press "Update interview script".');
      }
      const snap = await loadKb(ready.store, ready.today());
      const state = await loadState(ready.store);
      const profile = snap.profile && !snap.profile.empty ? `${snap.profile.fm.name || 'name not set'}, ${snap.profile.fm.role || 'role not set'}` : '';
      return renderInterview(script, stage, state?.interview, {
        profile,
        processes: snap.processes.map((p) => `${p.fm.title} (${FREQUENCY_LABEL[p.fm.frequency].toLowerCase()}, ${p.fm.minutes_per_run} min)`),
      });
    },
  });

  defineTool(server, ctx, {
    name: 'loam_save_interview',
    title: 'Save the interview results',
    description:
      'Saves what the interview found: creates profile.md, a folder for each process (description, empty corrections, a first skill), the glossary and the entities list. Safe to call several times: existing processes are updated by slug and keep their runs, corrections and examples. Call it with complete: true only after the user confirmed the process map. If the user gets tired, call it with what you have and the stage you reached.',
    input: InterviewInput.shape,
    kind: 'write',
    handler: async (args, ready) => {
      await requireBase(ready);
      const { plan, saved } = await planSaveInterview(ready.store, InterviewInput.parse(args), ready.today());
      await commit(ready, plan);
      const p = args.profile;
      const lines = [
        args.complete ? 'Interview saved and marked complete.' : `Interview progress saved${args.stage ? ` (stage: ${args.stage})` : ''}.`,
        `Profile: ${[p.name, p.role && (p.company ? `${p.role} at ${p.company}` : p.role)].filter(Boolean).join(', ') || 'saved'}.`,
      ];
      if (saved.length) {
        lines.push('', 'Processes:');
        for (const s of saved) {
          lines.push(`- ${s.slug}: ${s.title} — ${s.hours === null ? 'hours per year unknown' : `~${s.hours} h/year`}, ${AUTOMATION_LABEL[s.automation].toLowerCase()} (${s.created ? 'new' : 'updated'})`);
        }
      }
      lines.push(...plan.notes.map((n) => `Note: ${n}`));
      if (args.complete) {
        lines.push(
          '',
          'Next: suggest starter skills that fit these processes (meeting-summary, client-bad-news-email, weekly-status-report, incoming-doc-review, meeting-prep, task-handoff). The user adds them on the Skills screen of the Loam app. Tell them to press Refresh in the app to see their profile and processes.',
        );
      }
      return lines.join('\n');
    },
  });
}
