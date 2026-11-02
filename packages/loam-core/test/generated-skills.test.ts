import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyPlan, loadSkills, parseDoc, planDeleteSkill, planSaveInterview, planSyncAgentSkills, renderSkillList, scanSkill } from '../src';
import { addSampleSkill, freshBase, ROOT, TODAY } from './helpers';

const manifestTools = new Set((JSON.parse(readFileSync(join(ROOT, 'apps/mcp-server/manifest.json'), 'utf8')) as { tools: { name: string }[] }).tools.map((t) => t.name));
const WRITE_TOOLS = ['loam_upsert_note', 'loam_record_correction', 'loam_add_example', 'loam_generate_skill', 'loam_log_run', 'loam_save_interview', 'loam_import_skill', 'loam_set_skill_review', 'loam_init', 'loam_add_process', 'loam_upsert_context'];

describe('the skills Loam writes itself', () => {
  it('pass Loam\'s own safety check with no flag at all, name only tools that exist, and none that write', async () => {
    const store = await freshBase();
    const processes = [
      { title: 'Weekly client report', frequency: 'weekly', minutes_per_run: 40, automation: 'ready', what: 'A summary.', steps: ['Pull the numbers', 'Write it'], good: 'Short.', constraints: 'Never promise a date.' },
      { title: 'Handle a complaint', frequency: 'ad-hoc', minutes_per_run: 45, runs_per_year: 8, automation: 'manual-only' },
    ];
    await applyPlan(store, (await planSaveInterview(store, { profile: { name: 'Sarah' }, processes, complete: true } as never, TODAY)).plan);
    const { skills } = await loadSkills(store);
    expect(skills.map((s) => s.name).sort()).toEqual(['handle-a-complaint', 'weekly-client-report']);
    for (const skill of skills) {
      const { data, body } = parseDoc(skill.raw);
      const scan = scanSkill({ text: skill.raw, body, description: String(data.description), license: data.license ? String(data.license) : 'MIT', capabilities: ['read'], source: 'generated', frontmatterKeys: Object.keys(data) });
      expect(scan.red, `${skill.name}: ${JSON.stringify(scan.red)}`).toHaveLength(0);
      const named = [...new Set(skill.raw.match(/\bloam_[a-z_]+\b/g) ?? [])];
      for (const name of named) expect(manifestTools.has(name), `${name} is not in manifest.json`).toBe(true);
      for (const name of WRITE_TOOLS) expect(named, `${skill.name} names ${name}`).not.toContain(name);
    }
  });
});

describe('folders that already hold a starter skill from an older Loam', () => {
  it('still load it, list it as a starter skill, copy it for agents, and let the person delete it', async () => {
    const store = await freshBase();
    await addSampleSkill(store, 'meeting-summary'); // source: starter, as an older Loam wrote it
    const { skills, invalid } = await loadSkills(store);
    expect(invalid).toEqual([]);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.fm).toMatchObject({ name: 'meeting-summary', source: 'starter', capabilities: ['read'], reviewed: true, scanner: 'pass' });
    expect(renderSkillList(skills)).toMatch(/- meeting-summary — Turn raw meeting notes .* \[starter; read\]/);
    await applyPlan(store, await planSyncAgentSkills(store));
    expect(await store.exists('.claude/skills/loam-meeting-summary/SKILL.md')).toBe(true);
    expect(await store.exists('.agents/skills/loam-meeting-summary/SKILL.md')).toBe(true);
    await applyPlan(store, await planDeleteSkill(store, 'meeting-summary'));
    expect((await loadSkills(store)).skills).toEqual([]);
  });
});
