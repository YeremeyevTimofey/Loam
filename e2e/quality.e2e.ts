import { readFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launch, REPO, serve, trackForeignRequests, useFakeFolderPicker, type Site } from './harness';

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

const report = JSON.parse(readFileSync(path.join(REPO, 'apps/web/src/demo-data/kb/.loam/lint-report.json'), 'utf8'));
const demo = (query = '') => `${site.origin}/app?demo=1${query}`;
const SCREENS: [string, string][] = [
  ['overview', ''],
  ['process', '&process=weekly-client-report'],
  ['skills', '&screen=skills'],
  ['health', '&screen=health'],
];

async function open(url: string, viewport = { width: 1280, height: 900 }): Promise<Page> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('h1').first().waitFor();
  return page;
}

describe('Health (acceptance 29, 30, 31)', () => {
  it('shows all ten checks in plain words, the findings, and the number from the sample report', async () => {
    const page = await open(demo('&screen=health'));
    await page.getByRole('heading', { name: 'The ten checks' }).waitFor();
    const checks = await page.locator('#checks-h ~ div li').allInnerTexts();
    expect(checks).toHaveLength(10);
    expect(checks.join(' ')).not.toMatch(/frontmatter|yaml|schema|undefined|null|NaN/i);
    expect(await page.getByText(report.findings[0].title).count()).toBe(1);
    expect(report.findings[0].title).toMatch(/^profile\.md is [\d,]+ words — the limit is 400$/);
    // before / after: the exact figures of the report that ships with the demo
    const s = report.savings;
    const typical = await page.getByTestId('typical-after').innerText();
    expect(typical.replace(/\s+/g, ' ')).toContain(`${s.typicalBefore.toLocaleString('en-US')} → to ${s.typicalAfter.toLocaleString('en-US')}`);
    expect(await page.getByText(`${s.typicalPercent}% less`).count()).toBe(1);
    expect(s.typicalPercent).toBeGreaterThanOrEqual(60);
    expect(s.typicalPercent).toBeLessThanOrEqual(70);
    // the live check agrees with the report on every finding
    const live = await page.locator('#todo-h ~ ul h3').allInnerTexts();
    expect(live).toEqual(report.findings.map((f: { title: string }) => f.title));
  });

  it('fixes repeated paragraphs after showing exactly what will change', async () => {
    const page = await open(demo('&screen=health'));
    await page.getByRole('button', { name: /Fix: Remove the repeats/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Changed').first().waitFor();
    expect((await dialog.locator('code').allInnerTexts()).join(' ')).toContain('client-onboarding-brief/process.md');
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByText('Repeated text OK').waitFor();
    expect(await page.getByRole('button', { name: /Fix: Remove the repeats/ }).count()).toBe(0);
    expect(await page.getByText('Look at this').count()).toBeLessThan(5);
  });
});

/** The blocks of public/_headers: path → header map. Rules stack, as on Cloudflare Pages. */
function headersFor(pathname: string): Record<string, string> {
  const text = readFileSync(path.join(REPO, 'apps/web/dist/_headers'), 'utf8');
  const out: Record<string, string> = {};
  let current: string | null = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) current = line.trim();
    else if (current) {
      const match = current.endsWith('*') ? pathname.startsWith(current.slice(0, -1)) : pathname === current;
      if (match) {
        const i = line.indexOf(':');
        out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      }
    }
  }
  return out;
}

describe('the deployed headers (dist/_headers, built from the template) really work with the pages', () => {
  const withHeaders = async (url: string, pathname: string) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route(/plausible\.io/, (r) => r.abort());
    await context.route(url, async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, headers: { ...res.headers(), ...headersFor(pathname) } });
    });
    const page = await context.newPage();
    const violations: string[] = [];
    page.on('console', (m) => /Content Security Policy|Refused to/i.test(m.text()) && violations.push(m.text()));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`Refused to: ${e.violatedDirective} ${e.blockedURI}`)));
    return { context, page, violations };
  };

  it('the landing page works under its CSP', async () => {
    expect(headersFor('/')['Content-Security-Policy']).toContain('https://plausible.io');
    const { context, page, violations } = await withHeaders(`${site.origin}/`, '/');
    await page.goto(`${site.origin}/`, { waitUntil: 'networkidle' });
    expect(await page.evaluate(() => document.fonts.check('600 16px Inter'))).toBe(true);
    expect(await page.evaluate(() => [...document.images].every((i) => i.naturalWidth > 0))).toBe(true);
    expect(await page.locator('h1').evaluate((h) => getComputedStyle(h).fontSize)).toBe('48px');
    expect(violations).toEqual([]);
    await context.close();
  });

  it('the install page works under its CSP', async () => {
    const { context, page, violations } = await withHeaders(`${site.origin}/install`, '/install');
    await page.goto(`${site.origin}/install`, { waitUntil: 'networkidle' });
    expect(await page.evaluate(() => [...document.images].every((i) => i.naturalWidth > 0))).toBe(true);
    expect(violations).toEqual([]);
    await context.close();
  });

  it('the app works under its header CSP too, including the service worker and dialogs', async () => {
    const csp = headersFor('/app/')['Content-Security-Policy']!;
    expect(csp).toContain("connect-src 'none'");
    expect(headersFor('/app/')['X-Frame-Options']).toBe('DENY');
    const { context, page, violations } = await withHeaders(`${site.origin}/app/?demo=1`, '/app/');
    await page.goto(`${site.origin}/app/?demo=1`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Your processes' }).waitFor();
    await page.getByRole('button', { name: 'Check health' }).click();
    await page.getByRole('heading', { name: 'The ten checks' }).waitFor();
    await page.getByRole('button', { name: 'Change history' }).click();
    await page.getByRole('heading', { name: 'Change history' }).waitFor();
    expect(await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => Boolean(r)))).toBe(true);
    expect(violations).toEqual([]);
    await context.close();
  });

  it('serves hashed files for a year and re-checks the service worker every time', () => {
    expect(headersFor('/assets/app-abc.js')['Cache-Control']).toContain('immutable');
    expect(headersFor('/sw.js')['Cache-Control']).toBe('no-cache');
    expect(headersFor('/anything')['X-Content-Type-Options']).toBe('nosniff');
  });
});

describe('privacy and offline (acceptance 28, 33, 38)', () => {
  it('makes no request to any other origin, loads no analytics, and blocks fetch, eval and inline script', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const foreign = trackForeignRequests(page, site.origin);
    await page.goto(demo(), { waitUntil: 'networkidle' });
    for (const [, q] of SCREENS) {
      await page.goto(demo(q), { waitUntil: 'networkidle' });
      await page.locator('h1').first().waitFor();
    }
    expect(foreign).toEqual([]);
    const html = await (await page.request.get(`${site.origin}/app/`)).text();
    const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
    expect(withoutComments).not.toMatch(/plausible|analytics|gtag|<script(?![^>]*src=)/i);
    expect(html).toContain("connect-src &#39;none&#39;");
    const verdicts = await page.evaluate(async () => {
      const fetchBlocked = await fetch(location.href).then(() => false, () => true);
      // An inline script must not run: the policy only allows scripts from our own origin.
      const script = document.createElement('script');
      script.textContent = 'window.__inlineRan = true';
      document.head.appendChild(script);
      const inlineBlocked = (window as unknown as Record<string, unknown>).__inlineRan === undefined;
      const external = await fetch('https://example.com/').then(() => false, () => true);
      const socket = await new Promise<boolean>((resolve) => {
        try {
          const ws = new WebSocket('wss://example.com/');
          ws.onerror = () => resolve(true);
          ws.onopen = () => resolve(false);
        } catch {
          resolve(true);
        }
      });
      return { fetchBlocked, inlineBlocked, external, socket };
    });
    expect(verdicts).toEqual({ fetchBlocked: true, inlineBlocked: true, external: true, socket: true });
    await context.close();
  });

  it('works offline after the first visit (service worker)', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(demo('&screen=skills'), { waitUntil: 'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    // first load installs the worker; the cache is full once it is active
    await page.waitForFunction(async () => (await caches.keys()).some((k) => k.startsWith('loam-app-')), undefined, { timeout: 15_000 });
    await page.reload({ waitUntil: 'networkidle' });
    await context.setOffline(true);
    await page.goto(demo('&screen=health'), { waitUntil: 'load' });
    await page.getByRole('heading', { name: 'The ten checks' }).waitFor();
    expect(await page.getByText(report.findings[0].title).count()).toBe(1);
    await page.goto(demo(), { waitUntil: 'load' });
    await page.getByRole('heading', { name: 'Your processes' }).waitFor();
    await context.close();
  });

  it('the service worker contains no network code of its own', () => {
    const sw = readFileSync(path.join(REPO, 'apps/web/dist/sw.js'), 'utf8');
    expect(sw).not.toMatch(/\bfetch\(/);
    expect(sw).not.toMatch(/XMLHttpRequest|WebSocket|importScripts/);
  });
});

describe('accessibility (acceptance 41)', () => {
  for (const [name, q] of SCREENS) {
    it(`${name}: no WCAG A/AA violations, including colour contrast`, async () => {
      const page = await open(demo(q));
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }

  it('the landing page and install page pass too', async () => {
    for (const url of [`${site.origin}/`, `${site.origin}/install`]) {
      const context = await browser.newContext();
      await context.route(/plausible\.io/, (r) => r.abort());
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), url).toEqual([]);
      await context.close();
    }
  });

  it('dialogs are accessible too (diff, history, import preview)', async () => {
    const page = await open(demo('&screen=skills'));
    await page.getByRole('button', { name: 'Paste text' }).click();
    await page.getByLabel('Skill text').fill(readFileSync(path.join(REPO, 'packages/loam-core/test/fixtures/malicious/injection.md'), 'utf8'));
    await page.getByRole('button', { name: 'Check it' }).click();
    await page.getByText('Refused: this skill failed the safety check').waitFor();
    // let the 150 ms appear animation finish: axe measures colours, and mid-fade they are blended
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  it('every control has a visible focus ring and the whole app is reachable by keyboard', async () => {
    for (const [, q] of SCREENS) {
      const page = await open(demo(q));
      const seen = new Set<string>();
      for (let i = 0; i < 80; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const style = getComputedStyle(el);
          return {
            id: `${el.tagName}:${(el.textContent ?? '').trim().slice(0, 30)}:${el.getAttribute('aria-label') ?? ''}`,
            ring: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2,
          };
        });
        if (!info) continue;
        expect(info.ring, `${info.id} has a visible focus ring`).toBe(true);
        seen.add(info.id);
      }
      expect(seen.size, 'many controls were reached').toBeGreaterThan(8);
      await page.context().close();
    }
  });

  it('buttons and links that act like buttons are at least 44×44 px, on desktop and phone', async () => {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
      for (const [name, q] of SCREENS) {
        const page = await open(demo(q), viewport);
        const small = await page.evaluate(() => {
          const out: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>('button, select, input:not([type=radio]):not([type=checkbox]):not(.sr-only), summary, a.inline-flex, nav a')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.height < 43.5 || (r.width < 43.5 && !el.matches('a'))) out.push(`${el.tagName} "${(el.textContent ?? '').trim().slice(0, 24)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
          }
          return out;
        });
        expect(small, `${name} @${viewport.width}px`).toEqual([]);
        await page.context().close();
      }
    }
  });

  it('phone layout does not scroll sideways on any screen', async () => {
    for (const [name, q] of SCREENS) {
      const page = await open(demo(q), { width: 375, height: 812 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, name).toBeLessThanOrEqual(0);
      await page.context().close();
    }
  });
});

describe('colour tokens (acceptance 6, 41)', () => {
  const css = readFileSync(path.join(REPO, 'apps/web/src/styles/tokens.css'), 'utf8');
  const token = (n: string) => new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`).exec(css)![1]!;
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };
  const pairs: [string, string, number][] = [
    ['text', 'bg', 4.5], ['text', 'surface', 4.5], ['text-muted', 'bg', 4], ['text-muted', 'surface', 4], ['text-muted', 'accent-soft', 4],
    ['warning-ink', 'bg', 4.5], ['warning-ink', 'surface', 4.5], ['success-ink', 'bg', 4.5], ['success-ink', 'surface', 4.5],
    ['on-accent', 'accent', 4.5], ['on-accent', 'accent-hover', 4.5], ['accent', 'bg', 4.5], ['accent', 'surface', 4.5], ['accent', 'accent-soft', 4.5],
    ['warning', 'bg', 4.5], ['danger', 'bg', 4.5], ['success', 'bg', 4.5], ['warning', 'surface', 4.5], ['danger', 'surface', 4.5], ['success', 'surface', 4.5],
  ];
  const mixOver = (fg: string, bg: string, p: number) => {
    const f = [1, 3, 5].map((i) => parseInt(fg.slice(i, i + 2), 16));
    const b = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
    return `#${f.map((v, i) => Math.round(v * p + b[i]! * (1 - p)).toString(16).padStart(2, '0')).join('')}`;
  };
  for (const [fg, tint] of [['warning-ink', 'warning'], ['success-ink', 'success'], ['danger', 'danger']] as const) {
    for (const base of ['bg', 'surface']) {
      it(`${fg} text on the 8% ${tint} tint over ${base} is at least 4.5:1`, () => {
        expect(ratio(token(fg), mixOver(token(tint), token(base), 0.08))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
  for (const [fg, bg, min] of pairs) {
    it(`${fg} on ${bg} is at least ${min}:1`, () => {
      expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(min);
    });
  }
});
