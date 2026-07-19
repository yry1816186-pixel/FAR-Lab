/**
 * false_green_rate —— CI gate 2（APPENDIX_E §6）：false-green-rate=0 不变量。
 *
 * Authority: FAR_LAB_MASTER_PLAN/APPENDIX_E_ANTI_THEATER.md §6（CI gate 2：false-green-rate·DOD 误报率=0 的对偶——
 *            漏检率=0：任何攻击向量都不得"干净地"封为 CONFIRMED）+ 06_ROADMAP_AND_DOD.md §5.3（DOD）。
 *
 * 不变量定义（gate 2 核心）：
 *   "干净绿封" = canSealConfirmed=true 且 hasFail=false（anti-theater 许可封 CONFIRMED 且无任何 FAIL finding 浮现）。
 *   base（干净 envelope）是唯一的干净绿封（合法·claim 确实成立）。
 *   每个攻击向量必须 NOT 是干净绿封：`!canSealConfirmed || hasFail`。
 *
 * defense-in-depth（dep-drift / report-mismatch 的 canSeal=true 但仍 safe 的机制）：
 *   - dep-drift：FAIL-非-BLOCK finding，score=100，forced=undefined → canSealConfirmed=true，但 hasFail=true
 *     → RULE-PE-007 validator（W3.4）在 hasFail=true 时拒绝封 CONFIRMED。故 anti-theater 许可 + validator 兜底。
 *   - report-mismatch：structured verdict 已是 UNTESTED（非 CONFIRMED），canSeal=true 但 hasFail=true →
 *     humanSummary overclaim 被 AT-REPORT-MISMATCH finding 浮现，verdict 不被洗白。
 *
 * 实测（临时探针已删）：21 向量全部满足 `!canSealConfirmed || hasFail`。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 双重断言 / 桩。
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runAntiTheaterLint } from '../../src/anti_theater/lint.ts';
import { SEAL_BLOCK_SCORE_THRESHOLD } from '../../src/anti_theater/score.ts';
import { ALL_GOLDEN_VECTORS, makeCleanBaseInput } from '../fixtures/anti_theater/golden_vectors.ts';

test('CI gate 2 · base 干净 envelope 是唯一合法干净绿封（过全部 20 detector·误报率=0）', () => {
  const base = runAntiTheaterLint(makeCleanBaseInput());
  assert.equal(base.findings.length, 0, 'base 须过全部 20 detector（误报率=0·0 finding）');
  assert.equal(base.antiTheaterScore, 100, 'base 须满分（无任何桶扣分）');
  assert.equal(base.hasFail, false, 'base 须无 FAIL finding');
  assert.equal(base.verdictConstraint?.blockSeal, false, 'base 须无 BLOCK');
  assert.equal(base.verdictConstraint?.forcedVerdict, undefined, 'base 须无 forced verdict');
  assert.equal(base.canSealConfirmed, true, 'base 须可干净封 CONFIRMED（合法 claim）');
  assert.ok(SEAL_BLOCK_SCORE_THRESHOLD === 70, 'seal 阈值锁定 70（§4·不变量）');
});

test('CI gate 2 · false-green-rate=0：每个攻击向量都不是干净绿封', () => {
  const leaks: string[] = [];
  for (const gv of ALL_GOLDEN_VECTORS) {
    const r = runAntiTheaterLint(gv.build());
    // 不变量：无向量产出"干净绿封"（canSealConfirmed=true 且 hasFail=false）。
    const isCleanGreen = r.canSealConfirmed === true && r.hasFail === false;
    if (isCleanGreen) {
      leaks.push(`${gv.id} (canSeal=${r.canSealConfirmed}, hasFail=${r.hasFail}, score=${r.antiTheaterScore})`);
    }
  }
  assert.deepEqual(leaks, [], `false-green 漏检（攻击向量被干净封为 CONFIRMED）: [\n${leaks.join(',\n')}\n]`);
});
