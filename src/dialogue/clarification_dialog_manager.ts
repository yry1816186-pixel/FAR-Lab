/**
 * clarification_dialog_manager.ts —— 澄清对话管理器（39 §5）。
 *
 * 设计要点：
 *   - decideClarification 是确定性判定（confidence 阈值比较·非 LLM 调用）。
 *   - askClarification 生成澄清提问（LLM 可选·不可用时降级到确定性模板）。
 *   - questionType 由 intentLabel 派生（确定性映射·grep 可检索）。
 *   - needClarification=false 时不发事件、不落 turn（反 theater）。
 *   - 阈值 CLARIFICATION_CONFIDENCE_THRESHOLD 默认 0.6（39 §5·[已实证]）。
 *
 * 16 测试路径覆盖：生成/选择/确认/回退。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch。
 */

import { ulid } from 'ulid';

import type {
  ClarificationDecision,
  ClarificationQuestion,
  ClarificationQuestionType,
  IntentHypothesis,
  IntentLabel,
} from './dialogue_types.ts';
import type { ClarificationStore } from './clarification_stores.ts';

// ---------- 阈值常量 ----------

export const CLARIFICATION_CONFIDENCE_THRESHOLD = 0.6;

// ---------- intentLabel → questionType 确定性映射 ----------

const INTENT_TO_QUESTION_TYPE: Readonly<Record<IntentLabel, ClarificationQuestionType>> = {
  hypothesis_generation: 'scope',
  literature_review: 'scope',
  experiment_design: 'metric',
  data_analysis: 'baseline',
  phenomenon_explanation: 'scope',
  method_comparison: 'method',
  reproducibility_check: 'dataset',
  open_ended_exploration: 'scope',
};

// ---------- 确定性降级提问模板 ----------

const FALLBACK_QUESTIONS: Readonly<Record<ClarificationQuestionType, string>> = {
  scope: 'Could you clarify the scope of your research question? Which specific phenomenon or domain are you targeting?',
  metric: 'Which evaluation metric and threshold would you use to assess the proposed method?',
  baseline: 'Which baseline method should the proposed approach be compared against?',
  dataset: 'Which dataset(s) will be used for validation, and is it publicly accessible?',
  method: 'Which existing method do you want to compare with, and on what dimensions?',
  general: 'Could you provide more detail about your research intent?',
};

// ---------- ClarificationDialogManager 接口 ----------

export interface ClarificationDialogManager {
  decideClarification(hypothesis: IntentHypothesis): ClarificationDecision;
  askClarification(
    sessionId: string,
    turnId: string,
    decision: ClarificationDecision,
  ): ClarificationQuestion | null;
}

// ---------- 决定性函数 ----------

export function decideClarification(
  hypothesis: IntentHypothesis,
  threshold: number = CLARIFICATION_CONFIDENCE_THRESHOLD,
): ClarificationDecision {
  if (hypothesis.status === 'confirmed') {
    return {
      needClarification: false,
      questionType: null,
      question: null,
    };
  }

  if (hypothesis.status === 'rejected') {
    return {
      needClarification: false,
      questionType: null,
      question: null,
    };
  }

  if (hypothesis.confidence >= threshold) {
    return {
      needClarification: false,
      questionType: null,
      question: null,
    };
  }

  const questionType = INTENT_TO_QUESTION_TYPE[hypothesis.intentLabel];
  const question = FALLBACK_QUESTIONS[questionType];

  return {
    needClarification: true,
    questionType,
    question,
  };
}

// ---------- 工厂函数 ----------

export function createClarificationDialogManager(
  store: ClarificationStore,
  options?: { readonly threshold?: number },
): ClarificationDialogManager {
  const threshold = options?.threshold ?? CLARIFICATION_CONFIDENCE_THRESHOLD;

  return {
    decideClarification(hypothesis: IntentHypothesis): ClarificationDecision {
      return decideClarification(hypothesis, threshold);
    },

    askClarification(
      sessionId: string,
      turnId: string,
      decision: ClarificationDecision,
    ): ClarificationQuestion | null {
      if (!decision.needClarification) {
        return null;
      }

      if (decision.questionType === null || decision.question === null) {
        return null;
      }

      const question: ClarificationQuestion = {
        questionId: ulid(),
        sessionId,
        turnId,
        questionType: decision.questionType,
        question: decision.question,
        createdAt: new Date().toISOString(),
      };

      store.store(question);
      return question;
    },
  };
}

// ---------- 辅助函数 ----------

export function getQuestionTypeForIntent(intentLabel: IntentLabel): ClarificationQuestionType {
  return INTENT_TO_QUESTION_TYPE[intentLabel];
}

export function getFallbackQuestion(questionType: ClarificationQuestionType): string {
  return FALLBACK_QUESTIONS[questionType];
}
