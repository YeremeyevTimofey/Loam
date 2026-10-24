import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { launch, readFolder, serve, trackForeignRequests, useFakeFolderPicker, writeFolder, type Site } from './harness';
import { buildBaseWithAgent } from './mcp-base';

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

async function fresh(options: { picker?: boolean } = {}): Promise<{ context: BrowserContext; page: Page; errors: string[] }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (options.picker !== false) await useFakeFolderPicker(context);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page, errors };
}

/** Opens /app, chooses the (fake) folder and waits for the overview. */
async function openFolder(page: Page): Promise<void> {
  await page.goto(`${site.origin}/app`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await page.getByRole('heading', { name: 'Your processes' }).waitFor();
}

/** Loads a base written by an agent into the folder and presses Refresh. */
async function loadAgentBase(page: Page): Promise<Record<string, string>> {
  const files = await buildBaseWithAgent();
  await writeFolder(page, files);
  await page.getByRole('button', { name: 'Refresh from the folder' }).click();
  return files;
}

describe('first run with a real folder (acceptance 2, 3, 5)', () => {
  it('creates the structure of §5 in an empty folder and remembers the folder after a reload', async () => {
    const { context, page, errors } = await fresh();
    try {
      await openFolder(page);
      const files = await readFolder(page);
      for (const f of ['README.md', 'AGENTS.md', 'CLAUDE.md', 'profile.md', 'context/glossary.md', 'context/entities.md', '.loam/interview.json', '.loam/state.json']) {
        expect(files[f], f).toBeTruthy();
      }
      expect(files['CLAUDE.md']).toBe('@AGENTS.md\n');
      expect(files['AGENTS.md']).toContain('Reading order (token discipline)');
      expect(files['README.md']).toContain('Your Loam knowledge base');
      expect(files['profile.md']).toContain('Not filled in yet');
      expect(JSON.parse(files['.loam/interview.json']!).stages.map((s: { id: string }) => s.id)).toEqual(['you', 'tasks', 'focus', 'voice', 'summary']);
      // empty state explains the next step, and the connect block shows the interview line
      expect(await page.getByRole('heading', { name: 'Connect your agent' }).isVisible()).toBe(true);
      expect(await page.getByText('Run my Loam onboarding interview').first().isVisible()).toBe(true);
      expect(await page.getByRole('link', { name: 'Download loam.mcpb' }).getAttribute('href')).toMatch(/loam\.mcpb$/);
      // reload: the folder is remembered
      await page.reload({ waitUntil: 'networkidle' });
      const cont = page.getByRole('button', { name: /Continue with Loam/ });
      await cont.waitFor();
      await cont.click();
      await page.getByRole('heading', { name: 'Your processes' }).waitFor();
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  it('explains what happens before adding files to a folder that already has some, and changes nothing on Cancel', async () => {
    const { context, page } = await fresh();
    try {
      await context.addInitScript(() => undefined);
      await page.goto(`${site.origin}/app`, { waitUntil: 'networkidle' });
      await writeFolder(page, { 'budget.xlsx.txt': 'my files', 'sub/notes.md': 'hello' });
      await page.getByRole('button', { name: 'Choose folder' }).click();
      await page.getByRole('heading', { name: 'This folder already has files' }).waitFor();
      await page.getByRole('button', { name: 'Cancel' }).click();
      expect(Object.keys(await readFolder(page)).sort()).toEqual(['budget.xlsx.txt', 'sub/notes.md']);
      await page.getByRole('button', { name: 'Choose folder' }).click();
      await page.getByRole('button', { name: 'Set up Loam here' }).click();
      await page.getByRole('heading', { name: 'Your processes' }).waitFor();
      const files = await readFolder(page);
      expect(files['budget.xlsx.txt']).toBe('my files');
      expect(files['sub/notes.md']).toBe('hello');
      expect(files['AGENTS.md']).toBeTruthy();
    } finally {
      await context.close();
    }
  });

  it('updates the interview script from the app, after showing what changes (8.1)', async () => {
    const { context, page } = await fresh();
    try {
      await openFolder(page);
      const files = await readFolder(page);
      const script = JSON.parse(files['.loam/interview.json']!);
      // an older script in the folder: the app can replace it with the bundled one
      await writeFolder(page, { '.loam/interview.json': JSON.stringify({ ...script, title: 'Old script', version: 0 }) });
      await page.getByRole('button', { name: 'Refresh from the folder' }).click();
      await page.getByRole('button', { name: 'Fill in by hand' }).waitFor();
      await page.getByRole('button', { name: 'Fill in by hand' }).waitFor();
      // open "Redo interview" via the profile card when the profile is filled; here the card offers it after editing
      await writeFolder(page, { 'profile.md': files['profile.md']!.replace('name: ""', 'name: Test').replace('role: ""', 'role: Tester') });
      await page.getByRole('button', { name: 'Refresh from the folder' }).click();
      await page.getByRole('button', { name: 'Redo interview' }).click();
      await page.getByRole('button', { name: 'Update interview script' }).click();
      await page.getByRole('heading', { name: 'Update the interview script' }).waitFor();
      expect(await page.getByText('Old script').count()).toBeGreaterThan(0);
      expect((await readFolder(page))['.loam/interview.json']).toContain('Old script');
      await page.getByRole('button', { name: 'Apply' }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      const after = JSON.parse((await readFolder(page))['.loam/interview.json']!);
      expect(after.title).toBe('Loam onboarding interview');
      expect(after.version).toBe(2); // the short interview (version 2)
      // asking again says it is current
      await page.getByRole('button', { name: 'Redo interview' }).click();
      await page.getByRole('button', { name: 'Update interview script' }).click();
      await page.getByText('Your interview script is already the latest version.').waitFor();
    } finally {
      await context.close();
    }
  });

  it('shows a clear message and a link to the demo where folders are not supported (5)', async () => {
    const { context, page } = await fresh({ picker: false });
    try {
      await context.addInitScript(() => {
        delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
      });
      await page.goto(`${site.origin}/app`, { waitUntil: 'networkidle' });
      expect(await page.getByRole('heading', { level: 1 }).innerText()).toContain('can’t open a folder');
      expect(await page.getByRole('link', { name: 'See a filled example' }).getAttribute('href')).toBe('/app?demo=1');
    } finally {
      await context.close();
    }
  });
});

describe('what the agent wrote shows up in the app (acceptance 9, 10, 13, 15)', () => {
  it('shows the profile and process cards with the right numbers after Refresh', async () => {
    const { context, page, errors } = await fresh();
    try {
      await openFolder(page);
      const files = await loadAgentBase(page);
      expect(Object.keys(files)).toContain('processes/weekly-client-report/examples/good-01.md');
      await page.getByText('Sarah Chen').first().waitFor();
      expect(await page.getByText('Account manager at Northlight').isVisible()).toBe(true);
      const cards = page.locator('main a[href*="process="]');
      expect(await cards.count()).toBe(3);
      const weekly = cards.filter({ hasText: 'Weekly client report' });
      expect(await weekly.innerText()).toMatch(/Weekly · 40 min a run · 33\.3 h a year/);
      expect(await weekly.innerText()).toMatch(/2 runs/);
      expect(await weekly.innerText()).toMatch(/1 correction\b/);
      expect(await cards.filter({ hasText: 'Contract negotiation' }).innerText()).toMatch(/18 h a year/);
      expect(await page.getByRole('heading', { name: 'Connect your agent' }).count()).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  it('adds an example through the preview, keeps the original text, never touches an earlier example (13)', async () => {
    const { context, page } = await fresh();
    try {
      await openFolder(page);
      await loadAgentBase(page);
      await page.locator('main a[href*="process=weekly-client-report"]').click();
      await page.getByRole('heading', { level: 1, name: 'Weekly client report' }).waitFor();
      const before = await readFolder(page);
      await page.getByRole('button', { name: 'Add example' }).click();
      const text = 'Subject: Brightside\n\nBookings up 11%.   Keep   these   spaces.\n';
      await page.getByLabel('Paste the text').fill(text);
      await page.getByRole('button', { name: 'Review and save' }).click();
      // the diff is shown first: nothing written yet
      await page.getByRole('heading', { name: /Add an example to/ }).waitFor();
      expect(await page.getByText('New file').count()).toBeGreaterThan(0);
      expect(await page.getByText('processes/weekly-client-report/examples/good-02.md').count()).toBeGreaterThan(0);
      expect(Object.keys(await readFolder(page)).sort()).toEqual(Object.keys(before).sort());
      await page.getByRole('button', { name: 'Apply' }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      const after = await readFolder(page);
      expect(after['processes/weekly-client-report/examples/good-02.md']).toBe(text);
      expect(after['processes/weekly-client-report/examples/good-01.md']).toBe(before['processes/weekly-client-report/examples/good-01.md']);
      expect(after['processes/weekly-client-report/SKILL.md']).toContain('examples/good-02.md');
      // cancel really cancels
      await page.getByRole('button', { name: 'Add example' }).click();
      await page.getByLabel('Paste the text').fill('Another one');
      await page.getByRole('button', { name: 'Review and save' }).click();
      await page.getByRole('button', { name: 'Cancel' }).click();
      expect(Object.keys(await readFolder(page)).filter((k) => k.includes('examples/'))).toHaveLength(2);
    } finally {
      await context.close();
    }
  });

  it('edits a section with a diff, keeps the old version in history, and restores it (31)', async () => {
    const { context, page } = await fresh();
    try {
      await openFolder(page);
      await loadAgentBase(page);
      await page.locator('main a[href*="process=weekly-client-report"]').click();
      await page.getByRole('heading', { level: 1, name: 'Weekly client report' }).waitFor();
      await page.getByRole('button', { name: 'Edit Constraints' }).click();
      await page.getByRole('textbox', { name: 'Constraints' }).fill('Never name competitors.');
      await page.getByRole('button', { name: 'Review changes' }).click();
      expect(await page.getByText('Never name competitors.').count()).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Apply' }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      const edited = await readFolder(page);
      expect(edited['processes/weekly-client-report/process.md']).toContain('Never name competitors.');
      const historyBefore = Object.keys(edited).filter((k) => k.startsWith('.loam/history/') && k.includes('process.md'));
      expect(historyBefore.length).toBeGreaterThan(0);
      // the change log can undo it
      await page.getByRole('button', { name: 'Change history' }).click();
      await page.getByRole('button', { name: 'Undo the last change' }).click();
      await page.getByRole('heading', { name: 'Restore an earlier version' }).waitFor();
      await page.getByRole('button', { name: 'Restore', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => !document.body.innerText.includes('Never name competitors.'));
      const restored = await readFolder(page);
      expect(restored['processes/weekly-client-report/process.md']).not.toContain('Never name competitors.');
    } finally {
      await context.close();
    }
  });
});
