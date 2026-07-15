/**
 * llm_judge_injection —— CI gate 5（APPENDIX_E §6）：LLM-as-final-judge 注入检测 + structured kernel 不被覆盖。
 *
 * Authority: FAR_LAB_MASTER_PLAN/APPENDIX_E_ANTI_THEATER.md §2（AT-JUDGE-OVERRIDE 伪代码·llm-reviewer-override）+
 *            §6（CI gate 5）+ 03_EVIDENCE_CONTRACT_AND_VERDICT.md §8.2（F3 deterministic kernel·不接受 LLM 裁决）+
 *            F3 模型中立铁律（CI grep gate：src/anti_theater 禁 import openai/dashscope·W3.5 落地）。
 *
 * 攻击语义：verdict.integrityFlags 注入 LLM 标记（如 'llm_produced_summary'）→ 暗示 LLM 参与最终裁决，
 *   违反 F3 deterministic kernel 原则（structured verdict 须由确定性 R0-R9 决策树产出，不被 LLM 覆盖）。
 *
 * structured-kernel-wins（缺口 #10 / F3）：
 *   - AT-JUDGE-OVERRIDE 是 BLOCK 类 attack → blockSeal=true（拒绝 seal）+ forcedVerdict=UNTESTED（fail-closed）。
 *   - llmOverrideRejected 恒 true（deterministic lint 保证：有 override 则 BLOCK 拒绝·无 override vacuously true）。
 *   - prompt injection（integrityFlags 含 llm/judge 子串）不改 kernel 输出——结构化裁决权威，LLM 输出仅展示。
 *
 * 设计裁决：本 gate 在 anti-theater 层断言（检测 + 拒绝 seal）。CI grep gate（src/anti_theater 禁 LLM import）
 *   在 W3.5（anti_theater_deterministic_scan.mjs）落地；本 gate 验证运行时检测逻辑。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 双重断言 / 桩。
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runAntiTheaterLint } from '../../src/anti_theater/lint.ts';
import { getGoldenVector, makeCleanBaseInput } from '../fixtures/anti_theater/golden_vectors.ts';

test('CI gate 5 · AT-JUDGE-OVERRIDE：integrityFlags 注入 LLM 标记 → BLOCK 拒绝 seal + fail-closed UNTESTED', () => {
  // gv-judge-override-01：verdict.integrityFlags 注入 'llm_produced_summary'（含 'llm' 子串）。
  const gv = getGoldenVector('gv-judge-override-01');
  const report = runAntiTheaterLint(gv.build());

  // 1. 命中 AT-JUDGE-OVERRIDE detector（attackKind=llm-reviewer-override）。
  const judgeFinding = report.findings.find((f) => f.attackKind === 'llm-reviewer-override');
  assert.ok(judgeFinding, 'AT-JUDGE-OVERRIDE 须命中（integrityFlags 含 llm/judge 子串）');
  assert.equal(judgeFinding.outcome, 'FAIL');
  assert.equal(judgeFinding.hasFail, true);

  // 2. reasonCode=LLM_AS_FINAL_JUDGE 披露。
  const reasonCodes = report.verdictConstraint?.reasonCodes ?? [];
  assert.ok(reasonCodes.includes('LLM_AS_FINAL_JUDGE'), `reasonCodes 须含 LLM_AS_FINAL_JUDGE, got [${reasonCodes.join(',')}]`);

  // 3. BLOCK 类 attack → blockSeal=true（拒绝 seal·F3 fail-closed）。
  assert.equal(report.verdictConstraint?.blockSeal, true, 'AT-JUDGE-OVERRIDE 须 blockSeal=true（BLOCK·拒绝 seal）');

  // 4. forcedVerdict=UNTESTED（fail-closed·blockSeal 强制至少 UNTESTED·支持度降级 D17）。
  assert.equal(report.verdictConstraint?.forcedVerdict, 'UNTESTED', 'AT-JUDGE-OVERRIDE 须 forced UNTESTED（fail-closed）');

  // 5. canSealConfirmed=false（BLOCK → 不可封 CONFIRMED）。
  assert.equal(report.canSealConfirmed, false, 'AT-JUDGE-OVERRIDE 不可封 CONFIRMED');
});

test('CI gate 5 · llmOverrideRejected 恒 true：LLM 输出不覆盖 structured kernel output', () => {
  // 有 override（gv-judge-override-01）：deterministic lint 拒绝 override（BLOCK）→ rejected=true。
  const overrideReport = runAntiTheaterLint(getGoldenVector('gv-judge-override-01').build());
  assert.equal(overrideReport.llmOverrideRejected, true, '有 LLM override 时须 rejected=true（BLOCK 拒绝）');

  // 无 override（base 干净 envelope）：vacuously true（无 override 可拒绝）。
  const baseReport = runAntiTheaterLint(makeCleanBaseInput());
  assert.equal(baseReport.llmOverrideRejected, true, '无 LLM override 时 vacuously true（structured wins）');

  // prompt injection 不改 kernel 结构化输出：base verdict 仍 CONFIRMED（structured），不受 humanSummary 影响。
  //   （base humanSummary 中性·AT-REPORT-MISMATCH 不触发·verdict 未被 LLM 文案污染。）
  assert.equal(baseReport.findings.length, 0, 'base 无 finding（structured kernel 输出未被 prompt 污染）');
});
