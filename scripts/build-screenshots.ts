import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { preview } from 'vite';
import { COLORS, PUBLIC, REPO } from './assets/brand';

// Screenshots for the landing page (4) and the install guide (3). The four product shots are the real app in demo
// mode; the agent chat and the three Claude Desktop steps are drawn illustrations (labelled as such in the alt text).
// Run `npm run build && npm run screenshots`.
const web = path.join(REPO, 'apps/web');
const server = await preview({ root: web, configFile: path.join(web, 'vite.config.ts'), preview: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
const origin = server.resolvedUrls!.local[0]!.replace(/\/$/, '');
const font = `data:font/woff2;base64,${readFileSync(path.join(PUBLIC, 'fonts/inter-latin-variable.woff2')).toString('base64')}`;
const shots = path.join(PUBLIC, 'shots');
const browser = await chromium.launch();

const fill = (html: string, extra: Record<string, string> = {}) =>
  Object.entries({ __FONT__: font, __BG__: COLORS.bg, __TEXT__: COLORS.text, __MUTED__: COLORS.muted, __ACCENT__: COLORS.accent, ...extra }).reduce((h, [k, v]) => h.replaceAll(k, v), html);

async function app(name: string, url: string, prepare?: (page: Page) => Promise<void>) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(`${origin}${url}`, { waitUntil: 'networkidle' });
  await page.locator('h1').first().waitFor();
  await prepare?.(page);
  await page.waitForTimeout(400);
  writeFileSync(path.join(shots, name), await page.screenshot({ type: 'png' }));
  await page.close();
}

async function mock(name: string, html: string) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(path.join(shots, name), await page.screenshot({ type: 'png' }));
  await page.close();
}

// 1. interview (illustration), 2. process map, 3. files on disk, 4. connect
await mock('step-1-interview.png', fill(readFileSync(path.join(REPO, 'scripts/assets/mocks/chat.html'), 'utf8')));
await app('step-2-processes.png', '/app?demo=1');
await app('step-3-folder.png', '/app?demo=1&process=weekly-client-report', async (page) => {
  await page.getByRole('button', { name: 'View files' }).click();
  await page.getByRole('button', { name: 'corrections.md' }).click();
});
// the connect block only shows on a fresh folder: use the browser's private file system as the "folder"
{
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await context.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle('Loam', { create: true });
  });
  const page = await context.newPage();
  await page.goto(`${origin}/app`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await page.getByRole('heading', { name: 'Connect your agent' }).waitFor();
  await page.getByRole('heading', { name: 'Connect your agent' }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo({ top: 220 }));
  await page.waitForTimeout(400);
  writeFileSync(path.join(shots, 'step-4-connect.png'), await page.screenshot({ type: 'png' }));
  await context.close();
}

// install guide (illustrations of the three steps)
const install = readFileSync(path.join(REPO, 'scripts/assets/mocks/install.html'), 'utf8');
await mock(
  'install-1-download.png',
  fill(install, {
    __TITLE__: 'Downloads',
    __BODY__: `<div class="main" style="padding:40px 48px"><h1>Download the extension</h1><p>One small file. It lets Claude read your folder.</p><div class="row" style="margin-top:28px"><span class="btn">Download loam.mcpb</span></div><div class="row" style="margin-top:56px"><span class="file"><span class="doc"></span>loam.mcpb<span class="tag">4.8 MB</span></span></div></div>`,
  }),
);
await mock(
  'install-2-drag.png',
  fill(install, {
    __TITLE__: 'Claude Desktop · Settings',
    __BODY__: `<div class="side"><div>General</div><div>Connectors</div><div class="on">Extensions</div><div>Developer</div></div><div class="main"><h1>Extensions</h1><p>Drag a .mcpb file here to install it.</p><div class="drop"><span class="file" style="margin-right:18px"><span class="doc"></span>loam.mcpb</span>→ drop it in this window</div></div>`,
  }),
);
await mock(
  'install-3-folder.png',
  fill(install, {
    __TITLE__: 'Claude Desktop · Extensions · Loam',
    __BODY__: `<div class="side"><div>General</div><div>Connectors</div><div class="on">Extensions</div><div>Developer</div></div><div class="main"><h1>Loam</h1><p>Choose the folder you set up in the Loam app. It has a file called AGENTS.md inside.</p><div class="field"><span class="folder"></span>Loam<span class="tag" style="margin-left:auto">Knowledge base folder</span></div><div class="row"><span class="btn">Save</span><span class="tag">Turned on</span></div></div>`,
  }),
);

await browser.close();
await server.close();
console.log('Screenshots written to apps/web/public/shots');
