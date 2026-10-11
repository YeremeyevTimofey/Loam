import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { devices } from 'playwright';
import { launch, serve, trackForeignRequests, type Site } from './harness';

let site: Site;
beforeAll(async () => {
  site = await serve();
});
afterAll(async () => site?.close());

describe('landing page (acceptance 32-34, 40)', () => {
  it('has the six blocks, the two buttons, and nothing external except the analytics script', async () => {
    const browser = await launch.chromium();
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const foreign = trackForeignRequests(page, site.origin);
      const sizes: { url: string; bytes: number; type: string }[] = [];
      page.on('response', async (r) => {
        if (r.url().startsWith(site.origin)) {
          const body = await r.body().catch(() => Buffer.alloc(0));
          sizes.push({ url: r.url(), bytes: body.length, type: r.headers()['content-type'] ?? '' });
        }
      });
      await page.route(/plausible\.io/, (route) => route.abort());
      await page.goto(`${site.origin}/`, { waitUntil: 'networkidle' });
      expect(await page.locator('h1').innerText()).toBe('Your AI assistant finally knows how you work');
      await expect(page.getByRole('link', { name: 'See a filled example' }).first().getAttribute('href')).resolves.toBe('/app?demo=1');
      await expect(page.getByRole('link', { name: 'Start with my folder' }).getAttribute('href')).resolves.toBe('/app');
      for (const heading of ['Most people have the tool', 'How it works', 'What you get', 'Private by design']) {
        expect(await page.getByRole('heading', { name: new RegExp(heading) }).count(), heading).toBeGreaterThan(0);
      }
      expect(await page.locator('main li img').count()).toBe(4);
      // the only foreign request is the analytics script
      expect([...new Set(foreign.map((u) => new URL(u).host))]).toEqual(['plausible.io']);
      // weight without images, font included, under 100 KB
      const weight = sizes.filter((s) => !s.type.startsWith('image/')).reduce((sum, s) => sum + s.bytes, 0);
      expect(weight, JSON.stringify(sizes.map((s) => [s.url.replace(site.origin, ''), s.bytes]))).toBeLessThan(100_000);
      expect(sizes.some((s) => s.url.endsWith('inter-latin-variable.woff2'))).toBe(true);
      // number on the page comes from the sample base's own report
      const report = await (await page.request.get(`${site.origin}/app/`)).text();
      expect(report).not.toContain('plausible');
      expect(await page.locator('body').innerText()).toMatch(/\d+% less context per task/);
      // metadata: favicon, share preview
      expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toBe('https://loam.dev/og.png');
      for (const asset of ['/og.png', '/favicon.svg', '/favicon.ico', '/logo.svg', '/apple-touch-icon.png']) {
        expect((await page.request.get(`${site.origin}${asset}`)).status(), asset).toBe(200);
      }
      expect(await page.locator('script[src*="plausible"]').count()).toBe(1);
      expect(await page.evaluate(() => document.fonts.check('600 16px Inter'))).toBe(true);
    } finally {
      await browser.close();
    }
  });

  it('disables "Start with my folder" in Firefox, with the reason, while the demo stays active (34)', async () => {
    const browser = await launch.firefox();
    try {
      const page = await (await browser.newContext()).newPage();
      await page.route(/plausible\.io/, (route) => route.abort());
      await page.goto(`${site.origin}/`);
      const folder = page.locator('#cta-folder');
      await expect(folder.getAttribute('aria-disabled')).resolves.toBe('true');
      await expect(folder.getAttribute('href')).resolves.toBeNull();
      expect(await page.locator('#cta-note').isVisible()).toBe(true);
      expect(await page.locator('#cta-note').innerText()).toBe('Works in Chrome or Edge');
      await expect(page.locator('#cta-demo').getAttribute('href')).resolves.toBe('/app?demo=1');
    } finally {
      await browser.close();
    }
  });

  it('keeps the folder button enabled in Chromium', async () => {
    const browser = await launch.chromium();
    try {
      const page = await (await browser.newContext()).newPage();
      await page.route(/plausible\.io/, (route) => route.abort());
      await page.goto(`${site.origin}/`);
      await expect(page.locator('#cta-folder').getAttribute('aria-disabled')).resolves.toBeNull();
      expect(await page.locator('#cta-note').isHidden()).toBe(true);
    } finally {
      await browser.close();
    }
  });

  for (const [name, make] of [['WebKit (Safari engine)', launch.webkit], ['Firefox', launch.firefox], ['Chromium', launch.chromium]] as const) {
    it(`opens in ${name} and on a phone without a layout break (32)`, async () => {
      const browser: Browser = await make();
      try {
        const context = await browser.newContext(name.startsWith('WebKit') ? { ...devices['iPhone 13'] } : { viewport: { width: 375, height: 812 } });
        const page = await context.newPage();
        await page.route(/plausible\.io/, (route) => route.abort());
        await page.goto(`${site.origin}/`, { waitUntil: 'load' });
        expect(await page.locator('h1').innerText()).toContain('finally knows how you work');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(0);
        await page.goto(`${site.origin}/install`, { waitUntil: 'load' });
        expect(await page.locator('h2').count()).toBeGreaterThanOrEqual(3);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      } finally {
        await browser.close();
      }
    });
  }
});

describe('/app where folders are not supported (acceptance 5)', () => {
  for (const [name, make] of [['Firefox', launch.firefox], ['WebKit (Safari engine)', launch.webkit]] as const) {
    it(`explains it in ${name} and links to the demo`, async () => {
      const browser = await make();
      try {
        const page = await (await browser.newContext()).newPage();
        await page.goto(`${site.origin}/app`, { waitUntil: 'networkidle' });
        expect(await page.getByRole('heading', { level: 1 }).innerText()).toContain('can’t open a folder');
        expect(await page.locator('main').innerText()).toMatch(/Chrome, Edge/);
        await page.getByRole('link', { name: 'See a filled example' }).click();
        await page.getByRole('heading', { name: 'Your processes' }).waitFor();
        expect(page.url()).toContain('demo=1');
      } finally {
        await browser.close();
      }
    });
  }
});

describe('install page (acceptance 39)', () => {
  it('opens directly and has three steps with a screenshot each', async () => {
    const browser = await launch.chromium();
    try {
      const page = await (await browser.newContext()).newPage();
      await page.route(/plausible\.io/, (route) => route.abort());
      await page.goto(`${site.origin}/install`, { waitUntil: 'networkidle' });
      const steps = await page.locator('ol > li').all();
      expect(steps).toHaveLength(3);
      for (const step of steps) expect(await step.locator('img').count()).toBe(1);
      expect(await page.locator('a[href$="loam.mcpb"]').count()).toBe(1);
      expect(await page.locator('text=AGENTS.md').count()).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  });
});

describe('demo mode works everywhere (acceptance 35, 36, 37)', () => {
  for (const [name, make, ctx] of [
    ['Chromium', launch.chromium, {}],
    ['WebKit (Safari engine)', launch.webkit, {}],
    ['Firefox', launch.firefox, {}],
    ['iPhone (WebKit)', launch.webkit, { ...devices['iPhone 13'] }],
  ] as const) {
    it(`/app?demo=1 shows the filled base in ${name}`, async () => {
      const browser = await make();
      try {
        const page = await (await browser.newContext(ctx)).newPage();
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`${site.origin}/app?demo=1`, { waitUntil: 'networkidle' });
        await page.getByRole('heading', { name: 'Your processes' }).waitFor();
        expect(await page.getByText('Demo mode — changes are not saved').isVisible()).toBe(true);
        expect(await page.locator('main a[href*="process="]').count()).toBe(5);
        await page.getByRole('button', { name: 'Skills' }).first().click();
        await page.getByRole('heading', { name: 'Your skills' }).waitFor();
        for (const skill of ['meeting-summary', 'weekly-status-report', 'client-bad-news-email', 'competitor-snapshot']) {
          expect(await page.getByRole('heading', { name: skill, exact: true }).count(), skill).toBe(1);
        }
        expect(await page.getByText('Starter', { exact: true }).count()).toBe(3);
        expect(await page.getByText('Imported', { exact: true }).count()).toBe(1);
        expect(errors).toEqual([]);
      } finally {
        await browser.close();
      }
    });
  }

  it('deep link opens the process directly (37)', async () => {
    const browser = await launch.chromium();
    try {
      const page = await (await browser.newContext()).newPage();
      await page.goto(`${site.origin}/app?demo=1&process=weekly-client-report`, { waitUntil: 'networkidle' });
      expect(await page.getByRole('heading', { level: 1 }).innerText()).toBe('Weekly client report');
      expect(await page.getByText('Do my weekly client report').first().isVisible()).toBe(true);
      expect(await page.getByText('Stable', { exact: true }).count()).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  });

  it('edits live for the session and vanish on reload (36)', async () => {
    const browser = await launch.chromium();
    try {
      const page = await (await browser.newContext()).newPage();
      await page.goto(`${site.origin}/app?demo=1&process=meeting-follow-up`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /Delete the correction from/ }).click();
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await page.getByText('No corrections yet').waitFor();
      expect(await page.getByText('Owners by first name only').count()).toBe(0);
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByText('Owners by first name only').waitFor();
    } finally {
      await browser.close();
    }
  });
});
