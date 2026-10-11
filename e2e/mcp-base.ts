import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { applyPlan, planScaffold } from '../packages/loam-core/src';
import { createContext } from '../apps/mcp-server/src/context';
import { NodeStore } from '../apps/mcp-server/src/node-store';
import { createLoamServer } from '../apps/mcp-server/src/server';

const walk = (dir: string, base = dir): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });

export const INTERVIEW = {
  profile: { name: 'Sarah Chen', role: 'Account manager', company: 'Northlight', industry: 'Marketing agency', tools: ['HubSpot', 'Google Sheets'], style: 'Warm, direct.' },
  processes: [
    { title: 'Weekly client report', frequency: 'weekly', minutes_per_run: 40, automation: 'ready', inputs: ['CRM export'], what: 'A one-page summary for each client.', steps: ['Pull numbers', 'Write the summary'], good: 'Numbers first.' },
    { title: 'Monthly invoice check', frequency: 'monthly', minutes_per_run: 120, automation: 'needs-access', what: 'Check invoices against hours.' },
    { title: 'Contract negotiation', frequency: 'ad-hoc', minutes_per_run: 180, automation: 'manual-only', runs_per_year: 6, what: 'Live negotiation.' },
  ],
  glossary: [{ term: 'MRR', meaning: 'Monthly recurring revenue' }],
  entities: [{ name: 'Acme', kind: 'client', notes: 'Prefers short emails' }],
  stage: 'summary',
  complete: true,
};

/** Builds a base the way an agent would, through the real MCP tools, and returns its files. */
export async function buildBaseWithAgent(): Promise<Record<string, string>> {
  const dir = mkdtempSync(path.join(tmpdir(), 'loam-e2e-'));
  try {
    const store = new NodeStore(dir);
    await store.init();
    const today = new Date().toISOString().slice(0, 10);
    await applyPlan(store, await planScaffold(store, today));
    const ctx = createContext(dir);
    const server = createLoamServer(ctx);
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'e2e', version: '0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    const call = async (name: string, args: Record<string, unknown>) => {
      const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
      if (r.isError) throw new Error(`${name}: ${r.content[0]?.text}`);
    };
    await call('loam_save_interview', INTERVIEW);
    await call('loam_add_example', { slug: 'weekly-client-report', content: '# Acme weekly\n\nSessions up 12%.', kind: 'good' });
    await call('loam_record_correction', { slug: 'weekly-client-report', note: 'Numbers go in the first paragraph.', before: 'A good week', after: 'Sessions up 12%' });
    for (let i = 0; i < 2; i++) await call('loam_log_run', { slug: 'weekly-client-report' });
    await client.close();
    ctx.ready?.search.close();
    const files: Record<string, string> = {};
    for (const rel of walk(dir)) {
      if (rel.startsWith('.loam/history/') || rel === '.loam/index.sqlite') continue;
      files[rel] = readFileSync(path.join(dir, rel), 'utf8');
    }
    return files;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
