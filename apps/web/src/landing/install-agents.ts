import { AGENTS, connectFor } from '../app/lib/agents.ts';
import { esc } from './html.ts';

const PLACEHOLDER = '/path/to/your/Loam';

const code = (text: string, label: string) =>
  `<div class="relative"><pre class="m-0 overflow-auto whitespace-pre-wrap break-all rounded-md border border-line bg-bg p-3 pr-3 text-[13px] leading-6" tabindex="0" aria-label="${esc(label)}" data-copy>${esc(text)}</pre></div>`;

/** The install page's section for every agent except Claude Desktop, written from the same code the app uses. */
export function renderInstallAgents(npmPackage: string, appUrl: string): string {
  const items = AGENTS.filter((a) => a.id !== 'claude-desktop')
    .map((agent) => {
      const connect = connectFor(agent.id, { os: 'mac', npmPackage, folder: PLACEHOLDER });
      const blocks = connect.blocks
        // One-click links carry the folder path, so they only make sense in the app, where the path is known.
        .filter((b) => b.kind !== 'link')
        .map(
          (b) => `<div class="mt-4"><p class="mb-2 text-[15px] font-medium">${esc(b.title)}</p>${b.kind === 'file' ? `<p class="t-secondary mb-2">File: <code class="break-all">${esc(b.file ?? '')}</code></p>` : ''}${code(b.text ?? '', b.title)}${b.note ? `<p class="t-secondary mt-2">${esc(b.note)}</p>` : ''}</div>`,
        )
        .join('');
      return `<details class="rounded-lg border border-line bg-surface p-4" id="${agent.id}">
        <summary class="min-h-11 cursor-pointer py-2 text-lg font-semibold">${esc(agent.name)} <span class="t-secondary ml-2 font-normal">${esc(agent.blurb)}</span></summary>
        <div class="pt-2">
          <p class="t-secondary">Replace <code>${esc(PLACEHOLDER)}</code> with the full path of your Loam folder.</p>
          ${blocks}
          ${connect.after.map((line) => `<p class="t-secondary mt-4">${esc(line)}</p>`).join('')}
        </div>
      </details>`;
    })
    .join('\n      ');
  return `<div class="space-y-3">
      ${items}
    </div>
    <p class="mt-6">These are the Mac and Linux versions. <a href="${esc(appUrl)}">The Loam app</a> writes the exact command for your system (Windows included) with your folder path filled in, and gives one-click install links for Cursor and VS Code.</p>`;
}
