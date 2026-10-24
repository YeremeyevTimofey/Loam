// The starter skills (§14.3). Each is a plain markdown file so it can be read and edited as one.
const files = import.meta.glob('./*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface StarterSkill {
  name: string;
  text: string;
}

// Skills for a kind of work come first, alphabetically; skills about skills go last.
const LAST = new Set(['find-skills']);

export const STARTER_SKILLS: StarterSkill[] = Object.entries(files)
  .map(([path, text]) => ({ name: path.replace(/^\.\//, '').replace(/\.md$/, ''), text }))
  .sort((a, b) => Number(LAST.has(a.name)) - Number(LAST.has(b.name)) || a.name.localeCompare(b.name));
