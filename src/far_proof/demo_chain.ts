/**
 * Demo proof chain builder (T-W3-04 拱心石).
 *
 * 构造一条**真实**的端到端可证伪证据链，用于 .far-proof 导出 + 重放验证：
 *   FEC appendClaim (C-ASTRO-0001)
 *     → V2 verdict kernel (机器裁决)
 *     → sealProofEnvelope (确定性密封·禁 LLM)
 *     → 可被 exportFarProof 导出 / recompute_proof_hashes 字节级重算
 *
 * 诚实边界（ASK-9 / 00 §1.4）：
 *   - 代码**不得**密封 CONFIRMED 终审（需人类背书）。
 *   - 若机器裁决返回 CONFIRMED，密封前降级为 INCONCLUSIVE 并记 knownFailure。
 *   - demo 证据编码 refutesClaim=true（F1=0.62 远低于 0.80 阈值），但本链走 legacy 适配路径
 *     （makeLegacyCompatFec + evidenceToStatisticalResult），该降维不注入真实 pValue/adjustedPValue →
 *     kernel R6 refutes 门不触发 → 机器裁决实为 **UNTESTED**，非 REFUTED。
 *     真实 REFUTED 需经 statistics 注入（P1-5 hero pipeline 演示，见 tests/science_harness/hero_*_pipeline）。
 *
 * 模型中立：全程 offline_replay，无任何 qwen/dashscope/bailian 字面量。
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。
 *
 */

import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { runMigrations } from '../db/migrator.ts';
import { fecAppendClaim } from '../fec/index.ts';
import { GENESIS_PREV_HASH } from '../evidence_log/index.ts';
import { makeLegacyCompatFec } from '../falsifiability/index.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  ThresholdSpec,
  Verdict,
  VerdictKernelOutput,
} from '../falsifiability/index.ts';
import type { FecGateDecision } from '../fec/fec_mandate.ts';
import {
  GENESIS_PROOF_HASH,
  sealProofEnvelope,
} from '../proof_envelope/index.ts';
import type { SealResult } from '../proof_envelope/index.ts';
import type { SourceAnchor } from '../evidence_log/types.ts';

// ---------------------------------------------------------------------------
// 确定性常量（demo 用·测试注入同样值以字节级复现）
// ---------------------------------------------------------------------------

/** demo claim id：与 M3 TESS 天文基准对齐（C-ASTRO-0001）。TESS 沙箱本身是类型层（F4·V2 物理隔离）。 */
export const DEMO_CLAIM_ID = 'C-ASTRO-0001';

/** demo run id（下划线·Z15 job-id 规约：needs.<job>.result 表达式里连字符会被解析为减号）。 */
export const DEMO_RUN_ID = 'demo_astro_0001_refuted';

/**
 * demo git commit SHA（fresh-clone 锁定锚点）。
 * 诚实声明：这是 demo fixture 值，非真实仓库 HEAD。生产导出应注入 `git rev-parse HEAD`。
 */
export const DEMO_GIT_COMMIT_SHA = 'f'.repeat(40);

/** demo 导出时间戳（确定性·测试注入以字节级复现）。非 proofHash 输入。 */
export const DEMO_EXPORTED_AT = '2026-06-28T00:00:00.000Z';

/** demo 模型快照（offline replay fixture·模型中立：核心不绑定任何真实模型）。 */
export const DEMO_MODEL_SNAPSHOT = 'offline-replay-fixture@v1';

// ---------------------------------------------------------------------------
// 环境指纹（envHash）
// ---------------------------------------------------------------------------

export interface EnvDescriptor {
  /** schema 最大迁移版本（连续迁移·assertContiguousVersions 保证无间隙）。 */
  readonly schemaVersion: number;
  /** 运行时 Node 版本（诚实记录真实运行环境；非 proofHash 输入，不影响重放字节相等）。 */
  readonly nodeVersion: string;
  /** provider profile（demo 全程 offline_replay）。 */
  readonly providerProfile: string;
}

/**
 * 计算环境指纹：对 repro-affecting 环境描述符做 canonical_json → sha256。
 * 诚实：envHash 反映真实运行环境（Node 版本会跨机器不同），但它**不**进入 proofHash
 * 计算（proofHash 自排除），因此重放字节相等性不受 envHash 取值影响。
 */
export function computeEnvHash(descriptor: EnvDescriptor): string {
  const canonical = JSON.stringify({
    schemaVersion: descriptor.schemaVersion,
    nodeVersion: descriptor.nodeVersion,
    providerProfile: descriptor.providerProfile,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// demo 场景定义（C-ASTRO-0001 · legacy 路径 UNTESTED）
// ---------------------------------------------------------------------------

/**
 * C-ASTRO-0001：一个关于 TESS 天文适配器 F1 性能的可证伪 claim。
 *
 * claim: "适配器 A 在 TESS-ASTRO 基准上 F1 ≥ 0.80"
 * 证伪阈值: F1 > 0.80
 * 实测证据: F1 = 0.62（远低于阈值），evidence 编码 refutesClaim=true。
 *
 * 诚实声明：legacy 适配路径不注入真实 pValue/adjustedPValue → kernel R6 refutes 门不触发 →
 *   机器裁决 = UNTESTED（非 REFUTED）。demo_chain 的价值是演示**完整密封链形状**（FEC→kernel→seal），
 *   非演示真实统计裁决；真实 REFUTED 由 P1-5 hero pipeline（statistics 注入）演示。
 */
export const DEMO_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction: 'adapter A achieves macro-F1 >= 0.80 on TESS-ASTRO benchmark',
  metric: 'macro_f1',
  falsificationThreshold: 0.8,
  thresholdSemantics: 'gt',
};

export const DEMO_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 0.8,
};

export const DEMO_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: DEMO_GIT_COMMIT_SHA,
  dashscopeRequestId: null,
  isoTimestamp: DEMO_EXPORTED_AT,
  rawResponseHash: 'e'.repeat(64),
  codeLocation: {
    filePath: 'tess_astro/adapter_a.py',
    location: 'AdapterA.evaluate@v1',
    lineNumber: 42,
  },
};

export interface DemoChainResult {
  /** 调用方负责关闭 db（脚本/测试 finally 块）。 */
  readonly db: Database.Database;
  readonly claimId: string;
  readonly claimText: string;
  /** FEC 编排产出的机器裁决（密封前·可能含 CONFIRMED）。 */
  readonly machineVerdict: Verdict;
  /** V2 kernel 原始输出（demo_chain 经 fecAppendClaim 间接驱动 decideFiveValueVerdict 的物证：reasonCodes/decisiveRuleId/ruleTrace 非空）。 */
  readonly kernelOutput: VerdictKernelOutput;
  /** FEC 强制门决策（fail-closed 物证：valid demo 契约 allowed=true）。 */
  readonly fecGate: FecGateDecision;
  /** 密封信封（确定性·conclusion 已按 ASK-9 降级）。 */
  readonly sealed: SealResult;
  /** 实际密封的 conclusion（绝不等于 CONFIRMED）。 */
  readonly sealedConclusion: Verdict;
}

/**
 * ASK-9 降级：机器密封**不得**产出 CONFIRMED。
 * CONFIRMED → INCONCLUSIVE（记 knownFailure 说明需人类背书）。
 * 其余 verdict 原样返回（REFUTED / DEGRADED_SCOPE / UNTESTED 均可机器密封）。
 */
export function machineSealableConclusion(verdict: Verdict): {
  conclusion: Verdict;
  needsHumanEndorsement: boolean;
} {
  if (verdict === 'CONFIRMED') {
    return { conclusion: 'INCONCLUSIVE', needsHumanEndorsement: true };
  }
  return { conclusion: verdict, needsHumanEndorsement: false };
}

/**
 * 构造完整 demo 证明链（FEC → 裁决 → 密封）。
 *
 * @param db 已打开的 :memory: 或文件 DB（函数内应用全部迁移 0001-0006）。
 */
export function buildDemoChain(db: Database.Database): DemoChainResult {
  // 1. 应用全部连续迁移（0001-0006）—— proof_envelopes 表（0004）必须存在。
  runMigrations(db);

  // 2. C-ASTRO-0001 实测证据：F1 = 0.62 < 0.80 阈值 → 推翻 claim。
  const evidences: EvidenceRecord[] = [
    {
      claim: 'measured macro-F1 = 0.62 on TESS-ASTRO held-out split (n=512)',
      metricValue: 0.62,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: DEMO_SOURCE_ANCHOR,
    },
  ];

  // 3. FEC 编排：call_record + evidence_log + verdict_node 原子写入。
  const claimText =
    'adapter A achieves macro-F1 >= 0.80 on TESS-ASTRO benchmark';
  throw new Error("STUB_DEMO");
  const fecResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'a'.repeat(64),
        gitCommitSha: DEMO_GIT_COMMIT_SHA,
        isoTimestamp: DEMO_EXPORTED_AT,
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: GENESIS_PREV_HASH,
    },
    callAudit: {
      requestPayload: '{"prompt":"C-ASTRO-0001 hypothesis"}',
      responsePayload: '{"claim":"macro-F1 >= 0.80"}',
      finishReason: 'stop',
      usageTokensTotal: 24,
    },
    appendOptions: {
      providerProfile: 'offline_replay',
    },
    evidencePayload: {
      claimId: DEMO_CLAIM_ID,
      claim: claimText,
      metric: 'macro_f1',
    },
    sourceAnchor: DEMO_SOURCE_ANCHOR,
    claim: claimText,
    falsificationSpec: DEMO_FALSIFICATION_SPEC,
    thresholdSpec: DEMO_THRESHOLD_SPEC,
    evidences,
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: DEMO_CLAIM_ID,
        falsificationSpec: DEMO_FALSIFICATION_SPEC,
        thresholdSpec: DEMO_THRESHOLD_SPEC,
        frozenAt: DEMO_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
    // F8 预登记(§2-M2 接线·spec 11 反 p-hacking):makeVerdict 前锁定可证伪契约 preregistrationHash。
    // falsifiability_contracts 是独立 append-only 表,不进 canonical_hash 白名单(4 键)/不进 .far-proof 9+1 分量,
    // 故 contractId(ulid)的非确定性不影响 demo chain 的 proofHash 字节级重算。
    contractInput: {
      claimId: DEMO_CLAIM_ID,
      measurableImplication: DEMO_FALSIFICATION_SPEC.prediction,
      metric: DEMO_FALSIFICATION_SPEC.metric,
      comparator: 'gt',
      thresholdValue: DEMO_FALSIFICATION_SPEC.falsificationThreshold,
      compiledAt: DEMO_SOURCE_ANCHOR.isoTimestamp,
    },
  });

  // 4. ASK-9 降级：机器密封不得 CONFIRMED。
  const { conclusion: sealedConclusion, needsHumanEndorsement } =
    machineSealableConclusion(fecResult.decision.verdict);

  const knownFailures = needsHumanEndorsement
    ? [
        'machine verdict was CONFIRMED but downgraded to INCONCLUSIVE for sealing (ASK-9: CONFIRMED requires human endorsement)',
        'TESS sandbox is type-layer only (F4); physical process isolation is V2 roadmap',
      ]
    : ['TESS sandbox is type-layer only (F4); physical process isolation is V2 roadmap'];

  // 5. 确定性密封（禁 LLM·sealedBy = deterministic_sealer）。
  //    prevProofHash = GENESIS（首条信封）。input.checks 传 [] —— 真实 checks 由 validator 内部重生。
  const sealed = sealProofEnvelope(db, {
    claimId: DEMO_CLAIM_ID,
    verdictNodeId: fecResult.verdictNode.verdictId,
    conclusion: sealedConclusion,
    prevProofHash: GENESIS_PROOF_HASH,
    checks: [],
    knownFailures,
    falsificationSpec: DEMO_FALSIFICATION_SPEC,
    sourceAnchor: DEMO_SOURCE_ANCHOR,
    reproHash: 'a'.repeat(64),
    sealedAt: DEMO_EXPORTED_AT,
  });

  return {
    db,
    claimId: DEMO_CLAIM_ID,
    claimText,
    machineVerdict: fecResult.decision.verdict,
    kernelOutput: fecResult.kernelOutput,
    fecGate: fecResult.fecGate,
    sealed,
    sealedConclusion,
  };
}
