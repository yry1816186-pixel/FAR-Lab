/**
 * confounding_gate/d_separation —— d-separation（Bayes-Ball reachability）。
 *
 * Authority: PROJECT_PLAN/03 §7.5.1 (1)（d_separation 自包含 SSOT）。
 *
 * ⚠️ SSOT 偏差声明（决策 B·铁律：修根因不修症状 + 反幻觉）：
 *   03 §7.5.1 (1) 伪代码的 collider 分支语义与标准 d-separation **相反**：
 *     - 伪代码：「collider 及其后代均不在 Z → 路径通（pass·不阻断）；否则阻断」。
 *     - 标准（Koller-Friedman）：collider **未在 Z 且其后代未在 Z → 阻断**；collider 或后代在 Z → 打开。
 *   反例验证：collider `A→B←C`，Z={B}。标准 = d-连接（B 在 Z 打开 collider）；伪代码 = 阻断。
 *   本运行时实现 **Koller-Friedman 标准算法**（Probabilistic Graphical Models·Algorithm 3.1），
 *   经 canonical DAG 单测（tests/confounding_gate/d_separation.test.ts·chain/fork/collider）验证正确。
 *   伪代码仅作来源溯源；正确性以数学定义 + canonical 单测为权威。
 *
 * 契约：dSeparation(dag, X, Y, Z) → true=d-分离（独立）/ false=d-连接（可能依赖）。
 *   Z = 调整集（对应 CausalModel.controlledConfounders，blockBackdoorPaths 传入）。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。纯函数。
 */

import { ancestors } from './dag.ts';
import type { CausalDag } from './types.ts';

type TraversalDir = 'up' | 'down';

/**
 * 判定 X 与 Y 在给定调整集 Z 条件下是否 d-分离。
 *
 * 实现 Koller-Friedman Bayes-Ball reachability（PGM Algorithm 3.1）：
 *   - Phase I：A = Z ∪ ancestors(Z)（在 Z 中或有后代在 Z 的节点集·collider 激活判定用）。
 *   - Phase II：从 X 沿「活跃迹」BFS（节点, 方向）。
 *     * dir='up'（迹向上穿过 node）：node∉Z 时可向上（父）+ 向下（子）。
 *     * dir='down'（迹向下穿过 node）：node∉Z 时可向下（子）；node∈A（collider 激活）时可向上（父）。
 *   - X⊥Y|Z ⟺ Y 不在 X 的可达集 R 中。
 *
 * @returns true = d-分离（独立）/ false = d-连接（可能依赖）。
 */
export function dSeparation(dag: CausalDag, x: string, y: string, z: readonly string[]): boolean {
  const zSet = new Set<string>(z);

  // Phase I：A = Z ∪ ancestors(Z)。ancestors(z) 含 z 的全部祖先（不含 z 自身·dag.ts bfsCollect 语义）。
  const activated = new Set<string>(z);
  for (const ze of z) {
    for (const anc of ancestors(dag, ze)) {
      activated.add(anc);
    }
  }

  // Phase II：从 X 沿活跃迹 BFS（节点, 方向）。
  const visited = new Set<string>();
  const reachable = new Set<string>();
  const queue: Array<readonly [node: string, dir: TraversalDir]> = [[x, 'up']];

  while (queue.length > 0) {
    // queue.length > 0 保证 shift 非 undefined；! 窄断言配此依据（noUncheckedIndexedAccess）。
    const [node, dir] = queue.shift()!;
    const key = `${node}|${dir}`;
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);
    if (!zSet.has(node)) {
      reachable.add(node);
    }

    if (dir === 'up' && !zSet.has(node)) {
      // 迹向上穿过 node（node 非条件）→ 可向上（父）+ 向下（子）。
      for (const parent of dag.predecessors(node)) {
        queue.push([parent, 'up']);
      }
      for (const child of dag.successors(node)) {
        queue.push([child, 'down']);
      }
    } else if (dir === 'down') {
      // 迹向下穿过 node。
      if (!zSet.has(node)) {
        // node 非条件 → 可继续向下（子·chain/fork 非阻断）。
        for (const child of dag.successors(node)) {
          queue.push([child, 'down']);
        }
      }
      if (activated.has(node)) {
        // collider 激活（node 或其后代在 Z）→ 可向上（父·collider 打开）。
        for (const parent of dag.predecessors(node)) {
          queue.push([parent, 'up']);
        }
      }
    }
  }

  // X⊥Y|Z ⟺ Y 不可达。
  return !reachable.has(y);
}
