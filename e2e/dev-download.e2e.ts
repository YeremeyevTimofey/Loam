import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { WEB } from './harness';

const { site: cfg } = (await import('../scripts/lib/site-node.mjs')) as { site: import('../scripts/lib/site.d.mts').Site };

/** A dev server (`npm run dev`) with the extension taken from `mcpb`, as the plugin reads it when the config loads. */
async function devServer(mcpb: string): Promise<{ origin: string; server: ViteDevServer }> {
  const before = process.env.LOAM_DEV_MCPB;
  process.env.LOAM_DEV_MCPB = mcpb;
  try {
    const server = await createServer({ root: WEB, configFile: path.join(WEB, 'vite.config.ts'), logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false } });
    await server.listen();
    return { origin: server.resolvedUrls!.local[0]!.replace(/\/$/, ''), server };
  } finally {
    if (before === undefined) delete process.env.LOAM_DEV_MCPB;
    else process.env.LOAM_DEV_MCPB = before;
  }
}

const dirs: string[] = [];
const servers: ViteDevServer[] = [];
afterAll(async () => {
  for (const s of servers) await s.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('the download address on a local dev server (before any release exists)', () => {
  it('hands out the extension built on this computer, as a download named loam.mcpb', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'loam-dev-'));
    dirs.push(dir);
    const file = path.join(dir, 'loam.mcpb');
    const bytes = Buffer.from('PK-pretend-extension-bytes');
    writeFileSync(file, bytes);
    const { origin, server } = await devServer(file);
    servers.push(server);
    const res = await fetch(`${origin}${cfg.download.path}`, { redirect: 'manual' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${cfg.download.asset}"`);
    expect(res.headers.get('content-length')).toBe(String(bytes.length));
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);
    // everything else behaves as before
    const app = await fetch(`${origin}/app?demo=1`, { redirect: 'manual' });
    expect(app.status).toBe(308);
    expect(app.headers.get('location')).toBe('/app/?demo=1');
  });

  it('says how to build it when there is none, instead of sending the visitor to a GitHub 404', async () => {
    const { origin, server } = await devServer(path.join(tmpdir(), 'loam-no-such-extension', 'loam.mcpb'));
    servers.push(server);
    const res = await fetch(`${origin}${cfg.download.path}`, { redirect: 'manual' });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const body = await res.text();
    expect(body).toContain('npm run pack:mcpb');
    expect(body).toContain(cfg.releaseDownloadUrl);
  });
});
