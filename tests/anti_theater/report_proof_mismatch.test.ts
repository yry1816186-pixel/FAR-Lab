/**
 * report_proof_mismatch —— CI gate 4（APPENDIX_E §6）：自然语言 verdict 与 structured verdict 不一致检测。
 *
 * Authority: archived-plan §2（AT-REPORT-MISMATCH 伪代码·natural_language_verdict_mismatch）+
 *            §6（CI gate 4）+ 04_PROOF_ENVELOPE_AND_VERIFIER.md §2（humanSummary 不进 proofHash·AT-REPORT-MISMATCH
 *            检查其与 structured verdict 强度一致）。
 *
 * 攻击语义：envelope 的 humanSummary（LLM 可生成·人类可读）使用与 structured verdict 不匹配的强度词
 *   （如 verdict=UNTESTED 但 humanSummary 写"confirms the hypothesis"）→ 误导读者以为 claim 成立。
 *
 * structured-wins 原则（D16 / 缺口 #10）：
 *   - AT-REPORT-MISMATCH **不强制降级 verdict**（forcedVerdict=undefined）—— structured verdict 是权威，
 *     humanSummary 仅展示。verdict 已是 UNTESTED（honest），不应因报告文案错误再降级。
 *   - 但 mismatch 须被**浮现**：finding 进 antiTheaterReport.hasFail=true（RULE-PE-007 兜底）+
 *     reasonCode=REPORT_VERDICT_MISMATCH 披露 + llmOverrideRejected=true（structured 拒绝被 humanSummary 覆盖）。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 双重断言 / 桩。
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runAntiTheaterLint } from '../../src/anti_theater/lint.ts';
import { getGoldenVector, makeCleanBaseInput } from '../fixtures/anti_theater/golden_vectors.ts';

test('CI gate 4 · AT-REPORT-MISMATCH：humanSummary overclaim 被检出，structured verdict wins', () => {
  // gv-report-mismatch-01：verdict=UNTESTED，humanSummary 含 'confirms'（CONFIRMED 强度词·不在 UNTESTED 允许集）。
  const gv = getGoldenVector('gv-report-mismatch-01');
  const report = runAntiTheaterLint(gv.build());

  // 1. 命中 AT-REPORT-MISMATCH detector（attackKind=natural-language-verdict-mismatch）。
  const mismatchFinding = report.findings.find((f) => f.attackKind === 'natural-language-verdict-mismatch');
  assert.ok(mismatchFinding, 'AT-REPORT-MISMATCH 须命中（humanSummary 含 verdict 不匹配的强度词）');
  assert.equal(mismatchFinding.outcome, 'FAIL');
  assert.equal(mismatchFinding.hasFail, true);

  // 2. reasonCode=REPORT_VERDICT_MISMATCH 披露（透明）。
  const reasonCodes = report.verdictConstraint?.reasonCodes ?? [];
  assert.ok(reasonCodes.includes('REPORT_VERDICT_MISMATCH'), `reasonCodes 须含 REPORT_VERDICT_MISMATCH, got [${reasonCodes.join(',')}]`);

  // 3. structured wins：不强制降级 verdict（forcedVerdict=undefined·verdict 已是 UNTESTED·honest）。
  assert.equal(report.verdictConstraint?.forcedVerdict, undefined, 'AT-REPORT-MISMATCH 不 force verdict（structured wins·不降级）');

  // 4. llmOverrideRejected=true（deterministic kernel 拒绝 humanSummary 覆盖 structured verdict·缺口 #10）。
  assert.equal(report.llmOverrideRejected, true, 'llmOverrideRejected 须恒 true（structured verdict wins）');

  // 5. hasFail=true（RULE-PE-007 信号源·validator 兜底拒绝 clean CONFIRMED 封印）。
  assert.equal(report.hasFail, true, 'mismatch 须 hasFail=true（透明浮现·validator 兜底）');
});

test('CI gate 4 · 干净 envelope 的 humanSummary 不误报 AT-REPORT-MISMATCH（中性文案·无误报）', () => {
  // base humanSummary 是中性文案（无强度词/overclaim 词）→ AT-REPORT-MISMATCH 不命中（误报率=0）。
  const baseReport = runAntiTheaterLint(makeCleanBaseInput());
  const mismatch = baseReport.findings.find((f) => f.attackKind === 'natural-language-verdict-mismatch');
  assert.equal(mismatch, undefined, 'base 中性 humanSummary 不应触发 AT-REPORT-MISMATCH（误报率=0）');
});
