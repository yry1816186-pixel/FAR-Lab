// tests/confounding_gate/d_separation.test.ts
// 测试 dSeparation（Koller-Friedman Bayes-Ball reachability）。
//
// Authority: archived-plan §7.5.1 (1)（d_separation 自包含 SSOT）。
//
// ⚠️ 偏差背景（见 d_separation.ts 头注释·决策 B）：03 §7.5.1 (1) 伪代码的 collider 分支语义与
// 标准 d-separation 相反。本实现用 Koller-Friedman 标准算法，正确性以 **canonical DAG 数学定义**
// 为权威（chain/fork/collider 三态 × Z=∅/Z={B}），非伪代码字面。
//
// 数学 ground truth（Pearl/Koller-Friedman）：
//   - chain   A→B→C ：Z=∅ → d-连接；Z={B} → d-分离。
//   - fork    A←B→C ：Z=∅ → d-连接；Z={B} → d-分离。
//   - collider A→B←C：Z=∅ → d-分离；Z={B} → d-连接（collider 在 Z 打开）。
//
// 零容忍合规：无 any / @ts-ignore / 双重断言。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildDag } from '../../src/confounding_gate/dag.ts';
import { dSeparation } from '../../src/confounding_gate/d_separation.ts';
import type { CausalModel } from '../../src/confounding_gate/types.ts';

// ===== 辅助 fixture =====

/** chain A→B→C（B 是中间变量·非 collider）。 */
function chainModel(): CausalModel {
  return {
    nodes: [
      { nodeId: 'A', variableName: 'a', nodeKind: 'observed' },
      { nodeId: 'B', variableName: 'b', nodeKind: 'observed' },
      { nodeId: 'C', variableName: 'c', nodeKind: 'observed' },
    ],
    edges: [
      { fromNodeId: 'A', toNodeId: 'B', edgeKind: 'direct_cause' },
      { fromNodeId: 'B', toNodeId: 'C', edgeKind: 'direct_cause' },
    ],
    controlledConfounders: [],
    unmeasuredConfoundersSuspected: [],
  };
}

/** fork A←B→C（B 是共同原因·非 collider）。 */
function forkModel(): CausalModel {
  return {
    nodes: [
      { nodeId: 'A', variableName: 'a', nodeKind: 'observed' },
      { nodeId: 'B', variableName: 'b', nodeKind: 'observed' },
      { nodeId: 'C', variableName: 'c', nodeKind: 'observed' },
    ],
    edges: [
      { fromNodeId: 'B', toNodeId: 'A', edgeKind: 'direct_cause' },
      { fromNodeId: 'B', toNodeId: 'C', edgeKind: 'direct_cause' },
    ],
    controlledConfounders: [],
    unmeasuredConfoundersSuspected: [],
  };
}

/** collider A→B←C（B 是共同效应·collider）。 */
function colliderModel(): CausalModel {
  return {
    nodes: [
      { nodeId: 'A', variableName: 'a', nodeKind: 'observed' },
      { nodeId: 'B', variableName: 'b', nodeKind: 'observed' },
      { nodeId: 'C', variableName: 'c', nodeKind: 'observed' },
    ],
    edges: [
      { fromNodeId: 'A', toNodeId: 'B', edgeKind: 'direct_cause' },
      { fromNodeId: 'C', toNodeId: 'B', edgeKind: 'direct_cause' },
    ],
    controlledConfounders: [],
    unmeasuredConfoundersSuspected: [],
  };
}

// ===== chain：Z=∅ 连接 / Z={B} 分离 =====

test('dSeparation: chain A→B→C，Z=∅ → d-连接（false）', () => {
  const dag = buildDag(chainModel());
  // B 非 collider·未在 Z → 路径通 → A 与 C d-连接。
  assert.equal(dSeparation(dag, 'A', 'C', []), false);
});

test('dSeparation: chain A→B→C，Z={B} → d-分离（true）', () => {
  const dag = buildDag(chainModel());
  // B 在 Z 阻断 chain。
  assert.equal(dSeparation(dag, 'A', 'C', ['B']), true);
});

// ===== fork：Z=∅ 连接 / Z={B} 分离 =====

test('dSeparation: fork A←B→C，Z=∅ → d-连接（false）', () => {
  const dag = buildDag(forkModel());
  // B 共同原因·非 collider·未在 Z → 路径通。
  assert.equal(dSeparation(dag, 'A', 'C', []), false);
});

test('dSeparation: fork A←B→C，Z={B} → d-分离（true）', () => {
  const dag = buildDag(forkModel());
  // B 在 Z 阻断 fork。
  assert.equal(dSeparation(dag, 'A', 'C', ['B']), true);
});

// ===== collider：Z=∅ 分离 / Z={B} 连接（collider 打开）=====
// 这是 §7.5.1 (1) 伪代码出错的关键 case。标准：collider 未在 Z → 阻断；collider 在 Z → 打开。

test('dSeparation: collider A→B←C，Z=∅ → d-分离（true）·collider 未条件化阻断', () => {
  const dag = buildDag(colliderModel());
  // B 是 collider·未在 Z 且无后代在 Z → 阻断。
  assert.equal(dSeparation(dag, 'A', 'C', []), true);
});

test('dSeparation: collider A→B←C，Z={B} → d-连接（false）·collider 条件化打开', () => {
  const dag = buildDag(colliderModel());
  // B 在 Z → collider 打开 → A 与 C d-连接（伪代码此处会错判阻断·标准算法正确）。
  assert.equal(dSeparation(dag, 'A', 'C', ['B']), false);
});

// ===== collider 后代在 Z（collider 经后代激活）=====

test('dSeparation: collider A→B←C，B 有后代 D，Z={D} → d-连接（collider 后代在 Z 打开）', () => {
  const model: CausalModel = {
    nodes: [
      { nodeId: 'A', variableName: 'a', nodeKind: 'observed' },
      { nodeId: 'B', variableName: 'b', nodeKind: 'observed' },
      { nodeId: 'C', variableName: 'c', nodeKind: 'observed' },
      { nodeId: 'D', variableName: 'd', nodeKind: 'observed' },
    ],
    edges: [
      { fromNodeId: 'A', toNodeId: 'B', edgeKind: 'direct_cause' },
      { fromNodeId: 'C', toNodeId: 'B', edgeKind: 'direct_cause' },
      { fromNodeId: 'B', toNodeId: 'D', edgeKind: 'direct_cause' }, // B 的后代 D
    ],
    controlledConfounders: [],
    unmeasuredConfoundersSuspected: [],
  };
  const dag = buildDag(model);
  // D 在 Z → B（collider）经后代激活 → 打开 → d-连接。
  assert.equal(dSeparation(dag, 'A', 'C', ['D']), false);
  // 对照：D 不在 Z → collider 未激活 → d-分离。
  assert.equal(dSeparation(dag, 'A', 'C', []), true);
});

// ===== 自反性与对称性 =====

test('dSeparation: X 与自身视为 d-连接（false）·reachable 含起点', () => {
  const dag = buildDag(chainModel());
  // X 永远在自身可达集（reachable 含 X，除非 X∈Z·此处 X=A∉Z）→ false（非分离）。
  assert.equal(dSeparation(dag, 'A', 'A', []), false);
});

test('dSeparation: 对称性 dSeparation(A,C,Z)===dSeparation(C,A,Z)', () => {
  const dag = buildDag(chainModel());
  assert.equal(dSeparation(dag, 'A', 'C', ['B']), dSeparation(dag, 'C', 'A', ['B']));
  assert.equal(dSeparation(dag, 'A', 'C', []), dSeparation(dag, 'C', 'A', []));
});

// ===== 多路径复合 DAG：调整集阻断了所有路径才分离 =====

test('dSeparation: 复合 DAG·调整集阻断全部后门路径才分离', () => {
  // X←Z→Y（fork·经 Z）+ X→W←Y（collider·经 W）。X 与 Y 有两条潜在路径。
  //   - 经 Z（fork）：Z 不在条件集 → 通。
  //   - 经 W（collider）：W 不在条件集且无后代在条件集 → 阻断。
  // 故 Z=∅ → 经 Z 连接（false）；Z={Z} → fork 阻断且 collider 仍阻断 → 分离（true）；
  // Z={Z,W} → collider W 也打开 → 经 W 连接（false）。
  const model: CausalModel = {
    nodes: [
      { nodeId: 'X', variableName: 'x', nodeKind: 'observed' },
      { nodeId: 'Y', variableName: 'y', nodeKind: 'observed' },
      { nodeId: 'Z', variableName: 'z', nodeKind: 'observed' },
      { nodeId: 'W', variableName: 'w', nodeKind: 'observed' },
    ],
    edges: [
      { fromNodeId: 'Z', toNodeId: 'X', edgeKind: 'direct_cause' }, // Z→X
      { fromNodeId: 'Z', toNodeId: 'Y', edgeKind: 'direct_cause' }, // Z→Y（fork·Z 共同原因）
      { fromNodeId: 'X', toNodeId: 'W', edgeKind: 'direct_cause' }, // X→W
      { fromNodeId: 'Y', toNodeId: 'W', edgeKind: 'direct_cause' }, // Y→W（collider·W 共同效应）
    ],
    controlledConfounders: [],
    unmeasuredConfoundersSuspected: [],
  };
  const dag = buildDag(model);
  assert.equal(dSeparation(dag, 'X', 'Y', []), false); // 经 Z fork 连接
  assert.equal(dSeparation(dag, 'X', 'Y', ['Z']), true); // fork 阻断·collider 仍阻断 → 分离
  assert.equal(dSeparation(dag, 'X', 'Y', ['Z', 'W']), false); // collider W 打开 → 经 W 连接
});
