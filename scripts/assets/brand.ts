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

export const COLORS = {
  bg: token('bg'),
  accent: token('accent'),
  accentInk: token('accent-ink'),
  accentSoft: token('accent-soft'),
  onAccent: token('on-accent'),
  text: token('text'),
  muted: token('text-muted'),
};

/** `fg` laid over `bg` at `amount` (0–1), as CSS color-mix in srgb does. */
const over = (fg: string, bg: string, amount: number): string => {
  const f = [1, 3, 5].map((i) => parseInt(fg.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
  return `#${f.map((v, i) => Math.round(v * amount + b[i]! * (1 - amount)).toString(16).padStart(2, '0')).join('')}`;
};

/**
 * Three rounded bars, a slice of soil (§12C.6): the lime sprout on top, then the soil darkening with depth.
 * The middle bar is --soil in tokens.css (ink at 38% over the page). One path per bar, no gradients or filters.
 */
export const BAR_COLORS = [COLORS.accent, over(COLORS.text, COLORS.bg, 0.38), COLORS.text];
/** On the ink tile (favicon, app icons) the soil turns light, so every layer stays visible at 16px. */
export const TILE_COLORS = { tile: COLORS.text, bars: [COLORS.accent, over(COLORS.bg, COLORS.text, 0.55), COLORS.bg] };

const bar = (y: number, fill: string) =>
  `<path d="M4 ${y}h16a2 2 0 0 1 0 4H4a2 2 0 0 1 0-4z" fill="${fill}"/>`;

export const markPaths = (colors: string[] = BAR_COLORS): string => colors.map((fill, i) => bar(4 + i * 6, fill)).join('');

export const logoSvg = (): string => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">${markPaths()}</svg>\n`;

/** The mark on an ink tile. */
export const tileSvg = (size = 32): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${TILE_COLORS.tile}"/><g transform="translate(4 4)">${markPaths(TILE_COLORS.bars)}</g></svg>\n`;
