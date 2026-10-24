import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyPlan, planScaffold } from '../packages/loam-core/src';
import { NodeStore } from '../apps/mcp-server/src/node-store';
import { REPO } from './harness';

const { site } = (await import('../scripts/lib/site-node.mjs')) as { site: import('../scripts/lib/site.d.mts').Site };

const run = promisify(execFile);
let tarball: string;
let folder: string;
const cleanup: string[] = [];

/**
 * The package every agent except Claude Desktop starts with `npx -y loam-mcp --folder <path>`. It is packed exactly as
 * it would be published, installed by npx from the tarball (which downloads better-sqlite3 from npm, like a real
 * user's first start), and spoken to with a real MCP client over stdio. Needs network.
 */
beforeAll(async () => {
  execFileSync('npm', ['run', 'pack:npm'], { cwd: REPO, stdio: 'pipe' });
  const dir = path.join(REPO, 'apps/mcp-server/dist/npm-out');
  tarball = path.join(dir, readdirSync(dir).find((f) => f.endsWith('.tgz'))!);
  folder = mkdtempSync(path.join(tmpdir(), 'loam npm test-'));
  cleanup.push(folder);
  const store = new NodeStore(folder);
  await store.init();
  await applyPlan(store, await planScaffold(store, new Date().toISOString().slice(0, 10)));
}, 120_000);
afterAll(() => cleanup.forEach((d) => rmSync(d, { recursive: true, force: true })));

const npx = (args: string[], env: Record<string, string> = {}) =>
  run('npx', ['-y', '--package', tarball, 'loam-mcp', ...args], { env: { ...process.env, ...env }, timeout: 180_000 }).then(
    (r) => ({ code: 0, out: r.stdout, err: r.stderr }),
    (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout, err: e.stderr }),
  );

describe('the loam-mcp npm package', () => {
  it('stages the description for the official MCP Registry beside the package, agreeing with it, and leaves it out of the package', () => {
    const stage = path.join(REPO, 'apps/mcp-server/dist/npm');
    const server = JSON.parse(readFileSync(path.join(stage, 'server.json'), 'utf8'));
    const pkg = JSON.parse(readFileSync(path.join(stage, 'package.json'), 'utf8'));
    expect(server.name).toBe(pkg.mcpName);
    expect(server.version).toBe(pkg.version);
    expect(server.packages[0]).toMatchObject({ registryType: 'npm', identifier: pkg.name, version: pkg.version, transport: { type: 'stdio' } });
    expect(server.repository.url).toBe(site.githubUrl);
    const inTarball = execFileSync('tar', ['-tzf', tarball]).toString();
    expect(inTarball).not.toContain('server.json');
    expect(inTarball).toContain('package/index.mjs');
  });

  it('prints help and its version', async () => {
    const help = await npx(['--help']);
    expect(help.code).toBe(0);
    expect(help.out).toContain('loam-mcp --folder <path>');
    expect(help.out).toContain(`Source, documentation and issues: ${site.githubUrl}`);
    const version = await npx(['--version']);
    expect(version.out.trim()).toBe(JSON.parse(execFileSync('node', ['-p', "JSON.stringify(require('./apps/mcp-server/manifest.json'))"], { cwd: REPO }).toString()).version);
  });

  it('--check tells a person what is wrong and what to do', async () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'loam empty-'));
    cleanup.push(empty);
    const bad = await npx(['--check', '--folder', empty]);
    expect(bad.code).toBe(1);
    expect(bad.out).toMatch(/Loam knowledge base: NOT yet\. Open the Loam app/);
    expect(bad.out).toContain(`Still stuck? Tell us which agent and computer you use: ${site.issuesUrl}`);
    const missing = await npx(['--check', '--folder', path.join(empty, 'nope')]);
    expect(missing.code).toBe(1);
    expect(missing.out).toMatch(/does not exist/);
    const good = await npx(['--check', '--folder', folder]);
    expect(good.code, good.out + good.err).toBe(0);
    expect(good.out).toContain('Loam knowledge base: yes');
    expect(good.out).not.toContain('Still stuck?'); // only shown when something is wrong
    expect(good.out).toContain('SQLite full-text index (ok)');
    expect(good.out).toMatch(/Node 22\.|Node 2[3-9]\./);
  }, 240_000);

  it('works as an MCP server over stdio: the folder in --folder, spaces in the path, SQLite search', async () => {
    const transport = new StdioClientTransport({ command: 'npx', args: ['-y', '--package', tarball, 'loam-mcp', '--folder', folder], stderr: 'pipe' });
    let stderr = '';
    transport.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
    const client = new Client({ name: 'npm-test', version: '0' });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(17);
      const call = async (name: string, args: Record<string, unknown> = {}) =>
        ((await client.callTool({ name, arguments: args })) as { content: { text: string }[] }).content.map((c) => c.text).join('\n');
      expect(await call('loam_overview')).toMatch(/Onboarding interview: not started/);
      writeFileSync(path.join(folder, 'context', 'kiwi.md'), '# Kiwi\n\nThe kiwi account renews in March.\n');
      expect(await call('loam_search', { query: 'kiwi renews' })).toContain('context/kiwi.md');
      expect(stderr).not.toMatch(/unavailable|could not open|unexpected error/);
    } finally {
      await client.close();
    }
  }, 240_000);

  it('also accepts the folder from LOAM_FOLDER and as --folder=<path>', async () => {
    const viaEnv = await npx(['--check'], { LOAM_FOLDER: folder });
    expect(viaEnv.code, viaEnv.out).toBe(0);
    const viaEquals = await npx([`--folder=${folder}`, '--check']);
    expect(viaEquals.code, viaEquals.out).toBe(0);
  }, 240_000);
});
