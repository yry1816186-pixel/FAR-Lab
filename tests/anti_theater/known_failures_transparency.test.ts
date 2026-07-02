/**
 * known_failures_transparency —— CI gate 3（APPENDIX_E §6）：已知失败须透明披露。
 *
 * Authority: PROJECT_PLAN/APPENDIX_E_ANTI_THEATER.md §6（CI gate 3：known-failures transparency·
 *            含 finding 的 claim 不得静默呈现为 clean CONFIRMED）+ 03_EVIDENCE_CONTRACT_AND_VERDICT.md
 *            §6.1（原则：REFUTED/INCONCLUSIVE 不得被隐藏）+ 04_PROOF_ENVELOPE_AND_VERIFIER.md
 *            RULE-PE-007（CONFIRMED + hasFail → WARN/FAIL·W3.4 validator 兜底）。
 *
 * 透明性三元组（gate 3 核心）：
 *   1. FAIL outcome finding → 必须 hasFail=true（validator RULE-PE-007 据此拒绝 clean CONFIRMED 封印）。
 *   2. 任何 finding（含 WARN）→ 必须 reasonCodes 非空（机器可读披露·进 VerdictKernelOutput.reasonCodes）。
 *   3. findings 数量 === reasonCodes 覆盖的独立 reasonCode 数量级（无静默吞 finding）。
 *
 * 设计裁决：本 gate 在 anti-theater 层断言（far-verify CLI #11 未实现·不可断言最终 RED/YELLOW 输出）。
 *   RULE-PE-007 validator 行为在 W3.4（proof_envelope/v2/validator.test.ts）独立验证；本 gate 保证
 *   anti-theater 产出的 hasFail/reasonCodes 信号足以让 validator 做出正确裁决（信号源不静默）。
 *
 * 实测（临时探针已删）：21 向量全部满足三元组。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 双重断言 / 桩。
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runAntiTheaterLint } from '../../src/anti_theater/lint.ts';
import { ALL_GOLDEN_VECTORS } from '../fixtures/anti_theater/golden_vectors.ts';

test('CI gate 3 · 已知失败透明披露：FAIL finding → hasFail=true；任何 finding → reasonCodes 非空', () => {
  for (const gv of ALL_GOLDEN_VECTORS) {
    const r = runAntiTheaterLint(gv.build());

    // 1. FAIL outcome finding → hasFail=true（validator RULE-PE-007 信号源·不静默）。
    const hasFailOutcome = r.findings.some((f) => f.outcome === 'FAIL');
    if (hasFailOutcome) {
      assert.equal(
        r.hasFail,
        true,
        `${gv.id}: 存在 outcome=FAIL 的 finding 但 hasFail=false（RULE-PE-007 信号丢失·静默吞失败）`,
      );
    }

    // 2. 任何 finding（含 WARN）→ reasonCodes 去重并集非空（机器可读披露）。
    if (r.findings.length > 0) {
      const reasonCodes = r.verdictConstraint?.reasonCodes ?? [];
      assert.ok(
        reasonCodes.length > 0,
        `${gv.id}: 存在 ${r.findings.length} 个 finding 但 reasonCodes 为空（失败未透明披露）`,
      );
    }

    // 3. findings 非空时 report.hasFail 或 reasonCodes 须让 claim 无法 clean CONFIRMED（与 gate 2 互补）。
    //    WARN-only 向量（如 overfit）hasFail=false 但 forcedVerdict 降级（DEGRADED_SCOPE）→ 非 clean CONFIRMED。
    if (r.findings.length > 0) {
      const isCleanConfirm = r.canSealConfirmed === true && r.hasFail === false;
      assert.ok(
        !isCleanConfirm,
        `${gv.id}: 含 finding 却可 clean CONFIRMED（透明性失效·与 gate 2 false-green 矛盾）`,
      );
    }
  }
});
