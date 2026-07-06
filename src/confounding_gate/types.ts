/**
 * confounding_gate —— 类型层契约（CausalModel + ConfoundingGate 结果）。
 *
 * 字段对齐（§7.5.1:986）：伪代码消费 APPENDIX_A §10 CausalModel 字段（camelCase）。
 *   - nodes / edges / controlledConfounders / unmeasuredConfoundersSuspected
 * snake_case 仅作 Python 等价示意，不得用于访问附录对象字段。
 *
 * F6 红线（§7.5:980）：ConfoundingGate 是确定性图算法（d-separation + 后门路径枚举），
 * **不是 LLM 推理混杂**。CG-1 grep 门禁 src/confounding_gate 不得含 openai/chat.completions/llm 导入。
 *
 * 模型中立：本模块无 qwen/dashscope/bailian 字面量。
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。纯类型层（无运行时副作用）。
 */

// ---------------------------------------------------------------------------
// claim 分类 + 证据基础（F6 门控输入·22 T-W2-06 措辞）
// ---------------------------------------------------------------------------

/**
 * claim 类型（22 T-W2-06 三值·权威）。
 *
 * 注：08 SciIR claimType 9 值枚举未含 'quantitative'（22↔08 漂移·claim_fixtures.ts:14-16 TODO）。
 * 本任务用 22 T-W2-06 三值，不统一 08 枚举（out of scope）。'causal' 触发 ConfoundingGate F6。
 */
export type ClaimType = 'existence' | 'quantitative' | 'causal';

/**
 * 证据基础（F6 红线·03 §7.5:961）。
 * 'observational_only' + ConfoundingGate FAIL → 强制禁 CONFIRMED（相关 ≠ 因果）。
 *
 * 注：evidence_basis 枚举跨 spec 漂移（09_GAP_CLOSURE_LOG.md:683 记录）；F6 契约值取 'observational_only'
 * （03 §7.5:45 F6 red-line 小写字面量）。本四值枚举覆盖 11/02/08/32 各 spec 用例。
 */
export type EvidenceBasis = 'interventional' | 'observational_only' | 'mixed' | 'n_a';

// ---------------------------------------------------------------------------
// CausalModel（APPENDIX_A §10·DESIGN_LOCKED·claimType=causal 时强制非空）
// ---------------------------------------------------------------------------

/** DAG 节点类型（APPENDIX_A §10 CausalDagNode.nodeKind 4 值）。 */
export type CausalDagNodeKind = 'observed' | 'latent' | 'intervention' | 'outcome';

/** DAG 边类型（APPENDIX_A §10 CausalEdge.edgeKind 3 值·无 bidirected）。 */
export type CausalEdgeKind = 'direct_cause' | 'probable_cause' | 'spurious_correlation';

/** 因果 DAG 节点（APPENDIX_A §10）。 */
export interface CausalDagNode {
  /** [VC] 节点 id。 */
  readonly nodeId: string;
  /** [VC] 变量名。 */
  readonly variableName: string;
  /** [VC] 节点类型：observed / latent / intervention / outcome（4 值）。 */
  readonly nodeKind: CausalDagNodeKind;
  /** [DOC] 变量描述。 */
  readonly description?: string;
}

/** 因果 DAG 边（APPENDIX_A §10）。 */
export interface CausalEdge {
  /** [VC] 起点 nodeId。 */
  readonly fromNodeId: string;
  /** [VC] 终点 nodeId。 */
  readonly toNodeId: string;
  /** [VC] 边类型：direct_cause / probable_cause / spurious_correlation（3 值，无 bidirected）。 */
  readonly edgeKind: CausalEdgeKind;
  /** [DOC] 因果机制说明（F6 因果诚信）。 */
  readonly mechanismRationale?: string;
}

/**
 * 因果模型（APPENDIX_A §10）。
 * claimType=causal 时 FEC 校验强制非空，且 L7-L3 ConfoundingGate 强制启用（11 §2.3）。
 *
 * 字段消费（§7.5.1）：
 *   - controlledConfounders → 调整集 Z（block_backdoor_paths 用作 d-separation 条件集）。
 *   - unmeasuredConfoundersSuspected → 非空时 ConfoundingGate 倾向 FAIL（adjudicate_confounding outcome 裁决）。
 */
export interface CausalModel {
  /** [VC] DAG 节点列表。 */
  readonly nodes: readonly CausalDagNode[];
  /** [VC] DAG 边列表（CausalEdgeKind 3 值，无 bidirected）。 */
  readonly edges: readonly CausalEdge[];
  /** [VC] 已控制混淆子 nodeId 列表（调整集 Z，替代旧 backdoorSet）。 */
  readonly controlledConfounders: readonly string[];
  /** [VC] 怀疑未测混淆子 nodeId 列表（非空 → ConfoundingGate 倾向 unblocked/FAIL）。 */
  readonly unmeasuredConfoundersSuspected: readonly string[];
}

// ---------------------------------------------------------------------------
// CausalDag 内部表示（buildDag 产出·d_separation/backdoor 消费）
// ---------------------------------------------------------------------------

/**
 * 因果 DAG 运行时表示（buildDag 从 CausalModel.nodes/edges 构造）。
 *
 * 设计：邻接表 + 有向边查询。d_separation 伪代码消费 `dag.neighbors(X)`（无向邻接·union）+
 * `dag.has_edge(X, neighbor)`（正向）/ `dag.has_edge(neighbor, X)`（反向）。
 * 接口方法纯查询（无 mutation·确定性·幂等）。
 */
export interface CausalDag {
  /** 全部节点 id（稳定顺序·buildDag 按 nodes 输入序）。 */
  readonly nodeIds: readonly string[];
  /** 有向边存在性查询：from → to。 */
  hasEdge(from: string, to: string): boolean;
  /** 无向邻接节点（successors ∪ predecessors·去重·稳定序）。d_separation BFS 消费。 */
  neighbors(node: string): readonly string[];
  /** 后继节点（出边终点·X → successor）。descendants 遍历消费。 */
  successors(node: string): readonly string[];
  /** 前驱节点（入边起点·predecessor → X）。ancestors 遍历消费。 */
  predecessors(node: string): readonly string[];
}

// ---------------------------------------------------------------------------
// ConfoundingGate 结果（§7.5.1:1119-1128·8 字段）
// ---------------------------------------------------------------------------

/** ConfoundingGate 三值 outcome（§7.5.1:1107-1116）。 */
export type ConfoundingOutcome = 'PASS' | 'WARN' | 'FAIL';

/** 一条后门路径（exposure → outcome 的 nodeId 序列·含首尾）。 */
export type BackdoorPath = readonly string[];

/**
 * ConfoundingGate 裁决结果（§7.5.1:1119-1128·adjudicateConfounding 产出）。
 *
 * outcome 一句话口径（§7.5:949-953）：
 *   - PASS = 所有后门路径被 controlledConfounders 阻断（d-separation 成立）。
 *   - WARN = 存在后门路径但 unmeasuredConfoundersSuspected 为空（未阻断但变量全测）。
 *   - FAIL = 存在后门路径且 unmeasuredConfoundersSuspected 非空（存在未测量的未阻断混杂）。
 */
export interface ConfoundingGateResult {
  /** 三值裁决。 */
  readonly outcome: ConfoundingOutcome;
  /** 未阻断后门路径上的混淆子 nodeId（sorted·去重·排除 exposure/outcome）。 */
  readonly unblockedConfounders: readonly string[];
  /** 已阻断后门路径上的混淆子 nodeId（sorted·去重·排除 exposure/outcome）。 */
  readonly blockedConfounders: readonly string[];
  /** 怀疑未测混淆子 nodeId（sorted·即 unmeasuredConfoundersSuspected 投影）。 */
  readonly unmeasuredConfounders: readonly string[];
  /** exposure → outcome 的全部后门路径（findBackdoorPaths 枚举）。 */
  readonly backdoorPaths: readonly BackdoorPath[];
  /** 被 Z 阻断的后门路径子集。 */
  readonly blockedPaths: readonly BackdoorPath[];
  /** 未被 Z 阻断的后门路径子集。 */
  readonly unblockedPaths: readonly BackdoorPath[];
  /** 纯模板生成的因果诚信说明（CG-6·generateRationale·无 LLM）。 */
  readonly rationale: string;
}
