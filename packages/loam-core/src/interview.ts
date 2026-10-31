import { InterviewScript, type KbState } from './schema';

/**
 * The reference interview script (§8). It is written to .loam/interview.json when a base is
 * created, and again when the user presses "Update interview script". The MCP server only reads
 * the copy in the base, so the script can change without reinstalling the extension.
 */
export const DEFAULT_INTERVIEW: InterviewScript = InterviewScript.parse({
  version: 3,
  title: 'Loam onboarding interview',
  minutes: '3–5',
  rules: [
    'Before the first question tell the person, once: "Talking is faster than typing. If you can, use your app\'s voice input or your computer\'s dictation, and answer as fully as you like, in any order. The more you tell me, the better your base will be."',
    'Four open questions and one confirmation, about four minutes, one at a time. Never ask for a structured answer or cut a long one short: sort it out yourself.',
    'Offer a guess for what is missing ("weekly, about 40 minutes: right?") instead of asking again. Ask for missing numbers once, in one message.',
    'Do not sell AI. If a process automates badly, say so and why.',
    'If the person is tired, save progress (loam_save_interview with the stage) and offer to continue later.',
    'Any language is fine; folder and field names stay in English.',
  ],
  branches: [],
  stages: [
    {
      id: 'you',
      title: 'Who you are',
      goal: 'Role, tools, the people around them and their aims.',
      questions: ['Tell me about your work: who you are, where you work, the apps you use daily, who you work with most (colleagues, clients), and what you aim for or are measured on.'],
      instructions: ['Note the people (name, relation, what to keep in mind), goals and metrics from the answer: one or two sentences each.'],
    },
    {
      id: 'tasks',
      title: 'What repeats',
      goal: 'The recurring tasks, with how often and how long: the core of the map.',
      questions: ['Which tasks repeat every week or month? For each: roughly how often, how long it takes, and what it involves.'],
      instructions: ['Ask once, in one message, for missing frequency or minutes. Skip one-off work.'],
    },
    {
      id: 'focus',
      title: 'The one that costs most',
      goal: 'Steps, a good result and what must never happen, for the costliest task.',
      questions: [
        'Which of these costs you the most time or irritates you most? Walk me through it: the steps, what a good result looks like, what must never happen. If you can, share an example of a good result or the documents you work from.',
      ],
      instructions: [
        'If the user does not choose, take the task with the most hours a year. Note inputs, outputs and where mistakes creep in.',
        'Save an example of a good result with loam_add_example after the final save, once the process exists. For documents they only work from, note their names in the process inputs.',
      ],
    },
    {
      id: 'voice',
      title: 'Voice and names',
      goal: 'The tone of their writing, and names an outsider would not know.',
      questions: ['How should your texts sound (tone, language, sign-off)? And which clients, projects, systems and abbreviations should your assistant know by name?'],
    },
    {
      id: 'summary',
      title: 'Confirm and save',
      goal: 'Turn the answers into a process map, let the user correct it, save it.',
      instructions: [
        'Draft the map yourself. Per process: title, frequency (daily, weekly, monthly or ad-hoc), minutes per run, automation (ready, needs-access or manual-only), inputs, output, steps, what good looks like, constraints, what it takes. Mark guesses.',
        'Hours a year = minutes × runs per year ÷ 60 (daily 250, weekly 50, monthly 12; ad-hoc: ask for runs_per_year). Say honestly what automating each takes: access, review, risk.',
        'Show the map, ready processes first by hours a year, with the people, goals and metrics, and let the user correct all of it in one reply.',
        'Call loam_save_interview with everything and complete: true, then save any example.',
        'Then offer the matching starter skills.',
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

