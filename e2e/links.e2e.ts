import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { launch, readFolder, REPO, serve, trackForeignRequests, useFakeFolderPicker, type Site } from './harness';

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

/** Every link on the page that leaves for GitHub: href and visible text. */
const githubLinks = (page: Page) =>
  page.$$eval('a[href^="https://github.com/"]', (as) => as.map((a) => ({ href: (a as HTMLAnchorElement).href, text: (a.textContent ?? '').replace(/\s+/g, ' ').trim(), target: a.getAttribute('target'), rel: a.getAttribute('rel') })));

/** A repository link must be the repository, or a file or folder of it that exists in this checkout. */
function expectRealRepoLink(href: string): void {
  expect(href.startsWith(cfg.githubUrl), href).toBe(true);
  const m = new RegExp(`^${cfg.githubUrl.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/(blob|tree)/${cfg.branch}/([^#?]+)`).exec(href);
  if (m) {
    const full = path.join(REPO, decodeURIComponent(m[2]!));
    expect(existsSync(full), `${href} points at ${m[2]}, which does not exist`).toBe(true);
    expect(statSync(full).isDirectory(), href).toBe(m[1] === 'tree');
  }
}

async function open(url: string, viewport = { width: 1280, height: 900 }): Promise<{ page: Page; context: BrowserContext; foreign: string[] }> {
  const context = await browser.newContext({ viewport });
  await context.route(/plausible\.io/, (r) => r.abort());
  const page = await context.newPage();
  const foreign = trackForeignRequests(page, site.origin);
  await page.goto(url, { waitUntil: 'networkidle' });
  return { page, context, foreign };
}

describe('the website points to the repository and its files', () => {
  it('landing page: the code, the checks behind each promise, the security policy, issues and the licence', async () => {
    const { page, context, foreign } = await open(`${site.origin}/`);
    try {
      const links = await githubLinks(page);
      const byText = (t: string) => links.find((l) => l.text === t)?.href;
      expect(byText('Read the code on GitHub')).toBe(cfg.githubUrl);
      expect(byText('How each promise is checked')).toBe(cfg.fileUrl('docs/ARCHITECTURE.md#privacy-each-claim-and-how-it-is-checked'));
      expect(byText('The skill checker')).toBe(cfg.fileUrl('packages/loam-core/src/scanner.ts'));
      expect(byText('Security policy')).toBe(cfg.fileUrl('SECURITY.md'));
      const footer = await page.getByRole('navigation', { name: 'Footer' }).getByRole('link').evaluateAll((as) => as.map((a) => [(a.textContent ?? '').trim(), (a as HTMLAnchorElement).getAttribute('href')]));
      expect(footer).toEqual([
        ['GitHub', cfg.githubUrl],
        ['Install guide', '/install'],
        ['Report a problem', cfg.issuesUrl],
        ['Licence', cfg.fileUrl('LICENSE')],
        [cfg.contactEmail, `mailto:${cfg.contactEmail}`],
      ]);
      for (const l of links) expectRealRepoLink(l.href);
      expect(foreign.every((u) => u.includes('plausible.io'))).toBe(true); // the analytics script is the only thing the page reaches for
    } finally {
      await context.close();
    }
  });

  it('install guide: releases and checksum, the extension source, issues', async () => {
    const { page, context } = await open(`${site.origin}/install`);
    try {
      const links = await githubLinks(page);
      const hrefs = links.map((l) => l.href);
      expect(hrefs).toContain(cfg.releasesUrl);
      expect(hrefs).toContain(cfg.issuesUrl);
      expect(hrefs).toContain(cfg.dirUrl('apps/mcp-server'));
      expect(hrefs).toContain(cfg.githubUrl);
      for (const l of links) expectRealRepoLink(l.href);
      // the one-click download still goes through our own address, never straight to GitHub
      expect(await page.locator('#download').getAttribute('href')).toBe(cfg.download.path);
    } finally {
      await context.close();
    }
  });

  it('the not-found page offers a way to report a broken link', async () => {
    // The host (Cloudflare Pages) serves this file for any unknown address; the preview server only serves it by name.
    const res = await fetch(`${site.origin}/404.html`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`href="${cfg.issuesUrl}"`);
    expect(html).not.toMatch(/\{\{/);
  });
});

describe('the app points to the repository too', () => {
  it('the start screen has the footer; links open in a new tab and nothing is requested', async () => {
    const { page, context, foreign } = await open(`${site.origin}/app`);
    try {
      const footer = page.getByRole('navigation', { name: 'About Loam' });
      await footer.waitFor();
      const links = await githubLinks(page);
      expect(links.map((l) => l.href)).toEqual([cfg.githubUrl, cfg.issuesUrl, cfg.fileUrl('LICENSE')]);
      for (const l of links) {
        expect(l.target).toBe('_blank');
        expect(l.rel).toBe('noopener noreferrer');
        expectRealRepoLink(l.href);
      }
      // the link tells a screen reader that it opens a new tab, and is a comfortable target
      expect(await footer.getByRole('link', { name: 'Code on GitHub (opens in a new tab)' }).count()).toBe(1);
      for (const box of await footer.getByRole('link').evaluateAll((as) => as.map((a) => a.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);

      // clicking opens GitHub in another tab and leaves this page where it is
      await context.route('https://github.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>GitHub</title>' }));
      const [popup] = await Promise.all([context.waitForEvent('page'), footer.getByRole('link', { name: /Report a problem/ }).click()]);
      expect(popup.url()).toBe(cfg.issuesUrl);
      expect(page.url()).toBe(`${site.origin}/app/`);
      await popup.close();
      expect(foreign).toEqual([]); // the page itself requested nothing (the new tab is a separate navigation)
    } finally {
      await context.close();
    }
  });

  it('every screen of the demo carries the footer, and the contextual links lead to the right part of the docs', async () => {
    const { page, context } = await open(`${site.origin}/app?demo=1`);
    try {
      for (const [query, link] of [
        ['', null],
        ['&process=weekly-client-report', null],
        ['&screen=skills', cfg.fileUrl('docs/ARCHITECTURE.md#skills-and-the-security-model')],
        ['&screen=health', cfg.fileUrl('docs/ARCHITECTURE.md#context-lint')],
      ] as const) {
        await page.goto(`${site.origin}/app?demo=1${query}`, { waitUntil: 'networkidle' });
        await page.locator('h1').first().waitFor();
        const links = await githubLinks(page);
        expect(links.map((l) => l.href), query).toEqual(expect.arrayContaining([cfg.githubUrl, cfg.issuesUrl, cfg.fileUrl('LICENSE')]));
        if (link) expect(links.map((l) => l.href), query).toContain(link);
        for (const l of links) {
          expect(l.target, `${query} ${l.href}`).toBe('_blank');
          expectRealRepoLink(l.href);
        }
      }
    } finally {
      await context.close();
    }
  });

  it('the connect screen links the releases page next to the download and offers a way to report trouble', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await useFakeFolderPicker(context);
    const page = await context.newPage();
    try {
      await page.goto(`${site.origin}/app`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Choose folder' }).click();
      await page.getByRole('heading', { name: 'Connect your agent' }).waitFor();
      const links = await githubLinks(page);
      expect(links.map((l) => l.href)).toEqual(expect.arrayContaining([cfg.releasesUrl, cfg.issuesUrl]));
      expect(await page.getByRole('link', { name: 'Download loam.mcpb' }).getAttribute('href')).toBe(cfg.download.path);

      // the README written into a new folder says where to get help
      const readme = (await readFolder(page))['README.md']!;
      expect(readme).toContain(`at ${cfg.githubUrl}.`);
    } finally {
      await context.close();
    }
  });
});
