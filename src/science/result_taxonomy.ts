/**
 * science/result_taxonomy — STAT-NEGATIVE-001 负结果完整保留。
 *
 * 宪法条款的机器化：负结果分五类登记——NEGATIVE_RESULT（充分功效下的
 * 未检出，计入反证）/ NULL_RESULT（低功效未检出，不是反证）/
 * INCONCLUSIVE（无法判定）/ EXECUTION_FAILURE（执行失败，不是反证）/
 * INVALID_DESIGN（设计无效，不是反证）。执行失败或低功效被等同于反证
 * 是科学记录最常见的自伤——本 taxonomy 把「反证资格」做成每类的显式
 * 语义字段（countsAsCounterEvidence 仅 NEGATIVE_RESULT 为 true）。
 *
 * Registry（负结果登记簿）：append-only JSONL（.far 运行时区），无 GC、
 * 无删除路径——负结果的完整保留是登记簿的存在理由。每行带 entryHash
 * （canonical JSON 哈希，读回时逐行校验——篡改历史行 fail-closed 抛错）。
 *
 * 报告渲染：五类分列（空类也渲染 "none registered"——沉默缺节即可疑），
 * 显式标注「执行失败 ≠ 反证」。
 *
 * Cannot-prove：分类由「供给的运行产物字段」映射（status/effectDetected/
 * powered/designValid 的如实性由实验执行层负责）；countsAsCounterEvidence
 * 证明的是「本系统不会把执行失败/低功效送进反证聚合」，不证明 NEGATIVE_
 * RESULT 的统计功效声明本身正确（power 分析的正确性属于统计分析层）。
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import type { EpistemicTag } from '../schema/enums.ts';

// ---------------------------------------------------------------------------
// 五类 taxonomy + 反证资格语义
// ---------------------------------------------------------------------------

export const RESULT_OUTCOMES = [
  'NEGATIVE_RESULT',
  'NULL_RESULT',
  'INCONCLUSIVE',
  'EXECUTION_FAILURE',
  'INVALID_DESIGN',
] as const;
export type ResultOutcome = (typeof RESULT_OUTCOMES)[number];

export interface OutcomeSemantics {
  readonly outcome: ResultOutcome;
  /** 是否计入反证聚合（宪法：仅充分功效下的 NEGATIVE_RESULT 为 true）。 */
  readonly countsAsCounterEvidence: boolean;
  /** 对齐 EPISTEMIC_TAGS 的认知类型（INCONCLUSIVE → UNKNOWN，与裁决映射同源）。 */
  readonly epistemicTag: EpistemicTag;
  readonly description: string;
}

export const RESULT_TAXONOMY: Readonly<Record<ResultOutcome, OutcomeSemantics>> = {
  NEGATIVE_RESULT: {
    outcome: 'NEGATIVE_RESULT',
    countsAsCounterEvidence: true,
    epistemicTag: 'EVIDENCE',
    description: 'adequately-powered non-detection — counts as counter-evidence (aligns REFUTED → EVIDENCE)',
  },
  NULL_RESULT: {
    outcome: 'NULL_RESULT',
    countsAsCounterEvidence: false,
    epistemicTag: 'UNKNOWN',
    description: 'underpowered non-detection — the honest state is unknown, NOT refutation',
  },
  INCONCLUSIVE: {
    outcome: 'INCONCLUSIVE',
    countsAsCounterEvidence: false,
    epistemicTag: 'UNKNOWN',
    description: 'evidence could not discriminate the hypotheses (aligns verdict INCONCLUSIVE → UNKNOWN)',
  },
  EXECUTION_FAILURE: {
    outcome: 'EXECUTION_FAILURE',
    countsAsCounterEvidence: false,
    epistemicTag: 'UNKNOWN',
    description: 'the run failed to execute — failure of the instrument says nothing about nature',
  },
  INVALID_DESIGN: {
    outcome: 'INVALID_DESIGN',
    countsAsCounterEvidence: false,
    epistemicTag: 'UNKNOWN',
    description: 'the design cannot answer the question — no evidential content exists to preserve as counter-evidence',
  },
};

/** 与 EPISTEMIC_TAGS 的映射表（报告层直接消费；INCONCLUSIVE 与裁决映射对齐）。 */
export const RESULT_TO_EPISTEMIC_TAG: Readonly<Record<ResultOutcome, EpistemicTag>> = Object.fromEntries(
  RESULT_OUTCOMES.map((o) => [o, RESULT_TAXONOMY[o].epistemicTag]),
) as Readonly<Record<ResultOutcome, EpistemicTag>>;

// ---------------------------------------------------------------------------
// 运行产物 → 类别
// ---------------------------------------------------------------------------

export interface RunOutcome {
  readonly status: 'completed' | 'failed' | 'aborted';
  /** 是否检出效应（null = 无法判定）。 */
  readonly effectDetected: boolean | null;
  /** 统计功效是否充分（null = 未证实功效）。 */
  readonly powered: boolean | null;
  /** 设计是否有效（false = 设计无法回答问题）。 */
  readonly designValid: boolean | null;
}

export interface ClassifiedOutcome extends OutcomeSemantics {
  readonly outcome: ResultOutcome;
}

/**
 * 从运行产物映射负结果类别（确定性）。优先级：
 *   设计无效 > 执行失败 > 无法判定 > 未检出（按功效分 NEGATIVE/NULL）。
 * 阳性结果（effectDetected=true）不在负结果家族 → 返回 null（调用方不登记）。
 * powered=null 的未检出按 NULL_RESULT 处理（未证实功效不冒充反证——
 * fail-closed 诚实优先）。
 */
export function classifyResultOutcome(run: RunOutcome): ClassifiedOutcome | null {
  let outcome: ResultOutcome;
  if (run.designValid === false) {
    outcome = 'INVALID_DESIGN';
  } else if (run.status !== 'completed') {
    outcome = 'EXECUTION_FAILURE';
  } else if (run.effectDetected === null) {
    outcome = 'INCONCLUSIVE';
  } else if (run.effectDetected === true) {
    return null;
  } else if (run.powered === true) {
    outcome = 'NEGATIVE_RESULT';
  } else {
    outcome = 'NULL_RESULT';
  }
  return { ...RESULT_TAXONOMY[outcome] };
}

// ---------------------------------------------------------------------------
// Registry：append-only 登记（.far 运行时区，无 GC / 无删除路径）
// ---------------------------------------------------------------------------

/** 登记簿根目录（gitignored 运行时产物区，绝不入仓库根）。 */
export const NEGATIVE_RESULTS_ROOT = '.far/negative-results';

export interface NegativeResultEntryInput {
  readonly id: string;
  readonly claimId: string;
  readonly outcome: ResultOutcome;
  readonly detail: string;
}

export interface RegisteredNegativeResult {
  readonly id: string;
  readonly claimId: string;
  readonly outcome: ResultOutcome;
  readonly detail: string;
  readonly registeredAt: string;
  /** 覆盖除自身外的全部字段（canonical JSON 哈希——读回逐行校验）。 */
  readonly entryHash: string;
}

function registryPath(dir: string): string {
  return join(dir, 'registry.jsonl');
}

/**
 * 读取登记簿（append-only 的唯一读取路径）：逐行 parse + entryHash 校验
 * + outcome 白名单校验。任何行被篡改 → 抛错（fail-closed，绝不静默截断）。
 * 目录/文件不存在 → []（首跑语义）。
 */
export function readNegativeResults(dir: string = NEGATIVE_RESULTS_ROOT): readonly RegisteredNegativeResult[] {
  const path = registryPath(dir);
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  return lines.map((line, idx) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new Error(
        `readNegativeResults: corrupt registry line ${idx + 1} in ${path}: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(`readNegativeResults: registry line ${idx + 1} is not an object`);
    }
    const record = parsed as Record<string, unknown>;
    const { entryHash, ...core } = record;
    if (typeof entryHash !== 'string' || hashCanonicalJson(core) !== entryHash) {
      throw new Error(`readNegativeResults: entryHash mismatch on line ${idx + 1} (entry '${String(record['id'])}' tampered)`);
    }
    if (typeof record['outcome'] !== 'string' || !(RESULT_OUTCOMES as readonly string[]).includes(record['outcome'])) {
      throw new Error(`readNegativeResults: unknown outcome '${String(record['outcome'])}' on line ${idx + 1}`);
    }
    return parsed as RegisteredNegativeResult;
  });
}

/**
 * 登记一条负结果（append-only：读现有 → 防重 → 追加）。同 id 重复登记
 * 抛错（重复计数会污染报告）。registeredAt 由注入时钟产生（测试确定性）。
 */
export function registerNegativeResult(
  dir: string,
  input: NegativeResultEntryInput,
  now: () => Date = () => new Date(),
): RegisteredNegativeResult {
  const existing = readNegativeResults(dir);
  if (existing.some((r) => r.id === input.id)) {
    throw new Error(`registerNegativeResult: duplicate id '${input.id}' — the registry refuses double-counting (append-only, idempotency-guarded)`);
  }
  const core = {
    id: input.id,
    claimId: input.claimId,
    outcome: input.outcome,
    detail: input.detail,
    registeredAt: now().toISOString(),
  };
  const record: RegisteredNegativeResult = { ...core, entryHash: hashCanonicalJson(core) };
  mkdirSync(dir, { recursive: true });
  appendFileSync(registryPath(dir), `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

/**
 * 保留策略断言（STAT-NEGATIVE-001 验收面）：登记簿无 GC、无删除路径、
 * 五类皆可登记。这是模块级承诺的机器可读形式——与导出面测试（无
 * delete/gc/prune 导出）互为印证。
 */
export function negativeResultRetentionGuarantee(): {
  readonly garbageCollection: false;
  readonly deletionPaths: readonly string[];
  readonly registerableOutcomes: readonly ResultOutcome[];
  readonly rationale: string;
} {
  return {
    garbageCollection: false,
    deletionPaths: [],
    registerableOutcomes: [...RESULT_OUTCOMES],
    rationale:
      'negative results are preserved in full: the registry is append-only with no GC and no deletion path; all five classes are registrable and every report must render them',
  };
}

// ---------------------------------------------------------------------------
// 报告渲染（五类分列 + 执行失败≠反证显式标注）
// ---------------------------------------------------------------------------

/**
 * 渲染负结果报告节（markdown，纯字符串拼接）。空类渲染 "none
 * registered"——沉默缺节即可疑（负结果的消失必须是显式的不存在，不是
 * 被省略）。
 */
export function renderNegativeResultSection(entries: readonly RegisteredNegativeResult[]): string {
  const lines: string[] = [
    '## Negative Results Registry',
    '',
    '> Execution failure is NOT counter-evidence; an underpowered non-detection (NULL_RESULT) is not refutation.',
    '> Only NEGATIVE_RESULT (adequately-powered non-detection) counts as counter-evidence.',
    '',
  ];
  for (const outcome of RESULT_OUTCOMES) {
    const semantics = RESULT_TAXONOMY[outcome];
    const bucket = entries.filter((e) => e.outcome === outcome);
    lines.push(`### ${outcome}`);
    lines.push('');
    lines.push(`counts as counter-evidence: ${semantics.countsAsCounterEvidence ? 'yes' : 'no'} — ${semantics.description}`);
    lines.push('');
    if (bucket.length === 0) {
      lines.push('- none registered');
      lines.push('');
      continue;
    }
    for (const e of bucket) {
      lines.push(`- [${e.id}] ${e.claimId} — ${e.detail} (registered ${e.registeredAt})`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
