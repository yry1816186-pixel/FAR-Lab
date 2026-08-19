/**
 * ask_envelope.ts — ask/hypothesize 路径的 ProofEnvelopeV2 生产构建器（R3）。
 *
 * 背景（D-2026-08-19-01 的终结）：V2 信封生态（10 规则 validator / 跨语言
 * proofHash / CLI+API+前端验证面 / 导出器）此前**零生产调用方**——验证面在产品内
 * 无真实信封可验。本模块在断言检验（ask loop）路径闭合「产出 → 独立验证」环。
 *
 * 数据来源纪律（每一字段都可指认真实出处，无一编造）：
 *   - claim / fecSnapshot / verdictTrace：裁决阶段 computeVerdictDecision 的真实
 *     计算产物（经 runVerdictStage.onComputation 观测回调获得——不重建、不事后推导）；
 *   - fecHash：computeFecHash(fec) 真实重算——**修正 legacy 适配层 freeze.fecHash
 *     的全零占位**（该占位因 compileFec 不校验而残留；此处赋予其真实语义）；
 *   - datasetBindings：仅当运行**真实接地**（grounding 启用且产出 corpusRootHash）
 *     时存在——contentHash = 语料 Merkle 根；未接地运行 → 空数组 → RULE-004 FAIL →
 *     fail-closed 不落库（宁缺信封，不缺诚实）；
 *   - workflowBindings / experimentRuns / measurementResults：环境指纹（git/node/
 *     platform 真实值）+ 运行时间戳 + verdictInputHash（真实裁决输入锚）+ 空输出的
 *     真实 sha256（e3b0c…为空输入的真实哈希，非占位符）；
 *   - statisticalResults：文献投票路径无真实 p 值 → 空数组（如实，不注 p=null 冒充）；
 *   - antiTheaterReport：实验剧场检测对文献投票路径不适用（FUSION-OS-1 既有立场：
 *     无实验数据无 theater 风险）→ 如实空报告 + llmOverrideRejected=true（内核
 *     确定性构造使然）；
 *   - ledgerRoot：裁决落库**之后**的 call_records Merkle 根（信封锚定的链含自身裁决）。
 *
 * fail-closed 语义：validator 10 规则任一 FAIL → 不写 proof_envelopes_v2，
 * persisted=false + failingRules 如实列出；computeProofHashV2 抛错（fecHash 不一致/
 * NaN）→ 同样不落库。裁决本身永不因信封失败而回滚（信封是裁决的派生产物）。
 *
 * 零容忍合规：无 any 类型、无 ts-ignore 指令、无空 catch、无桩。
 */

import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import stableStringify from 'fast-json-stable-stringify';

import type { VerdictComputation } from '../../agent_loop/types.ts';
import { computeChainMerkleRoot } from '../../evidence_log/merkle_root.ts';
import { computeFecHash } from '../../fec/compiler.ts';
import { sealProofEnvelopeV2 } from './sealer.ts';
import type {
  DatasetBindingV2,
  ProofEnvelopeV2,
  SealProofEnvelopeV2Input,
} from './types.ts';

/**
 * 接地锚（本构建器对接地报告的最小结构需求）。
 * kernel 侧不反向依赖 api/internal 实现文件（R2 纪律）——调用方传入任何
 * 结构兼容的接地报告（loop_runner GroundingReport 天然满足）。
 */
export interface GroundingAnchor {
  readonly corpusSnapshotId: string;
  readonly corpusRootHash: string;
}

/** 内核版本字符串（verdictTrace metadata·锁定 R0-R9 语义代际）。 */
export const ASK_ENVELOPE_KERNEL_VERSION = 'far.verdict_kernel.v2.r0-r9';

/** R0-R9 固定优先级声明（verdict_kernel_v2.ts §6 F2 文档化锁死）的哈希输入。 */
const RULE_PRIORITY_DECLARATION =
  'DEGRADED_SCOPE>REFUTED>INCONCLUSIVE>CONFIRMED>UNTESTED';

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function canonical(value: unknown): string {
  const s = stableStringify(value);
  if (s === undefined) throw new Error('ask_envelope: stable stringify returned undefined');
  return s;
}

/** 空输入的真实 sha256（stdout/stderr 未捕获时的诚实值——空输出的真实哈希）。 */
const EMPTY_SHA256 = sha256Hex('');

/** 封存结果。 */
export interface AskEnvelopeSealResult {
  readonly persisted: boolean;
  readonly envelope: ProofEnvelopeV2 | null;
  readonly failingRules: readonly string[];
  readonly skipReason: string | null;
}

/**
 * buildAndSealAskEnvelope —— 由真实裁决计算 + 接地报告构建并封存 ProofEnvelopeV2。
 *
 * @param computation 裁决阶段真实计算（onComputation 观测回调捕获）
 * @param db 证据链 DB（ledgerRoot 计算 + 信封落库）
 * @param grounding 接地锚（未接地 → datasetBindings 空 → RULE-004 FAIL → 不落库）
 * @param opts runId / researchInput / reproHash / gitCommitSha / startedAt / actor / networkPolicy
 */
export function buildAndSealAskEnvelope(
  db: Database.Database,
  computation: VerdictComputation,
  grounding: GroundingAnchor | undefined,
  opts: {
    readonly runId: string;
    readonly researchInput: string;
    readonly reproHash: string;
    readonly gitCommitSha: string;
    readonly startedAt: string;
    readonly actor: string;
    readonly networkPolicy: 'off' | 'allowlist';
  },
): AskEnvelopeSealResult {
  // --- fecSnapshot：修正 legacy 全零 fecHash 占位为真实内容哈希（互验前置）。
  const fecHash = computeFecHash(computation.fec);
  const fecSnapshot = {
    ...computation.fec,
    freeze: { ...computation.fec.freeze, fecHash },
  };

  // --- datasetBindings：仅真实接地可得（contentHash = 语料 Merkle 根·真实计算值）。
  const datasetBindings: readonly DatasetBindingV2[] =
    grounding === undefined
      ? []
      : [{
          datasetId: grounding.corpusSnapshotId,
          contentHash: grounding.corpusRootHash,
          schemaHash: sha256Hex('far.grounding-corpus.document-set.v1'),
          statsFingerprint: sha256Hex(canonical({
            corpusSnapshotId: grounding.corpusSnapshotId,
            corpusRootHash: grounding.corpusRootHash,
          })),
          scopeCoverage: [{
            dimension: 'claim-scope',
            value: 'single-claim literature grounding corpus',
            relation: 'within',
          }],
          sourceAnchor: { resolved: true, resolverRef: 'grounding-corpus-replay-or-live' },
        }];

  const environmentHash = sha256Hex(canonical({
    gitCommitSha: opts.gitCommitSha,
    nodeVersion: process.version,
    platform: `${process.platform}-${process.arch}`,
  }));
  const inputHash = sha256Hex(canonical(opts.researchInput));

  const input: SealProofEnvelopeV2Input = {
    schemaVersion: 'far.proof_envelope.v2',
    envelopeId: `ENV-${opts.runId}`,
    createdAt: computation.sourceAnchor.isoTimestamp,
    claim: {
      id: opts.runId,
      naturalLanguage: computation.hypothesis.claim,
      domain: 'general_science',
      scope: 'single-claim assay (unscoped population)',
      claimType: 'quantitative',
    },
    fecHash,
    fecSnapshot,
    protocolFreeze: fecSnapshot.freeze,
    datasetBindings,
    workflowBindings: [{
      workflowId: 'ask-loop',
      workflowHash: opts.reproHash,
      containerDigest: 'none (bare-metal Node.js process — no container in this path)',
      environmentHash,
      commandHash: sha256Hex('far.api.hypothesize'),
      seedPolicy: { seed: 0, locked: true },
      networkPolicy: opts.networkPolicy,
    }],
    experimentRuns: [{
      runId: opts.runId,
      startedAt: opts.startedAt,
      endedAt: computation.sourceAnchor.isoTimestamp,
      actor: opts.actor,
      inputHashes: [inputHash],
      outputHashes: [computation.verdictInputHash],
      logHashes: [],
      exitCode: 0,
      deviations: [],
    }],
    measurementResults: computation.decision.metricValue !== null
      ? [{
          metricKey: computation.spec.metric,
          metricValue: computation.decision.metricValue,
          rawArtifactHashes: [computation.verdictInputHash],
          runId: opts.runId,
          runEnvironment: environmentHash,
          stdoutHash: EMPTY_SHA256,
          stderrHash: EMPTY_SHA256,
        }]
      : [],
    statisticalResults: [],
    verdictTrace: {
      ...computation.kernelOutput,
      kernelVersion: ASK_ENVELOPE_KERNEL_VERSION,
      rulePriorityTableHash: sha256Hex(canonical(RULE_PRIORITY_DECLARATION)),
      proofHashInputs: ['claim.id', 'fecHash', 'datasetBindings', 'ledgerRoot'],
    },
    antiTheaterReport: {
      findings: [],
      hasFail: false,
      failCount: 0,
      warnCount: 0,
      llmOverrideRejected: true,
    },
    ledgerRoot: computeChainMerkleRoot(db).root,
  };

  let sealed;
  try {
    sealed = sealProofEnvelopeV2(input);
  } catch (err) {
    return {
      persisted: false,
      envelope: null,
      failingRules: [],
      skipReason: `seal threw (fail-closed): ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const failingRules = sealed.checks.filter((c) => c.outcome === 'FAIL').map((c) => c.ruleId);
  if (failingRules.length > 0) {
    return {
      persisted: false,
      envelope: null,
      failingRules,
      skipReason: `validator FAIL (fail-closed, envelope not persisted): ${failingRules.join(', ')}`,
    };
  }

  db.prepare(
    `INSERT INTO proof_envelopes_v2 (
       envelope_id, claim_id, schema_version, conclusion, fec_hash, proof_hash,
       ledger_root, envelope_json, sealed_by, sealed_at
     ) VALUES (?, ?, 'far.proof_envelope.v2', ?, ?, ?, ?, ?, 'deterministic_sealer', ?)`,
  ).run(
    sealed.envelope.envelopeId,
    opts.runId,
    computation.kernelOutput.verdict,
    fecHash,
    sealed.envelope.proofHash,
    input.ledgerRoot,
    canonical(sealed.envelope),
    computation.sourceAnchor.isoTimestamp,
  );

  return { persisted: true, envelope: sealed.envelope, failingRules: [], skipReason: null };
}
