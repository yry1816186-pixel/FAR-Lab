import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseSkillMarkdown, loadSkillsFromDir, selectSkills, renderSkillsPrompt, type AgentSkill } from '../src/agent/skills.js';

const SKILL_MD = `---
name: counter-evidence
description: Hunt contradicting literature and failed replications
whenToUse: when refining hypotheses or checking counter evidence
priority: 5
---
Always search for failed replications first.`;

describe('skills (conditional injection)', () => {
  it('parses frontmatter into a skill', () => {
    const res = parseSkillMarkdown(SKILL_MD, 'project', 'test.md');
    expect('skill' in res).toBe(true);
    if (!('skill' in res)) return;
    expect(res.skill.name).toBe('counter-evidence');
    expect(res.skill.tier).toBe('project');
    expect(res.skill.priority).toBe(5);
    expect(res.skill.whenToUse).toMatch(/counter evidence/);
    expect(res.skill.body).toContain('failed replications');
  });

  it('rejects structurally invalid skills (no name / no frontmatter)', () => {
    expect('error' in parseSkillMarkdown('no frontmatter here', 'user', 'a.md')).toBe(true);
    expect('error' in parseSkillMarkdown('---\ndescription: x\n---\nbody', 'user', 'b.md')).toBe(true);
  });

  it('loads skills from a directory and warns on unreadable dirs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-skills-'));
    fs.writeFileSync(path.join(dir, 'good.md'), SKILL_MD);
    fs.writeFileSync(path.join(dir, 'bad.md'), 'no frontmatter');
    fs.writeFileSync(path.join(dir, 'ignored.txt'), 'not a skill');
    const { skills, warnings } = loadSkillsFromDir(dir, 'project');
    expect(skills.length).toBe(1);
    expect(skills[0]!.name).toBe('counter-evidence');
    expect(warnings.length).toBe(1);
    const missing = loadSkillsFromDir(path.join(dir, 'does-not-exist'), 'user');
    expect(missing.skills.length).toBe(0);
    expect(missing.warnings[0]).toMatch(/not readable/);
  });

  it('selects only task-relevant skills (zero-score skills cost nothing)', () => {
    const skills: AgentSkill[] = [
      { name: 'counter-evidence', description: 'hunt contradicting literature', whenToUse: 'refining hypotheses counter evidence', tier: 'builtin', priority: 0, body: 'A'.repeat(50) },
      { name: 'formatting', description: 'markdown table formatting', whenToUse: 'rendering tables', tier: 'builtin', priority: 9, body: 'B'.repeat(50) },
    ];
    const selected = selectSkills('refine the counter evidence for these hypotheses', skills, { maxCount: 5, maxChars: 10_000 });
    expect(selected.map((s) => s.name)).toEqual(['counter-evidence']);
  });

  it('breaks ties by user > project > builtin tier, then priority', () => {
    const skills: AgentSkill[] = [
      { name: 'builtin-evidence', description: 'evidence work', tier: 'builtin', priority: 5, body: 'x' },
      { name: 'user-evidence', description: 'evidence work', tier: 'user', priority: 0, body: 'x' },
      { name: 'project-evidence', description: 'evidence work', tier: 'project', priority: 0, body: 'x' },
    ];
    const selected = selectSkills('do evidence work', skills, { maxCount: 3, maxChars: 10_000 });
    expect(selected[0]!.name).toBe('user-evidence');
    expect(selected.map((s) => s.tier)).toEqual(['user', 'project', 'builtin']);
  });

  it('respects the character budget across selected skills', () => {
    const skills: AgentSkill[] = Array.from({ length: 5 }, (_, i) => ({
      name: `skill-${i}`, description: `evidence task variant ${i}`, tier: 'builtin' as const, priority: 0, body: 'y'.repeat(100),
    }));
    const selected = selectSkills('evidence task', skills, { maxCount: 5, maxChars: 250 });
    const total = selected.reduce((n, s) => n + s.body.length + s.name.length + s.description.length, 0);
    expect(total).toBeLessThanOrEqual(250 + 150); // budget + at most one overflow beyond
    expect(selected.length).toBeLessThan(5);
  });

  it('renders nothing when no skills apply', () => {
    expect(renderSkillsPrompt([])).toBe('');
    expect(renderSkillsPrompt(selectSkills('unrelated topic', [
      { name: 'a', description: 'b', tier: 'builtin', priority: 0, body: 'c' },
    ], { maxCount: 1, maxChars: 100 }))).toBe('');
  });
});
