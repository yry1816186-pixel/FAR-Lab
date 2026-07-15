/**
 * 研究对话层类型定义（camelCase 内存态）。
 *
 * 设计要点：
 *   - 所有 TS 内存字段 camelCase；SQL 物理列 snake_case（见 schema/migrations/0002_add_dialogue_tables.sql）。
 *   - IntentLabel 8 值与 02 §3.8 CHECK + 0002 migration 字节级一致（CI 断言）。
 *   - 不进 canonicalHash（39 §0#5）；对话内容仅落 dialogue_turns。
 *   - 不产判定节点（39 §0#2·避免 LLM-as-judge 红线）。
 *   - 通道互斥：dialogue 层属主环（purpose_tag='dialogue'），不进评测环。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch。
 */

// ---------- §2 IntentLabel 8 值（02 §3.8 CHECK · 13 V-INTENTGRASP · 已钉版） ----------

export const INTENT_LABELS = [
  'hypothesis_generation',
  'literature_review',
  'experiment_design',
  'data_analysis',
  'phenomenon_explanation',
  'method_comparison',
  'reproducibility_check',
  'open_ended_exploration',
] as const;

export type IntentLabel = (typeof INTENT_LABELS)[number];

export function isIntentLabel(value: string): value is IntentLabel {
  return (INTENT_LABELS as readonly string[]).includes(value);
}

// ---------- 会话/轮次/假设状态机枚举 ----------

export const RESEARCH_SESSION_STATUSES = [
  'created',
  'active',
  'paused',
  'finalized',
  'archived',
] as const;
export type ResearchSessionStatus = (typeof RESEARCH_SESSION_STATUSES)[number];

export const DIALOGUE_TURN_ROLES = ['user', 'assistant', 'system'] as const;
export type DialogueTurnRole = (typeof DIALOGUE_TURN_ROLES)[number];

export const INTENT_HYPOTHESIS_STATUSES = ['pending', 'confirmed', 'rejected'] as const;
export type IntentHypothesisStatus = (typeof INTENT_HYPOTHESIS_STATUSES)[number];

// ---------- 澄清提问类型枚举（39 §5 questionType · grep 可检索） ----------

export const CLARIFICATION_QUESTION_TYPES = [
  'scope',
  'metric',
  'baseline',
  'dataset',
  'method',
  'general',
] as const;
export type ClarificationQuestionType = (typeof CLARIFICATION_QUESTION_TYPES)[number];

export function isClarificationQuestionType(value: string): value is ClarificationQuestionType {
  return (CLARIFICATION_QUESTION_TYPES as readonly string[]).includes(value);
}

// ---------- §8 共享值类型（引用 02 §3.6-3.8 物理列·camelCase 内存态） ----------

/** 对应 research_sessions 行（02 §3.6·5 值状态机） */
export interface ResearchSession {
  readonly sessionId: string;
  readonly userId: string | null;
  readonly status: ResearchSessionStatus;
  readonly createdAt: string;
  readonly finalizedAt: string | null;
  readonly linkedRunId: string | null;
}

/** 对应 dialogue_turns 行（02 §3.7·3 值角色枚举 + turn_no 唯一） */
export interface DialogueTurn {
  readonly turnId: string;
  readonly sessionId: string;
  readonly turnNo: number;
  readonly role: DialogueTurnRole;
  readonly content: string;
  readonly intentHypothesisId: string | null;
  readonly clarificationQuestionId: string | null;
  readonly toolCallSeq: number | null;
  readonly createdAt: string;
}

/** 对应 intent_hypotheses 行（02 §3.8·8 值 intent_label + 3 值状态机） */
export interface IntentHypothesis {
  readonly hypothesisId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly intentLabel: IntentLabel;
  readonly confidence: number;
  readonly rationale: string;
  readonly status: IntentHypothesisStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 澄清提问记录（dialogue 层内部·39 §5 ClarificationDecision 的持久化形态） */
export interface ClarificationQuestion {
  readonly questionId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly questionType: ClarificationQuestionType;
  readonly question: string;
  readonly createdAt: string;
}

// ---------- §6 ResearchThoughtFramework（12 字段·06:81 SSOT·非表·只 TS 接口） ----------

/**
 * 思维结构框架（39 §6·12 字段·非表）。
 *
 * 是 stage1 的可选参考输入（UnderstandingPayload.dialogueContext），不替换 stage1 原逻辑。
 * 不产判定节点（39 §0#2·避免 LLM-as-judge 红线）。
 */
export interface ResearchThoughtFramework {
  readonly frameworkId: string;
  readonly primaryIntent: IntentLabel;
  readonly researchQuestion: string;
  readonly falsifiableAngle: string;
  readonly keyVariables: readonly string[];
  readonly dataDescription: string;
  readonly constraints: readonly string[];
  readonly proposedBaselines: readonly string[];
  readonly proposedMetrics: readonly string[];
  readonly openIssues: readonly string[];
  readonly linkedDialogueTurnIds: readonly string[];
  readonly synthesizedAt: string;
}

// ---------- 澄清决策（39 §5 ClarificationDecision） ----------

export interface ClarificationDecision {
  readonly needClarification: boolean;
  readonly questionType: ClarificationQuestionType | null;
  readonly question: string | null;
}
