/**
 * stage3_hypothesis —— [3] 候选假设生成执行器（结构化输出 + falsifiability_gate 硬阻断）。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/06_agent_loop.md §2（stage3）+ §5.2-§5.3（执行器要点 + gate）.
 *
 * 职责：生成可证伪假设 + 过 falsifiability_gate 硬阻断（无 falsification_method → throw 降级）。
 *
 * buildMessages 消费：stage2 产物（knowledgeGraphSummary + gaps）+ feedbackSignal（若有回灌）。
 *
 * 输出：HypothesisPayload（kind='hypothesis'·含 falsificationMethod 必填）。
 *
 * falsifiability_gate 协作（§5.3）：
 *   - runStage 返回后，把 HypothesisPayload.falsificationMethod（FalsificationMethod 类型）
 *     转换为 FalsificationSpec + ThresholdSpec（falsifiability/types.ts 入库形态）。
 *   - 调 falsifiabilityGate({ hypothesis, falsificationSpec, thresholdSpec? }) 硬阻断。
 *   - gate 抛 FalsifiabilityGateError → 转 FALSIFIABILITY_GATE_BLOCK（AgentLoopError）。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import { falsifiabilityGate } from '../../falsifiability/index.ts';
import { FalsifiabilityGateError } from '../../falsifiability/index.ts';
import type {
  FalsificationSpec,
  ThresholdSpec,
} from '../../falsifiability/types.ts';
import type { LlmMessage } from '../../llm_gateway/types.ts';
import type {
  FalsificationMethod,
  HypothesisPayload,
  StageArtifact,
  StageContext,
} from '../types.ts';
import { runStage } from '../run_stage.ts';
import { HypothesisSchema } from './schemas.ts';
import { STAGE_TO_PURPOSE_TAG } from '../stage_purpose.ts';


/**
 * runStage3 —— [3] 候选假设生成执行器（含 falsifiability_gate 硬阻断）。
 *
 * @throws {code: 'FALSIFIABILITY_GATE_BLOCK'} 假设不可证伪（falsificationMethod 缺失或无效）
 */
export async function runStage3(ctx: StageContext): Promise<StageArtifact> {
  const artifact = await runStage(
    ctx,
    'stage3_hypothesis',
    'hypothesis', // payloadKind
    STAGE_TO_PURPOSE_TAG.stage3_hypothesis, // 'hypothesis'（API-1 SSOT）
    HypothesisSchema,
    buildHypothesisMessages,
  );

  // falsifiability_gate 硬阻断：假设无 falsification_method 不许放行（§5.3）
  const hyp = narrowHypothesis(artifact);
  const { spec, thresholdSpec } = toFalsificationSpecAndThreshold(hyp.falsificationMethod);
  try {
    falsifiabilityGate({
      hypothesis: hyp.claim,
      falsificationSpec: spec,
      ...(thresholdSpec === undefined ? {} : { thresholdSpec }),
    });
  } catch (err) {
    if (err instanceof FalsifiabilityGateError) {
      throw Object.assign(
        new Error(
          `runStage3: FALSIFIABILITY_GATE_BLOCK (hypothesis not falsifiable: ${err.message})`,
        ),
        { code: 'FALSIFIABILITY_GATE_BLOCK', stageId: 'stage3_hypothesis' as const, cause: err },
      );
    }
    throw err;
  }

  return artifact;
}


/**
 * 构造 stage3 的 system/user messages。
 *
 * system: 角色 + 任务 + JSON 输出格式要求（含 falsificationMethod 必填说明）。
 * user: stage2 产物（knowledgeGraphSummary + gaps）+ feedbackSignal（若有回灌）。
 */
function buildHypothesisMessages(ctx: StageContext): readonly LlmMessage[] {
  const system = [
    'You are a research hypothesis generator. Task: generate a FALSIFIABLE hypothesis.',
    '',
    'A falsifiable hypothesis must include a falsificationMethod with:',
    '- prediction: string (a testable prediction)',
    '- metric: string (e.g. "macro_f1", "rmse")',
    '- comparator: "gt" | "lt" | "range"',
    '- value: number (required for gt/lt)',
    '- lower, upper: number (required for range)',
    '',
    'Output a JSON object with EXACTLY these fields:',
    '- kind: "hypothesis" (literal string)',
    '- claim: string (the hypothesis statement)',
    '- falsificationMethod: { prediction, metric, comparator, value?, lower?, upper? }',
    '- supportingCitations: string[] (evidence_id list from stage2)',
    '- scopeSlipText: string (scope-slip degradation statement, anti-theater)',
    '',
    'Do NOT include any other fields. Do NOT wrap JSON in markdown fences.',
  ].join('\n');

  const userParts: string[] = [ctx.researchInput];

  // 消费 stage2_integration 产物
  const stage2 = findPrevIntegration(ctx.prevArtifacts);
  if (stage2 !== undefined) {
    userParts.push(
      '',
      'Knowledge integration summary:',
      stage2.knowledgeGraphSummary,
      '',
      'Identified gaps:',
      stage2.gaps.length > 0 ? stage2.gaps.map((g, i) => `${i + 1}. ${g}`).join('\n') : '(none)',
    );
  }

  // 消费 feedbackSignal（[6]→[3] 回灌）
  if (ctx.feedbackSignal !== null) {
    userParts.push(
      '',
      `Feedback from previous iteration ${ctx.feedbackSignal.iterationNumber}:`,
      ctx.feedbackSignal.refinements.length > 0
        ? ctx.feedbackSignal.refinements.map((r, i) => `${i + 1}. ${r}`).join('\n')
        : '(no specific refinements)',
    );
  }

  const user = userParts.join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}


/**
 * 从 prevArtifacts 中找最近一次 stage2_integration 产物（用 discriminatedUnion narrow）。
 */
function findPrevIntegration(
  artifacts: readonly StageArtifact[],
): import('../types.ts').IntegrationPayload | undefined {
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const artifact = artifacts[i];
    if (artifact && artifact.stageId === 'stage2_integration') {
      const s = artifact.structured;
      if (s.kind === 'integration') {
        return s;
      }
    }
  }
  return undefined;
}


/**
 * 把 StageArtifact.structured 收窄为 HypothesisPayload（R10 discriminatedUnion narrow）。
 */
function narrowHypothesis(artifact: StageArtifact): HypothesisPayload {
  const s = artifact.structured;
  if (s.kind !== 'hypothesis') {
    throw new Error(
      `stage3_hypothesis.narrowHypothesis: expected kind='hypothesis' but got kind='${s.kind}' ` +
        `(stageId=${artifact.stageId}·runStage 返回的 structured 类型与预期不符)`,
    );
  }
  return s;
}


/**
 * FalsificationMethod → FalsificationSpec + ThresholdSpec 转换。
 *
 * FalsificationMethod 是 stage3 LLM 结构化输出形态（comparator + value/lower/upper）。
 * FalsificationSpec 是 falsifiability_gate 入库形态（falsificationThreshold + thresholdSemantics）。
 *
 * 转换规则：
 *   - comparator='gt' + value → thresholdSemantics='gt', falsificationThreshold=value, thresholdSpec=undefined
 *   - comparator='lt' + value → thresholdSemantics='lt', falsificationThreshold=value, thresholdSpec=undefined
 *   - comparator='range' + lower/upper → thresholdSemantics='range', falsificationThreshold=0(占位),
 *     thresholdSpec={ semantics:'range', lower, upper }
 *
 * @throws Error 若 comparator 与 value/lower/upper 不匹配
 *
 * 导出供 verdict_stage 复用（单一转换权威·禁在裁决阶段重写第二份 FalsificationMethod→Spec 转换）。
 */
export function toFalsificationSpecAndThreshold(
  method: FalsificationMethod,
): { spec: FalsificationSpec; thresholdSpec: ThresholdSpec | undefined } {
  const baseSpec = {
    prediction: method.prediction,
    metric: method.metric,
  };

  if (method.comparator === 'gt') {
    if (method.value === undefined) {
      throw new Error(
        `toFalsificationSpecAndThreshold: comparator='gt' requires value (prediction="${method.prediction}")`,
      );
    }
    return {
      spec: { ...baseSpec, falsificationThreshold: method.value, thresholdSemantics: 'gt' },
      thresholdSpec: undefined,
    };
  }

  if (method.comparator === 'lt') {
    if (method.value === undefined) {
      throw new Error(
        `toFalsificationSpecAndThreshold: comparator='lt' requires value (prediction="${method.prediction}")`,
      );
    }
    return {
      spec: { ...baseSpec, falsificationThreshold: method.value, thresholdSemantics: 'lt' },
      thresholdSpec: undefined,
    };
  }

  // comparator === 'range'
  if (method.lower === undefined || method.upper === undefined) {
    throw new Error(
      `toFalsificationSpecAndThreshold: comparator='range' requires lower and upper (prediction="${method.prediction}")`,
    );
  }
  return {
    // range 语义下 falsificationThreshold 不使用（实际用 thresholdSpec.lower/upper），填 0 占位
    spec: { ...baseSpec, falsificationThreshold: 0, thresholdSemantics: 'range' },
    thresholdSpec: { semantics: 'range', lower: method.lower, upper: method.upper },
  };
}
