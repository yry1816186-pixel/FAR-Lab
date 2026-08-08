/**
 * P0-3 可插拔 stage 注册表（2026-08-07 落地）。
 *
 * 定位：agent_loop 六阶段 FSM 的**声明式调度元数据层**（ADDITIVE·不触碰 fsm_runner
 * 顺序执行逻辑）。提供：
 *   - 默认注册表 DEFAULT_STAGE_REGISTRY：6 阶段完整描述（stageId / 序号 / 标签 /
 *     payloadKind / 是否消费反馈信号 / 是否裁决关键 / 可否跳过）
 *   - 运行时注册/覆写（registerStage / deregisterStage）与查询（getStage /
 *     listStages / getStageOrder）
 *   - 顺序校验（validateStageOrder）：任何外部覆写不得破坏 1→6 依赖序
 *     （stage3 依赖 stage2 的整合图、stage4 依赖 stage3 的可证伪假设等）
 *
 * 为何不与 fsm_runner 直接耦合：并行/人工接管（后续迭代）将以本注册表为调度输入；
 * fsm_runner 保持顺序确定性基线。注册表对 trust-kernel 零影响（纯元数据·不参与裁决）。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { StageArtifact, StageContext, StageId } from './types.ts';
import type { PayloadKind } from '../schema/enums.ts';

/** 注册表对外再导出（消费者免于直接依赖 types.ts）。 */
export type { StageId };

/**
 * 扩展阶段执行器：主链收敛并产出裁决后，作为并行分支（order>6）并发执行。
 * 返回标准 StageArtifact（复用证据链/收据/事件语义），失败必须显式抛错。
 */
export type ExtensionStageExecutor = (ctx: StageContext) => Promise<StageArtifact>;

/** 单阶段声明：调度器/UI/并行执行器消费。 */
export interface StageDescriptor {
  readonly stageId: StageId;
  /** 阶段序号：1..6 为主链默认执行顺序；>6 为并行扩展分支（可选·不参与主链依赖）。 */
  readonly order: number;
  /** 人类可读标签（CLI/前端渲染）。 */
  readonly label: string;
  /** 产出 payload kind（证据链类型·与 schema 对齐）。 */
  readonly payloadKind: PayloadKind;
  /** 是否消费上一阶段回灌信号（仅 stage3 消费 [6]→[3] feedback）。 */
  readonly consumesFeedbackSignal: boolean;
  /** 裁决关键性：该阶段产物直接参与 R0-R9 裁决输入指纹。 */
  readonly verdictCritical: boolean;
  /** 可否在并行调度中被跳过（stage1/5 为纯上下文，可条件裁剪）。 */
  readonly skippable: boolean;
  /** 阶段职责（文档化描述）。 */
  readonly description: string;
  /** 扩展阶段执行器（仅 order>6 并行分支设置·主链 1..6 不设）。 */
  readonly executor?: ExtensionStageExecutor;
}

/**
 * 扩展阶段执行失败的显式错误（反剧场 F11：绝不静默吞错）。
 * fsm_runner 捕获后以 code='EXTENSION_STAGE_FAILED' + stageId 落 LoopState.error。
 */
export class ExtensionStageError extends Error {
  readonly stageId: StageId;

  constructor(stageId: StageId, message: string) {
    super(`extension stage ${stageId} failed: ${message}`);
    this.name = 'ExtensionStageError';
    this.stageId = stageId;
  }
}

/** 注册表默认配置：与 fsm_runner 顺序执行语义严格一致（不得随意改序）。 */
export const DEFAULT_STAGE_REGISTRY: readonly StageDescriptor[] = [
  {
    stageId: 'stage1_understanding',
    order: 1,
    label: 'Understanding',
    payloadKind: 'understanding',
    consumesFeedbackSignal: false,
    verdictCritical: false,
    skippable: false,
    description: '问题理解与范围界定：problemStatement / keyTerms / falsifiableAngle。',
  },
  {
    stageId: 'stage2_integration',
    order: 2,
    label: 'Integration',
    payloadKind: 'integration',
    consumesFeedbackSignal: false,
    verdictCritical: true,
    skippable: false,
    description: '领域整合：citation + knowledgeGraphSummary + gaps（裁决输入之一）。',
  },
  {
    stageId: 'stage3_hypothesis',
    order: 3,
    label: 'Hypothesis',
    payloadKind: 'hypothesis',
    consumesFeedbackSignal: true,
    verdictCritical: true,
    skippable: false,
    description: '可证伪假设生成：claim + falsificationMethod（[6]→[3] 回灌唯一消费点）。',
  },
  {
    stageId: 'stage4_evidence',
    order: 4,
    label: 'Evidence',
    payloadKind: 'experiment',
    consumesFeedbackSignal: false,
    verdictCritical: true,
    skippable: false,
    description: '证据检索/实验设计：evidenceRecords + entailmentScore（裁决输入之一）。',
  },
  {
    stageId: 'stage5_plan',
    order: 5,
    label: 'Planning',
    payloadKind: 'plan',
    consumesFeedbackSignal: false,
    verdictCritical: false,
    skippable: false,
    description: '复现执行计划：datasetChoices / methodChoices / executableChecks。',
  },
  {
    stageId: 'stage6_feedback',
    order: 6,
    label: 'Feedback',
    payloadKind: 'feedback',
    consumesFeedbackSignal: false,
    verdictCritical: true,
    skippable: false,
    description: 'LLM 自评收敛信号：continueIteration / refinements（迭代终止判定之一）。',
  },
];

/** 注册表运行时状态：默认 6 阶段 + 外部注册扩展（复制·避免共享突变）。 */
let registry: readonly StageDescriptor[] = [...DEFAULT_STAGE_REGISTRY];

function indexOfId(stages: readonly StageDescriptor[], stageId: StageId): number {
  return stages.findIndex((s) => s.stageId === stageId);
}

/**
 * 注册/覆写单阶段。非法输入（非正整数 order、重复 order、破坏主链依赖）抛错·fail-closed。
 * 返回注册表当前快照（链式可用）。
 */
export function registerStage(descriptor: StageDescriptor): readonly StageDescriptor[] {
  if (!Number.isInteger(descriptor.order) || descriptor.order < 1) {
    throw new Error(`stage_registry: order must be a positive integer (got ${descriptor.order})`);
  }
  const next = [...registry];
  const existing = indexOfId(next, descriptor.stageId);
  if (existing >= 0) {
    next[existing] = descriptor;
  } else {
    next.push(descriptor);
  }
  validateStageOrder(next);
  registry = next;
  return registry;
}

/** 注销单阶段（默认注册表的 6 阶段不可注销·防破坏基线）。 */
export function deregisterStage(stageId: StageId): boolean {
  if (indexOfId(DEFAULT_STAGE_REGISTRY, stageId) >= 0) {
    return false;
  }
  const next = registry.filter((s) => s.stageId !== stageId);
  if (next.length === registry.length) {
    return false;
  }
  registry = next;
  return true;
}

/** 查询单阶段（未注册返回 undefined）。 */
export function getStage(stageId: StageId): StageDescriptor | undefined {
  const idx = indexOfId(registry, stageId);
  return idx >= 0 ? registry[idx] : undefined;
}

/** 按 order 升序返回当前注册表快照（调度顺序·不可变副本）。 */
export function listStages(): readonly StageDescriptor[] {
  return [...registry].sort((a, b) => a.order - b.order);
}

/** 当前执行顺序（stageId 数组）。 */
export function getStageOrder(): readonly StageId[] {
  return listStages().map((s) => s.stageId);
}

/**
 * 顺序校验：任意两个阶段不得共享 order；主链 1..6 必须完整存在；
 * 依赖序不变量（stage3 晚于 stage2、stage4 晚于 stage3）不得破坏。
 * 不满足则抛错（任何注册/覆写后自动执行·防破坏调度序）。
 */
export function validateStageOrder(stages: readonly StageDescriptor[]): void {
  const orders = new Set<number>();
  for (const s of stages) {
    if (orders.has(s.order)) {
      throw new Error(`stage_registry: duplicate order ${s.order} (${s.stageId})`);
    }
    orders.add(s.order);
  }
  for (let o = 1; o <= 6; o++) {
    if (!orders.has(o)) {
      throw new Error(`stage_registry: missing order ${o} (dependency chain broken)`);
    }
  }
  // 依赖序不变量：stage3 必须晚于 stage2、stage4 晚于 stage3。
  const orderOf = (id: StageId): number | undefined =>
    stages.find((s) => s.stageId === id)?.order;
  const o2 = orderOf('stage2_integration');
  const o3 = orderOf('stage3_hypothesis');
  const o4 = orderOf('stage4_evidence');
  if (o2 !== undefined && o3 !== undefined && o3 <= o2) {
    throw new Error('stage_registry: stage3 must run after stage2 (integration graph dependency)');
  }
  if (o3 !== undefined && o4 !== undefined && o4 <= o3) {
    throw new Error('stage_registry: stage4 must run after stage3 (falsifiable claim dependency)');
  }
}

/** 重置注册表为默认（测试用）。 */
export function resetStageRegistry(): void {
  registry = [...DEFAULT_STAGE_REGISTRY];
}
