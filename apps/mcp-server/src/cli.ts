import os from 'node:os';

export const USAGE = `Loam MCP server — gives your AI agent access to your Loam knowledge base.

Usage:
  loam-mcp --folder <path>     Start the server for the folder you set up in the Loam app
  loam-mcp --check --folder <path>
                               Check that Node, the folder and search work, then exit
  loam-mcp --version | --help

The folder can also be given with the LOAM_FOLDER environment variable.
Your agent starts this server for you: add it to the agent's MCP settings (Loam app → Connect your agent).`;

export type Cli =
  | { kind: 'run'; folder: string | undefined }
  | { kind: 'check'; folder: string | undefined }
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'error'; message: string };

/** Quotes some launchers leave around a path, and ~ for the home folder (JSON configs never expand it). */
export function resolveFolderInput(raw: string | undefined, home: string = os.homedir()): string | undefined {
  if (raw === undefined) return undefined;
  let value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1).trim();
  if (value === '') return undefined;
  if (value === '~') return home;
  if (value.startsWith('~/') || value.startsWith('~\\')) return `${home}${value.slice(1)}`;
  return value;
}

export function parseCli(argv: string[], env: Record<string, string | undefined> = {}): Cli {
  let folder: string | undefined;
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') return { kind: 'help' };
    if (arg === '--version' || arg === '-v') return { kind: 'version' };
    if (arg === '--check') check = true;
    else if (arg === '--folder' || arg === '-f') {
      const next = argv[++i];
      if (next === undefined || next.startsWith('--')) return { kind: 'error', message: `${arg} needs a path, for example: ${arg} ~/Loam` };
      folder = next;
    } else if (arg.startsWith('--folder=')) folder = arg.slice('--folder='.length);
    else if (!arg.startsWith('-') && folder === undefined) folder = arg;
    else return { kind: 'error', message: `Unknown option "${arg}".` };
  }
  const resolved = resolveFolderInput(folder ?? env.LOAM_FOLDER);
  return check ? { kind: 'check', folder: resolved } : { kind: 'run', folder: resolved };
}
