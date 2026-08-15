// src/planning/checkpoint.ts
// 职责：PROGRESS.md 检查点协议
// 渲染 + 解析（确定性纯函数）。
//
// 协议（AGENTS.md §19.1）：检查点最小内容 = 当前目标 / 已完成（带证据）/
// 当前状态 / 下一步 / 阻塞 / 已排除方案 / 未验证假设。
// 恢复协议：新会话第一动作 = 读 PROGRESS.md 顶部 → git status → git log → 续跑。

import type { Checkpoint, ParsedCheckpoint } from './types.ts';

/** 渲染检查点为 PROGRESS.md 顶部可追加的 markdown 块。 */
export function renderCheckpoint(cp: Checkpoint): string {
  const lines: string[] = [
    `# PROGRESS — ${cp.taskId} @ ${new Date().toISOString()}`,
    '',
    `## 当前目标（≤20 词）`,
    cp.goal,
    '',
    `## 已完成（带证据：命令输出 / file:line / 测试名）`,
    ...bullet(cp.completed),
    '',
    `## 当前状态（git branch / commit / dirty flag）`,
    cp.state,
  ];
  if (cp.blockers.length > 0) {
    lines.push('', `## 阻塞 / 风险`, ...bullet(cp.blockers));
  }
  if (cp.excludedApproaches.length > 0) {
    lines.push('', `## 已排除方案（防恢复时盲目重试）`, ...bullet(cp.excludedApproaches));
  }
  if (cp.assumptions.length > 0) {
    lines.push('', `## 未验证的假设`, ...bullet(cp.assumptions));
  }
  lines.push('', `## 下一步（具体可执行的下一动作，不是抽象计划）`, cp.nextStep, '');
  return lines.join('\n');
}

function bullet(items: readonly string[]): string[] {
  return items.length === 0 ? ['（无）'] : items.map((i) => `- ${i}`);
}

/**
 * 解析检查点 markdown 为结构化段（供恢复协议读取"下一步"等）。
 * 只解析本模板格式（# PROGRESS — ... 头 + ## 小节），解析失败返回 ok=false。
 */
export function parseCheckpoint(markdown: string): ParsedCheckpoint {
  const lines = markdown.split(/\r?\n/);
  const sections: Record<string, string> = {};

  let taskId: string | undefined;
  const header = lines[0]?.match(/^# PROGRESS —\s*(.+?)\s*@\s*\S+$/);
  if (header !== undefined && header !== null) {
    taskId = header[1]?.trim();
  }

  let currentSection: string | undefined;
  for (const rawLine of lines) {
    const heading = rawLine.match(/^##\s+(.+?)\s*$/);
    if (heading !== null) {
      currentSection = heading[1]?.trim();
      if (currentSection !== undefined) sections[currentSection] = '';
      continue;
    }
    if (currentSection !== undefined && rawLine.trim().length > 0) {
      sections[currentSection] = sections[currentSection] === '' ? rawLine.trim() : `${sections[currentSection]}\n${rawLine.trim()}`;
    }
  }

  if (Object.keys(sections).length === 0) {
    return { ok: false, taskId: undefined, sections: {}, error: 'no "## " sections found (not a rendered checkpoint)' };
  }
  return { ok: true, taskId, sections };
}

/** 从解析结果中提取"下一步"（恢复协议的核心读点）。键匹配"下一步"前缀（兼容完整标题）。 */
export function nextStepFrom(sections: Readonly<Record<string, string>>): string | undefined {
  const key = Object.keys(sections).find((k) => k.startsWith('下一步'));
  const value = key === undefined ? undefined : sections[key];
  return value?.trim() || undefined;
}
