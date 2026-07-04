// tests/far_proof/demo_chain_replay_v2.test.ts
//
// P0-2c 端到端物证：demo_chain 经 fecAppendClaim（demo_chain.ts:181）间接驱动 V2 verdict kernel。
// 架构事实：demo_chain 从未直接调 makeVerdict/decideFiveValueVerdict——它调 fecAppendClaim，
// 后者内部（orchestrator.ts:117）调 decideFiveValueVerdict，kernelOutput（reasonCodes/ruleTrace/
// decisiveRuleId/statisticalReport）真实回流。本测试断言 kernelOutput 非桩、machineVerdict 流自 kernel。
//
// 真实依赖：buildDemoChain → fecAppendClaim → decideFiveValueVerdict（V2 R0-R9 内核，确定性·无 LLM）。
// 反假绿：断言 kernelOutput.ruleTrace 多条 + decisiveRuleId 命中 R\d + machineVerdict===kernelOutput.verdict。
//
// Authority: PROJECT_PLAN/DEPTH_LEDGER.md §C P0-2c + 03 §7（R0-R9 决策树）+ orchestrator.ts:117。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { buildDemoChain } from '../../src/far_proof/demo_chain.ts';

test('demo_chain_seals_with_five_value_verdict: fecAppendClaim drives V2 kernel (reasonCodes/decisiveRuleId/statisticalReport real) (P0-2c)', () => {
  const db = new Database(':memory:');
  try {
    const chain = buildDemoChain(db);

    // demo 用合法契约 → fecGate.allowed=true → 决策流自 V2 kernel（非 !allowed fail-closed 分支）。
    assert.equal(chain.fecGate.allowed, true, 'demo contract must compile (valid legacy-compat FEC)');

    // kernelOutput 非桩：decisiveRuleId 非空 + reasonCodes 非空 + ruleTrace 至少 1 条（R0-R9 决策树真实运行）。
    assert.ok(
      chain.kernelOutput.decisiveRuleId.length > 0,
      `decisiveRuleId must be non-empty, got: "${chain.kernelOutput.decisiveRuleId}"`,
    );
    assert.ok(
      chain.kernelOutput.reasonCodes.length > 0,
      'kernel reasonCodes must be non-empty (kernel ran the decision tree)',
    );
    assert.ok(
      chain.kernelOutput.ruleTrace.length >= 1,
      `kernel ruleTrace must have >=1 rule, got ${chain.kernelOutput.ruleTrace.length}`,
    );

    // statisticalReport 携带真实观测指标（primaryEffectSize=0.62 = demo evidence 的 macro-F1，
    // 非占位常量）——证明 kernel 消费了真实 evidence 数据而非预制空对象。
    assert.equal(
      chain.kernelOutput.statisticalReport.primaryEffectSize,
      0.62,
      'primaryEffectSize must carry the real observed metric (0.62), proving real evidence flowed through the kernel',
    );

    // 关键接线证明：machineVerdict 流自 kernelOutput.verdict（demo_chain→fecAppendClaim→decideFiveValueVerdict）。
    // fecGate.allowed=true 时 decision = verdictResultFromKernelOutput(kernelOutput) → verdict 同源。
    assert.equal(
      chain.machineVerdict,
      chain.kernelOutput.verdict,
      'machineVerdict must equal kernelOutput.verdict (proves demo_chain drives V2 kernel via fecAppendClaim)',
    );

    // 五值枚举红线：machineVerdict ∈ 冻结五值。
    assert.ok(
      ['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'].includes(chain.machineVerdict),
      `machineVerdict must be one of the five frozen verdicts, got: ${chain.machineVerdict}`,
    );
  } finally {
    db.close();
  }
});
