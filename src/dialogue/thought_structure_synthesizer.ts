/**
 * thought_structure_synthesizer.ts —— 思维结构合成器（39 §6）。
 *
 * 设计要点：
 *   - synthesizeFramework 产出 ResearchThoughtFramework（12 字段·非表·39 §6）。
 *   - 诚实降级：turn<3 或无意图假设 或 all confidence<0.5 时触发降级，
 *     将 DEGRADATION_PROMPT 注入 openIssues[0]（反 theater·可 grep）。
 *   - synthesizeWithDegradation 包装为 ManifestDraft（携带降级标记 + provenance）。
 *   - 不调用 LLM、不产判定节点、不进 canonicalHash（39 §0#5）。
 *   - 聚合 primaryIntent：confirmed 优先，否则按频次；空集 → open_ended_exploration。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch。
 */

import { ulid } from 'ulid';
import type {
  DialogueTurn,
  IntentHypothesis,
  IntentLabel,
  ResearchThoughtFramework,
} from './dialogue_types.ts';
import { createManifestDraft } from './manifest_draft.ts';
import type { ManifestDraft } from './manifest_draft.ts';

// ---------- 降级常量 ----------

export const MIN_TURNS_FOR_SYNTHESIS = 3;
export const MIN_CONFIDENCE_FOR_SYNTHESIS = 0.5;

export const DEGRADATION_PROMPT =
  'DEGRADATION_NOTICE: 思维结构合成触发降级——当前对话轮次不足或意图置信度过低，' +
  '合成结果不可作为判定依据，需人工复核或补充更多对话上下文。';

export const UNFALSIFIABLE_MARKER = 'UNFALSIFIABLE_FROM_DIALOGUE';

// ---------- 降级判定 ----------

export interface DegradationAssessment {
  readonly degraded: boolean;
  readonly reason: string | null;
}

export function shouldDegrade(
  turns: readonly DialogueTurn[],
  hypotheses: readonly IntentHypothesis[],
): DegradationAssessment {
  if (turns.length < MIN_TURNS_FOR_SYNTHESIS) {
    return {
      degraded: true,
      reason: `insufficient_turns: have ${turns.length}, need >= ${MIN_TURNS_FOR_SYNTHESIS}`,
    };
  }
  if (hypotheses.length === 0) {
    return {
      degraded: true,
      reason: 'no_intent_hypotheses: cannot synthesize framework without intent hypotheses',
    };
  }
  const allBelowThreshold = hypotheses.every(
    (h) => h.confidence < MIN_CONFIDENCE_FOR_SYNTHESIS,
  );
  if (allBelowThreshold) {
    return {
      degraded: true,
      reason: `all_confidence_below_threshold: every hypothesis confidence < ${MIN_CONFIDENCE_FOR_SYNTHESIS}`,
    };
  }
  return { degraded: false, reason: null };
}

// ---------- primaryIntent 聚合 ----------

export function aggregatePrimaryIntent(
  hypotheses: readonly IntentHypothesis[],
): IntentLabel {
  if (hypotheses.length === 0) {
    return 'open_ended_exploration';
  }
  const confirmed = hypotheses.find((h) => h.status === 'confirmed');
  if (confirmed !== undefined) {
    return confirmed.intentLabel;
  }
  const frequency = new Map<IntentLabel, number>();
  for (const h of hypotheses) {
    frequency.set(h.intentLabel, (frequency.get(h.intentLabel) ?? 0) + 1);
  }
  let bestLabel: IntentLabel | undefined = undefined;
  let bestCount = 0;
  for (const [label, count] of frequency) {
    if (bestLabel === undefined || count > bestCount) {
      bestLabel = label;
      bestCount = count;
    }
  }
  return bestLabel ?? 'open_ended_exploration';
}

// ---------- ThoughtStructureSynthesizer 接口 ----------

export interface ThoughtStructureSynthesizer {
  synthesizeFramework(input: {
    readonly sessionId: string;
    readonly turns: readonly DialogueTurn[];
    readonly hypotheses: readonly IntentHypothesis[];
  }): ResearchThoughtFramework;
  synthesizeWithDegradation(input: {
    readonly sessionId: string;
    readonly turns: readonly DialogueTurn[];
    readonly hypotheses: readonly IntentHypothesis[];
  }): ManifestDraft;
}

// ---------- 内部派生函数 ----------

function deriveFalsifiableAngle(primaryIntent: IntentLabel): string {
  if (primaryIntent === 'open_ended_exploration') {
    return UNFALSIFIABLE_MARKER;
  }
  return `falsifiable_angle_derived_from_${primaryIntent}`;
}

function deriveResearchQuestion(turns: readonly DialogueTurn[]): string {
  for (const turn of turns) {
    if (turn.role === 'user') {
      return turn.content;
    }
  }
  const first = turns[0];
  return first !== undefined ? first.content : '';
}

// ---------- 合成实现 ----------

function synthesizeFramework(input: {
  readonly sessionId: string;
  readonly turns: readonly DialogueTurn[];
  readonly hypotheses: readonly IntentHypothesis[];
}): ResearchThoughtFramework {
  if (input.turns.length === 0) {
    throw new Error('synthesizeFramework: turns must not be empty (provenance required)');
  }
  const assessment = shouldDegrade(input.turns, input.hypotheses);
  const primaryIntent = aggregatePrimaryIntent(input.hypotheses);
  const openIssues: string[] = [];
  if (assessment.degraded) {
    openIssues.push(DEGRADATION_PROMPT);
  }
  return {
    frameworkId: ulid(),
    primaryIntent,
    researchQuestion: deriveResearchQuestion(input.turns),
    falsifiableAngle: deriveFalsifiableAngle(primaryIntent),
    keyVariables: [],
    dataDescription: '',
    constraints: [],
    proposedBaselines: [],
    proposedMetrics: [],
    openIssues,
    linkedDialogueTurnIds: input.turns.map((t) => t.turnId),
    synthesizedAt: new Date().toISOString(),
  };
}

function synthesizeWithDegradation(input: {
  readonly sessionId: string;
  readonly turns: readonly DialogueTurn[];
  readonly hypotheses: readonly IntentHypothesis[];
}): ManifestDraft {
  const framework = synthesizeFramework(input);
  const assessment = shouldDegrade(input.turns, input.hypotheses);
  return createManifestDraft({
    framework,
    degraded: assessment.degraded,
    degradationReason: assessment.reason,
    sourceSessionId: input.sessionId,
  });
}

// ---------- 工厂函数 ----------

export function createThoughtStructureSynthesizer(): ThoughtStructureSynthesizer {
  return {
    synthesizeFramework(input) {
      return synthesizeFramework(input);
    },
    synthesizeWithDegradation(input) {
      return synthesizeWithDegradation(input);
    },
  };
}
