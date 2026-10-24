import { Download, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context';
import { AGENTS, checkFolder, connectFor, detectOs, type AgentId, type Block, type Os } from '../lib/agents';
import { cn } from '../lib/cn';
import { INTERVIEW_COMMAND, ISSUES_URL, MCPB_URL, NPM_PACKAGE, RELEASES_URL } from '../lib/links';
import { recallFolderPath, rememberFolderPath } from '../store/folder';
import { CodeBlock } from './CodeBlock';
import { CopyField } from './CopyField';
import { NewTabLink } from './NewTabLink';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';

const OS_LABEL: Record<Os, string> = { mac: 'Mac', windows: 'Windows', linux: 'Linux' };
const HOW_TO_COPY: Record<Os, string> = {
  mac: 'In Finder, click the folder once, then press ⌥⌘C (Option + Command + C) to copy its path. Paste it here.',
  windows: 'In File Explorer, hold Shift, right-click the folder and choose “Copy as path”. Paste it here.',
  linux: 'In your terminal, go to the folder and run pwd, then paste the result here. Or drag the folder into the terminal.',
};

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li>
      <p className="mb-2 font-medium">
        {n}. {title}
      </p>
      {children}
    </li>
  );
}

function BlockView({ block }: { block: Block }) {
  return (
    <div className="space-y-2">
      <p className="text-[15px] font-medium text-ink">{block.title}</p>
      {block.kind === 'link' ? (
        <Button asChild>
          <a href={block.href} rel="noreferrer">
            <ExternalLink size={20} aria-hidden /> {block.label}
          </a>
        </Button>
      ) : block.kind === 'command' ? (
        <CodeBlock text={block.text!} label={block.title} />
      ) : (
        <>
          <p className="t-secondary">
            File: <code className="break-all">{block.file}</code>
          </p>
          <CodeBlock text={block.text!} label={`${block.title}: ${block.file}`} />
        </>
      )}
      {block.note ? <p className="t-secondary">{block.note}</p> : null}
    </div>
  );
}

/**
 * "Connect your agent": Loam works with any AI agent that can run a local MCP server. Claude Desktop installs a
 * one-click bundle; every other agent starts the same server with npx, and this panel writes the exact command or
 * config for the chosen agent and the person's folder path.
 */
export function ConnectAgent({ className }: { className?: string }) {
  const { store } = useApp();
  const [agent, setAgent] = useState<AgentId>('claude-desktop');
  const [os, setOs] = useState<Os>(() => detectOs(navigator.userAgent, navigator.platform));
  const [raw, setRaw] = useState('');
  const persist = store.mode === 'fs';

  useEffect(() => {
    if (persist) void recallFolderPath().then((p) => p && setRaw(p));
  }, [persist]);

  const folder = useMemo(() => checkFolder(raw, os, store.mode === 'fs' ? store.label : undefined), [raw, os, store]);
  const info = AGENTS.find((a) => a.id === agent)!;
  const connect = useMemo(() => (folder.path ? connectFor(agent, { os, npmPackage: NPM_PACKAGE, folder: folder.path }) : null), [agent, os, folder.path]);

  return (
    <Card className={className}>
      <h2 className="t-h3 mb-1">Connect your agent</h2>
      <p className="t-secondary mb-5">
        Loam works with any AI agent that can run a local MCP server: Claude, Cursor, Codex, VS Code, Gemini CLI and more. Pick yours; it takes a few minutes, once.
      </p>

      <div role="radiogroup" aria-label="Your AI agent" className="mb-6 flex flex-wrap gap-2">
        {AGENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={agent === a.id}
            onClick={() => setAgent(a.id)}
            className={cn('inline-flex h-11 items-center rounded-md border px-4 text-base font-medium', agent === a.id ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink hover:bg-bg')}
          >
            {a.name}
          </button>
        ))}
      </div>
      <p className="t-secondary mb-5">{info.blurb}</p>

      {agent === 'claude-desktop' ? (
        <ol className="mb-6 space-y-5">
          <Step n={1} title="Download the extension">
            <Button asChild variant="secondary">
              <a href={MCPB_URL} className="hover:no-underline" rel="noreferrer">
                <Download size={20} aria-hidden /> Download loam.mcpb
              </a>
            </Button>
            <p className="t-secondary mt-1">
              Every version and its checksum are on the <NewTabLink inline href={RELEASES_URL}>releases page</NewTabLink>.
            </p>
          </Step>
          <Step n={2} title="Add it to Claude Desktop">
            <p className="t-secondary">
              Double-click the downloaded file, or open Claude Desktop, go to Settings → Extensions and drag it into the window. <a href="/install">Show me with pictures</a>.
            </p>
          </Step>
          <Step n={3} title="When it asks for a folder, choose this one">
            <CopyField text={store.label} label="Copy name" />
            <p className="t-secondary mt-2">Your browser doesn’t tell us where on your disk the folder is, so look for the name above. It has a file called AGENTS.md inside.</p>
          </Step>
        </ol>
      ) : (
        <ol className="mb-6 space-y-5">
          <Step n={1} title="Make sure Node is installed">
            <p className="t-secondary mb-2">
              {info.name} starts Loam with Node 22 or newer. Run this in a terminal; if it prints v22 or higher, you are set. Otherwise install Node from nodejs.org.
            </p>
            <CopyField text="node --version" />
          </Step>
          <Step n={2} title="Tell us where your folder is">
            <div className="mb-2 flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="folder-path">Full path of the folder “{store.label}”</Label>
                <Input
                  id="folder-path"
                  value={raw}
                  onChange={(e) => {
                    setRaw(e.target.value);
                    if (persist) void rememberFolderPath(e.target.value);
                  }}
                  placeholder={os === 'windows' ? 'C:\\Users\\you\\Documents\\Loam' : '/Users/you/Documents/Loam'}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="folder-help"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="os">System</Label>
                <select id="os" value={os} onChange={(e) => setOs(e.target.value as Os)} className="h-11 rounded-md border border-line bg-surface px-3 text-base text-ink focus-visible:border-accent">
                  {(Object.keys(OS_LABEL) as Os[]).map((o) => (
                    <option key={o} value={o}>
                      {OS_LABEL[o]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p id="folder-help" className="t-secondary">
              {HOW_TO_COPY[os]} Browsers hide this path from websites, which is why it is typed here. It stays on this page and is not sent anywhere.
            </p>
            {folder.problem ? (
              <p role="alert" className="mt-2 rounded-md bg-warning-soft p-3 text-[15px] text-warning-ink">
                {folder.problem}
              </p>
            ) : null}
          </Step>
          <Step n={3} title={`Connect ${info.name}`}>
            {connect ? (
              <div className="space-y-5">
                {connect.blocks.map((b) => (
                  <BlockView key={b.title} block={b} />
                ))}
              </div>
            ) : (
              <p className="t-secondary">Enter the folder path above and the exact command for {info.name} appears here.</p>
            )}
          </Step>
        </ol>
      )}

      <p className="mb-2 font-medium">{agent === 'claude-desktop' ? 'Then tell your agent:' : '4. Then tell your agent:'}</p>
      <CopyField text={INTERVIEW_COMMAND} />
      <p className="t-secondary mt-2">The interview takes 15 to 20 minutes. When it’s done, come back here and press Refresh.</p>

      {connect && connect.after.length > 0 ? (
        <ul className="t-secondary mt-4 list-disc space-y-1 pl-5">
          {connect.after.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <p className="t-secondary mt-4">
        A chat in a web browser (ChatGPT, Gemini or claude.ai) cannot run a local server, so it cannot save to Loam. You can still give it a process or a skill: open it in Loam and press “Copy for any chat”. Any agent that opens this folder can also read it by following AGENTS.md.
      </p>
      <p className="t-secondary mt-2">
        Something not working? <NewTabLink inline href={ISSUES_URL}>Tell us on GitHub</NewTabLink> which agent and which computer you use.
      </p>
    </Card>
  );
}
