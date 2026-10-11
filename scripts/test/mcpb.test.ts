import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repo = path.resolve(__dirname, '../..');
const mcpb = path.join(repo, 'apps/mcp-server/dist/loam.mcpb');

/**
 * Runs the packed extension the way Claude Desktop does: unzip, run `node server/index.mjs` with the
 * folder in LOAM_FOLDER, speak MCP over stdio. Needs `npm run pack:mcpb` first (CI does this).
 */
describe.skipIf(!existsSync(mcpb))('packed loam.mcpb (acceptance 7)', () => {
  let unpacked: string;
  let folder: string;
  let client: Client;
  let stderr = '';

  beforeAll(async () => {
    unpacked = mkdtempSync(path.join(tmpdir(), 'loam-mcpb-'));
    folder = mkdtempSync(path.join(tmpdir(), 'loam-kb-'));
    execFileSync('npx', ['mcpb', 'unpack', mcpb, unpacked], { cwd: repo, stdio: 'pipe' });
    const manifest = JSON.parse(readFileSync(path.join(unpacked, 'manifest.json'), 'utf8'));
    const entry = manifest.server.mcp_config.args[0].replace('${__dirname}', unpacked);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      env: { ...(process.env as Record<string, string>), [Object.keys(manifest.server.mcp_config.env)[0]!]: folder },
      stderr: 'pipe',
    });
    transport.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
    client = new Client({ name: 'mcpb-test', version: '0' });
    await client.connect(transport);
  });
  afterAll(async () => {
    await client?.close();
    rmSync(unpacked, { recursive: true, force: true });
    rmSync(folder, { recursive: true, force: true });
  });

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    return { text: r.content.map((c) => c.text).join('\n'), isError: Boolean(r.isError) };
  };

  it('the manifest asks for a directory and passes it as LOAM_FOLDER', () => {
    const manifest = JSON.parse(readFileSync(path.join(unpacked, 'manifest.json'), 'utf8'));
    expect(manifest.user_config.knowledge_base_folder).toMatchObject({ type: 'directory', required: true });
    expect(manifest.server.mcp_config.env.LOAM_FOLDER).toBe('${user_config.knowledge_base_folder}');
    expect(manifest.compatibility.runtimes.node).toBe('>=22');
  });

  it('lists the same tools the manifest advertises', async () => {
    const manifest = JSON.parse(readFileSync(path.join(unpacked, 'manifest.json'), 'utf8'));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(manifest.tools.map((t: { name: string }) => t.name).sort());
  });

  it('explains that an empty folder is not a base yet', async () => {
    const r = await call('loam_overview');
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/not a Loam knowledge base yet/);
  });

  it('works on a real base, with the native SQLite index loaded from prebuilds', async () => {
    // Initialise the folder the way the app does, using the same core.
    const { applyPlan, planScaffold } = await import('@loam/core');
    const { NodeStore } = await import('../../apps/mcp-server/src/node-store');
    const store = new NodeStore(folder);
    await store.init();
    await applyPlan(store, await planScaffold(store, '2026-10-11'));
    expect((await call('loam_overview')).text).toMatch(/Onboarding interview: not started/);
    writeFileSync(path.join(folder, 'context', 'quokka.md'), '# Quokka\n\nThe quokka account is our oldest client.\n');
    const hit = await call('loam_search', { query: 'quokka' });
    expect(hit.text).toContain('context/quokka.md');
    expect(hit.text).not.toMatch(/Basic search/);
    expect(existsSync(path.join(folder, '.loam', 'index.sqlite'))).toBe(true);
    expect((await call('loam_lint')).text).toMatch(/Context health/);
    expect(stderr).not.toMatch(/unavailable|could not open|unexpected error/);
  });
});
