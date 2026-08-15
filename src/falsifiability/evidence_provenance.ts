/**
 * evidence_provenance —— T-003 · Evidence provenance hash binding（fail-closed 校验器）。
 *
 * F-2-005 / T-003 修复：
 *   反剧场最深的洞——"系统无法区分真算出来的 metricValue 和编的 metricValue"。
 *   demo seed 本身就是"手工注入值恰好满足阈值的合法版本"——若第三方问"你怎么证明
 *   这个 0.71 TM-score 是从 CASP15 真算的而不是手填的"，系统原答不出。
 *
 * 修复机制（V1 边界·诚实登记）：
 *   - EvidenceRecord 新增 `executionProvenanceHash?: string`（可选·向后兼容）；
 *   - 本模块提供 `assertPrimaryEvidenceProvenanceBound` fail-closed 校验器：
 *     当 FEC 要求 `requireExecutionProvenance: true` 时，primary 证据缺失 hash → 抛错；
 *   - V1 默认 `requireExecutionProvenance: false`（不破坏现有 demo seed）；
 *   - V2 计划：所有真实研究路径 FEC 强制开启，届时无 hash 的 metricValue 一律 fail-closed。
 *
 * 这不是 anti-theater detector（不进 20-detector 列表·不进 proofHash），
 * 而是裁决前的**前置 fail-closed 闸**——比 detector 更严，直接拒绝裁决而非降级。
 *
 * 模型中立（F3/C1）。零容忍合规：无 any / @ts-ignore / 空 catch / 桩。
 */

import { createHash } from 'node:crypto';
import type { EvidenceRecord } from './types.ts';

/** 64-hex sha256 校验（与 sandbox_runner.stdoutHash/artifactTreeHash 同格式）。 */
const HEX64 = /^[0-9a-f]{64}$/;

/** fail-closed 校验选项。 */
export interface ProvenanceAssertionOptions {
  /**
   * true → 强制 primary 证据必须有 executionProvenanceHash（fail-closed）。
   * false → 不强制（V1 默认·向后兼容现有 demo seed）。
   * V2 计划：所有真实研究路径 FEC 强制 true。
   */
  readonly requireExecutionProvenance: boolean;
  /** FEC claimId（错误消息可读性·不进 hash）。 */
  readonly claimId?: string;
}

/** fail-closed 校验结果。 */
export interface ProvenanceAssertionResult {
  /** true = 通过（所有 primary 证据都有 hash，或 requireExecutionProvenance=false）；false = 拒绝。 */
  readonly ok: boolean;
  /** 未绑定 provenance hash 的 primary 证据索引列表（ok=false 时非空）。 */
  readonly unboundEvidenceIndices: readonly number[];
  /** fail-closed reasonCode（进 verdict kernel integrityFlags → R7 阻断 CONFIRMED）。 */
  readonly reasonCode: string | null;
  /** 人类可读错误消息（ok=false 时非空）。 */
  readonly error: string | null;
}

/** 标准 reasonCode（与 verdict_kernel_v2 的 reasonCodes 同命名空间）。 */
export const EVIDENCE_PROVENANCE_UNBOUND_REASON_CODE = 'EVIDENCE_PROVENANCE_UNBOUND';

/**
 * 判定一条 evidence 是否为 "primary"（其 metricValue 进入裁决阈值比较）。
 *
 * primary 定义（与 verdict kernel R6 主检验语义对齐）：
 *   supportsClaim=true 且 refutesClaim=false → 主支持证据，metricValue 必须有 provenance。
 *   refutesClaim=true → 反证证据，metricValue 不进主阈值比较（可缺 provenance，由 R6_REFUTED 处理）。
 *   两者皆 false → 无向证据（不进主裁决，可缺 provenance）。
 *
 * 这与 FEC 的 requiredEvidence[].critical=true 语义一致：只有 critical 的 primary 证据
 * 才需要 provenance 绑定（secondary/control 证据可缺，由 AT-MISSING-RAW detector 另行处理）。
 */
export function isPrimaryEvidence(evidence: EvidenceRecord): boolean {
  return evidence.supportsClaim && !evidence.refutesClaim;
}

/**
 * 校验 executionProvenanceHash 格式（64-hex sha256）。
 * @returns true = 合法 hash；false = 缺失或格式错。
 */
export function isValidExecutionProvenanceHash(hash: string | undefined): hash is string {
  return typeof hash === 'string' && HEX64.test(hash);
}

/**
 * assertPrimaryEvidenceProvenanceBound —— fail-closed 校验：primary 证据必须有 provenance hash。
 *
 * 行为契约：
 *   - requireExecutionProvenance=false → 恒 ok=true（V1 默认·不破坏 demo seed）；
 *   - requireExecutionProvenance=true：
 *     · 遍历 evidences，对每条 primary 证据（isPrimaryEvidence=true）校验 executionProvenanceHash；
 *     · 缺失或格式错（非 64-hex）→ 收集索引进 unboundEvidenceIndices；
 *     · 任一未绑定 → ok=false + reasonCode='EVIDENCE_PROVENANCE_UNBOUND' + error 消息；
 *     · 全部绑定 → ok=true。
 *
 * 用法（在 FEC orchestrator 裁决前调用）：
 * ```ts
 * const result = assertPrimaryEvidenceProvenanceBound(evidences, {
 *   requireExecutionProvenance: fec.requireExecutionProvenance ?? false,
 *   claimId: fec.claimId,
 * });
 * if (!result.ok) {
 *   // fail-closed: 拒绝裁决，返回 UNTESTED + EVIDENCE_PROVENANCE_UNBOUND
 *   // 不抛错——交 caller 决定如何降级（抛错 vs integrityFlag vs UNTESTED）。
 * }
 * ```
 *
 * 设计决策（why 不抛错而返回 result）：
 *   - caller 可能是 orchestrator（降级到 UNTESTED）或 verdict_stage（加 integrityFlag）；
 *   - 抛错会强制一种降级策略，破坏 caller 灵活性；
 *   - 返回 result 让 caller 按 FEC deviationPolicy 决定（degrade vs reject vs flag）。
 *
 * @param evidences - 待校验的证据列表
 * @param options - 校验选项（requireExecutionProvenance + claimId）
 * @returns ProvenanceAssertionResult（ok=true 通过；ok=false 拒绝，含索引/reasonCode/error）
 */
export function assertPrimaryEvidenceProvenanceBound(
  evidences: ReadonlyArray<EvidenceRecord>,
  options: ProvenanceAssertionOptions,
): ProvenanceAssertionResult {
  // V1 默认不强制（向后兼容）：requireExecutionProvenance=false → 恒通过
  if (!options.requireExecutionProvenance) {
    return {
      ok: true,
      unboundEvidenceIndices: [],
      reasonCode: null,
      error: null,
    };
  }

  const unboundIndices: number[] = [];
  for (let i = 0; i < evidences.length; i += 1) {
    const evidence = evidences[i];
    if (evidence === undefined) {
      continue;
    }
    if (!isPrimaryEvidence(evidence)) {
      // secondary/control/refutes 证据不强制 provenance（由 AT-MISSING-RAW 另行处理）
      continue;
    }
    if (!isValidExecutionProvenanceHash(evidence.executionProvenanceHash)) {
      unboundIndices.push(i);
    }
  }

  if (unboundIndices.length === 0) {
    return {
      ok: true,
      unboundEvidenceIndices: [],
      reasonCode: null,
      error: null,
    };
  }

  const claimPrefix = options.claimId !== undefined ? `[${options.claimId}] ` : '';
  return {
    ok: false,
    unboundEvidenceIndices: unboundIndices,
    reasonCode: EVIDENCE_PROVENANCE_UNBOUND_REASON_CODE,
    error:
      `${claimPrefix}EVIDENCE_PROVENANCE_UNBOUND: ${unboundIndices.length} primary evidence(s) ` +
      `at indices [${unboundIndices.join(', ')}] lack a valid executionProvenanceHash ` +
      `(64-hex sha256 from sandbox_runner.stdoutHash/artifactTreeHash). ` +
      `requireExecutionProvenance=true → fail-closed: refuse to seal verdict (metricValue could be hand-injected fixture). ` +
      `Fix: bind each primary evidence.metricValue to a sandbox execution hash via computeSandboxRunResult.`,
  };
}

/**
 * computeExecutionProvenanceHash —— 工具函数：从 sandbox stdout 计算 provenance hash。
 *
 * 提供给 research path 的便利函数：研究者跑完 sandbox 后，用此函数从 stdout 计算 hash，
 * 填入 EvidenceRecord.executionProvenanceHash。本函数不读 FS——caller 须传 stdout 字符串。
 *
 * 与 sandbox_runner.computeSandboxRunResult 的 stdoutHash 同算法（sha256Hex）。
 * 不复用 sandbox_runner 的实现是为了避免 falsifiability → science_harness 循环依赖
 * （sandbox_runner 反向依赖 falsifiability 的 ExecutionFingerprint 类型）。
 *
 * @param stdout - sandbox 执行的 stdout 字符串
 * @returns 64-hex sha256
 */
export function computeExecutionProvenanceHash(stdout: string): string {
  // 镜像 sandbox_runner.sha256Hex（不导入 sandbox_runner 避免循环依赖·同算法确定性）
  // ES module 顶层 import（lint no-require-imports 合规）
  return createHash('sha256').update(stdout, 'utf8').digest('hex');
}
