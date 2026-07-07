// tests/confounding_gate/adjudicate.test.ts
// 测试 adjudicateConfounding（§7.5.1 (3) 三值 outcome）+ confoundingOutcomeVerdictEffect（§7.5:955-961 共享映射）。
//
// Authority: FAR_LAB_MASTER_PLAN/03 §7.5.1:1093-1129 + §7.5:949-961。
//
// 零容忍合规：无 any / @ts-ignore / 双重断言。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { adjudicateConfounding, confoundingOutcomeVerdictEffect } from '../../src/confounding_gate/adjudicate.ts';
import type { CausalModel, EvidenceBasis } from '../../src/confounding_gate/types.ts';

// ===== 辅助 fixture =====

/** PASS：chain E→M→O，exposure E 无父节点·无后门路径。 */
function passModel(): CausalModel {
  return {
    nodes: [
      { nodeId: 'E', variableName: 'exposure', nodeKind: 'intervention' },
      { nodeId: 'M', variableName: 'mediator', nodeKind: 'observed' },
      { nodeId: 'O', variableName: 'outcome', nodeKind: 'outcome' },
    ],
    edges: [
      { fromNodeId: 'E', toNodeId: 'M', edgeKind: 'direct_cause' },
      { fromNodeId: 'M', toNodeId: 'O', edgeKind: 'direct_cause' },
    ],
    controlledConfounders: [],
    unmeasuredConfoundersSuspected: [],
  };
}

/** WARN：fork C→E, C→O（C 已测·observed），Z=[] 未阻断但 unmeasuredConfoundersSuspected=[]。 */
function warnModel(): CausalModel {
  return {
    nodes: [
      { nodeId: 'E', variableName: 'exposure', nodeKind: 'intervention' },
      { nodeId: 'O', variableName: 'outcome', nodeKind: 'outcome' },
      { nodeId: 'C', variableName: 'confounder', nodeKind: 'observed' },
    ],
    edges: [
      { fromNodeId: 'C', toNodeId: 'E', edgeKind: 'direct_cause' },
      { fromNodeId: 'C', toNodeId: 'O', edgeKind: 'direct_cause' },
    ],
    controlledConfounders: [], // 未调整·后门路径 [E,C,O] 未阻断
    unmeasuredConfoundersSuspected: [], // 但无怀疑未测混淆子
  };
}

/** FAIL：fork L→E, L→O，L latent（unmeasuredConfoundersSuspected=[L]），Z=[] 未阻断。 */
function failModel(): CausalModel {
  return {
    nodes: [
      { nodeId: 'E', variableName: 'exposure', nodeKind: 'intervention' },
      { nodeId: 'O', variableName: 'outcome', nodeKind: 'outcome' },
      { nodeId: 'L', variableName: 'latent_confounder', nodeKind: 'latent' },
    ],
    edges: [
      { fromNodeId: 'L', toNodeId: 'E', edgeKind: 'direct_cause' },
      { fromNodeId: 'L', toNodeId: 'O', edgeKind: 'direct_cause' },
    ],
    controlledConfounders: [],
    unmeasuredConfoundersSuspected: ['L'],
  };
}

/** hero-B 完整 fixture DAG（决策 G·CoT 幻觉率因果声称）。 */
function heroBModel(): CausalModel {
  return {
    nodes: [
      { nodeId: 'cot_prompting', variableName: 'cot', nodeKind: 'intervention' },
      { nodeId: 'hallucination_rate', variableName: 'hallucination', nodeKind: 'outcome' },
      { nodeId: 'task_difficulty', variableName: 'difficulty', nodeKind: 'observed' },
      { nodeId: 'prior_knowledge', variableName: 'prior', nodeKind: 'latent' },
    ],
    edges: [
      { fromNodeId: 'cot_prompting', toNodeId: 'hallucination_rate', edgeKind: 'direct_cause' },
      { fromNodeId: 'task_difficulty', toNodeId: 'cot_prompting', edgeKind: 'direct_cause' },
      { fromNodeId: 'task_difficulty', toNodeId: 'hallucination_rate', edgeKind: 'direct_cause' },
      { fromNodeId: 'prior_knowledge', toNodeId: 'cot_prompting', edgeKind: 'direct_cause' },
      { fromNodeId: 'prior_knowledge', toNodeId: 'hallucination_rate', edgeKind: 'direct_cause' },
    ],
    controlledConfounders: ['task_difficulty'], // 调整集 Z·阻断 task_difficulty 后门路径
    unmeasuredConfoundersSuspected: ['prior_knowledge'], // latent·未测·未阻断
  };
}

// ===== adjudicateConfounding 三值 outcome =====

test('adjudicateConfounding: PASS（chain·无后门路径）', () => {
  const r = adjudicateConfounding(passModel(), 'E', 'O');
  assert.equal(r.outcome, 'PASS');
  assert.equal(r.unblockedConfounders.length, 0);
  assert.equal(r.blockedConfounders.length, 0);
  assert.equal(r.unmeasuredConfounders.length, 0);
  assert.equal(r.backdoorPaths.length, 0);
  assert.equal(r.blockedPaths.length, 0);
  assert.equal(r.unblockedPaths.length, 0);
  assert.ok(r.rationale.includes('PASS'), 'rationale 应含 outcome=PASS');
});

test('adjudicateConfounding: WARN（fork·未阻断但无怀疑未测混淆子）', () => {
  const r = adjudicateConfounding(warnModel(), 'E', 'O');
  assert.equal(r.outcome, 'WARN');
  // 后门路径 [E,C,O] 未阻断·C 是未阻断混淆子。
  assert.deepEqual([...r.unblockedConfounders], ['C']);
  assert.equal(r.blockedConfounders.length, 0);
  assert.equal(r.unblockedPaths.length, 1);
  assert.ok(r.rationale.includes('WARN'));
});

test('adjudicateConfounding: FAIL（fork·latent 未测混淆子）', () => {
  const r = adjudicateConfounding(failModel(), 'E', 'O');
  assert.equal(r.outcome, 'FAIL');
  assert.deepEqual([...r.unblockedConfounders], ['L']);
  assert.deepEqual([...r.unmeasuredConfounders], ['L']);
  assert.ok(r.rationale.includes('FAIL'));
});

test('adjudicateConfounding: hero-B → FAIL + 正确字段归属（task_difficulty 阻断·prior_knowledge 未阻断）', () => {
  const r = adjudicateConfounding(heroBModel(), 'cot_prompting', 'hallucination_rate');
  assert.equal(r.outcome, 'FAIL');
  // 两条后门路径·各经 task_difficulty / prior_knowledge。
  assert.equal(r.backdoorPaths.length, 2);
  // task_difficulty ∈ Z → 其路径阻断 → blockedConfounders；prior_knowledge ∉ Z → 未阻断。
  assert.deepEqual([...r.blockedConfounders], ['task_difficulty']);
  assert.deepEqual([...r.unblockedConfounders], ['prior_knowledge']);
  assert.deepEqual([...r.unmeasuredConfounders], ['prior_knowledge']);
  assert.equal(r.blockedPaths.length, 1);
  assert.equal(r.unblockedPaths.length, 1);
  // backdoorPaths = blocked ∪ unblocked。
  assert.equal(r.backdoorPaths.length, r.blockedPaths.length + r.unblockedPaths.length);
});

test('adjudicateConfounding: CG-2 fail-closed·含环 CausalModel → throw', () => {
  const cyclic: CausalModel = {
    nodes: [
      { nodeId: 'A', variableName: 'a', nodeKind: 'observed' },
      { nodeId: 'B', variableName: 'b', nodeKind: 'observed' },
    ],
    edges: [
      { fromNodeId: 'A', toNodeId: 'B', edgeKind: 'direct_cause' },
      { fromNodeId: 'B', toNodeId: 'A', edgeKind: 'direct_cause' }, // 环
    ],
    controlledConfounders: [],
    unmeasuredConfoundersSuspected: [],
  };
  assert.throws(() => adjudicateConfounding(cyclic, 'A', 'B'), /cyclic CausalDag/i);
});

// ===== confoundingOutcomeVerdictEffect（§7.5:955-961 共享映射·决策 D）=====

test('confoundingOutcomeVerdictEffect: PASS → none / []（baseWouldConfirm 不影响）', () => {
  assert.deepEqual(confoundingOutcomeVerdictEffect('PASS', 'interventional', true), {
    verdictEffect: 'none',
    reasonCodes: [],
  });
  assert.deepEqual(confoundingOutcomeVerdictEffect('PASS', 'observational_only', false), {
    verdictEffect: 'none',
    reasonCodes: [],
  });
});

test('confoundingOutcomeVerdictEffect: WARN + wouldConfirm → downgrade_to_inconclusive', () => {
  const r = confoundingOutcomeVerdictEffect('WARN', 'observational_only', true);
  assert.equal(r.verdictEffect, 'downgrade_to_inconclusive');
  assert.deepEqual([...r.reasonCodes], ['R_CAUSAL_CONFOUNDING_WARN']);
});

test('confoundingOutcomeVerdictEffect: WARN + !wouldConfirm → none（本就不会 CONFIRMED）', () => {
  const r = confoundingOutcomeVerdictEffect('WARN', 'interventional', false);
  assert.equal(r.verdictEffect, 'none');
  assert.deepEqual([...r.reasonCodes], []);
});

test('confoundingOutcomeVerdictEffect: FAIL + observational_only → degrade + F6_CAUSAL_HONESTY', () => {
  const r = confoundingOutcomeVerdictEffect('FAIL', 'observational_only' as EvidenceBasis, true);
  assert.equal(r.verdictEffect, 'degrade_to_degraded_scope');
  assert.deepEqual([...r.reasonCodes], ['R_CAUSAL_CONFOUNDING_FAIL', 'F6_CAUSAL_HONESTY']);
});

test('confoundingOutcomeVerdictEffect: FAIL + interventional → degrade（无 F6_CAUSAL_HONESTY）', () => {
  const r = confoundingOutcomeVerdictEffect('FAIL', 'interventional', true);
  assert.equal(r.verdictEffect, 'degrade_to_degraded_scope');
  assert.deepEqual([...r.reasonCodes], ['R_CAUSAL_CONFOUNDING_FAIL']);
});

test('confoundingOutcomeVerdictEffect: FAIL + evidenceBasis=undefined → degrade（无 F6_CAUSAL_HONESTY）', () => {
  // exactOptionalPropertyTypes：undefined 缺省·非 interventional → 不追加 F6_CAUSAL_HONESTY。
  const r = confoundingOutcomeVerdictEffect('FAIL', undefined, false);
  assert.equal(r.verdictEffect, 'degrade_to_degraded_scope');
  assert.deepEqual([...r.reasonCodes], ['R_CAUSAL_CONFOUNDING_FAIL']);
});

test('confoundingOutcomeVerdictEffect: FAIL 无论 baseWouldConfirm 均 degrade（F2 优先级最高）', () => {
  const r1 = confoundingOutcomeVerdictEffect('FAIL', 'interventional', true);
  const r2 = confoundingOutcomeVerdictEffect('FAIL', 'interventional', false);
  assert.equal(r1.verdictEffect, 'degrade_to_degraded_scope');
  assert.equal(r2.verdictEffect, 'degrade_to_degraded_scope');
});
