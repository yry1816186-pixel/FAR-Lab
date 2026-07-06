/**
 * confounding_gate —— barrel（确定性因果混杂门·F6·§7.5）。
 *
 * 公共 API：
 *   - 类型：CausalModel/CausalDagNode/CausalEdge/CausalDag/ConfoundingGateResult/ConfoundingOutcome/
 *           ClaimType/EvidenceBasis/BackdoorPath（types.ts）。
 *   - DAG：buildDag/topologicalSort/assertAcyclic/ancestors/descendants（dag.ts·CG-2 acyclic）。
 *   - d-separation：dSeparation（d_separation.ts·Koller-Friedman Bayes-Ball）。
 *   - 后门路径：findBackdoorPaths/isPathBlocked/blockBackdoorPaths（backdoor.ts）。
 *   - 裁决：adjudicateConfounding（adjudicate.ts·三值 outcome）+ confoundingOutcomeVerdictEffect（共享映射）。
 *   - 说明：generateRationale（rationale.ts·CG-6 纯模板）。
 *
 * F6 红线（§7.5:980）：本模块是确定性图算法（d-separation + 后门路径枚举），**非 LLM 推理混杂**。
 * CG-1 grep 门禁 src/confounding_gate 不得含 openai/chat.completions/dashscope/llm 导入。
 *
 */

export type {
  BackdoorPath,
  CausalDag,
  CausalDagNode,
  CausalDagNodeKind,
  CausalEdge,
  CausalEdgeKind,
  CausalModel,
  ClaimType,
  ConfoundingGateResult,
  ConfoundingOutcome,
  EvidenceBasis,
} from './types.ts';

export { ancestors, assertAcyclic, buildDag, descendants, topologicalSort } from './dag.ts';
export { dSeparation } from './d_separation.ts';
export { blockBackdoorPaths, findBackdoorPaths, isPathBlocked } from './backdoor.ts';
export {
  adjudicateConfounding,
  confoundingOutcomeVerdictEffect,
} from './adjudicate.ts';
export type { ConfoundingVerdictEffect, ConfoundingVerdictEffectResult } from './adjudicate.ts';
export { generateRationale } from './rationale.ts';
