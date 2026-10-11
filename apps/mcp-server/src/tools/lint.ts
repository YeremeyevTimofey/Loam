import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FILE } from '@loam/core';
import { runLint, type LintReport } from '@loam/core/lint';
import type { Ctx } from '../context';
import { defineTool } from './define';
import { requireBase } from './read';

const n = (x: number) => x.toLocaleString('en-US');

export function lintText(r: LintReport): string {
  const lines: string[] = [];
  const attention = r.findings.length;
  lines.push(attention ? `Context health: ${attention} thing${attention === 1 ? '' : 's'} to look at.` : 'Context health: everything looks good.');
  lines.push('', 'Checks:');
  for (const c of r.checks) lines.push(`${c.status === 'ok' ? '✓' : '!'} ${c.name}: ${c.summary}`);
  if (attention) {
    lines.push('', 'What to look at (most important first):');
    for (const f of r.findings.slice(0, 12)) lines.push(`- ${f.title}. ${f.detail}`);
    if (attention > 12) lines.push(`… and ${attention - 12} more in the Loam app.`);
  }
  const s = r.savings;
  lines.push('', `Before / after: ${n(s.beforeTokens)} → ${n(s.afterTokens)} tokens (${s.percent}% less) if the suggestions are applied.`);
  for (const i of s.items) lines.push(`  - ${i.label}: ${n(i.tokens)} tokens`);
  lines.push('', 'The Health screen of the Loam app can apply the safe fixes, each one with a preview.');
  return lines.join('\n');
}

export function registerLintTool(server: McpServer, ctx: Ctx): void {
  defineTool(server, ctx, {
    name: 'loam_lint',
    title: 'Check the health of the knowledge base',
    description:
      'Runs the Context Lint: what a typical task costs in tokens, files over their size limit, repeated text, possible contradictions, outdated processes, unfilled templates, processes without examples, unreviewed imported skills, skills without a description, and whether the agent copies of the skills are in sync. Returns a plain-language report with a before/after estimate.',
    input: {},
    kind: 'write',
    handler: async (_args, ready) => {
      await requireBase(ready);
      const report = await runLint(ready.store, { today: ready.today() });
      await ready.store.writeFile(FILE.lintReport, `${JSON.stringify(report, null, 2)}\n`);
      return lintText(report);
    },
  });
}
