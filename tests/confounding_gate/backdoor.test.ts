// tests/confounding_gate/backdoor.test.ts
// 测试 findBackdoorPaths（§7.5.1 (2) DFS 枚举）+ isPathBlocked（路径级 d-separation 阻断）+ blockBackdoorPaths。
//
// Authority: PROJECT_PLAN/03 §7.5.1:1044-1091。
//
// ⚠️ 偏差背景（见 backdoor.ts 头注释）：SSOT `block_backdoor_paths` 伪代码对每路径调全局 d_separation
// （恒参 no-op）。本实现用路径级 isPathBlocked（标准定义）。outcome 等价·分桶更精确。
//
// 零容忍合规：无 any / @ts-ignore / 双重断言。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildDag } from '../../src/confounding_gate/dag.ts';
import {
  blockBackdoorPaths,
  findBackdoorPaths,
  isPathBlocked,
} from '../../src/confounding_gate/backdoor.ts';
import type { CausalModel } from '../../src/confounding_gate/types.ts';

// ===== 辅助 fixture =====

/** chain A→B→C（exposure A 无父节点·无后门路径）。 */
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

/** fork B→A, B→C（B 共同原因·exposure A 的父节点）。 */
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

/** collider A→B←C（exposure A 无父节点·collider 结构）。 */
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

// ===== findBackdoorPaths 枚举 =====

test('findBackdoorPaths: chain A→B→C，exposure=A outcome=C → []（仅因果路径·无后门）', () => {
  const dag = buildDag(chainModel());
  // A 仅 A→B 正向·start 时跳过 → 无后门路径。
  assert.deepEqual(findBackdoorPaths(dag, 'A', 'C'), []);
});

test('findBackdoorPaths: fork（B→A,B→C），exposure=A outcome=C → [[A,B,C]]（经共同原因 B）', () => {
  const dag = buildDag(forkModel());
  const paths = findBackdoorPaths(dag, 'A', 'C');
  assert.equal(paths.length, 1);
  assert.deepEqual([...paths[0]!], ['A', 'B', 'C']);
});

test('findBackdoorPaths: collider A→B←C，exposure=A outcome=C → []（A 无父节点·无后门起点）', () => {
  const dag = buildDag(colliderModel());
  // A 无入边·无法以「指向 A 的边」开始 → 无后门路径。
  assert.deepEqual(findBackdoorPaths(dag, 'A', 'C'), []);
});

test('findBackdoorPaths: 多后门路径（hero-B 缩影）cp←{td,pk}→hr → 两条后门路径', () => {
  const model: CausalModel = {
    nodes: [
      { nodeId: 'cp', variableName: 'cot', nodeKind: 'intervention' },
      { nodeId: 'hr', variableName: 'hallucination', nodeKind: 'outcome' },
      { nodeId: 'td', variableName: 'task_difficulty', nodeKind: 'observed' },
      { nodeId: 'pk', variableName: 'prior_knowledge', nodeKind: 'latent' },
    ],
    edges: [
      { fromNodeId: 'cp', toNodeId: 'hr', edgeKind: 'direct_cause' },
      { fromNodeId: 'td', toNodeId: 'cp', edgeKind: 'direct_cause' },
      { fromNodeId: 'td', toNodeId: 'hr', edgeKind: 'direct_cause' },
      { fromNodeId: 'pk', toNodeId: 'cp', edgeKind: 'direct_cause' },
      { fromNodeId: 'pk', toNodeId: 'hr', edgeKind: 'direct_cause' },
    ],
    controlledConfounders: [],
    unmeasuredConfoundersSuspected: [],
  };
  const dag = buildDag(model);
  const paths = findBackdoorPaths(dag, 'cp', 'hr');
  assert.equal(paths.length, 2);
  // 每条路径首=cp 尾=hr·中间为 td 或 pk。
  const middles = paths.map((p) => p[1]).sort();
  assert.deepEqual(middles, ['pk', 'td']);
});

// ===== isPathBlocked 路径级阻断 =====

test('isPathBlocked: fork 路径 [A,B,C]，Z=[] → 未阻断；Z=[B] → 阻断（B 非 collider 在 Z）', () => {
  const dag = buildDag(forkModel());
  const path = ['A', 'B', 'C'] as const;
  assert.equal(isPathBlocked(dag, path, []), false); // B 非 collider·不在 Z → 活跃
  assert.equal(isPathBlocked(dag, path, ['B']), true); // B ∈ Z → 阻断
});

test('isPathBlocked: collider 路径 [A,B,C]（A→B←C），Z=[] → 阻断；Z=[B] → 未阻断（collider 激活）', () => {
  const dag = buildDag(colliderModel());
  const path = ['A', 'B', 'C'] as const; // B 是 collider（A→B 且 C→B）
  assert.equal(isPathBlocked(dag, path, []), true); // collider 未激活（B 及后代不在 Z）→ 阻断
  assert.equal(isPathBlocked(dag, path, ['B']), false); // B ∈ Z → collider 激活 → 未阻断
});

test('isPathBlocked: collider 后代在 Z 亦激活·Z=[D]（B→D）→ 未阻断', () => {
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
      { fromNodeId: 'B', toNodeId: 'D', edgeKind: 'direct_cause' },
    ],
    controlledConfounders: [],
    unmeasuredConfoundersSuspected: [],
  };
  const dag = buildDag(model);
  const path = ['A', 'B', 'C'] as const;
  // D 是 B 的后代·D ∈ Z → collider B 经后代激活 → 未阻断。
  assert.equal(isPathBlocked(dag, path, ['D']), false);
});

test('isPathBlocked: 直连边 [A,B]（无中间节点）→ 未阻断（false）', () => {
  const dag = buildDag(chainModel());
  // 直连 exposure→outcome 无中间节点·不阻断（首尾不参与判定）。
  assert.equal(isPathBlocked(dag, ['A', 'B'] as const, ['A', 'B']), false);
});

// ===== blockBackdoorPaths 分桶 =====

test('blockBackdoorPaths: fork·Z=[B] → blocked=[[A,B,C]]·unblocked=[]', () => {
  const dag = buildDag(forkModel());
  const model: CausalModel = { ...forkModel(), controlledConfounders: ['B'] };
  const { blocked, unblocked } = blockBackdoorPaths(dag, 'A', 'C', model);
  assert.equal(blocked.length, 1);
  assert.deepEqual([...blocked[0]!], ['A', 'B', 'C']);
  assert.equal(unblocked.length, 0);
});

test('blockBackdoorPaths: fork·Z=[] → blocked=[]·unblocked=[[A,B,C]]', () => {
  const dag = buildDag(forkModel());
  const { blocked, unblocked } = blockBackdoorPaths(dag, 'A', 'C', forkModel());
  assert.equal(blocked.length, 0);
  assert.equal(unblocked.length, 1);
  assert.deepEqual([...unblocked[0]!], ['A', 'B', 'C']);
});
