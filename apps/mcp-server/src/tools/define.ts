import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LoamError, unifiedDiff, applyPlan, planSyncAgentSkills, touchesSkills, type Plan } from '@loam/core';
import { ZodError, type z } from 'zod';
import type { Ctx, Ready } from '../context';

type Shape = Record<string, z.ZodType>;
export type ToolResult = string | { text: string; isError?: boolean };

export interface ToolDef<S extends Shape> {
  name: string;
  title: string;
  description: string;
  input: S;
  /** `write` tools run one at a time. */
  kind: 'read' | 'write';
  handler: (args: { [K in keyof S]: z.infer<S[K]> }, ready: Ready) => Promise<ToolResult>;
}

/** Registers a tool whose failures come back as readable text instead of crashing the server. */
export function defineTool<S extends Shape>(server: McpServer, ctx: Ctx, def: ToolDef<S>): void {
  server.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description,
      inputSchema: def.input,
      annotations: {
        readOnlyHint: def.kind === 'read',
        destructiveHint: false,
        idempotentHint: false,
        // The server never talks to anything outside the knowledge base folder.
        openWorldHint: false,
      },
    },
    (async (args: never) => {
      const run = async (): Promise<ToolResult> => {
        if (!ctx.ready) return { text: ctx.problem ?? 'The knowledge base is not available.', isError: true };
        return def.handler(args, ctx.ready);
      };
      try {
        const result = await (def.kind === 'write' ? ctx.lock.run(run) : run());
        const { text, isError } = typeof result === 'string' ? { text: result, isError: false } : result;
        return { content: [{ type: 'text' as const, text }], ...(isError ? { isError: true } : {}) };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: describeError(error) }], isError: true };
      }
    }) as never,
  );
}

export function describeError(error: unknown): string {
  if (error instanceof LoamError) return error.message;
  if (error instanceof ZodError) {
    return `The input is not valid: ${error.issues.map((i) => `${i.path.join('.') || 'value'} ${i.message}`).join('; ')}.`;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[loam] unexpected error: ${error instanceof Error ? (error.stack ?? message) : message}\n`);
  return `Something went wrong inside the Loam extension: ${message}. Nothing was lost; try again, and if it keeps happening tell the user.`;
}

/** Diffs of every change in a plan, as markdown the agent can show to the user. */
export function renderDiff(plan: Plan): string {
  if (plan.changes.length === 0) return 'No files changed.';
  return plan.changes
    .map((c) => {
      const kind = c.before === null ? 'created' : c.after === null ? 'deleted' : 'changed';
      const diff = unifiedDiff(c.path, c.before, c.after).split('\n');
      const shown = diff.length > 80 ? [...diff.slice(0, 80), `… (${diff.length - 80} more lines)`] : diff;
      return `File ${kind}: ${c.path}\n\`\`\`diff\n${shown.join('\n')}\n\`\`\``;
    })
    .join('\n\n');
}

/** Applies a plan, then refreshes the agent copies of the skills if skills were touched. */
export async function commit(ready: Ready, plan: Plan): Promise<void> {
  await applyPlan(ready.store, plan);
  if (touchesSkills(plan)) await applyPlan(ready.store, await planSyncAgentSkills(ready.store));
}
