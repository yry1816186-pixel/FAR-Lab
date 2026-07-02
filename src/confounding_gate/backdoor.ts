/**
 * confounding_gate/backdoor —— 后门路径枚举 + 阻断判定（§7.5.1 (2)）。
 *
 * Authority: PROJECT_PLAN/03 §7.5.1:1044-1091（find_backdoor_paths / block_backdoor_paths 自包含 SSOT）。
 *
 * ⚠️ SSOT 偏差声明（铁律：修根因不修症状 + 反幻觉）：
 *   03 §7.5.1 (2) `block_backdoor_paths` 伪代码对每条后门路径调用
 *   `d_separation(dag, exposure, outcome, Z)`——但 exposure/outcome/Z 三参在循环中**恒定**，
 *   故该调用是「全局 d-分离」的 N 次重复（no-op·all-or-nothing 分桶），并非路径级阻断判定。
 *   这与该函数的字段语义（blockedPaths/unblockedPaths/blockedConfounders/unblockedConfounders 须路径级归属）
 *   及 outcome 表口径矛盾。
 *
 *   本运行时实现 **路径级 d-separation 阻断**（Pearl/Koller-Friedman 标准定义）：
 *     路径 P 在给定 Z 下「阻断」⟺ 存在某个中间节点 v 阻断：
 *       - v 是 P 上的 collider（n_{i-1}→v←n_{i+1}）且 v 与其后代**均不在** Z → 阻断；
 *       - v 是 P 上的非 collider（chain n_{i-1}→v→n_{i+1} 或 fork n_{i-1}←v→n_{i+1}）且 v ∈ Z → 阻断。
 *     路径「活跃」（未阻断）⟺ 所有中间节点均活跃。
 *
 *   等价性（保证 outcome 不变）：X⊥Y|Z ⟺ 所有 X-Y 路径均阻断（d-separation 的定义）。
 *   故「全部路径阻断 ⟺ unblocked 为空 ⟺ PASS」与 SSOT 全局判定一致；
 *   本实现额外给出**正确的路径级分桶**（blockedPaths 真正只含被阻断路径）。
 *
 * 契约：
 *   - findBackdoorPaths(dag, exposure, outcome) → 后门路径列表（每条 = nodeId 序列·含首尾 exposure/outcome）。
 *   - isPathBlocked(dag, path, z) → 单条路径是否被 Z 阻断（标准定义·供 blockBackdoorPaths 与单测）。
 *   - blockBackdoorPaths(dag, exposure, outcome, causalModel) → { blocked, unblocked }（Z=controlledConfounders）。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。纯函数（不 mutate 输入）。
 */

import { descendants } from './dag.ts';
import type { BackdoorPath, CausalDag, CausalModel } from './types.ts';

// ---------------------------------------------------------------------------
// findBackdoorPaths —— §7.5.1 (2) DFS 枚举（以「指向 exposure 的边」开始·非因果路径）
// ---------------------------------------------------------------------------

/**
 * 枚举所有 exposure → outcome 的后门路径（以指向 exposure 的边开始·跳过 exposure→ 因果路径）。
 *
 * 忠实 §7.5.1:1056-1073 DFS：started_backward 标志首次走 edge_backward（neighbor→current）后置 True；
 * exposure 处 edge_forward（exposure→neighbor）在未 started_backward 时跳过（避免因果路径）。
 * 到达 outcome 且 started_backward → 记录路径。
 *
 * @returns 后门路径列表（每条 = [exposure, ..., outcome]·nodeId 序列·含首尾）。
 */
export function findBackdoorPaths(
  dag: CausalDag,
  exposure: string,
  outcome: string,
): readonly BackdoorPath[] {
  const paths: BackdoorPath[] = [];

  // DFS 栈帧：(current, path, visited, started_backward)。递归语义改显式栈避免深递归（DAG 有界但保守）。
  type Frame = { readonly current: string; readonly path: readonly string[]; readonly visited: ReadonlySet<string>; readonly startedBackward: boolean };
  const stack: Frame[] = [{ current: exposure, path: [exposure], visited: new Set<string>([exposure]), startedBackward: false }];

  while (stack.length > 0) {
    // stack.length > 0 保证 pop 非 undefined；! 窄断言配此依据（noUncheckedIndexedAccess）。
    const { current, path, visited, startedBackward } = stack.pop()!;
    if (current === outcome && startedBackward) {
      paths.push([...path]);
      continue; // outcome 为终点·不再向其下游扩展
    }
    for (const neighbor of dag.neighbors(current)) {
      if (visited.has(neighbor)) {
        continue; // 简单路径·不重复访问
      }
      const edgeForward = dag.hasEdge(current, neighbor); // current → neighbor
      const edgeBackward = dag.hasEdge(neighbor, current); // neighbor → current
      // DAG 无 bidirected（buildDag 拒 2-cycle）·forward/backward 至多一个成立（adjacency 保证恰一个）。
      if (edgeForward) {
        if (current === exposure && !startedBackward) {
          continue; // 不能以 exposure→ 开始（因果路径·非后门·§7.5.1:1066-1067）
        }
        stack.push({
          current: neighbor,
          path: [...path, neighbor],
          visited: new Set<string>(visited).add(neighbor),
          startedBackward, // forward 不改变 started_backward
        });
      }
      if (edgeBackward) {
        stack.push({
          current: neighbor,
          path: [...path, neighbor],
          visited: new Set<string>(visited).add(neighbor),
          startedBackward: true, // edge_backward → 置 True（§7.5.1:1070）
        });
      }
    }
  }

  return paths;
}

// ---------------------------------------------------------------------------
// isPathBlocked —— 路径级 d-separation 阻断（Pearl/Koller-Friedman 标准定义）
// ---------------------------------------------------------------------------

/**
 * 判定单条路径在给定调整集 Z 下是否被阻断（标准 path-blocking 定义）。
 *
 * 中间节点 v（i ∈ [1, len-2]）阻断条件：
 *   - collider（n_{i-1}→v 且 n_{i+1}→v）：v ∉ Z 且 v 的后代均 ∉ Z → 阻断。
 *   - 非 collider（chain/fork）：v ∈ Z → 阻断。
 * 路径阻断 ⟺ 至少一个中间节点阻断；活跃（未阻断）⟺ 全部中间节点活跃。
 *
 * @param path nodeId 序列（含首尾·首尾不参与阻断判定）。
 * @param z 调整集（CausalModel.controlledConfounders）。
 */
export function isPathBlocked(dag: CausalDag, path: BackdoorPath, z: readonly string[]): boolean {
  if (path.length < 3) {
    // 直连边（exposure→outcome·无中间节点）·无节点可阻断 → 活跃（未阻断）。
    // 注：直连边作为「路径」时 d-separation 视其为永不阻断（首尾不参与判定）。
    return false;
  }
  const zSet = new Set<string>(z);
  for (let i = 1; i < path.length - 1; i++) {
    // path[i] 中间节点；path[i-1] 前驱；path[i+1] 后继（路径序列意义·非 DAG 父子）。
    const prev = path[i - 1]!;
    const node = path[i]!;
    const next = path[i + 1]!;
    // collider 判定：两侧箭头均指向 node（prev→node 且 next→node）。
    const isCollider = dag.hasEdge(prev, node) && dag.hasEdge(next, node);
    if (isCollider) {
      // collider 阻断 ⟺ node 及其后代均不在 Z。
      const nodeOrDescInZ = zSet.has(node) || descendants(dag, node).some((d) => zSet.has(d));
      if (!nodeOrDescInZ) {
        return true; // collider 未激活 → 阻断此路径
      }
      // collider 激活（node 或后代在 Z）→ 此中间节点活跃·继续检查下一节点
    } else {
      // 非 collider（chain/fork）·node ∈ Z → 阻断
      if (zSet.has(node)) {
        return true;
      }
    }
  }
  return false; // 全部中间节点活跃 → 路径未阻断
}

// ---------------------------------------------------------------------------
// blockBackdoorPaths —— §7.5.1 (2) 分桶（Z=controlledConfounders·路径级阻断）
// ---------------------------------------------------------------------------

/**
 * 用 CausalModel.controlledConfounders 作调整集 Z，对每条后门路径做路径级阻断判定。
 *
 * @returns { blocked, unblocked }（blocked=被 Z 阻断的路径·unblocked=未被阻断的路径）。
 */
export function blockBackdoorPaths(
  dag: CausalDag,
  exposure: string,
  outcome: string,
  causalModel: CausalModel,
): { readonly blocked: readonly BackdoorPath[]; readonly unblocked: readonly BackdoorPath[] } {
  const backdoorPaths = findBackdoorPaths(dag, exposure, outcome);
  const z = causalModel.controlledConfounders;
  const blocked: BackdoorPath[] = [];
  const unblocked: BackdoorPath[] = [];
  for (const path of backdoorPaths) {
    if (isPathBlocked(dag, path, z)) {
      blocked.push(path);
    } else {
      unblocked.push(path);
    }
  }
  return { blocked, unblocked };
}
