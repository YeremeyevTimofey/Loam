// What each AI agent needs to be connected to the Loam MCP server, as plain data and pure functions.
// No browser or Node APIs: the app (live, with the person's folder path) and the install page (at build time, with a
// placeholder path) use the same code, and the tests check the output with real parsers and a real shell.
//
// Formats come from each tool's own documentation (checked October 2026): Claude Code `claude mcp add`, Cursor
// mcp.json + install deeplink (base64 JSON), Codex config.toml + `codex mcp add`, VS Code mcp.json + `code --add-mcp`
// + vscode:mcp/install (URL-encoded JSON), Gemini CLI settings.json, Windsurf mcp_config.json.

export type Os = 'mac' | 'windows' | 'linux';

export type AgentId = 'claude-desktop' | 'claude-code' | 'cursor' | 'codex' | 'vscode' | 'gemini' | 'windsurf' | 'other';

export interface AgentInfo {
  id: AgentId;
  name: string;
  /** One line shown under the name. */
  blurb: string;
  /** Claude Desktop installs a bundle that carries its own Node; every other agent starts the server with npx. */
  needsNode: boolean;
}

export const AGENTS: AgentInfo[] = [
  { id: 'claude-desktop', name: 'Claude Desktop', blurb: 'One file, one click. Nothing else to install.', needsNode: false },
  { id: 'claude-code', name: 'Claude Code', blurb: 'One command in your terminal.', needsNode: true },
  { id: 'cursor', name: 'Cursor', blurb: 'A one-click link in the app, or a few lines in mcp.json.', needsNode: true },
  { id: 'codex', name: 'Codex', blurb: 'One command, or a few lines in config.toml.', needsNode: true },
  { id: 'vscode', name: 'VS Code (Copilot)', blurb: 'A one-click link in the app, or one command.', needsNode: true },
  { id: 'gemini', name: 'Gemini CLI', blurb: 'A few lines in settings.json.', needsNode: true },
  { id: 'windsurf', name: 'Windsurf', blurb: 'A few lines in mcp_config.json.', needsNode: true },
  { id: 'other', name: 'Another agent', blurb: 'Any agent that can run a local MCP server.', needsNode: true },
];

export const SERVER_NAME = 'loam';

export function detectOs(userAgent: string, platform = ''): Os {
  const text = `${platform} ${userAgent}`.toLowerCase();
  if (text.includes('win')) return 'windows';
  if (text.includes('mac') || text.includes('iphone') || text.includes('ipad')) return 'mac';
  return 'linux';
}

export interface FolderCheck {
  /** The path, tidied (quotes and trailing slashes removed). Empty when nothing usable was entered. */
  path: string;
  /** Something the person should look at before copying, or null. */
  problem: string | null;
}

/** Tidies what people paste: quotes from "Copy as path", file:// links, trailing separators. */
export function checkFolder(raw: string, os: Os, expectedName?: string): FolderCheck {
  let value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1).trim();
  if (/^file:\/\//i.test(value)) {
    try {
      value = decodeURIComponent(new URL(value).pathname);
      if (/^\/[a-zA-Z]:/.test(value)) value = value.slice(1).replace(/\//g, '\\');
    } catch {
      /* keep as typed */
    }
  }
  if (value.length > 1) value = value.replace(/[\\/]+$/, '') || value;
  if (value === '') return { path: '', problem: null };
  const absolute = /^([a-zA-Z]:[\\/]|\\\\|\/|~[\\/]?$|~[\\/])/.test(value);
  if (!absolute) return { path: value, problem: 'This does not look like a full path. It should start with / (Mac, Linux), ~/ or a drive letter such as C:\\ (Windows).' };
  if (os === 'windows' && /[%$`!"]/.test(value)) return { path: value, problem: 'Special characters (% $ ` ! ") in the path can break the command. Move the folder to a simpler path, or type the config by hand.' };
  if (os !== 'windows' && /^[a-zA-Z]:[\\/]/.test(value)) return { path: value, problem: 'This is a Windows-style path, but your system looks like Mac or Linux. Pick “Windows” above if that is right.' };
  if (os === 'windows' && value.startsWith('/') && !value.startsWith('//')) return { path: value, problem: 'This is a Mac or Linux style path. Pick the matching system above, or copy the Windows path (it starts with a drive letter such as C:\\).' };
  if (expectedName) {
    const last = value.split(/[\\/]/).pop() ?? '';
    if (last !== expectedName && value !== '~') return { path: value, problem: `The folder you set up is called “${expectedName}”, but this path ends in “${last}”. Check it points to the same folder.` };
  }
  return { path: value, problem: null };
}

/** Quotes one argument for the shell the person will paste into (POSIX shells, or cmd/PowerShell on Windows). */
export function quoteArg(value: string, os: Os): string {
  // Windows (cmd and PowerShell): plain words stay as they are; anything with a backslash, space or symbol gets double quotes.
  if (os === 'windows') return /^[A-Za-z0-9_.@+=,:/-]+$/.test(value) ? value : `"${value}"`;
  if (/^[A-Za-z0-9_@%+=:,./~-]+$/.test(value) && !value.startsWith('~')) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export interface ServerCommand {
  command: string;
  args: string[];
}

/** How an agent starts the server. On Windows npx is a script, so it goes through cmd /c (what every client expects). */
export function serverCommand(opts: { os: Os; npmPackage: string; folder: string }): ServerCommand {
  const inner = ['npx', '-y', opts.npmPackage, '--folder', opts.folder];
  return opts.os === 'windows' ? { command: 'cmd', args: ['/c', ...inner] } : { command: 'npx', args: inner.slice(1) };
}

const json = (value: unknown) => JSON.stringify(value, null, 2);
const base64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};

export type BlockKind = 'command' | 'file' | 'link';

export interface Block {
  kind: BlockKind;
  /** Short heading, e.g. "Run this in your terminal". */
  title: string;
  /** Command line or file content. */
  text?: string;
  /** For `file`: where it goes. */
  file?: string;
  /** For `link`: the address and its label. */
  href?: string;
  label?: string;
  note?: string;
  language?: 'bash' | 'json' | 'toml';
}

export interface Connect {
  /** Steps to show, in order. */
  blocks: Block[];
  /** Said once, after the steps. */
  after: string[];
}

const homeFile = (os: Os, unix: string, windows: string) => (os === 'windows' ? windows : unix);

/** Everything the person needs to connect `agent` to the Loam folder at `folder`. */
export function connectFor(agent: AgentId, opts: { os: Os; npmPackage: string; folder: string }): Connect {
  const { os, npmPackage, folder } = opts;
  const server = serverCommand({ os, npmPackage, folder });
  const shellLine = [server.command, ...server.args.map((a) => quoteArg(a, os))].join(' ');
  const mcpServers = { mcpServers: { [SERVER_NAME]: server } };
  const firstRun = 'The first start downloads the server (about 15 MB) and can take up to a minute.';

  switch (agent) {
    case 'claude-desktop':
      return { blocks: [], after: [] };

    case 'claude-code':
      return {
        blocks: [
          {
            kind: 'command',
            title: 'Run this in your terminal',
            language: 'bash',
            text: `claude mcp add --transport stdio --scope user ${SERVER_NAME} -- ${shellLine}`,
            note: `“--scope user” makes Loam available in every project. ${firstRun}`,
          },
        ],
        after: ['Skills are picked up from the .claude/skills folder in your Loam folder after you press “Sync to agents” in the Skills screen.'],
      };

    case 'cursor': {
      const config = base64(JSON.stringify(server));
      return {
        blocks: [
          {
            kind: 'link',
            title: 'Install in one click',
            href: `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${encodeURIComponent(config)}`,
            label: 'Add Loam to Cursor',
            note: 'Cursor asks you to confirm. If the link does nothing, use the file below.',
          },
          { kind: 'file', title: 'Or add it by hand', file: homeFile(os, '~/.cursor/mcp.json', '%USERPROFILE%\\.cursor\\mcp.json'), language: 'json', text: json(mcpServers), note: `If the file already has other servers, add only the “${SERVER_NAME}” entry inside “mcpServers”. ${firstRun}` },
        ],
        after: ['Cursor reads AGENTS.md from your folder by itself, and skills from .agents/skills after “Sync to agents”.'],
      };
    }

    case 'codex': {
      const toml = [`[mcp_servers.${SERVER_NAME}]`, `command = ${JSON.stringify(server.command)}`, `args = [${server.args.map((a) => JSON.stringify(a)).join(', ')}]`, 'startup_timeout_sec = 60'].join('\n');
      return {
        blocks: [
          { kind: 'command', title: 'Run this in your terminal', language: 'bash', text: `codex mcp add ${SERVER_NAME} -- ${shellLine}`, note: firstRun },
          { kind: 'file', title: 'Or add it to Codex’s config', file: homeFile(os, '~/.codex/config.toml', '%USERPROFILE%\\.codex\\config.toml'), language: 'toml', text: toml, note: 'The 60 seconds give the first start time to download the server.' },
        ],
        after: ['Codex reads AGENTS.md from your folder by itself, and skills from .agents/skills after “Sync to agents”.'],
      };
    }

    case 'vscode': {
      const payload = { name: SERVER_NAME, type: 'stdio', ...server };
      const payloadJson = JSON.stringify(payload);
      const cli = os === 'windows' ? `code --add-mcp "${payloadJson.replace(/"/g, '\\"')}"` : `code --add-mcp ${quoteArg(payloadJson, os)}`;
      return {
        blocks: [
          { kind: 'link', title: 'Install in one click', href: `vscode:mcp/install?${encodeURIComponent(payloadJson)}`, label: 'Add Loam to VS Code', note: 'VS Code asks you to confirm.' },
          { kind: 'command', title: 'Or run this in your terminal', language: 'bash', text: cli, note: firstRun },
          { kind: 'file', title: 'Or add it to a project’s .vscode/mcp.json', file: '.vscode/mcp.json', language: 'json', text: json({ servers: { [SERVER_NAME]: { type: 'stdio', ...server } } }) },
        ],
        after: ['Copilot reads AGENTS.md from your folder when it is the workspace, and skills from .agents/skills after “Sync to agents”.'],
      };
    }

    case 'gemini':
      return {
        blocks: [
          {
            kind: 'file',
            title: 'Add this to Gemini CLI’s settings',
            file: homeFile(os, '~/.gemini/settings.json', '%USERPROFILE%\\.gemini\\settings.json'),
            language: 'json',
            text: json({ mcpServers: { [SERVER_NAME]: { ...server, timeout: 60000 } } }),
            note: `If the file already has other servers, add only the “${SERVER_NAME}” entry inside “mcpServers”. ${firstRun}`,
          },
        ],
        after: ['Gemini CLI reads GEMINI.md from your folder, which points to AGENTS.md, and skills from .agents/skills after “Sync to agents”.'],
      };

    case 'windsurf':
      return {
        blocks: [
          {
            kind: 'file',
            title: 'Add this to Windsurf’s MCP config',
            file: homeFile(os, '~/.codeium/windsurf/mcp_config.json', '%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json'),
            language: 'json',
            text: json(mcpServers),
            note: `Open it from Windsurf’s MCP settings if the path differs in your version. ${firstRun}`,
          },
        ],
        after: ['Windsurf reads AGENTS.md from your folder when it is the workspace, and skills from .agents/skills after “Sync to agents”.'],
      };

    case 'other':
      return {
        blocks: [
          { kind: 'file', title: 'Add this to your agent’s MCP configuration', file: 'mcp.json (the name differs between agents)', language: 'json', text: json(mcpServers), note: `Most agents use this shape. The server is started with: ${shellLine}. ${firstRun}` },
        ],
        after: ['Any agent that can run a local (stdio) MCP server works. Agents that cannot can still read your folder: they follow AGENTS.md, in read-only mode.'],
      };
  }
}
