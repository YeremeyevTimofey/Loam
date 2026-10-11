import { badge, button, esc, num } from './html.ts';

/** The shape of apps/web/src/demo-data/summary.json (written by `npm run demo:build` from the sample base). */
export interface SarahSummary {
  persona: { name: string; role: string; company: string; industry: string; tools: string[] };
  numbers: { readyCount: number; readyHours: number; typicalBefore: number; typicalAfter: number; typicalPercent: number };
  processes: { slug: string; title: string; frequency: string; minutes: number; hours: number | null; automation: string; runs: number; corrections: number; stable: boolean; examples: number }[];
  learning: { slug: string; title: string; runs: number; stable: boolean; corrections: { date: string; run: number | null; note: string; was: string | null; should: string | null }[] };
  skills: { name: string; source: string; description: string; scanner: string | null; reviewed: boolean; verdict: string | null }[];
  safety: { refused: { skill: string; reason: string }[]; reviews: number };
}

const FREQUENCY: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', 'ad-hoc': 'Ad hoc' };
const AUTOMATION: Record<string, [Parameters<typeof badge>[0], string]> = {
  ready: ['success', 'Ready to automate'],
  'needs-access': ['warning', 'Needs access'],
  'manual-only': ['muted', 'Manual only'],
};
const REFUSAL_WHY: Record<string, string> = {
  delete: 'it told the agent to delete files',
  network: 'it used the internet',
  exfiltration: 'it tried to read files and send them out',
  injection: 'it tried to change how the agent behaves',
  escape: 'it reached outside the folder',
  credentials: 'it asked for passwords or keys',
};
const date = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

/** Block "Meet Sarah": the fictional example, told through the numbers and files of the sample knowledge base. */
export function renderSarah(s: SarahSummary, links: { demo: string; processBase: string; skills: string; health: string }): string {
  const first = s.persona.name.split(' ')[0] ?? s.persona.name;
  const notReady = s.processes.filter((p) => p.automation !== 'ready');
  const imported = s.skills.find((k) => k.source === 'imported');
  const refused = s.safety.refused[0];

  const rows = s.processes
    .map((p) => {
      const [tone, label] = AUTOMATION[p.automation] ?? ['muted', p.automation];
      return `<tr class="border-b border-line align-top">
        <th scope="row" class="py-3 pr-4 text-left font-medium"><a href="${esc(`${links.processBase}${p.slug}`)}" class="font-medium">${esc(p.title)}</a></th>
        <td class="py-3 pr-4 text-right tabular-nums">${p.hours === null ? '–' : esc(String(p.hours))}</td>
        <td class="py-3 pr-4">${esc(FREQUENCY[p.frequency] ?? p.frequency)}, ${p.minutes} min</td>
        <td class="py-3"><span class="flex flex-wrap gap-1">${badge(tone, label)}${p.stable ? badge('success', 'Stable') : ''}</span></td>
      </tr>`;
    })
    .join('');

  const steps = s.learning.corrections
    .map(
      (c, i) => `<li class="relative border-l border-line pb-6 pl-5 last:pb-0">
        <span class="absolute -left-[5px] top-2 size-[9px] rounded-full bg-accent" aria-hidden="true"></span>
        <p class="t-secondary">${esc(date(c.date))}${c.run !== null ? ` · after run ${c.run}` : ''} · correction ${i + 1}</p>
        <p class="mt-1 font-medium">${esc(c.note)}</p>
        ${c.was && c.should ? `<p class="t-secondary mt-1"><span class="font-medium">Was:</span> ${esc(clip(c.was, 110))}<br><span class="font-medium">Should be:</span> ${esc(clip(c.should, 110))}</p>` : ''}
      </li>`,
    )
    .join('');

  const skillCards = s.skills
    .map((k) => {
      const tags =
        k.source === 'imported'
          ? `${badge('warning', 'Imported')}${k.scanner === 'warn' ? badge('warning', 'Scan warning') : badge('success', 'Scan passed')}${k.reviewed ? badge(k.verdict === 'safe' ? 'success' : 'warning', `Reviewed: ${k.verdict ?? 'yes'}`) : badge('warning', 'Not reviewed')}`
          : `${badge('neutral', 'Starter')}${badge('muted', 'Read only')}`;
      return `<li class="rounded-lg border border-line bg-surface p-4">
        <p class="font-medium">${esc(k.name)}</p>
        <p class="t-secondary mt-1">${esc(clip(k.description, 120))}</p>
        <p class="mt-3 flex flex-wrap gap-1">${tags}</p>
      </li>`;
    })
    .join('');

  return `<section class="gutter pb-14 md:pb-24" aria-labelledby="sarah-h" id="example">
  <div class="wide">
    <p class="t-secondary mb-2">A fictional example, built from the sample knowledge base you can open yourself</p>
    <h2 id="sarah-h" class="t-h2 mb-4">Meet ${esc(first)}, an ${esc(s.persona.role.toLowerCase())}</h2>
    <p class="mb-3 max-w-[720px]">${esc(first)} looks after six client accounts at ${esc(s.persona.company)}, a 20-person marketing agency. She answered Loam's interview once, in about 15 minutes. Everything below comes from the files that interview created, and every number is real: open her knowledge base to check.</p>
    <p class="t-secondary mb-10 max-w-[720px]">Her tools: ${esc(s.persona.tools.join(', '))}.</p>

    <h3 class="t-h3 mb-3">1. The interview found five recurring processes</h3>
    <div class="mb-3 overflow-x-auto rounded-lg border border-line bg-surface">
      <table class="w-full min-w-[30rem] border-collapse px-4 text-left text-[15px]">
        <thead><tr class="border-b border-line text-muted">
          <th scope="col" class="px-0 py-3 pl-4 font-medium">Process</th><th scope="col" class="py-3 pr-4 text-right font-medium">Hours a year</th><th scope="col" class="py-3 pr-4 font-medium">How often</th><th scope="col" class="py-3 pr-4 font-medium">Can it be automated?</th>
        </tr></thead>
        <tbody class="[&_th]:pl-4 [&_td:last-child]:pr-4">${rows}</tbody>
      </table>
    </div>
    <p class="t-secondary mb-10 max-w-[720px]">${s.numbers.readyCount} of ${s.processes.length} are ready to automate: about ${s.numbers.readyHours} hours a year of ${esc(first)}'s time. Loam is straight about the rest: ${notReady.map((p) => `“${esc(p.title)}” is ${p.automation === 'needs-access' ? 'waiting for access to a system' : 'a live negotiation and stays manual'}`).join(', and ')}.</p>

    <h3 class="t-h3 mb-3">2. Her weekly report got better with every correction</h3>
    <p class="mb-5 max-w-[720px]">${esc(first)} asked her agent for the ${esc(s.learning.title.toLowerCase())} ${s.learning.runs} times. After each run she told it what to change, and each correction became a rule the agent reads first next time:</p>
    <ol class="mb-5 max-w-[720px]">${steps}</ol>
    <p class="mb-10 max-w-[720px]">Since then, ${s.learning.runs - (s.learning.corrections.at(-1)?.run ?? 0)} runs in a row needed no change, so Loam marks the process <strong>stable</strong>. She never edited a file by hand.</p>

    <h3 class="t-h3 mb-3">3. Her skills, and a safety check on every one that comes from outside</h3>
    <ul class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">${skillCards}</ul>
    <p class="mb-10 max-w-[720px]">${imported ? `“${esc(imported.name)}” came from outside, so Loam scanned it, flagged that it is long, and stored it as read-only, like every imported skill. Her own agent then reviewed it and called it safe: a note for her, which never changes what the skill may do. ` : ''}${refused ? `Another one, “${esc(refused.skill)}”, was refused: ${esc(REFUSAL_WHY[refused.reason] ?? 'it failed the safety check')}. There is no “add anyway”.` : ''}</p>

    <h3 class="t-h3 mb-3">4. A tidier base means less for her agent to read</h3>
    <p class="mb-8 max-w-[720px]">A typical task reads ${num(s.numbers.typicalBefore)} tokens in this deliberately messy sample. After the clean-up Loam suggests, it reads ${num(s.numbers.typicalAfter)}: <strong>${s.numbers.typicalPercent}% less</strong>.</p>

    <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      ${button(links.demo, `Open ${first}'s knowledge base`, 'primary', 'plausible-event-name=Sarah+Demo')}
      ${button(`${links.processBase}${s.learning.slug}`, `See the ${s.learning.title.toLowerCase()} process`, 'secondary')}
      ${button(links.skills, 'See her skills', 'secondary')}
      ${button(links.health, 'See the health check', 'secondary')}
    </div>
  </div>
</section>`;
}
