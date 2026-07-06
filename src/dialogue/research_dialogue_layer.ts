/**
 * research_dialogue_layer.ts —— 研究对话层总调度（39 §7·7-step 主调度流程）。
 *
 * 7-step 主调度流程：
 *   1. input_analysis —— 解析用户输入·建 session·追加 user turn
 *   2. clarification —— 推断意图·判定是否需澄清·必要时生成澄清提问
 *   3. thought_structure —— 构建初步思维结构
 *   4. tool_invocation —— 调用只读工具·工具失败时降级
 *   5. synthesis —— 合成框架（含诚实降级）
 *   6. validation —— 验证框架字段
 *   7. output —— 结束 session·返回框架
 *
 * 工具失败降级：工具调用失败时记录至 openIssues·不中断流程。
 * 不产判定节点（39 §0#2·避免 LLM-as-judge 红线）。
 * 通道互斥：dialogue 层属主环·不进评测环。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch。
 */

import { ulid } from 'ulid';

import type {
  DialogueTurn,
  IntentHypothesis,
  IntentLabel,
  ResearchSession,
  ResearchThoughtFramework,
} from './dialogue_types.ts';
import { INTENT_LABELS, isIntentLabel } from './dialogue_types.ts';
import {
  CLARIFICATION_CONFIDENCE_THRESHOLD,
  createClarificationDialogManager,
  decideClarification,
} from './clarification_dialog_manager.ts';
import type { ClarificationStore } from './clarification_stores.ts';
import { createInMemoryClarificationStore } from './clarification_stores.ts';
import {
  createThoughtStructureSynthesizer,
} from './thought_structure_synthesizer.ts';
import type { ThoughtStructureSynthesizer } from './thought_structure_synthesizer.ts';
import {
  DIALOGUE_TOOLS,
  invokeDialogueTool,
} from './tool_registry.ts';
import type { DialogueToolResult } from './tool_registry.ts';
import {
  createDialogueEventEmitter,
  clarificationAskedEvent,
  dialogueTurnCompletedEvent,
  dialogueTurnStartedEvent,
  intentInferredEvent,
  sessionFinalizedEvent,
  sessionStartedEvent,
} from './dialogue_event_emitter.ts';
import type { DialogueEventEmitter } from './dialogue_event_emitter.ts';
import { createManifestDraft, type ManifestDraft } from './manifest_draft.ts';

// ---------- 常量 ----------

export const DEFAULT_MAX_TURNS = 20;
export const DIALOGUE_END_SIGNAL = '__DIALOGUE_END__';

// ---------- ResearchDialogueLayer 接口 ----------

export interface ResearchDialogueLayer {
  runDialogue(opts: {
    readonly userId?: string;
    readonly researchTopic?: string;
    readonly maxTurns?: number;
    readonly userTurnProvider: () => Promise<string> | string;
    readonly recalledMemoryContext?: readonly string[];
  }): ManifestDraft;
}

// ---------- 对话层运行结果 ----------

export interface DialogueRunResult {
  readonly session: ResearchSession;
  readonly turns: readonly DialogueTurn[];
  readonly hypotheses: readonly IntentHypothesis[];
  readonly manifest: ManifestDraft;
  readonly toolResults: readonly DialogueToolResult[];
  readonly degraded: boolean;
}

// ---------- 工厂函数 ----------

export function createResearchDialogueLayer(options?: {
  readonly clarificationStore?: ClarificationStore;
  readonly eventEmitter?: DialogueEventEmitter;
  readonly synthesizer?: ThoughtStructureSynthesizer;
  readonly confidenceThreshold?: number;
  readonly maxTurns?: number;
}): ResearchDialogueLayer {
  const store = options?.clarificationStore ?? createInMemoryClarificationStore();
  const emitter = options?.eventEmitter ?? createDialogueEventEmitter();
  const synthesizer = options?.synthesizer ?? createThoughtStructureSynthesizer();
  const threshold = options?.confidenceThreshold ?? CLARIFICATION_CONFIDENCE_THRESHOLD;
  const maxTurnsDefault = options?.maxTurns ?? DEFAULT_MAX_TURNS;

  const clarificationManager = createClarificationDialogManager(store, { threshold });

  return {
    runDialogue(opts: {
      readonly userId?: string;
      readonly researchTopic?: string;
      readonly maxTurns?: number;
      readonly userTurnProvider: () => Promise<string> | string;
      readonly recalledMemoryContext?: readonly string[];
    }): ManifestDraft {
      const maxTurns = opts.maxTurns ?? maxTurnsDefault;
      // exactOptionalPropertyTypes: 可选属性不可显式赋 undefined，
      // 仅在源值非 undefined 时展开（标准类型安全模式）。
      const result = runSevenStepDialogue({
        ...(opts.userId !== undefined ? { userId: opts.userId } : {}),
        ...(opts.researchTopic !== undefined ? { researchTopic: opts.researchTopic } : {}),
        maxTurns,
        userTurnProvider: opts.userTurnProvider,
        ...(opts.recalledMemoryContext !== undefined ? { recalledMemoryContext: opts.recalledMemoryContext } : {}),
        store,
        emitter,
        synthesizer,
        clarificationManager,
        threshold,
      });
      return result.manifest;
    },
  };
}

// ---------- 7-step 主调度流程 ----------

interface DialogueContext {
  readonly userId?: string;
  readonly researchTopic?: string;
  readonly maxTurns: number;
  readonly userTurnProvider: () => Promise<string> | string;
  readonly recalledMemoryContext?: readonly string[];
  readonly store: ClarificationStore;
  readonly emitter: DialogueEventEmitter;
  readonly synthesizer: ThoughtStructureSynthesizer;
  readonly clarificationManager: ReturnType<typeof createClarificationDialogManager>;
  readonly threshold: number;
}

function runSevenStepDialogue(ctx: DialogueContext): DialogueRunResult {
  // ===== Step 1: input_analysis =====
  const sessionId = ulid();
  const now = new Date().toISOString();
  const session: ResearchSession = {
    sessionId,
    userId: ctx.userId ?? null,
    status: 'active',
    createdAt: now,
    finalizedAt: null,
    linkedRunId: null,
  };

  ctx.emitter.emit(sessionStartedEvent(sessionId, session.userId));

  const turns: DialogueTurn[] = [];
  const hypotheses: IntentHypothesis[] = [];
  const toolResults: DialogueToolResult[] = [];
  let turnNo = 0;

  // ===== Step 2: clarification (multi-turn loop) =====
  for (let i = 0; i < ctx.maxTurns; i++) {
    const userMsg = ctx.userTurnProvider();
    const userMsgResolved = typeof userMsg === 'string' ? userMsg : '';

    if (userMsgResolved === DIALOGUE_END_SIGNAL) {
      break;
    }

    turnNo += 1;
    const turnId = ulid();
    const turnCreatedAt = new Date().toISOString();
    const userTurn: DialogueTurn = {
      turnId,
      sessionId,
      turnNo,
      role: 'user',
      content: userMsgResolved,
      intentHypothesisId: null,
      clarificationQuestionId: null,
      toolCallSeq: null,
      createdAt: turnCreatedAt,
    };
    turns.push(userTurn);
    ctx.emitter.emit(dialogueTurnStartedEvent(sessionId, turnNo));

    const hypothesis = inferIntentDeterministic(
      sessionId,
      turnId,
      userMsgResolved,
      ctx.recalledMemoryContext,
    );
    hypotheses.push(hypothesis);
    ctx.emitter.emit(intentInferredEvent(sessionId, hypothesis.intentLabel, hypothesis.confidence));

    const decision = ctx.clarificationManager.decideClarification(hypothesis);
    if (decision.needClarification) {
      const clarification = ctx.clarificationManager.askClarification(sessionId, turnId, decision);
      if (clarification !== null) {
        ctx.emitter.emit(clarificationAskedEvent(sessionId, clarification.questionType));
        const assistantTurn: DialogueTurn = {
          turnId: ulid(),
          sessionId,
          turnNo: turnNo + 1,
          role: 'assistant',
          content: clarification.question,
          intentHypothesisId: hypothesis.hypothesisId,
          clarificationQuestionId: clarification.questionId,
          toolCallSeq: null,
          createdAt: new Date().toISOString(),
        };
        turns.push(assistantTurn);
        turnNo += 1;
        ctx.emitter.emit(dialogueTurnCompletedEvent(sessionId, assistantTurn.turnId, hypothesis.hypothesisId));
        continue;
      }
    }

    ctx.emitter.emit(dialogueTurnCompletedEvent(sessionId, turnId, hypothesis.hypothesisId));
  }

  // ===== Step 3: thought_structure =====
  if (turns.length === 0) {
    const placeholderTurn: DialogueTurn = {
      turnId: ulid(),
      sessionId,
      turnNo: 1,
      role: 'user',
      content: ctx.researchTopic ?? '(empty dialogue)',
      intentHypothesisId: null,
      clarificationQuestionId: null,
      toolCallSeq: null,
      createdAt: new Date().toISOString(),
    };
    turns.push(placeholderTurn);
  }

  // ===== Step 4: tool_invocation (with failure degradation) =====
  for (const tool of DIALOGUE_TOOLS) {
    const toolInput: Record<string, string> = {};
    if (hypotheses.length > 0) {
      toolInput.keyword = hypotheses[0]?.intentLabel ?? 'default';
    }
    const result = invokeDialogueTool(tool.toolId, toolInput);
    toolResults.push(result);
    if (!result.ok && result.error !== null) {
      // 工具失败降级：记录错误但不中断流程
      const errorTurn: DialogueTurn = {
        turnId: ulid(),
        sessionId,
        turnNo: turnNo + 1,
        role: 'system',
        content: `TOOL_FAILURE: ${tool.toolId}: ${result.error}`,
        intentHypothesisId: null,
        clarificationQuestionId: null,
        toolCallSeq: null,
        createdAt: new Date().toISOString(),
      };
      turns.push(errorTurn);
      turnNo += 1;
    }
  }

  // ===== Step 5: synthesis (with honest degradation) =====
  const manifest = ctx.synthesizer.synthesizeWithDegradation({
    sessionId,
    turns,
    hypotheses,
  });

  // ===== Step 6: validation =====
  validateFramework(manifest.framework, turns);

  // ===== Step 7: output =====
  ctx.emitter.emit(sessionFinalizedEvent(sessionId, manifest.framework.frameworkId));

  return {
    session: { ...session, status: 'finalized', finalizedAt: new Date().toISOString() },
    turns,
    hypotheses,
    manifest,
    toolResults,
    degraded: manifest.degraded,
  };
}

// ---------- 确定性意图推断（离线降级·无 LLM） ----------

function inferIntentDeterministic(
  sessionId: string,
  turnId: string,
  userMessage: string,
  recalledMemoryContext?: readonly string[],
): IntentHypothesis {
  const intentLabel = classifyIntent(userMessage);
  const confidence = computeConfidence(userMessage, intentLabel, recalledMemoryContext);
  const now = new Date().toISOString();

  return {
    hypothesisId: ulid(),
    sessionId,
    turnId,
    intentLabel,
    confidence,
    rationale: `deterministic_classification: intent=${intentLabel} confidence=${confidence.toFixed(2)}`,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
}

function classifyIntent(message: string): IntentLabel {
  const lower = message.toLowerCase();
  if (lower.includes('hypothesis') || lower.includes('assume') || lower.includes('predict')) {
    return 'hypothesis_generation';
  }
  if (lower.includes('literature') || lower.includes('survey') || lower.includes('review')) {
    return 'literature_review';
  }
  if (lower.includes('experiment') || lower.includes('design') || lower.includes('setup')) {
    return 'experiment_design';
  }
  if (lower.includes('data') || lower.includes('analyze') || lower.includes('analysis')) {
    return 'data_analysis';
  }
  if (lower.includes('phenomenon') || lower.includes('explain') || lower.includes('why')) {
    return 'phenomenon_explanation';
  }
  if (lower.includes('compare') || lower.includes('versus') || lower.includes('method')) {
    return 'method_comparison';
  }
  if (lower.includes('reproduc') || lower.includes('replicate') || lower.includes('verify')) {
    return 'reproducibility_check';
  }
  return 'open_ended_exploration';
}

function computeConfidence(
  message: string,
  intentLabel: IntentLabel,
  recalledMemoryContext?: readonly string[],
): number {
  if (intentLabel === 'open_ended_exploration') {
    return 0.3;
  }
  const keywordCount = countKeywordMatches(message, intentLabel);
  const baseConfidence = Math.min(0.5 + keywordCount * 0.15, 0.95);
  const memoryBoost = recalledMemoryContext !== undefined && recalledMemoryContext.length > 0 ? 0.05 : 0;
  return Math.min(baseConfidence + memoryBoost, 0.95);
}

function countKeywordMatches(message: string, intentLabel: IntentLabel): number {
  const lower = message.toLowerCase();
  const keywords: Record<IntentLabel, string[]> = {
    hypothesis_generation: ['hypothesis', 'assume', 'predict', 'claim'],
    literature_review: ['literature', 'survey', 'review', 'paper'],
    experiment_design: ['experiment', 'design', 'setup', 'protocol'],
    data_analysis: ['data', 'analyze', 'analysis', 'dataset'],
    phenomenon_explanation: ['phenomenon', 'explain', 'why', 'cause'],
    method_comparison: ['compare', 'versus', 'method', 'baseline'],
    reproducibility_check: ['reproduc', 'replicate', 'verify', 'reproduce'],
    open_ended_exploration: [],
  };
  return keywords[intentLabel].filter((kw) => lower.includes(kw)).length;
}

// ---------- 框架验证 =====

function validateFramework(framework: ResearchThoughtFramework, turns: readonly DialogueTurn[]): void {
  if (framework.researchQuestion === '') {
    throw new Error('validateFramework: researchQuestion must not be empty');
  }
  if (framework.linkedDialogueTurnIds.length === 0) {
    throw new Error('validateFramework: linkedDialogueTurnIds must not be empty (provenance required)');
  }
  if (!isIntentLabel(framework.primaryIntent)) {
    throw new Error(`validateFramework: primaryIntent "${framework.primaryIntent}" is not a valid IntentLabel`);
  }
  const turnIdSet = new Set(turns.map((t) => t.turnId));
  for (const linkedId of framework.linkedDialogueTurnIds) {
    if (!turnIdSet.has(linkedId)) {
      throw new Error(`validateFramework: linkedDialogueTurnId "${linkedId}" not found in turns (provenance violation)`);
    }
  }
}

// ---------- 导出辅助 ----------

export { decideClarification, createManifestDraft, INTENT_LABELS };
