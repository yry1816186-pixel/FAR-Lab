import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  VERDICT_VALUES,
  VERDICT_BADGE_VARIANT,
  isVerdictValue,
} from '@/lib/verdict';
import { verdictBadgeClass } from '@/components/VerdictBadge';
import type { VerdictValue } from '@/lib/types';

/**
 * verdict SSOT 防漂移锁（2026-08-18 审计批次 2）。
 *
 * 三个锁定面：
 *   1. SSOT 表语义正确（DEGRADED=warning 橙 / INCONCLUSIVE=secondary 灰——修复前
 *      Overview/Ablation 两页互换）；
 *   2. SSOT 与 VerdictBadge 组件语义不冲突（同一裁决不得一边绿一边红）；
 *   3. 页面层不得再自建裁决→颜色映射（源码扫描锁，新违规即红）。
 */

const PAGES_DIR = join(__dirname, '..', 'pages');

/** 递归收集 pages/ 下全部 .tsx 源码（当前为平铺,递归以防未来分层）。 */
function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collectTsxFiles(full));
    else if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('verdict SSOT — 语义正确性', () => {
  it('5 值词汇与内核一致且有序', () => {
    expect([...VERDICT_VALUES]).toEqual([
      'CONFIRMED',
      'REFUTED',
      'INCONCLUSIVE',
      'DEGRADED_SCOPE',
      'UNTESTED',
    ]);
  });

  it('variant 映射：CONFIRMED 绿 / REFUTED 红 / DEGRADED 橙 / INCONCLUSIVE 灰 / UNTESTED outline', () => {
    expect(VERDICT_BADGE_VARIANT.CONFIRMED).toBe('success');
    expect(VERDICT_BADGE_VARIANT.REFUTED).toBe('destructive');
    // 修复目标:此前 Overview/Ablation 把这两值互换(审计 P1 色彩互换发现)
    expect(VERDICT_BADGE_VARIANT.DEGRADED_SCOPE).toBe('warning');
    expect(VERDICT_BADGE_VARIANT.INCONCLUSIVE).toBe('secondary');
    expect(VERDICT_BADGE_VARIANT.UNTESTED).toBe('outline');
  });

  it('isVerdictValue：合法五值通过,漂移词与空值拒绝', () => {
    for (const v of VERDICT_VALUES) expect(isVerdictValue(v)).toBe(true);
    // WizardPage:495 曾未校验强转的漂移词风险(审计 P2)——守卫必须拒绝
    expect(isVerdictValue('verified')).toBe(false);
    expect(isVerdictValue('supported')).toBe(false);
    expect(isVerdictValue('proven')).toBe(false);
    expect(isVerdictValue('')).toBe(false);
    expect(isVerdictValue(null)).toBe(false);
    expect(isVerdictValue(undefined)).toBe(false);
  });

  it('SSOT 与 VerdictBadge 组件不冲突：同裁决两端不得出现对立色语义', () => {
    // success(绿)只许 CONFIRMED;warning(=degraded-solid 橙)只许 DEGRADED_SCOPE;
    // destructive(红)只许 REFUTED。VerdictBadge 端等价断言:对应 class 出现在同裁决。
    for (const v of VERDICT_VALUES) {
      const cls = verdictBadgeClass(v as VerdictValue);
      const variant = VERDICT_BADGE_VARIANT[v as VerdictValue];
      if (variant === 'success') expect(cls).toContain('bg-verdict-confirmed-solid');
      if (variant === 'destructive') expect(cls).toContain('bg-verdict-refuted-solid');
      if (variant === 'warning') expect(cls).toContain('bg-verdict-degraded-solid');
    }
  });
});

describe('verdict SSOT — 页面层防漂移源码锁', () => {
  it('pages/ 下不存在自建裁决→颜色/variant 映射（必须 import lib/verdict 或用 VerdictBadge）', () => {
    const forbidden =
      /(?:VERDICT_VARIANT|STATUS_VARIANT|VERDICT_META|VERDICT_COLORS)\s*[:=]/;
    const offenders: string[] = [];
    for (const file of collectTsxFiles(PAGES_DIR)) {
      const src = readFileSync(file, 'utf-8');
      if (forbidden.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]); // 新增自建映射即红——改 lib/verdict.ts 一处
  });
});
