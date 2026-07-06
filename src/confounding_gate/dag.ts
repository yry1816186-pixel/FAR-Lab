/**
 * confounding_gate/dag —— 因果 DAG 构造 + 拓扑（CG-2 acyclic fail-closed）+ 祖先/后代。
 *
 * CG-2（acyclic fail-closed）：buildDag 构造后强制 topologicalSort 验证无环；含环 → throw Error。
 * 源码 `A→B→A` 自环或多节点环均被 Kahn 算法检出（processed < nodeIds.length）。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。纯函数（不 mutate 输入 CausalModel）。
 */

import type { CausalDag, CausalModel } from './types.ts';

// ---------------------------------------------------------------------------
// buildDag —— CausalModel → CausalDag 邻接表示（+ 结构校验 + CG-2 acyclic）
// ---------------------------------------------------------------------------

/**
 * 从 CausalModel 构造 CausalDag 运行时表示。
 *
 * 结构校验（fail-closed）：
 *   - 重复 nodeId → throw。
 *   - 边引用不存在的 nodeId → throw。
 *   - 含环（含自环）→ throw（CG-2·topologicalSort 检出）。
 *
 * 邻接查询（d_separation/backdoor 消费）：
 *   - hasEdge(from, to)：有向边 from → to。
 *   - neighbors(node)：无向邻接（successors ∪ predecessors·sorted·去重）。
 *   - successors(node)：出边终点；predecessors(node)：入边起点。
 */
export function buildDag(model: CausalModel): CausalDag {
  const nodeIds: string[] = [];
  const nodeIdSet = new Set<string>();
  for (const node of model.nodes) {
    if (nodeIdSet.has(node.nodeId)) {
      throw new Error(`buildDag: duplicate nodeId '${node.nodeId}'`);
    }
    nodeIdSet.add(node.nodeId);
    nodeIds.push(node.nodeId);
  }

  // 邻接表：successors（出边）/ predecessors（入边）。每节点初始化空 Set 保证查询不返回 undefined。
  const successors = new Map<string, Set<string>>();
  const predecessors = new Map<string, Set<string>>();
  for (const id of nodeIds) {
    successors.set(id, new Set<string>());
    predecessors.set(id, new Set<string>());
  }

  for (const edge of model.edges) {
    if (!nodeIdSet.has(edge.fromNodeId)) {
      throw new Error(`buildDag: edge.fromNodeId '${edge.fromNodeId}' not in nodes`);
    }
    if (!nodeIdSet.has(edge.toNodeId)) {
      throw new Error(`buildDag: edge.toNodeId '${edge.toNodeId}' not in nodes`);
    }
    successors.get(edge.fromNodeId)!.add(edge.toNodeId);
    predecessors.get(edge.toNodeId)!.add(edge.fromNodeId);
  }

  const dag: CausalDag = {
    nodeIds,
    hasEdge(from, to) {
      return successors.get(from)?.has(to) ?? false;
    },
    neighbors(node) {
      const succSet = successors.get(node) ?? new Set<string>();
      const predSet = predecessors.get(node) ?? new Set<string>();
      const union = new Set<string>([...succSet, ...predSet]);
      return [...union].sort();
    },
    successors(node) {
      return [...(successors.get(node) ?? new Set<string>())].sort();
    },
    predecessors(node) {
      return [...(predecessors.get(node) ?? new Set<string>())].sort();
    },
  };

  // CG-2：构造后立即验证无环（fail-closed·含环 throw）。保证 adjudicateConfounding 消费的 DAG 恒无环。
  assertAcyclic(dag);
  return dag;
}

// ---------------------------------------------------------------------------
// topologicalSort —— Kahn 算法（CG-2 acyclic 验证·环 → throw）
// ---------------------------------------------------------------------------

/**
 * Kahn 拓扑排序。含环（processed < nodeIds.length）→ throw Error（CG-2 fail-closed）。
 *
 * @returns 拓扑序 nodeId 列表（入度 0 优先·同层按 nodeId sorted 稳定序）。
 * @throws {Error} DAG 含环时。
 */
export function topologicalSort(dag: CausalDag): readonly string[] {
  const inDegree = new Map<string, number>();
  for (const id of dag.nodeIds) {
    inDegree.set(id, 0);
  }
  for (const id of dag.nodeIds) {
    for (const succ of dag.successors(id)) {
      inDegree.set(succ, (inDegree.get(succ) ?? 0) + 1);
    }
  }

  // 入度 0 节点入队（sorted 稳定序）。
  const queue: string[] = dag.nodeIds.filter((id) => (inDegree.get(id) ?? 0) === 0).sort();
  const order: string[] = [];

  while (queue.length > 0) {
    // queue.length > 0 保证 shift 非 undefined；! 窄断言配此依据（noUncheckedIndexedAccess）。
    const node = queue.shift()!;
    order.push(node);
    for (const succ of dag.successors(node)) {
      const decremented = (inDegree.get(succ) ?? 0) - 1;
      inDegree.set(succ, decremented);
      if (decremented === 0) {
        // 保持队列 sorted 稳定（新入度 0 节点按 nodeId 插入）。
        queue.push(succ);
        queue.sort();
      }
    }
  }

  if (order.length !== dag.nodeIds.length) {
    throw new Error(
      `topologicalSort: cyclic CausalDag detected (processed ${order.length}/${dag.nodeIds.length} nodes · CG-2 acyclic violated)`,
    );
  }
  return order;
}

/**
 * 断言 DAG 无环（CG-2）。含环 → throw。buildDag 构造时调用；亦供单测/外部校验。
 */
export function assertAcyclic(dag: CausalDag): void {
  topologicalSort(dag); // throws on cycle
}

// ---------------------------------------------------------------------------
// ancestors / descendants —— d_separation collider 后代判定消费
// ---------------------------------------------------------------------------

/** X 的全部祖先（沿 predecessors 反向 BFS·不含 X 自身·sorted）。d_separation Phase1 消费。 */
export function ancestors(dag: CausalDag, node: string): readonly string[] {
  return bfsCollect(dag, node, (id) => dag.predecessors(id));
}

/** X 的全部后代（沿 successors 正向 BFS·不含 X 自身·sorted）。d_separation collider 后代判定消费。 */
export function descendants(dag: CausalDag, node: string): readonly string[] {
  return bfsCollect(dag, node, (id) => dag.successors(id));
}

/** 通用 BFS 收集（沿 nextFn 方向遍历·去重·sorted·不含起点）。 */
function bfsCollect(
  dag: CausalDag,
  start: string,
  nextFn: (id: string) => readonly string[],
): readonly string[] {
  const visited = new Set<string>();
  const queue: string[] = [...nextFn(start)];
  while (queue.length > 0) {
    // queue.length > 0 保证 shift 非 undefined；! 窄断言配此依据。
    const current = queue.shift()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const next of nextFn(current)) {
      if (!visited.has(next)) {
        queue.push(next);
      }
    }
  }
  return [...visited].sort();
}
