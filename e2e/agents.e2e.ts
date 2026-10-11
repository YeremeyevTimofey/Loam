import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { parse as parseToml } from 'smol-toml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { launch, readFolder, REPO, serve, useFakeFolderPicker, writeFolder, type Site } from './harness';
import { buildBaseWithAgent } from './mcp-base';

const { site: cfg } = (await import('../scripts/lib/site-node.mjs')) as { site: import('../scripts/lib/site.d.mts').Site };

let site: Site;
let browser: Browser;
beforeAll(async () => {
  site = await serve();
  browser = await launch.chromium();
});
afterAll(async () => {
  await browser?.close();
  await site?.close();
});

const summary = JSON.parse(readFileSync(path.join(REPO, 'apps/web/src/demo-data/summary.json'), 'utf8'));

async function freshApp(): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await useFakeFolderPicker(context);
  await context.route(/plausible\.io/, (r) => r.abort());
  const page = await context.newPage();
  await page.goto(`${site.origin}/app`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await page.getByRole('heading', { name: 'Connect your agent' }).waitFor();
  return { context, page };
}
const pickAgent = (page: Page, name: string) => page.getByRole('radio', { name, exact: true }).click();
const setSystem = (page: Page, label: string) => page.getByLabel('System').selectOption({ label });
const codeBlocks = (page: Page) => page.locator('pre[aria-label]').allInnerTexts();

describe('Connect your agent works for more than Claude (the new positioning)', () => {
  it('offers every agent, starting with Claude Desktop and its one-click download', async () => {
    const { context, page } = await freshApp();
    try {
      const names = await page.getByRole('radio').allInnerTexts();
      expect(names).toEqual(['Claude Desktop', 'Claude Code', 'Cursor', 'Codex', 'VS Code (Copilot)', 'Gemini CLI', 'Windsurf', 'Another agent']);
      expect(await page.getByRole('radio', { name: 'Claude Desktop' }).getAttribute('aria-checked')).toBe('true');
      expect(await page.getByRole('link', { name: 'Download loam.mcpb' }).getAttribute('href')).toBe(cfg.download.path);
      expect(await page.getByText('Run my Loam onboarding interview').first().isVisible()).toBe(true);
    } finally {
      await context.close();
    }
  });

  it('Cursor: asks for the path, then gives a working install link and the config for that exact folder', async () => {
    const { context, page } = await freshApp();
    try {
      await pickAgent(page, 'Cursor');
      await page.getByText('Enter the folder path above').waitFor();
      await setSystem(page, 'Mac');
      await page.getByLabel(/Full path of the folder/).fill('"/Users/sarah/My Documents/Loam"');
      const href = await page.getByRole('link', { name: 'Add Loam to Cursor' }).getAttribute('href');
      const url = new URL(href!);
      expect(`${url.protocol}//${url.host}${url.pathname}`).toBe('cursor://anysphere.cursor-deeplink/mcp/install');
      const expected = { command: 'npx', args: ['-y', cfg.npmPackage, '--folder', '/Users/sarah/My Documents/Loam'] };
      expect(JSON.parse(Buffer.from(url.searchParams.get('config')!, 'base64').toString())).toEqual(expected);
      const [file] = await codeBlocks(page);
      expect(JSON.parse(file!).mcpServers.loam).toEqual(expected);
      expect(await page.getByText('~/.cursor/mcp.json').count()).toBeGreaterThan(0);
      expect(await page.getByText(/Cursor reads AGENTS\.md/).count()).toBe(1);
    } finally {
      await context.close();
    }
  });

  it('Codex: a command and a TOML file that a TOML parser reads back; Windows switches to cmd /c', async () => {
    const { context, page } = await freshApp();
    try {
      await pickAgent(page, 'Codex');
      await setSystem(page, 'Mac');
      await page.getByLabel(/Full path of the folder/).fill("/Users/sarah/Sarah's Loam");
      const [command, toml] = await codeBlocks(page);
      expect(command).toBe(`codex mcp add loam -- npx -y ${cfg.npmPackage} --folder '/Users/sarah/Sarah'\\''s Loam'`);
      expect((parseToml(toml!) as { mcp_servers: { loam: unknown } }).mcp_servers.loam).toEqual({ command: 'npx', args: ['-y', cfg.npmPackage, '--folder', "/Users/sarah/Sarah's Loam"], startup_timeout_sec: 60 });
      await setSystem(page, 'Windows');
      await page.getByLabel(/Full path of the folder/).fill('C:\\Users\\Sarah\\Documents\\Loam');
      const [winCommand, winToml] = await codeBlocks(page);
      expect(winCommand).toBe(`codex mcp add loam -- cmd /c npx -y ${cfg.npmPackage} --folder "C:\\Users\\Sarah\\Documents\\Loam"`);
      expect((parseToml(winToml!) as { mcp_servers: { loam: { command: string; args: string[] } } }).mcp_servers.loam).toMatchObject({ command: 'cmd', args: ['/c', 'npx', '-y', cfg.npmPackage, '--folder', 'C:\\Users\\Sarah\\Documents\\Loam'] });
    } finally {
      await context.close();
    }
  });

  it('every other agent gets a valid config; the VS Code link decodes to the same server', async () => {
    const { context, page } = await freshApp();
    try {
      await pickAgent(page, 'Claude Code');
      await setSystem(page, 'Linux');
      await page.getByLabel(/Full path of the folder/).fill('/home/sarah/Loam');
      expect((await codeBlocks(page))[0]).toBe(`claude mcp add --transport stdio --scope user loam -- npx -y ${cfg.npmPackage} --folder /home/sarah/Loam`);
      await pickAgent(page, 'VS Code (Copilot)');
      const link = new URL((await page.getByRole('link', { name: 'Add Loam to VS Code' }).getAttribute('href'))!.replace('vscode:mcp/install?', 'http://x/?q='));
      expect(JSON.parse(link.searchParams.get('q')!)).toEqual({ name: 'loam', type: 'stdio', command: 'npx', args: ['-y', cfg.npmPackage, '--folder', '/home/sarah/Loam'] });
      const vsBlocks = await codeBlocks(page);
      expect(JSON.parse(vsBlocks.at(-1)!).servers.loam.type).toBe('stdio');
      await pickAgent(page, 'Gemini CLI');
      expect(JSON.parse((await codeBlocks(page))[0]!).mcpServers.loam).toMatchObject({ command: 'npx', timeout: 60000 });
      expect(await page.getByText(/GEMINI\.md/).count()).toBeGreaterThan(0);
      await pickAgent(page, 'Windsurf');
      expect(JSON.parse((await codeBlocks(page))[0]!).mcpServers.loam.args).toContain('/home/sarah/Loam');
      await pickAgent(page, 'Another agent');
      expect(JSON.parse((await codeBlocks(page))[0]!).mcpServers.loam.command).toBe('npx');
      expect(await page.getByText(/cannot save to Loam yet/).count()).toBe(1);
    } finally {
      await context.close();
    }
  });

  it('warns about a path that does not fit, and remembers the path after a reload', async () => {
    const { context, page } = await freshApp();
    try {
      await pickAgent(page, 'Codex');
      await setSystem(page, 'Mac');
      const input = page.getByLabel(/Full path of the folder/);
      await input.fill('Loam');
      await page.getByRole('alert').filter({ hasText: 'full path' }).waitFor();
      await input.fill('/Users/sarah/Notes');
      await page.getByRole('alert').filter({ hasText: 'ends in “Notes”' }).waitFor();
      await input.fill('C:\\Users\\Sarah\\Loam');
      await page.getByRole('alert').filter({ hasText: 'Windows-style' }).waitFor();
      await input.fill('/Users/sarah/Loam');
      expect(await page.getByRole('alert').count()).toBe(0);
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /Continue with Loam/ }).click();
      await page.getByRole('heading', { name: 'Connect your agent' }).waitFor();
      await pickAgent(page, 'Cursor');
      expect(await page.getByLabel(/Full path of the folder/).inputValue()).toBe('/Users/sarah/Loam');
    } finally {
      await context.close();
    }
  });

  it('copy buttons put the exact text on the clipboard', async () => {
    const { context, page } = await freshApp();
    try {
      await pickAgent(page, 'Claude Code');
      await setSystem(page, 'Mac');
      await page.getByLabel(/Full path of the folder/).fill('/Users/sarah/Loam');
      await page.getByRole('button', { name: /Copy: Run this in your terminal/ }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`claude mcp add --transport stdio --scope user loam -- npx -y ${cfg.npmPackage} --folder /Users/sarah/Loam`);
    } finally {
      await context.close();
    }
  });

  it('is accessible for every agent', async () => {
    const { context, page } = await freshApp();
    try {
      for (const name of ['Claude Desktop', 'Claude Code', 'Cursor', 'Codex', 'VS Code (Copilot)', 'Gemini CLI', 'Windsurf', 'Another agent']) {
        await pickAgent(page, name);
        const input = page.getByLabel(/Full path of the folder/);
        if (await input.count()) {
          await page.getByLabel('System').selectOption({ label: 'Mac' });
          await input.fill('/Users/sarah/Loam');
        }
        await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished)));
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), name).toEqual([]);
      }
    } finally {
      await context.close();
    }
  });

  it('an agent can be connected later from the overview', async () => {
    const { context, page } = await freshApp();
    try {
      await writeFolder(page, await buildBaseWithAgent());
      await page.getByRole('button', { name: 'Refresh from the folder' }).click();
      await page.getByRole('button', { name: 'Connect an agent' }).click();
      await page.getByRole('dialog').getByRole('heading', { name: 'Connect your agent' }).waitFor();
      await page.getByRole('dialog').getByRole('radio', { name: 'Cursor' }).click();
      expect(await page.getByRole('dialog').getByText('Enter the folder path above').count()).toBe(1);
    } finally {
      await context.close();
    }
  });
});

describe('the download link goes straight to the file, not to a GitHub page', () => {
  it('our address answers with a redirect to the newest release file, and _redirects says the same', async () => {
    const res = await fetch(`${site.origin}${cfg.download.path}`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(cfg.releaseDownloadUrl);
    expect(cfg.releaseDownloadUrl).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/latest\/download\/loam\.mcpb$/);
    expect(readFileSync(path.join(REPO, 'apps/web/dist/_redirects'), 'utf8').trim()).toBe(`${cfg.download.path} ${cfg.releaseDownloadUrl} 302`);
    const headers = readFileSync(path.join(REPO, 'apps/web/dist/_headers'), 'utf8');
    expect(headers).toContain(cfg.analytics.origin);
    expect(headers).not.toContain('{{');
  });

  for (const [where, open] of [
    ['the install page', async (page: Page) => { await page.goto(`${site.origin}/install`, { waitUntil: 'networkidle' }); }],
    ['the app', async (page: Page) => { await page.goto(`${site.origin}/app`, { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'Choose folder' }).click(); await page.getByRole('link', { name: 'Download loam.mcpb' }).waitFor(); }],
  ] as const) {
    it(`one click on ${where} starts the download and leaves the page where it is`, async () => {
      // A stand-in for GitHub: "latest/download" redirects once more to the stored file, which is served as an attachment.
      const store = createServer((req, res) => {
        if (req.url === '/latest/download/loam.mcpb') {
          res.writeHead(302, { location: '/stored/loam.mcpb' }).end();
        } else if (req.url === '/stored/loam.mcpb') {
          res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename=loam.mcpb' }).end(Buffer.from('PK\u0003\u0004 fake bundle'));
        } else res.writeHead(404).end();
      });
      await new Promise<void>((resolve) => store.listen(0, '127.0.0.1', resolve));
      const port = (store.address() as { port: number }).port;
      const context = await browser.newContext({ acceptDownloads: true });
      try {
        await useFakeFolderPicker(context);
        await context.route(/plausible\.io/, (r) => r.abort());
        // Our own address, exactly as the site answers it, but pointing the last hop at the stand-in.
        await context.route(`${site.origin}${cfg.download.path}`, (route) => route.fulfill({ status: 302, headers: { location: `http://127.0.0.1:${port}/latest/download/loam.mcpb` } }));
        const page = await context.newPage();
        await open(page);
        const before = page.url();
        const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download loam.mcpb' }).click()]);
        expect(download.suggestedFilename()).toBe('loam.mcpb');
        expect(page.url()).toBe(before);
        expect(await page.getByRole('link', { name: 'Download loam.mcpb' }).isVisible()).toBe(true);
      } finally {
        await context.close();
        store.close();
      }
    });
  }
});

describe('Meet Sarah on the landing page', () => {
  it('shows the fictional persona, her processes, learning, skills and numbers, all from the sample base', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route(/plausible\.io/, (r) => r.abort());
    const page = await context.newPage();
    await page.goto(`${site.origin}/`, { waitUntil: 'networkidle' });
    const section = page.locator('#example');
    expect(await section.getByRole('heading', { level: 2 }).innerText()).toBe('Meet Sarah, an account manager');
    expect(await section.innerText()).toContain('A fictional example');
    // order on the page: how it works → Sarah → what you get
    const headings = await page.getByRole('heading', { level: 2 }).allInnerTexts();
    expect(headings.indexOf('How it works')).toBeLessThan(headings.indexOf('Meet Sarah, an account manager'));
    expect(headings.indexOf('Meet Sarah, an account manager')).toBeLessThan(headings.indexOf('What you get'));
    // processes: five rows with the hours the app shows
    const rows = await section.locator('tbody tr').all();
    expect(rows).toHaveLength(5);
    for (const p of summary.processes) {
      const row = section.locator('tbody tr', { hasText: p.title });
      expect(await row.innerText(), p.title).toContain(String(p.hours));
      expect(await row.locator('a').getAttribute('href')).toBe(`/app?demo=1&process=${p.slug}`);
    }
    expect(await section.getByText('Stable', { exact: true }).count()).toBe(1);
    expect(await section.innerText()).toContain(`${summary.numbers.readyCount} of 5 are ready to automate: about ${summary.numbers.readyHours} hours a year`);
    // the learning loop: every correction, with its before and after
    expect(await section.locator('ol > li').count()).toBe(summary.learning.corrections.length);
    for (const c of summary.learning.corrections) expect(await section.innerText()).toContain(c.note);
    expect(await section.innerText()).toContain('Was:');
    // skills and safety
    expect(await section.locator('ul > li').count()).toBe(summary.skills.length);
    for (const s of summary.skills) expect(await section.getByText(s.name, { exact: true }).count(), s.name).toBeGreaterThan(0);
    expect(await section.innerText()).toContain('“inbox-cleaner”, was refused');
    expect(await section.innerText()).toContain('There is no “add anyway”');
    expect(await section.getByText('Reviewed: safe').count()).toBe(1);
    // numbers agree with the product's own report
    expect(await section.innerText()).toContain(`${summary.numbers.typicalPercent}% less`);
    // links open the demo on the right screens
    expect(await section.getByRole('link', { name: "Open Sarah's knowledge base" }).getAttribute('href')).toBe('/app?demo=1');
    expect(await section.getByRole('link', { name: 'See her skills' }).getAttribute('href')).toBe('/app?demo=1&screen=skills');
    expect(await section.getByRole('link', { name: 'See the health check' }).getAttribute('href')).toBe('/app?demo=1&screen=health');
    await section.getByRole('link', { name: 'See her skills' }).click();
    await page.getByRole('heading', { name: 'Your skills' }).waitFor();
    await context.close();
  });
});

describe('the install page covers every agent', () => {
  it('Claude Desktop in three steps, and a section with the exact command for each other agent', async () => {
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    await context.route(/plausible\.io/, (r) => r.abort());
    const page = await context.newPage();
    await page.goto(`${site.origin}/install`, { waitUntil: 'networkidle' });
    expect(await page.getByRole('heading', { level: 1 }).innerText()).toBe('Connect Loam to your AI agent');
    const steps = await page.locator('#claude-desktop ol > li').all();
    expect(steps).toHaveLength(3);
    for (const step of steps) expect(await step.locator('img').count()).toBe(1);
    expect(await page.locator('#claude-desktop a#download').getAttribute('href')).toBe(cfg.download.path);
    const agents = await page.locator('#other-agents details').all();
    expect(agents).toHaveLength(7);
    for (const id of ['claude-code', 'cursor', 'codex', 'vscode', 'gemini', 'windsurf', 'other']) {
      const d = page.locator(`#${id}`);
      expect(await d.locator('pre').count(), id).toBeGreaterThan(0);
      expect(await d.textContent(), id).toContain(cfg.npmPackage);
    }
    // every JSON block on the page is valid JSON, the TOML parses
    for (const text of await page.locator('#other-agents pre').allInnerTexts()) {
      if (text.trim().startsWith('{')) expect(() => JSON.parse(text), text).not.toThrow();
      if (text.includes('[mcp_servers.')) expect(() => parseToml(text)).not.toThrow();
    }
    // the copy button (added by the page's script) copies the block
    await page.locator('#codex summary').click();
    const button = page.locator('#codex').getByRole('button', { name: /Copy:/ }).first();
    await button.click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('codex mcp add loam -- npx -y');
    await context.close();
  });

  it('the landing page no longer says Claude is the only way', async () => {
    const context = await browser.newContext();
    await context.route(/plausible\.io/, (r) => r.abort());
    const page = await context.newPage();
    await page.goto(`${site.origin}/`, { waitUntil: 'networkidle' });
    const text = await page.locator('body').innerText();
    expect(text).toContain('Works with Claude, Cursor, Codex, Gemini, VS Code and any MCP-capable agent');
    expect(text).not.toMatch(/Claude Desktop to connect your agent/);
    expect(text).toContain('Works with the agent you already use');
    for (const agent of ['Cursor', 'Codex', 'Gemini CLI', 'Windsurf', 'VS Code (Copilot)']) expect(text, agent).toContain(agent);
    await context.close();
  });
});

describe('agents other than Claude read the folder', () => {
  it('Sync writes both skill folders from the screen, and Health fixes outdated instructions with a preview', async () => {
    const { context, page } = await freshApp();
    try {
      await writeFolder(page, await buildBaseWithAgent());
      await page.getByRole('button', { name: 'Refresh from the folder' }).click();
      await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Skills' }).click();
      await page.getByRole('heading', { name: 'Your skills' }).waitFor();
      await page.getByRole('button', { name: 'Sync to agents' }).click();
      await page.getByText(/files? updated in \.claude\/skills and \.agents\/skills|already up to date/).waitFor();
      let files = await readFolder(page);
      for (const root of ['.claude/skills', '.agents/skills']) expect(files[`${root}/loam-weekly-client-report/SKILL.md`], root).toContain('name: loam-weekly-client-report');
      expect(files['GEMINI.md']).toBe('@AGENTS.md\n');
      expect(files['AGENTS.md']).toContain('## If the loam_* tools are not available');

      // an older base: instructions from before this version
      await writeFolder(page, { 'AGENTS.md': files['AGENTS.md']!.replace(/\n## If the loam_\* tools[\s\S]*$/, '\n') });
      await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Health' }).click();
      await page.getByRole('heading', { name: 'The instructions for your agents are out of date' }).waitFor();
      await page.getByRole('button', { name: 'Fix: Update the instructions' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByText('If the loam_* tools are not available').first().waitFor();
      expect(await dialog.getByText('AGENTS.md').count()).toBeGreaterThan(0);
      await dialog.getByRole('button', { name: 'Apply' }).click();
      await dialog.waitFor({ state: 'hidden' });
      files = await readFolder(page);
      expect(files['AGENTS.md']).toContain('## If the loam_* tools are not available');
      expect(files['AGENTS.md']).toContain('Personal work context for Sarah Chen, Account manager.');
      await page.getByRole('heading', { name: 'The instructions for your agents are out of date' }).waitFor({ state: 'detached' });
    } finally {
      await context.close();
    }
  });
});
