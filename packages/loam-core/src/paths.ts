import { LoamError } from './types';

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSlug(value: string): boolean {
  return value.length > 0 && value.length <= 64 && SLUG_RE.test(value);
}

/** Folder-safe name: latin, lowercase, hyphens. Cyrillic is transliterated. Returns '' if nothing is left. */
export function slugify(text: string): string {
  const latin = text
    .toLowerCase()
    .split('')
    .map((ch) => CYRILLIC[ch] ?? ch)
    .join('');
  return latin
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}

/**
 * Normalises a path that must stay inside the base. Throws on anything that could escape:
 * absolute paths, drive letters, "..", "~", NUL bytes. Returns "a/b/c.md" (no leading "./").
 */
export function normalizeRelPath(input: string): string {
  if (typeof input !== 'string' || input.length === 0) throw new LoamError('The path is empty.');
  if (input.includes('\0')) throw new LoamError('The path contains an invalid character.');
  const unified = input.replace(/\\/g, '/');
  if (unified.startsWith('/') || /^[a-zA-Z]:/.test(unified) || unified.startsWith('~')) {
    throw new LoamError(`"${input}" is outside the knowledge base. Use a path relative to the base folder.`);
  }
  const parts: string[] = [];
  for (const part of unified.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') throw new LoamError(`"${input}" tries to leave the knowledge base folder. Paths must stay inside it.`);
    parts.push(part);
  }
  if (parts.length === 0) throw new LoamError('The path is empty.');
  return parts.join('/');
}

export const dirname = (p: string): string => {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
};
export const basename = (p: string): string => p.slice(p.lastIndexOf('/') + 1);
export const join = (...parts: string[]): string => parts.filter(Boolean).join('/');

export const processDir = (slug: string) => `processes/${slug}`;
export const processFile = (slug: string) => `processes/${slug}/process.md`;
export const processSkillFile = (slug: string) => `processes/${slug}/SKILL.md`;
export const examplesDir = (slug: string) => `processes/${slug}/examples`;
export const correctionsFile = (slug: string) => `processes/${slug}/corrections.md`;
export const skillDir = (name: string) => `skills/${name}`;
export const skillFile = (name: string) => `skills/${name}/SKILL.md`;
export const agentSkillFile = (root: string, dirName: string) => `${root}/${dirName}/SKILL.md`;

/** Matches processes/<slug>/<rest> and returns the slug. */
export function processSlugOf(path: string): string | null {
  const m = /^processes\/([a-z0-9-]+)\//.exec(path);
  return m ? (m[1] ?? null) : null;
}
