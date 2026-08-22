import fs from 'node:fs';
import path from 'node:path';

/**
 * Skills (H4, Claude Code conditional-skills discipline): markdown + frontmatter
 * manifests, tiered by origin, selected for injection by task relevance instead of
 * preloading everything. A skill that never matches the task costs zero context.
 */

export type SkillTier = 'builtin' | 'project' | 'user';

export interface AgentSkill {
  name: string;
  description: string;
  /** Free-text trigger conditions — matched against the task for selection. */
  whenToUse?: string;
  /** Tier origin (builtin < project < user when priorities tie). */
  tier: SkillTier;
  /** Numeric priority within/below tier comparison (higher wins). */
  priority: number;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Minimal frontmatter parser (key: value lines; no YAML dependency — skills in this
 * repo declare flat string/number fields only). Returns null for structurally invalid
 * skills (fail-closed: a malformed skill is skipped loudly by the caller, never guessed).
 */
export const parseSkillMarkdown = (md: string, tier: SkillTier, source: string): { skill: AgentSkill } | { error: string } => {
  const m = FRONTMATTER_RE.exec(md);
  if (m === null) return { error: `${source}: missing frontmatter block` };
  const fields = new Map<string, string>();
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/.exec(line.trim());
    if (kv !== null) fields.set(kv[1]!, kv[2]!.trim());
  }
  const name = fields.get('name');
  const description = fields.get('description');
  if (name === undefined || name.length === 0) return { error: `${source}: frontmatter has no name` };
  if (description === undefined || description.length === 0) return { error: `${source}: frontmatter has no description` };
  const priorityRaw = fields.get('priority');
  const priority = priorityRaw !== undefined && /^\d+$/.test(priorityRaw) ? Number(priorityRaw) : 0;
  const whenToUse = fields.get('whenToUse');
  return {
    skill: {
      name, description,
      ...(whenToUse !== undefined && whenToUse.length > 0 ? { whenToUse } : {}),
      tier, priority,
      body: m[2] ?? '',
    },
  };
};

export const loadSkillsFromDir = (dir: string, tier: SkillTier): { skills: AgentSkill[]; warnings: string[] } => {
  const skills: AgentSkill[] = [];
  const warnings: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { skills, warnings: [`${dir}: not readable — no skills loaded from this tier`] };
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const file = path.join(dir, entry.name);
    const parsed = parseSkillMarkdown(fs.readFileSync(file, 'utf8'), tier, file);
    if ('error' in parsed) { warnings.push(parsed.error); continue; }
    skills.push(parsed.skill);
  }
  return { skills, warnings };
};

const tokenize = (s: string): Set<string> =>
  new Set(s.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/).filter((t) => t.length > 2));

/**
 * Relevance selection: score = token overlap between the task and the skill's trigger
 * text (whenToUse + name + description). Skills with score 0 are never injected.
 * Ordering: score, then user>project>builtin tier, then declared priority.
 */
export const selectSkills = (task: string, skills: readonly AgentSkill[], limits: { maxCount: number; maxChars: number }): AgentSkill[] => {
  const taskTokens = tokenize(task);
  const TIER_RANK: Record<SkillTier, number> = { user: 2, project: 1, builtin: 0 };
  const scored = skills
    .map((s) => ({ s, score: [...tokenize([s.name, s.description, s.whenToUse ?? ''].join(' '))].filter((t) => taskTokens.has(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || TIER_RANK[b.s.tier] - TIER_RANK[a.s.tier] || b.s.priority - a.s.priority || a.s.name.localeCompare(b.s.name));
  const selected: AgentSkill[] = [];
  let used = 0;
  for (const { s } of scored) {
    if (selected.length >= limits.maxCount) break;
    const size = s.body.length + s.name.length + s.description.length;
    if (used + size > limits.maxChars && selected.length > 0) continue; // try smaller skills
    selected.push(s);
    used += size;
  }
  return selected;
};

/** Inject selected skills into the system prompt (conditional, budgeted). */
export const renderSkillsPrompt = (selected: readonly AgentSkill[]): string => {
  if (selected.length === 0) return '';
  const blocks = selected.map((s) => `### skill: ${s.name}\n${s.description}\n${s.body.trim()}`);
  return `\n\n## Applicable skills\n${blocks.join('\n\n')}`;
};
