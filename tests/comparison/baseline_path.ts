// tests/comparison/baseline_path.ts
//
// Phase 3 Task 3.1 — baseline 路径构造。
//
// 绕过 FAR-Lab 三个核心防御的「裸 LLM 裁决」路径，用于对比试验：
//   1. 绕过 FEC 强制门：不调用 compileFec + enforceFecMandatoryGate
//   2. 绕过 V2 kernel：用 V1 makeVerdict（仅 supportsClaim/refutesClaim 布尔计数，无 R0-R9）
//   3. 绕过 anti-theater：V1 makeVerdict 不接受 antiTheaterReport 参数
//
// 真实依赖：V1 makeVerdict @ src/falsifiability/verdict.ts:76（真调·非 mock）
//           proofHash = sha256(canonical JSON of verdict)（node:crypto 真实重算）
//
// Authority: CLAUDE.md §1（PROGRESS = 真实依赖端到端接线成功）+ §5 红线（五值枚举固定）。

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeVerdict } from '../../src/falsifiability/verdict.ts';
import { canonicalJson } from '../../src/evidence_log/hasher.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  SourceAnchor,
  ThresholdSpec,
  VerdictResult,
} from '../../src/falsifiability/types.ts';
import type {
  FecContractV2,
  ThresholdSpec as FecThresholdSpec,
} from '../../src/fec/fec_contract.ts';
import type {
  StatisticalResult,
  VerdictKernelInput,
} from '../../src/falsifiability/verdict_kernel_v2.ts';
import type { Verdict } from '../../src/schema/enums.ts';

const CASE_DIR = fileURLToPath(new URL('../../golden_vectors/cases/', import.meta.url));

const BASELINE_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-07-11T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

export interface BaselineVerdictInput {
  readonly claim: string;
  readonly evidences: ReadonlyArray<EvidenceRecord>;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec;
}

export interface BaselineVerdictOutput {
  readonly verdict: Verdict;
  readonly scopeSlipText: string | null;
  readonly untestedReason: string | null;
  readonly conflictingEvidenceCount: number;
  readonly metricValue: number | null;
  readonly proofHash: string;
}

/**
 * runBaselineVerdict — baseline 路径入口。
 *
 * 直接调 V1 makeVerdict（src/falsifiability/verdict.ts:76），绕过 FEC 门 / V2 kernel / anti-theater。
 * proofHash = sha256(canonical JSON of verdict result) —— 真实哈希重算（node:crypto），只绕过三防御不绕过 hash。
 */
export function runBaselineVerdict(input: BaselineVerdictInput): BaselineVerdictOutput {
  const result: VerdictResult = makeVerdict({
    claim: input.claim,
    evidences: input.evidences,
    falsificationSpec: input.falsificationSpec,
    thresholdSpec: input.thresholdSpec,
  });

  const proofHash = computeBaselineProofHash(result);
  return {
    verdict: result.verdict,
    scopeSlipText: result.scopeSlipText,
    untestedReason: result.untestedReason,
    conflictingEvidenceCount: result.conflictingEvidenceCount,
    metricValue: result.metricValue,
    proofHash,
  };
}

function computeBaselineProofHash(result: VerdictResult): string {
  const payload = {
    verdict: result.verdict,
    scopeSlipText: result.scopeSlipText,
    untestedReason: result.untestedReason,
    conflictingEvidenceCount: result.conflictingEvidenceCount,
    metricValue: result.metricValue,
  };
  return createHash('sha256').update(canonicalJson(payload, 'baseline_proofHash'), 'utf8').digest('hex');
}

export interface GoldenVectorBaselineResult {
  readonly caseId: string;
  readonly scenario: string;
  readonly baselineVerdict: Verdict;
  readonly expectedVerdict: Verdict;
  readonly diverges: boolean;
}

/**
 * verifyBaselineOnGoldenVectors — 验证 baseline 路径在 GV-01..14 上能跑通。
 *
 * 将 GV kernel input 降维为 V1 EvidenceRecord[]（effectDirection → supportsClaim/refutesClaim 布尔），
 * 跑 V1 makeVerdict，返回每条 GV 的 baseline verdict vs expected verdict 对比。
 *
 * 降维规则（V1 无法表达 V2 语义）：
 *   - effectDirection='supports' → supportsClaim=true
 *   - effectDirection='refutes'  → supportsClaim=false, refutesClaim=true
 *   - effectDirection='neutral'  → supportsClaim=false, refutesClaim=true（V1 无 neutral 态·降维为 refutes）
 *   - metricValue=undefined → 跳过 evaluateThreshold 富化，保留原始布尔（防 threshold 覆盖攻击语义）
 */
export function verifyBaselineOnGoldenVectors(): readonly GoldenVectorBaselineResult[] {
  const files = readdirSync(CASE_DIR)
    .filter((file) => /^GV-\d+\.json$/.test(file))
    .sort();

  const results: GoldenVectorBaselineResult[] = [];
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(CASE_DIR, file), 'utf8'));
    const caseId = parsed.caseId as string;
    const scenario = parsed.scenario as string;
    const kernel = parsed.input.kernel as VerdictKernelInput;
    const expectedVerdict = parsed.expected.verdict as Verdict;

    const baselineInput = kernelInputToBaseline(kernel, caseId);
    const output = runBaselineVerdict(baselineInput);
    results.push({
      caseId,
      scenario,
      baselineVerdict: output.verdict,
      expectedVerdict,
      diverges: output.verdict !== expectedVerdict,
    });
  }
  return results;
}

export function kernelInputToBaseline(
  kernel: VerdictKernelInput,
  caseId: string,
): BaselineVerdictInput {
  const fec = kernel.fec;
  const claim = fec !== null ? fec.measurableImplication : `claim-${caseId}`;
  const falsificationSpec = fecToBaselineFalsificationSpec(fec, claim);
  const thresholdSpec = fecToBaselineThresholdSpec(fec);
  const evidences = statisticsToBaselineEvidences(kernel.statistics, claim);
  return { claim, evidences, falsificationSpec, thresholdSpec };
}

function fecToBaselineFalsificationSpec(fec: FecContractV2 | null, claim: string): FalsificationSpec {
  if (fec === null) {
    return {
      prediction: claim,
      metric: 'placeholder',
      falsificationThreshold: 0,
      thresholdSemantics: 'gt',
    };
  }
  return {
    prediction: claim,
    metric: fec.metric.metricKey,
    falsificationThreshold: fec.threshold.value,
    thresholdSemantics: mapFecSemanticsToBaseline(fec.threshold.thresholdSemantics),
  };
}

function fecToBaselineThresholdSpec(fec: FecContractV2 | null): ThresholdSpec {
  if (fec === null) {
    return { semantics: 'gt', value: 0 };
  }
  const ts = fec.threshold;
  if (ts.thresholdSemantics === 'range') {
    return {
      semantics: 'range',
      lower: ts.value,
      upper: ts.rangeUpper ?? ts.value,
    };
  }
  return {
    semantics: mapFecSemanticsToBaseline(ts.thresholdSemantics),
    value: ts.value,
  };
}

function mapFecSemanticsToBaseline(sem: FecThresholdSpec['thresholdSemantics']): 'gt' | 'lt' {
  // V1 ThresholdSemantics 只支持 gt/lt/range；FEC 的 eq/ne 降维为 gt（V1 无法表达等值判定）。
  if (sem === 'lt') return 'lt';
  return 'gt';
}

function statisticsToBaselineEvidences(
  statistics: readonly StatisticalResult[],
  claim: string,
): EvidenceRecord[] {
  if (statistics.length === 0) {
    return [];
  }
  return statistics.map((stat, index) => {
    // V1 无 neutral 态：neutral 降维为 refutes（不支持即反证·V1 的布尔二元模型）。
    const supportsClaim = stat.effectDirection === 'supports';
    const refutesClaim = !supportsClaim;
    return {
      claim: `${claim} — evidence ${index + 1} (${stat.testId})`,
      // metricValue 故意缺省 → 跳过 evaluateThreshold 富化，保留原始布尔（防 threshold 覆盖攻击语义）
      supportsClaim,
      refutesClaim,
      scopeNarrowerThanClaim: false,
      sourceAnchor: BASELINE_SOURCE_ANCHOR,
    };
  });
}
