import { InterviewScript, type KbState } from './schema';

/**
 * The reference interview script (§8). It is written to .loam/interview.json when a base is
 * created, and again when the user presses "Update interview script". The MCP server only reads
 * the copy in the base, so the script can change without reinstalling the extension.
 */
export const DEFAULT_INTERVIEW: InterviewScript = InterviewScript.parse({
  version: 1,
  title: 'Loam onboarding interview',
  minutes: '15–20',
  rules: [
    "Ask about specifics, not abstractions. Not \"what are your challenges?\" but \"what did you do yesterday between 10 and 12?\", \"what did you last explain to a colleague twice?\", \"which document do you rebuild every week?\".",
    'Dig until you have two numbers per process: how often it happens and how many minutes one run takes. A process without both does not go on the map. Ask again if the answer lacks them.',
    'Ask for proof. For every significant process, ask the user to paste or attach a real artifact (a finished report, an email, a template).',
    'Do not sell AI. If a process automates badly, say so plainly and explain why.',
    'Ask one question at a time. Wait for the answer before asking the next.',
    'Aim for 15–20 minutes. If the user is tired, save progress with loam_save_interview (pass the stage you reached) and offer to continue later.',
    'The user may answer in any language. Write their words in the language they used; keep folder names (slugs) and field names in English.',
  ],
  branches: [
    {
      id: 'client-work',
      label: 'Client work (accounts, sales, support)',
      recognise: 'The role revolves around external clients or customers: account manager, sales, customer success, support.',
      questions: [
        'Which documents do you write or rebuild for clients on a regular basis (reports, proposals, briefs, follow-ups)?',
        'What do you do after every client call or meeting?',
        'What do you send a client when something is late or went wrong?',
      ],
    },
    {
      id: 'internal-ops',
      label: 'Internal processes (HR, administration, operations)',
      recognise: 'The role revolves around colleagues and internal systems: HR, office or finance administration, operations.',
      questions: [
        'Which forms, checks or approvals do you process on a schedule?',
        'Which requests from colleagues do you answer again and again?',
        'Which spreadsheet or report do you update every week or month?',
      ],
    },
    {
      id: 'content-marketing',
      label: 'Content and marketing',
      recognise: 'The role revolves around producing content or campaigns: marketing, communications, content, social.',
      questions: [
        'What content do you produce on a regular basis (posts, newsletters, decks, briefs)?',
        'What do you rewrite for different channels or audiences?',
        'What reporting do you do on campaigns or results?',
      ],
    },
  ],
  stages: [
    {
      id: 'role',
      title: 'Role and context',
      goal: 'Who the user is, where they work, who they deal with, which tools they use. After the first answer, decide which branch (client-work, internal-ops or content-marketing) fits.',
      questions: [
        "What's your role, and what company or team do you work for?",
        'What industry is that, and who do you deal with most: clients, colleagues, suppliers?',
        'Which tools and apps do you open every day (email, CRM, spreadsheets, chat, documents)?',
        'In one sentence: what are you personally responsible for?',
      ],
    },
    {
      id: 'day-map',
      title: 'Map of the day',
      goal: 'What the user does daily, weekly and monthly. For every item get the frequency and the minutes per run.',
      uses_branch: true,
      questions: [
        'Walk me through yesterday between 10 and 12. What exactly did you do?',
        'What do you do every single day? For each thing, about how many minutes?',
        'What happens every week? For each, how long does it take you?',
        'What happens every month? For each, how long does it take you?',
        'What did you last explain to a colleague twice?',
      ],
    },
    {
      id: 'pain',
      title: 'Pain points',
      goal: 'Where time is lost and where an assistant would help most.',
      questions: [
        'What do you keep explaining again, to colleagues or to your AI?',
        'Where do you lose the most time in a week?',
        'What do you do mechanically, without really thinking?',
        'Where do mistakes tend to creep in?',
      ],
    },
    {
      id: 'quality',
      title: 'Quality bar',
      goal: 'What a good result looks like and who judges it.',
      questions: [
        "For the document we just discussed, what makes you say \"yes, that's it\"?",
        'Who judges the result: you, your manager, the client?',
        'What counts as a failure?',
      ],
    },
    {
      id: 'glossary',
      title: 'Vocabulary and entities',
      goal: 'Words and names an outsider would not understand.',
      questions: [
        'Which terms or abbreviations would confuse an outsider?',
        'Which clients, projects or systems come up by name, and is there anything to keep in mind about each?',
      ],
    },
    {
      id: 'artifacts',
      title: 'Artifacts',
      goal: 'Real examples of good work.',
      instructions: [
        'Ask for two or three real files or texts: a finished report, an email the user is proud of, a template.',
        'For each, ask which process it belongs to. Offer to save it as a good example once the base is created (loam_add_example).',
      ],
    },
    {
      id: 'summary',
      title: 'Summary and save',
      goal: 'Turn the answers into a process map, confirm it with the user, then save it.',
      instructions: [
        'For each process write: title, frequency (daily, weekly, monthly or ad-hoc), minutes per run, automation (ready, needs-access or manual-only), inputs, output, steps, what a good result looks like, constraints, and what it takes.',
        'Score each process: annual hours = minutes per run × runs per year ÷ 60. Runs per year: daily 250, weekly 50, monthly 12. For ad-hoc, ask the user to estimate runs per year and pass runs_per_year.',
        'Be honest per process. Besides the win, say what is needed: access, human review, risk of error. A task of 30 minutes every day (about 125 hours a year) matters more than one of 2 hours once a month (24 hours).',
        'Show the map to the user, with processes marked ready sorted by annual hours, and let them confirm or correct it.',
        'Call loam_save_interview with the profile, the confirmed processes, the glossary and entities, and complete: true.',
        'Then suggest the starter skills that fit the processes found (meeting-summary, client-bad-news-email, weekly-status-report, incoming-doc-review, meeting-prep, task-handoff). The Skills screen in the Loam app adds them in one click.',
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

