// tests/confounding_gate/dag.test.ts
// 测试 buildDag + topologicalSort（CG-2 acyclic fail-closed）+ ancestors/descendants。
//
// Authority: :1133（CG-2 causalDag 必须无环）+ §7.5.1 (1)（d_separation 消费
//            dag.neighbors/has_edge/get_ancestors/get_descendants）。
//
// 零容忍合规：无 any / @ts-ignore / 双重断言。assert.throws 捕获 CG-2 fail-closed。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { ancestors, assertAcyclic, buildDag, descendants, topologicalSort } from '../../src/confounding_gate/dag.ts';
import type { CausalModel } from '../../src/confounding_gate/types.ts';

// ===== 辅助 fixture =====

/** 线性 DAG A→B→C（chain·无环）。 */
function chainModel(): CausalModel {
  return {
    nodes: [
      { nodeId: 'A', variableName: 'a', nodeKind: 'intervention' },
      { nodeId: 'B', variableName: 'b', nodeKind: 'observed' },
      { nodeId: 'C', variableName: 'c', nodeKind: 'outcome' },
    ],
    edges: [
      { fromNodeId: 'A', toNodeId: 'B', edgeKind: 'direct_cause' },
      { fromNodeId: 'B', toNodeId: 'C', edgeKind: 'direct_cause' },
    ],
    controlledConfounders: [],
    unmeasuredConfoundersSuspected: [],
  };
}

// ===== buildDag 邻接查询 =====

test('buildDag: 邻接查询 hasEdge/neighbors/successors/predecessors 正确', () => {
  const dag = buildDag(chainModel());
  assert.equal(dag.hasEdge('A', 'B'), true);
  assert.equal(dag.hasEdge('B', 'A'), false); // 有向：B→A 不存在
  assert.equal(dag.hasEdge('A', 'C'), false);
  // B 的无向邻接 = {A, C}（successors ∪ predecessors）。
  assert.deepEqual([...dag.neighbors('B')], ['A', 'C']);
  assert.deepEqual([...dag.successors('B')], ['C']);
  assert.deepEqual([...dag.predecessors('B')], ['A']);
  assert.deepEqual([...dag.nodeIds], ['A', 'B', 'C']);
});

test('buildDag: neighbors 去重（A→B 且 B→A 双向时无向邻接不重复）', () => {
  const model: CausalModel = {
    nodes: [
      { nodeId: 'A', variableName: 'a', nodeKind: 'observed' },
      { nodeId: 'B', variableName: 'b', nodeKind: 'observed' },
    ],
    edges: [
      { fromNodeId: 'A', toNodeId: 'B', edgeKind: 'direct_cause' },
      { fromNodeId: 'B', toNodeId: 'A', edgeKind: 'direct_cause' }, // 双向 → 环·buildDag 应 throw
    ],
    controlledConfounders: [],
    unmeasuredConfoundersSuspected: [],
  };
  // 双向 A↔B 是环 → CG-2 fail-closed → throw（不测邻接，测 throw）。
  assert.throws(() => buildDag(model), /cyclic|acyclic/i);
});

// ===== CG-2 acyclic fail-closed =====

test('CG-2: 含环 DAG（A→B→C→A）→ buildDag/topologicalSort/assertAcyclic 均 throw', () => {
  const cyclic: CausalModel = {
    nodes: [
      { nodeId: 'A', variableName: 'a', nodeKind: 'observed' },
      { nodeId: 'B', variableName: 'b', nodeKind: 'observed' },
      { nodeId: 'C', variableName: 'c', nodeKind: 'observed' },
    ],
    edges: [
      { fromNodeId: 'A', toNodeId: 'B', edgeKind: 'direct_cause' },
      { fromNodeId: 'B', toNodeId: 'C', edgeKind: 'direct_cause' },
      { fromNodeId: 'C', toNodeId: 'A', edgeKind: 'direct_cause' }, // 闭环
    ],
    controlledConfounders: [],
    unmeasuredConfoundersSuspected: [],
  };
  assert.throws(() => buildDag(cyclic), /cyclic CausalDag/i);
  // topologicalSort / assertAcyclic 直接对环 DAG（绕过 buildDag 校验构造）亦 throw。
  const cyclicDag = {
    nodeIds: ['A', 'B', 'C'],
    hasEdge: (from: string, to: string) =>
      (from === 'A' && to === 'B') || (from === 'B' && to === 'C') || (from === 'C' && to === 'A'),
    neighbors: (n: string) => (n === 'A' ? ['B', 'C'] : n === 'B' ? ['A', 'C'] : ['A', 'B']),
    successors: (n: string) => (n === 'A' ? ['B'] : n === 'B' ? ['C'] : ['A']),
    predecessors: (n: string) => (n === 'A' ? ['C'] : n === 'B' ? ['A'] : ['B']),
  };
  assert.throws(() => topologicalSort(cyclicDag), /cyclic CausalDag/i);
  assert.throws(() => assertAcyclic(cyclicDag), /cyclic CausalDag/i);
});

test('CG-2: 自环（A→A）→ throw', () => {
  const selfLoop: CausalModel = {
    nodes: [{ nodeId: 'A', variableName: 'a', nodeKind: 'observed' }],
    edges: [{ fromNodeId: 'A', toNodeId: 'A', edgeKind: 'direct_cause' }],
    controlledConfounders: [],
    unmeasuredConfoundersSuspected: [],
  };
  assert.throws(() => buildDag(selfLoop), /cyclic CausalDag/i);
});

// ===== 结构校验 =====

test('buildDag: 重复 nodeId → throw', () => {
  const dup: CausalModel = {
    nodes: [
      { nodeId: 'A', variableName: 'a', nodeKind: 'observed' },
      { nodeId: 'A', variableName: 'a2', nodeKind: 'observed' },
    ],
    edges: [],
    controlledConfounders: [],
    unmeasuredConfoundersSuspected: [],
  };
  assert.throws(() => buildDag(dup), /duplicate nodeId 'A'/);
});

test('buildDag: 边引用不存在的 nodeId → throw', () => {
  const dangling: CausalModel = {
    nodes: [{ nodeId: 'A', variableName: 'a', nodeKind: 'observed' }],
    edges: [{ fromNodeId: 'A', toNodeId: 'GHOST', edgeKind: 'direct_cause' }],
    controlledConfounders: [],
    unmeasuredConfoundersSuspected: [],
  };
  assert.throws(() => buildDag(dangling), /'GHOST' not in nodes/);
});

// ===== topologicalSort 顺序 =====

test('topologicalSort: 线性 A→B→C → [A, B, C]', () => {
  const dag = buildDag(chainModel());
  assert.deepEqual([...topologicalSort(dag)], ['A', 'B', 'C']);
});

test('topologicalSort: 分叉 A→B, A→C → A 首，B/C 随后（入度 0 优先）', () => {
  const model: CausalModel = {
    nodes: [
      { nodeId: 'A', variableName: 'a', nodeKind: 'intervention' },
      { nodeId: 'B', variableName: 'b', nodeKind: 'outcome' },
      { nodeId: 'C', variableName: 'c', nodeKind: 'outcome' },
    ],
    edges: [
      { fromNodeId: 'A', toNodeId: 'B', edgeKind: 'direct_cause' },
      { fromNodeId: 'A', toNodeId: 'C', edgeKind: 'direct_cause' },
    ],
    controlledConfounders: [],
    unmeasuredConfoundersSuspected: [],
  };
  const order = [...topologicalSort(buildDag(model))];
  assert.equal(order[0], 'A');
  assert.deepEqual([...order.slice(1)].sort(), ['B', 'C']);
});

// ===== ancestors / descendants =====

test('ancestors: chain A→B→C，ancestors(C) = [A, B]，ancestors(A) = []', () => {
  const dag = buildDag(chainModel());
  assert.deepEqual([...ancestors(dag, 'C')], ['A', 'B']);
  assert.deepEqual([...ancestors(dag, 'A')], []);
});

test('descendants: chain A→B→C，descendants(A) = [B, C]，descendants(C) = []', () => {
  const dag = buildDag(chainModel());
  assert.deepEqual([...descendants(dag, 'A')], ['B', 'C']);
  assert.deepEqual([...descendants(dag, 'C')], []);
});
