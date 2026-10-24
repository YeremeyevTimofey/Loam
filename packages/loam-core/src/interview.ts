import { InterviewScript, type KbState } from './schema';

/**
 * The reference interview script (§8). It is written to .loam/interview.json when a base is
 * created, and again when the user presses "Update interview script". The MCP server only reads
 * the copy in the base, so the script can change without reinstalling the extension.
 */
export const DEFAULT_INTERVIEW: InterviewScript = InterviewScript.parse({
  version: 2,
  title: 'Loam onboarding interview',
  minutes: '3–5',
  rules: [
    'One question at a time: four questions and one confirmation, about four minutes. No hour-by-hour walk-throughs of a day.',
    'Short answers are enough. Offer your guess and let the person correct it ("weekly, about 40 minutes: right?") instead of asking again.',
    'Every task needs two numbers: how often and how many minutes per run. Ask once, in one message, for what is missing. A task without both does not go on the map.',
    'No files during the interview. After saving, offer to add a real finished result for the top process (loam_add_example).',
    'Do not sell AI. If a process automates badly, say so and why.',
    'If the person is tired, save progress with loam_save_interview (pass the stage) and offer to continue later.',
    'Answers may be in any language: keep their words, and keep folder names (slugs) and field names in English.',
  ],
  branches: [],
  stages: [
    {
      id: 'you',
      title: 'Who you are',
      goal: 'Role, workplace and everyday tools, in one answer.',
      questions: ['Who are you at work? Tell me your role, where you work, and the apps you open every day (email, spreadsheets, CRM, chat, documents).'],
    },
    {
      id: 'tasks',
      title: 'What repeats',
      goal: 'The recurring tasks, with how often and how long. This is the core of the map.',
      questions: ['Which tasks do you repeat every week or month? List three to six, with roughly how often and how many minutes each takes. Short notes are fine.'],
      instructions: [
        'If a task lacks how often or how many minutes, ask for the missing numbers once, for all of them in one message.',
        'Skip one-off work. Only repeating tasks belong on the map.',
      ],
    },
    {
      id: 'focus',
      title: 'The one that costs most',
      goal: 'Steps, what a good result looks like, and what must never happen, for the task that costs the most.',
      questions: ['Which of these costs you the most time, or irritates you most? Walk me through its steps, tell me what a good result looks like, and name anything that must never happen.'],
      instructions: [
        'If the user does not say, pick the task with the most hours a year (minutes per run × runs per year). Do a second task only if the user is still happy to continue.',
        'Note what comes in (inputs), what goes out, and where mistakes creep in.',
      ],
    },
    {
      id: 'voice',
      title: 'Voice and names',
      goal: "How the user's writing should sound, and the names an outsider would not know.",
      questions: ['How should your texts sound (tone, language, how you sign off)? And which clients, projects, systems or abbreviations should your assistant know by name?'],
    },
    {
      id: 'summary',
      title: 'Confirm and save',
      goal: 'Turn the answers into a process map, let the user correct it, then save it.',
      instructions: [
        'Draft the map yourself from the answers. For each process write: title, frequency (daily, weekly, monthly or ad-hoc), minutes per run, automation (ready, needs-access or manual-only), inputs, output, steps, what a good result looks like, constraints, and what it takes. Use sensible guesses for what the user did not say and mark them as guesses.',
        'Score each process: annual hours = minutes per run × runs per year ÷ 60. Runs per year: daily 250, weekly 50, monthly 12. For ad-hoc, ask the user to estimate runs per year and pass runs_per_year.',
        'Be honest per process. Besides the win, say what is needed: access, human review, risk of error. A task of 30 minutes every day (about 125 hours a year) matters more than one of 2 hours once a month (24 hours).',
        'Show the map, with processes marked ready sorted by annual hours, and let the user confirm or correct it in one reply.',
        'Call loam_save_interview with the profile, the confirmed processes, the glossary and entities, and complete: true.',
        'Then offer two next steps: adding one real finished result for the top process (loam_add_example), and the starter skills that fit (meeting-summary, client-bad-news-email, weekly-status-report, incoming-doc-review, meeting-prep, task-handoff), which the Skills screen of the Loam app adds in one click.',
      ],
    },
  ],
});

export const defaultInterviewJson = (): string => `${JSON.stringify(DEFAULT_INTERVIEW, null, 2)}\n`;

export function parseInterview(text: string): InterviewScript {
  return InterviewScript.parse(JSON.parse(text));
}

/** Text the agent receives from loam_get_interview_script. */
export function renderInterview(
  script: InterviewScript,
  stageId: string | undefined,
  progress: KbState['interview'] | undefined,
  saved: { profile: string; processes: string[] },
): string {
  const lines: string[] = [`# ${script.title} (${script.minutes} minutes)`, '', '## How to run it', ...script.rules.map((r) => `- ${r}`)];
  const stage = stageId ? script.stages.find((s) => s.id === stageId) : undefined;
  if (stageId && !stage) {
    lines.push('', `Unknown stage "${stageId}". Stages: ${script.stages.map((s) => s.id).join(', ')}.`);
    return lines.join('\n');
  }
  lines.push('', '## Progress');
  if (progress && progress.status !== 'not_started') {
    lines.push(`Status: ${progress.status}. Last stage saved: ${progress.stage ?? 'none'}.`);
  } else lines.push('Not started.');
  if (saved.profile) lines.push(`Saved profile: ${saved.profile}`);
  if (saved.processes.length) lines.push(`Saved processes: ${saved.processes.join('; ')}`);

  if (!stage) {
    lines.push('', '## Stages (in order)');
    script.stages.forEach((s, i) => lines.push(`${i + 1}. ${s.id} — ${s.title}: ${s.goal}`));
    const next = progress?.stage ? script.stages[script.stages.findIndex((s) => s.id === progress.stage) + 1] : script.stages[0];
    lines.push('', `Start with stage "${(next ?? script.stages[0])?.id}": call loam_get_interview_script with that stage to get its questions.`);
    return lines.join('\n');
  }

  lines.push('', `## Stage: ${stage.title} (${stage.id})`, stage.goal);
  if (stage.questions.length) lines.push('', 'Questions (ask one at a time, adapt to the answers):', ...stage.questions.map((q, i) => `${i + 1}. ${q}`));
  if (stage.uses_branch) {
    lines.push('', 'Also ask the questions of the branch that matches the role from stage "role":');
    for (const b of script.branches) {
      lines.push('', `Branch ${b.id} — ${b.label}. Use when: ${b.recognise}`, ...b.questions.map((q, i) => `${i + 1}. ${q}`));
    }
  }
  if (stage.instructions.length) lines.push('', 'Do this:', ...stage.instructions.map((s, i) => `${i + 1}. ${s}`));
  const index = script.stages.findIndex((s) => s.id === stage.id);
  const next = script.stages[index + 1];
  lines.push('', next ? `When done, move to stage "${next.id}".` : 'This is the last stage.');
  return lines.join('\n');
}

