import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PUBLIC = path.join(REPO, 'apps/web/public');

/** Reads a colour from tokens.css, so assets and UI cannot drift apart. */
function token(name: string): string {
  const css = readFileSync(path.join(REPO, 'apps/web/src/styles/tokens.css'), 'utf8');
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`token --${name} not found`);
  return m[1]!.toLowerCase();
}

export const COLORS = { bg: token('bg'), accent: token('accent'), text: token('text'), muted: token('text-muted') };

const mix = (hex: string, amount: number): string => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${c.map((v) => Math.round(255 - (255 - v) * amount).toString(16).padStart(2, '0')).join('')}`;
};

/** Three rounded bars, lighter on top: a slice of soil (§12C.6). One path per bar, no gradients or filters. */
export const BAR_COLORS = [mix(COLORS.accent, 0.4), mix(COLORS.accent, 0.7), COLORS.accent];
const bar = (y: number, fill: string) =>
  `<path d="M4 ${y}h16a2 2 0 0 1 0 4H4a2 2 0 0 1 0-4z" fill="${fill}"/>`;

export const markPaths = (): string => BAR_COLORS.map((fill, i) => bar(4 + i * 6, fill)).join('');

export const logoSvg = (): string => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">${markPaths()}</svg>\n`;

/** The mark on the page background, as a tile. */
export const tileSvg = (size = 32): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${COLORS.bg}"/><g transform="translate(4 4)">${markPaths()}</g></svg>\n`;
