import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { isKnowledgeBase } from '@loam/core';
import { parseCli, REPO, USAGE } from './cli';
import { createContext } from './context';
import { createLoamServer, SERVER_VERSION } from './server';

// stdout carries the protocol. Anything meant for a human goes to stderr (--help, --version and --check excepted).
const cli = parseCli(process.argv.slice(2), process.env);

if (cli.kind === 'help') {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}
if (cli.kind === 'version') {
  process.stdout.write(`${SERVER_VERSION}\n`);
  process.exit(0);
}
if (cli.kind === 'error') {
  process.stderr.write(`${cli.message}\n\n${USAGE}\n`);
  process.exit(2);
}

const ctx = createContext(cli.folder);

if (cli.kind === 'check') {
  const major = Number(process.versions.node.split('.')[0]);
  const lines = [`Loam MCP server ${SERVER_VERSION}`, `Node ${process.versions.node} ${major >= 22 ? '(ok)' : '(too old: Node 22 or newer is needed)'}`];
  let ok = major >= 22;
  if (ctx.ready) {
    lines.push(`Folder ${ctx.ready.store.root} (found)`);
    const base = await isKnowledgeBase(ctx.ready.store);
    lines.push(base ? 'Loam knowledge base: yes' : 'Loam knowledge base: NOT yet. That is fine: your agent can set it up when you first ask (it will ask you), or open the Loam app in Chrome or Edge and choose this same folder.');
    ok = ok && base;
    await ctx.ready.search.sync().catch(() => undefined);
    lines.push(`Search: ${ctx.ready.search.mode === 'fts5' ? 'SQLite full-text index (ok)' : 'basic keyword scan (the SQLite module did not load; everything else works)'}`);
  } else {
    lines.push(`Folder: ${ctx.problem}`);
    ok = false;
  }
  if (!ok && REPO) lines.push(`Still stuck? Tell us which agent and computer you use: ${REPO}/issues`);
  process.stdout.write(`${lines.join('\n')}\n`);
  ctx.ready?.search.close();
  process.exit(ok ? 0 : 1);
}

if (ctx.problem) process.stderr.write(`[loam] ${ctx.problem}\n`);

const server = createLoamServer(ctx);
await server.connect(new StdioServerTransport());
process.stderr.write(`[loam] ready${ctx.ready ? ` — ${ctx.ready.store.root}` : ''}\n`);
// Build the search index in the background so the first search is fast.
ctx.ready?.search.sync().catch((error: Error) => process.stderr.write(`[loam] indexing failed: ${error.message}\n`));

const shutdown = () => {
  ctx.ready?.search.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
