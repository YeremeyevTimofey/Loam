import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = path.resolve(import.meta.dirname, '..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return /demo-data|starter-skills/.test(name) ? [] : files(full);
    return /\.(tsx?|css)$/.test(name) ? [full] : [];
  });
const sources = [...files(path.join(WEB, 'src')), ...['index.html', 'install.html', '404.html', 'app/index.html'].map((f) => path.join(WEB, f))];
const tokens = readFileSync(path.join(WEB, 'src/styles/tokens.css'), 'utf8');
const token = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(tokens)?.[1]?.trim();

describe('the design system (DESIGN.md)', () => {
  it('uses lime only as a fill: text, borders, rings and focus in its hue use accent-ink', () => {
    const asText = /\b(?:text|border|outline|ring|decoration|stroke)-accent(?![-\w])|accent-\[var\(--accent\)\]|(?<![-\w])color:\s*var\(--accent\)/;
    const offenders = sources.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => (asText.test(line) ? `${path.relative(WEB, file)}:${i + 1}: ${line.trim().slice(0, 100)}` : null))
        .filter((x): x is string => x !== null),
    );
    expect(offenders).toEqual([]);
  });

  it('has one bright accent with ink on it, and a text shade of the same hue', () => {
    expect(token('accent')).toBe('#c6f432');
    expect(token('on-accent')).toBe(token('text'));
    expect(token('accent-ink')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('loads one self-hosted font, Geist, and preloads it on the pages that use it first', () => {
    const theme = readFileSync(path.join(WEB, 'src/styles/theme.css'), 'utf8');
    expect(theme.match(/@font-face/g)).toHaveLength(1);
    expect(theme).toContain("url('/fonts/geist-latin-variable.woff2')");
    for (const page of ['index.html', 'install.html']) {
      expect(readFileSync(path.join(WEB, page), 'utf8')).toContain('<link rel="preload" href="/fonts/geist-latin-variable.woff2"');
    }
    expect(token('f-sans')).toMatch(/^'Geist',/);
  });

  it('plays the landing page animation only for people who have not asked for less motion', () => {
    const landing = readFileSync(path.join(WEB, 'src/styles/landing.css'), 'utf8');
    const outside = landing.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}\n/, '');
    expect(outside).not.toMatch(/animation\s*:/);
    expect(landing).toMatch(/@media \(prefers-reduced-motion: no-preference\)/);
  });
});
