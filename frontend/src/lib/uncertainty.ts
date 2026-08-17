// frontend/src/lib/uncertainty.ts
// 职责：不确定性易理解但不失真（UX-UNCERTAINTY-001）—— schema + 误导措辞审查 + 披露文案 SSOT。
//
// 三件事：
//   1. UncertaintyKind 分类学（为什么不确定）——每种「已知道什么/还不知道什么/如何减少」三段式；
//   2. MISLEADING_PHRASES 确定性扫描——科学文案不得断言 5 值裁决系统之外的确定性
//      （"证明/保证/毋庸置疑"——裁决系统只能说支持/反驳/不确定，不能说证明）；
//   3. describeVerdictUncertainty：非决定性裁决（INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED）
//      → 结构化披露。CONFIRMED/REFUTED 是确定性裁决，不携带不确定性披露（返回 null）。
//
// 诚实边界：本模块是机器可测子集（schema/措辞/覆盖）；「真实用户理解度」属 UX-UNCERTAINTY
// 的人工/可用性测试部分（T1），不在此冒充。
// 措辞审查不能证明的：语义正确的完整覆盖——只扫已知误导短语，新话术需人工 review 后入表。

import { z } from 'zod';
import type { VerdictValue } from '@/lib/types';

// ---------------------------------------------------------------------------
// 分类学 schema
// ---------------------------------------------------------------------------

export const UNCERTAINTY_KINDS = [
  'insufficient_evidence',
  'conflicting_evidence',
  'scope_limited',
  'not_run',
  'statistical_noise',
] as const;
export type UncertaintyKind = (typeof UNCERTAINTY_KINDS)[number];

export const UncertaintyDisclosureSchema = z.object({
  kind: z.enum(UNCERTAINTY_KINDS),
  /** 该裁决下已确立的事实（不说「什么都不知道」）。 */
  whatIsKnown: z.string().min(1),
  /** 尚未确立的事实（具体，不泛化）。 */
  whatIsUnknown: z.string().min(1),
  /** 减少该不确定性的下一步（可执行）。 */
  nextStep: z.string().min(1),
});
export type UncertaintyDisclosure = z.infer<typeof UncertaintyDisclosureSchema>;

/** 每种不确定性的披露模板（SSOT——组件只消费，不得自造文案）。 */
export const UNCERTAINTY_TEMPLATES: Readonly<Record<UncertaintyKind, UncertaintyDisclosure>> = {
  insufficient_evidence: {
    kind: 'insufficient_evidence',
    whatIsKnown: 'the claim was checked and the available evidence did not reach the decision threshold',
    whatIsUnknown: 'whether additional evidence would flip the verdict either way',
    nextStep: 'add independent evidence (replication, new data, or another check) and re-verify',
  },
  conflicting_evidence: {
    kind: 'conflicting_evidence',
    whatIsKnown: 'at least two checks disagree on this claim',
    whatIsUnknown: 'which conflicting check reflects reality',
    nextStep: 'inspect the conflicting checks and re-run with corrected inputs or tighter scope',
  },
  scope_limited: {
    kind: 'scope_limited',
    whatIsKnown: 'the verdict holds only within the narrowed scope actually verified',
    whatIsUnknown: 'whether the claim holds outside that scope',
    nextStep: 're-verify the claim at the original scope with sufficient evidence',
  },
  not_run: {
    kind: 'not_run',
    whatIsKnown: 'nothing — this claim has not been evaluated yet',
    whatIsUnknown: 'everything about the claim\'s truth value',
    nextStep: 'run the verification pipeline on this claim',
  },
  statistical_noise: {
    kind: 'statistical_noise',
    whatIsKnown: 'the measured signal is within the noise band of the statistical test',
    whatIsUnknown: 'whether a true effect exists beneath the noise',
    nextStep: 'increase sample size or measurement precision and re-run',
  },
};

// ---------------------------------------------------------------------------
// 误导措辞审查（确定性扫描）
// ---------------------------------------------------------------------------

/**
 * 裁决系统之外的确定性断言（科学只能支持/反驳，不能「证明」）。
 * 注意：5 值裁决枚举标签（Confirmed/Inconclusive/…）是系统词汇，不在误导表——
 * 扫描目标是对用户的解释文案，不是枚举名。
 */
export const MISLEADING_PHRASES: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  { pattern: /\bproves?\b/i, why: 'science supports or refutes; it does not prove' },
  { pattern: /\bproven\b/i, why: 'science supports or refutes; it does not prove' },
  { pattern: /\bguarantees?\b/i, why: 'verification outcomes carry no guarantee' },
  { pattern: /\birrefutable\b/i, why: 'evidence can always be revisited; nothing is irrefutable' },
  { pattern: /\bbeyond (?:a )?doubt\b/i, why: 'verdicts are threshold decisions, not certainty claims' },
  { pattern: /\b100% (?:accurate|certain|sure)\b/i, why: 'no verification pipeline is 100% accurate' },
  { pattern: /证明/, why: '「证明」超出支持/反驳词汇——验证只能支持或反驳，不能证明' },
  { pattern: /保证/, why: '验证结论不附带保证' },
  { pattern: /毋庸置疑/, why: '裁决是阈值判定，不是无可置疑的断言' },
];

export interface WordingViolation {
  readonly phrase: string;
  readonly why: string;
}

/** 扫描用户向文案；命中误导短语即违规（确定性：同一文本同一结果）。 */
export function reviewWording(text: string): WordingViolation[] {
  const violations: WordingViolation[] = [];
  for (const { pattern, why } of MISLEADING_PHRASES) {
    const match = pattern.exec(text);
    if (match !== null) {
      violations.push({ phrase: match[0], why });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// 裁决 → 披露
// ---------------------------------------------------------------------------

/**
 * 非决定性裁决 → 结构化不确定性披露。
 * INCONCLUSIVE → insufficient_evidence（默认语义；conflicting 情形由 check 明细表达）；
 * DEGRADED_SCOPE → scope_limited；UNTESTED → not_run。
 * CONFIRMED/REFUTED → null（确定性裁决，无不确定性披露面）。
 */
export function describeVerdictUncertainty(verdict: VerdictValue): UncertaintyDisclosure | null {
  switch (verdict) {
    case 'INCONCLUSIVE':
      return UNCERTAINTY_TEMPLATES.insufficient_evidence;
    case 'DEGRADED_SCOPE':
      return UNCERTAINTY_TEMPLATES.scope_limited;
    case 'UNTESTED':
      return UNCERTAINTY_TEMPLATES.not_run;
    case 'CONFIRMED':
    case 'REFUTED':
      return null;
  }
}

/** 披露渲染为一行可读文本（组件统一使用——同源防脱钩）。 */
export function renderUncertaintyNote(d: UncertaintyDisclosure): string {
  return `Known: ${d.whatIsKnown}. Unknown: ${d.whatIsUnknown}. To reduce: ${d.nextStep}.`;
}
