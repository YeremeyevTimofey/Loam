import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { afterAll, describe, expect, it } from 'vitest';
import { AGENTS, checkFolder, connectFor, detectOs, quoteArg, serverCommand, type AgentId, type Os } from '../src/app/lib/agents';

const PKG = 'loam-mcp';
const TRICKY = ['/Users/sarah/Loam', '/Users/sarah/My Loam', "/Users/sarah/Sarah's Loam", '/Users/sarah/$HOME/Loam', '/Users/sarah/a`b`/Loam', '/Users/sarah/semi;colon & amp/Loam', '/Users/sarah/Папка Loam', '/Users/sarah/star*glob?/Loam', '~/Loam', '/Users/sarah/"quoted"/Loam'];
const cfg = (agent: AgentId, folder: string, os: Os = 'mac') => connectFor(agent, { os, npmPackage: PKG, folder });
const block = (agent: AgentId, kind: string, folder = '/Users/sarah/My Loam', os: Os = 'mac') => cfg(agent, folder, os).blocks.find((b) => b.kind === kind)!;

describe('how each agent starts the server', () => {
  it('uses npx directly on Mac and Linux, and cmd /c npx on Windows', () => {
    expect(serverCommand({ os: 'mac', npmPackage: PKG, folder: '/x/Loam' })).toEqual({ command: 'npx', args: ['-y', 'loam-mcp', '--folder', '/x/Loam'] });
    expect(serverCommand({ os: 'linux', npmPackage: PKG, folder: '/x/Loam' })).toEqual({ command: 'npx', args: ['-y', 'loam-mcp', '--folder', '/x/Loam'] });
    expect(serverCommand({ os: 'windows', npmPackage: PKG, folder: 'C:\\Users\\Sarah\\Loam' })).toEqual({ command: 'cmd', args: ['/c', 'npx', '-y', 'loam-mcp', '--folder', 'C:\\Users\\Sarah\\Loam'] });
  });

  it('lists the agents people ask for, Claude Desktop first, and only Claude Desktop needs no Node', () => {
    expect(AGENTS.map((a) => a.id)).toEqual(['claude-desktop', 'claude-code', 'cursor', 'codex', 'vscode', 'gemini', 'windsurf', 'other']);
    expect(AGENTS.filter((a) => !a.needsNode).map((a) => a.id)).toEqual(['claude-desktop']);
    expect(cfg('claude-desktop', '').blocks).toEqual([]);
  });
});

describe('JSON and TOML configs are valid for every system and every tricky path', () => {
  for (const folder of [...TRICKY, 'C:\\Users\\Sarah\\My Loam', '\\\\server\\share\\Loam']) {
    for (const os of ['mac', 'windows'] as const) {
      it(`${os}: ${folder}`, () => {
        const expected = serverCommand({ os, npmPackage: PKG, folder });
        for (const agent of ['cursor', 'windsurf', 'other'] as const) {
          const parsed = JSON.parse(block(agent, 'file', folder, os).text!);
          expect(parsed.mcpServers.loam, agent).toEqual(expected);
        }
        expect(JSON.parse(block('gemini', 'file', folder, os).text!).mcpServers.loam).toEqual({ ...expected, timeout: 60000 });
        expect(JSON.parse(block('vscode', 'file', folder, os).text!).servers.loam).toEqual({ type: 'stdio', ...expected });
        const toml = parseToml(block('codex', 'file', folder, os).text!) as { mcp_servers: { loam: { command: string; args: string[]; startup_timeout_sec: number } } };
        expect(toml.mcp_servers.loam).toEqual({ ...expected, startup_timeout_sec: 60 });
      });
    }
  }

  it('the Cursor link carries the same config in base64, Unicode paths included', () => {
    for (const folder of ['/Users/sarah/Loam', '/Users/sarah/Папка Loam', '/Users/sarah/日本語']) {
      const href = block('cursor', 'link', folder).href!;
      const url = new URL(href);
      expect(`${url.protocol}//${url.host}${url.pathname}`).toBe('cursor://anysphere.cursor-deeplink/mcp/install');
      expect(url.searchParams.get('name')).toBe('loam');
      const decoded = JSON.parse(Buffer.from(url.searchParams.get('config')!, 'base64').toString('utf8'));
      expect(decoded).toEqual(serverCommand({ os: 'mac', npmPackage: PKG, folder }));
    }
  });

  it('the VS Code link carries name, type and command, URL-encoded', () => {
    const href = block('vscode', 'link', '/Users/sarah/Папка Loam').href!;
    expect(href.startsWith('vscode:mcp/install?')).toBe(true);
    expect(JSON.parse(decodeURIComponent(href.slice('vscode:mcp/install?'.length)))).toEqual({ name: 'loam', type: 'stdio', command: 'npx', args: ['-y', 'loam-mcp', '--folder', '/Users/sarah/Папка Loam'] });
  });
});

describe('the commands people paste into a terminal survive a real shell', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'loam-agents-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  // Stand-ins for claude / codex / code that print the arguments they received, as JSON.
  for (const name of ['claude', 'codex', 'code']) {
    writeFileSync(path.join(dir, name), `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)));\n`);
    chmodSync(path.join(dir, name), 0o755);
  }
  const run = (command: string): string[] => JSON.parse(execFileSync('sh', ['-c', command], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, HOME: '/home/someone' } }).toString());

  for (const folder of TRICKY) {
    it(`claude mcp add: ${folder}`, () => {
      expect(run(block('claude-code', 'command', folder).text!)).toEqual(['mcp', 'add', '--transport', 'stdio', '--scope', 'user', 'loam', '--', 'npx', '-y', 'loam-mcp', '--folder', folder]);
    });
    it(`codex mcp add: ${folder}`, () => {
      expect(run(block('codex', 'command', folder).text!)).toEqual(['mcp', 'add', 'loam', '--', 'npx', '-y', 'loam-mcp', '--folder', folder]);
    });
    it(`code --add-mcp: ${folder}`, () => {
      const argv = run(block('vscode', 'command', folder).text!);
      expect(argv[0]).toBe('--add-mcp');
      expect(JSON.parse(argv[1]!)).toEqual({ name: 'loam', type: 'stdio', command: 'npx', args: ['-y', 'loam-mcp', '--folder', folder] });
    });
  }

  it('a path that starts with ~ is quoted, so the server (not the shell) expands it', () => {
    expect(quoteArg('~/Loam', 'mac')).toBe("'~/Loam'");
    expect(run(block('claude-code', 'command', '~/Loam').text!).at(-1)).toBe('~/Loam');
  });
});

describe('Windows commands (shape only: they cannot run here)', () => {
  it('wrap the path in double quotes and go through cmd /c', () => {
    expect(block('claude-code', 'command', 'C:\\Users\\Sarah\\My Loam', 'windows').text).toBe('claude mcp add --transport stdio --scope user loam -- cmd /c npx -y loam-mcp --folder "C:\\Users\\Sarah\\My Loam"');
    expect(block('codex', 'command', 'D:\\Loam', 'windows').text).toBe('codex mcp add loam -- cmd /c npx -y loam-mcp --folder "D:\\Loam"');
  });
  it('config file locations follow the system', () => {
    expect(block('cursor', 'file', 'x', 'mac').file).toBe('~/.cursor/mcp.json');
    expect(block('cursor', 'file', 'x', 'windows').file).toBe('%USERPROFILE%\\.cursor\\mcp.json');
    expect(block('codex', 'file', 'x', 'windows').file).toBe('%USERPROFILE%\\.codex\\config.toml');
    expect(block('gemini', 'file', 'x', 'linux').file).toBe('~/.gemini/settings.json');
  });
  it('the VS Code command escapes the JSON for cmd', () => {
    const text = block('vscode', 'command', 'C:\\Loam', 'windows').text!;
    expect(text.startsWith('code --add-mcp "{\\"name\\":\\"loam\\"')).toBe(true);
  });
});

describe('what people paste as a folder path', () => {
  it('removes quotes, file:// links and trailing slashes', () => {
    expect(checkFolder('"/Users/sarah/My Loam"', 'mac').path).toBe('/Users/sarah/My Loam');
    expect(checkFolder("'/Users/sarah/Loam/'", 'mac').path).toBe('/Users/sarah/Loam');
    expect(checkFolder('file:///Users/sarah/My%20Loam', 'mac').path).toBe('/Users/sarah/My Loam');
    expect(checkFolder('file:///C:/Users/Sarah/Loam', 'windows').path).toBe('C:\\Users\\Sarah\\Loam');
    expect(checkFolder('"C:\\Users\\Sarah\\Loam\\"', 'windows').path).toBe('C:\\Users\\Sarah\\Loam');
    expect(checkFolder('   ', 'mac')).toEqual({ path: '', problem: null });
  });
  it('warns about the usual mistakes, and stays quiet when the path is fine', () => {
    expect(checkFolder('Loam', 'mac').problem).toMatch(/full path/);
    expect(checkFolder('./Loam', 'mac').problem).toMatch(/full path/);
    expect(checkFolder('C:\\Users\\Sarah\\Loam', 'mac').problem).toMatch(/Windows-style/);
    expect(checkFolder('/Users/sarah/Loam', 'windows').problem).toMatch(/Mac or Linux/);
    expect(checkFolder('C:\\Users\\50% off\\Loam', 'windows').problem).toMatch(/Special characters/);
    expect(checkFolder('/Users/sarah/Notes', 'mac', 'Loam').problem).toMatch(/called “Loam”.*ends in “Notes”/);
    for (const [p, os] of [['/Users/sarah/Loam', 'mac'], ['~/Loam', 'mac'], ['C:\\Users\\Sarah\\Loam', 'windows'], ['\\\\server\\share\\Loam', 'windows']] as const) {
      expect(checkFolder(p, os, 'Loam').problem, p).toBeNull();
    }
  });
  it('detects the system from the browser', () => {
    expect(detectOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel')).toBe('mac');
    expect(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32')).toBe('windows');
    expect(detectOs('Mozilla/5.0 (X11; Linux x86_64)', 'Linux x86_64')).toBe('linux');
  });
});
