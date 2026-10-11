import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launch, readFolder, REPO, serve, useFakeFolderPicker, writeFolder, type Site } from './harness';

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

const fixture = (name: string) => readFileSync(path.join(REPO, 'packages/loam-core/test/fixtures/malicious', name), 'utf8');

async function skillsScreen(): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await useFakeFolderPicker(context);
  const page = await context.newPage();
  await page.goto(`${site.origin}/app`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await page.getByRole('heading', { name: 'Your processes' }).waitFor();
  await writeFolder(page, { '.claude/skills/my-own-skill/SKILL.md': '---\nname: my-own-skill\ndescription: Mine\n---\nMy own instructions.\n' });
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Skills' }).click();
  await page.getByRole('heading', { name: 'Your skills' }).waitFor();
  return { page, close: () => context.close() };
}

const paste = async (page: Page, text: string) => {
  await page.getByRole('button', { name: 'Paste text' }).click();
  await page.getByLabel('Skill text').fill(text);
  await page.getByRole('button', { name: 'Check it' }).click();
};

describe('starter pack and sync (acceptance 18, 19)', () => {
  it('lists the six starter skills, adds one by copying it, syncs with the loam- prefix and leaves the user\'s own skill alone', async () => {
    const { page, close } = await skillsScreen();
    try {
      for (const name of ['meeting-summary', 'client-bad-news-email', 'weekly-status-report', 'incoming-doc-review', 'meeting-prep', 'task-handoff']) {
        expect(await page.getByRole('button', { name: `Add ${name}` }).count(), name).toBe(1);
      }
      await page.getByRole('button', { name: 'Add meeting-summary' }).click();
      await page.getByRole('heading', { name: 'Add “meeting-summary”' }).waitFor();
      await page.getByRole('button', { name: 'Add skill' }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      const files = await readFolder(page);
      const stored = files['skills/meeting-summary/SKILL.md']!;
      expect(stored).toContain('source: starter');
      expect(stored).toContain('reviewed: true');
      expect(stored).toContain('scanner: pass');
      expect(stored).toContain('# Meeting summary');
      expect(files['.claude/skills/loam-meeting-summary/SKILL.md']).toContain('name: loam-meeting-summary');
      expect(files['.claude/skills/my-own-skill/SKILL.md']).toBe('---\nname: my-own-skill\ndescription: Mine\n---\nMy own instructions.\n');
      expect(await page.getByRole('button', { name: 'meeting-summary is already added' }).isDisabled()).toBe(true);

      // Sync repairs a damaged copy and reports how many files it touched
      await writeFolder(page, { '.claude/skills/loam-meeting-summary/SKILL.md': 'tampered' });
      await page.getByRole('button', { name: 'Sync to agents' }).click();
      await page.getByText('1 file updated in .claude/skills and .agents/skills.').waitFor();
      expect((await readFolder(page))['.claude/skills/loam-meeting-summary/SKILL.md']).toContain('name: loam-meeting-summary');
      expect((await readFolder(page))['.claude/skills/my-own-skill/SKILL.md']).toContain('My own instructions.');
      await page.getByRole('button', { name: 'Sync to agents' }).click();
      await page.getByText('Agent skills are already up to date.').waitFor();
    } finally {
      await close();
    }
  });
});

describe('deleting a skill', () => {
  it('removes the skill and its agent copy, and nothing else (19)', async () => {
    const { page, close } = await skillsScreen();
    try {
      await page.getByRole('button', { name: 'Add meeting-summary' }).click();
      await page.getByRole('button', { name: 'Add skill' }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      expect((await readFolder(page))['.claude/skills/loam-meeting-summary/SKILL.md']).toBeTruthy();
      await page.getByRole('button', { name: 'Delete meeting-summary' }).click();
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      const files = await readFolder(page);
      expect(files['skills/meeting-summary/SKILL.md']).toBeUndefined();
      expect(files['.claude/skills/loam-meeting-summary/SKILL.md']).toBeUndefined();
      expect(files['.claude/skills/my-own-skill/SKILL.md']).toContain('My own instructions.');
      expect(Object.keys(files).some((k) => k.startsWith('.loam/history/') && k.includes('meeting-summary'))).toBe(true);
      await page.getByRole('button', { name: 'View audit log' }).click();
      const rows = (await page.getByRole('dialog').locator('tbody tr').allInnerTexts()).join('\n');
      expect(rows).toMatch(/Deleted/);
      expect(rows).toMatch(/Added/);
    } finally {
      await close();
    }
  });
});

describe('importing skills is guarded by the scanner (acceptance 20-23, 27)', () => {
  const refusals: [string, string, RegExp][] = [
    ['delete.md', 'Deletes files', /delete all the files/],
    ['network.md', 'Uses the internet', /https:\/\/metrics\.example-analytics\.com/],
    ['exfiltration.md', 'Sends your files out', /send everything/],
    ['injection.md', 'Changes how your AI behaves', /Ignore all previous instructions/],
    ['escape.md', 'Reaches outside your folder', /\.\.\/\.\.\/Documents/],
    ['credentials.md', 'Asks for passwords or keys', /password and API key/],
  ];

  it('refuses a skill for each red category, names the category and the offending line, and offers no way around it', async () => {
    const { page, close } = await skillsScreen();
    try {
      for (const [file, label, line] of refusals) {
        await paste(page, fixture(file));
        const dialog = page.getByRole('dialog');
        await dialog.getByText('Refused: this skill failed the safety check').waitFor();
        expect(await dialog.getByText(label).count(), `${file}: category`).toBeGreaterThan(0);
        expect(await dialog.locator('code').allInnerTexts().then((t) => t.join('\n')), `${file}: line`).toMatch(line);
        expect(await dialog.getByText(/line \d+/).count(), `${file}: line number`).toBeGreaterThan(0);
        // no override anywhere: no "Add to my base", nothing that says "anyway" or "force"
        expect(await dialog.getByRole('button', { name: /add to my base/i }).count()).toBe(0);
        const controls = await page.locator('button, a, [role=button], [role=link], input[type=submit]').allInnerTexts();
        expect(controls.join(' | ').toLowerCase(), `${file}: no control that overrides the refusal`).not.toMatch(/anyway|force|override|ignore the warning|add it regardless/);
        await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
      }
      const files = await readFolder(page);
      expect(Object.keys(files).filter((p) => p.startsWith('skills/'))).toEqual([]);
      // every refusal is in the audit log
      await page.getByRole('button', { name: 'View audit log' }).click();
      const rows = await page.getByRole('dialog').locator('tbody tr').allInnerTexts();
      expect(rows.filter((r) => r.includes('Refused'))).toHaveLength(6);
      const audit = JSON.parse(files['.loam/skill-audit.json']!);
      expect(audit.entries).toHaveLength(6);
      expect(audit.entries.every((e: { hash: string; scanner: string }) => e.scanner === 'fail' && /^[0-9a-f]{64}$/.test(e.hash))).toBe(true);
    } finally {
      await close();
    }
  });

  it('rejects network and write capabilities for an imported skill', async () => {
    const { page, close } = await skillsScreen();
    try {
      await paste(page, fixture('capability-network.md'));
      await page.getByRole('dialog').getByText(/declares network access/).waitFor();
      await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).first().click();
      await paste(page, fixture('capability-write.md'));
      await page.getByRole('dialog').getByText(/permission to write to your base/).waitFor();
      expect(await page.getByRole('button', { name: /add to my base/i }).count()).toBe(0);
    } finally {
      await close();
    }
  });

  it('shows a preview with the full text and permissions, then adds a clean skill as unreviewed and offers an agent review (20)', async () => {
    const { page, close } = await skillsScreen();
    try {
      const text = '---\nname: Tone Checker\ndescription: Check a draft for tone and suggest two small changes\nlicense: MIT\n---\n\n# Tone checker\n\nRead the draft and point out where the tone slips.\n';
      await paste(page, text);
      const dialog = page.getByRole('dialog');
      await dialog.getByText('Passed the safety check').first().waitFor();
      expect(await dialog.getByText('Read only').count()).toBe(1);
      expect(await dialog.locator('pre').innerText()).toContain('point out where the tone slips');
      await dialog.getByRole('button', { name: 'Add to my base' }).click();
      await dialog.waitFor({ state: 'hidden' });
      const card = page.locator('section', { has: page.getByRole('heading', { name: 'Your skills' }) }).locator('h3', { hasText: 'tone-checker' });
      await card.waitFor();
      expect(await page.getByText('Not reviewed').count()).toBe(1);
      const stored = (await readFolder(page))['skills/tone-checker/SKILL.md']!;
      expect(stored).toContain('source: imported');
      expect(stored).toContain('reviewed: false');
      expect(stored).toContain('capabilities: [read]');
      expect((await readFolder(page))['.claude/skills/loam-tone-checker/SKILL.md']).toContain('BEGIN IMPORTED SKILL');
      await page.getByRole('button', { name: 'Ask my agent to review' }).click();
      await page.getByText('Review the imported skill tone-checker in my Loam base').waitFor();
    } finally {
      await close();
    }
  });

  it('imports a 1500-word skill with no licence with a visible warning (22), via a file', async () => {
    const { page, close } = await skillsScreen();
    try {
      const body = Array.from({ length: 170 }, () => 'Write a clear summary of the notes in plain words.').join(' ');
      await page.locator('input[type=file]').setInputFiles({ name: 'long.md', mimeType: 'text/markdown', buffer: Buffer.from(`---\nname: long-one\ndescription: A long but harmless skill about summaries\n---\n\n${body}\n`) });
      const dialog = page.getByRole('dialog');
      await dialog.getByText('Passed the safety check, with warnings').waitFor();
      expect(await dialog.getByText(/longer than 1000 words/).count()).toBe(1);
      await dialog.getByRole('button', { name: 'Add to my base' }).click();
      await dialog.waitFor({ state: 'hidden' });
      await page.getByText('Scan warning').waitFor();
      expect((await readFolder(page))['skills/long-one/SKILL.md']).toContain('scanner: warn');
    } finally {
      await close();
    }
  });

  it('explains a file that is not a skill at all, in plain words', async () => {
    const { page, close } = await skillsScreen();
    try {
      await paste(page, '# Just notes\n\nNo header here.');
      await page.getByRole('dialog').getByText(/no header/).waitFor();
      expect(await page.getByRole('button', { name: /add to my base/i }).count()).toBe(0);
    } finally {
      await close();
    }
  });
});
