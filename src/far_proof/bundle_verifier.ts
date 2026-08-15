/**
 * V1 .far-proof bundle verifier.
 *
 * Verifies the project-self-verifiable offline bundle format exported by
 * src/far_proof/exporter.ts: required files, redacted call_records hash chain,
 * and V1 ProofEnvelope proofHash recomputation.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { canonicalHash } from '../evidence_log/hasher.ts';
import { ALLOWED_TRANSITIONS, computeEventHash, type LifecycleState, type LifecycleTargetKind } from '../evidence_log/lifecycle.ts';
import { rowToCallRecord } from '../evidence_log/repository.ts';
import { GENESIS_PREV_HASH, type CallRecordHashRow } from '../evidence_log/types.ts';
import { computeProofHash } from '../proof_envelope/proof_hash.ts';
import { dispatchRulesetVerifier } from '../proof_envelope/ruleset_version.ts';
import { GENESIS_PROOF_HASH, type CheckOutcome, type ProofCheckResult, type ProofEnvelope } from '../proof_envelope/types.ts';
import type { FalsificationSpec, Verdict } from '../falsifiability/types.ts';
import { verifyFarProofPackageIntegrity, FAR_PROOF_INTEGRITY_FILE } from './integrity_check.ts';
import { verifyCallRecordExportAnchor } from '../evidence_log/verifier.ts';
import { verifyBundleSignature, type BundleSignatureResult } from './bundle_signature.ts';
import { computeEnvFingerprint, compareEnvFingerprint, type EnvFingerprint } from './env_fingerprint.ts';

/** V1 .far-proof bundle 所需文件白名单（full 模式必须全部存在）。 */
export const FAR_PROOF_REQUIRED_FILES = [
  'ro-crate-metadata.json',
  'prov.ttl',
  'proof_envelopes.jsonl',
  'repro_runs.jsonl',
  'call_records.redacted.jsonl',
  'claim_graph.json',
  'otel-trace.jsonl',
  'data_manifest.json',
  'README_REPLAY.md',
  'code/MANIFEST.md',
] as const;

/** Bundle 验证模式：'chain' 仅验 call_records 哈希链，'envelope' 仅验 proof_envelopes，'full' 全量验证。 */
export type FarProofBundleVerifyMode = 'chain' | 'envelope' | 'full';

interface RawEnvelopeRow {
  readonly envelope_id: string;
  readonly claim_id: string;
  readonly verdict_node_id: string;
  readonly conclusion: string;
  readonly proof_hash: string;
  readonly prev_proof_hash: string;
  readonly checks: string;
  readonly known_failures: string;
  readonly falsification_spec: string;
  readonly source_anchor: string;
  readonly repro_hash: string;
  /** IC-01 · migration 0019:legacy 包无此列/为 NULL → 按 v1 默认派发 */
  readonly ruleset_uri?: string | null;
  readonly sealed_by: string;
  readonly sealed_at: string;
  readonly created_at: string;
}

interface RedactedCallRecordRow extends CallRecordHashRow {
  readonly finish_reason?: string | null;
  readonly usage_tokens_total?: number | null;
}

/** 信封 proofHash 重算不匹配详情：信封 ID、存储值与重算值。 */
export interface ProofEnvelopeMismatch {
  readonly envelopeId: string;
  readonly expected: string;
  readonly actual: string;
}

/** call_records.redacted.jsonl 哈希链验证结果：是否通过、已验证条数、断裂位置与期望/实际哈希。 */
export interface BundleChainResult {
  readonly ok: boolean;
  readonly verifiedCount: number;
  readonly brokenAtSeq: number | null;
  readonly expectedHash: string | null;
  readonly actualHash: string | null;
  readonly chainHead: string | null;
}

/** .far-proof bundle 全模式验证结果聚合：必选文件、信封校验、哈希链、生命周期、完整性、DB 锚比对。 */
export interface BundleVerifyResult {
  readonly ok: boolean;
  readonly bundlePath: string;
  readonly mode: FarProofBundleVerifyMode;
  readonly requiredFilesPresent: boolean;
  readonly missingFiles: readonly string[];
  readonly proofEnvelopeRan: boolean;
  readonly proofEnvelopeOk: boolean;
  readonly proofEnvelopeCount: number;
  readonly proofEnvelopeMismatches: readonly ProofEnvelopeMismatch[];
  readonly chainRan: boolean;
  readonly chain: BundleChainResult;
  /** Ed25519 bundle 签名维度（DEF-18 一致伪造收窄·additive：无 sidecar 则 skipped）。 */
  readonly signature: BundleSignatureResult;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * 验证 .far-proof bundle 的完整性：必选文件存在性、proof_envelopes proofHash 重算、
 * call_records 哈希链、lifecycle_events 事件链、integrity.json 全分量 SHA-256 清单、
 * 可选 DB↔导出锚交叉比对。
 *
 * @param bundlePath bundle 根目录路径。
 * @param mode 验证模式（'chain' | 'envelope' | 'full'，默认 'full'）。
 * @param options.dbAnchor 可选：持有证据库 DB 时进行 DB↔导出锚交叉校验（DEF-18）。
 * @returns 聚合验证结果，ok=true 表示所有检查通过。
 */
export function verifyFarProofBundle(
  bundlePath: string,
  mode: FarProofBundleVerifyMode = 'full',
  options: { readonly dbAnchor?: Database.Database; readonly expectedPubKeyPem?: string } = {},
): BundleVerifyResult {
  const requiredFiles = requiredFilesForMode(mode);
  const missingFiles = requiredFiles.filter((file) => !existsSync(join(bundlePath, file)));
  const errors: string[] = missingFiles.map((file) => `MISSING_REQUIRED_FILE: ${file}`);
  const warnings: string[] = [];

  let proofEnvelopeCount = 0;
  let proofEnvelopeRan = false;
  let proofEnvelopeOk = false;
  let proofEnvelopeMismatches: readonly ProofEnvelopeMismatch[] = [];
  if (mode !== 'chain' && !missingFiles.includes('proof_envelopes.jsonl')) {
    proofEnvelopeRan = true;
    try {
      const proofResult = verifyProofEnvelopeJsonl(join(bundlePath, 'proof_envelopes.jsonl'));
      proofEnvelopeCount = proofResult.checked;
      proofEnvelopeMismatches = proofResult.mismatches;
      proofEnvelopeOk = proofEnvelopeMismatches.length === 0 && proofResult.linkageErrors.length === 0;
      for (const mismatch of proofEnvelopeMismatches) {
        errors.push(
          `PROOF_HASH_MISMATCH: ${mismatch.envelopeId} expected=${mismatch.expected.slice(0, 16)} actual=${mismatch.actual.slice(0, 16)}`,
        );
      }
      for (const linkageError of proofResult.linkageErrors) {
        errors.push(linkageError);
      }
    } catch (error) {
      errors.push(`PROOF_ENVELOPES_UNREADABLE: ${errorMessage(error)}`);
    }
  }

  let chain: BundleChainResult = emptyChainResult();
  let chainRan = false;
  if (mode !== 'envelope' && !missingFiles.includes('call_records.redacted.jsonl')) {
    chainRan = true;
    try {
      chain = verifyRedactedCallRecordsJsonl(join(bundlePath, 'call_records.redacted.jsonl'));
      if (!chain.ok) {
        errors.push(
          `LEDGER_ROOT_MISMATCH: call_records chain broken at seq=${chain.brokenAtSeq ?? '?'} expected=${chain.expectedHash?.slice(0, 16) ?? 'n/a'} actual=${chain.actualHash?.slice(0, 16) ?? 'n/a'}`,
        );
      }
      if (chain.verifiedCount === 0) {
        // F-V09-04 修复:full 模式下空账本视同破坏(删文件=FAIL 而清空=clean 的语义不一致已闭合);
        // chain 模式保留警告以兼容'仅验链'的显式窄验证(含无 LLM 调用的 legacy 包)。
        if (mode === 'full') {
          errors.push('CHAIN_EMPTY: call_records.redacted.jsonl contains no records(full 模式空账本视同破坏)');
        } else {
          warnings.push('CHAIN_EMPTY: call_records.redacted.jsonl contains no records');
        }
      }
    } catch (error) {
      errors.push(`CALL_RECORDS_UNREADABLE: ${errorMessage(error)}`);
    }
  }

  // V05-F5/F-V09-02 修复:full 模式下 lifecycle_events.jsonl 事件链独立重算+
  // 与 claim_graph.lifecycleStates 交叉一致性(撤回墓碑不可无痕抹除/翻转)。
  if (mode === 'full') {
    const lifecycleResult = verifyLifecycleEventsJsonl(
      join(bundlePath, 'lifecycle_events.jsonl'),
      join(bundlePath, 'claim_graph.json'),
    );
    for (const lifecycleError of lifecycleResult.errors) {
      errors.push(lifecycleError);
    }
  }

  // DEF-17: 当 bundle 含 integrity.json 全分量 sha256 清单时,机检全分量内容(非仅白名单存在性)。
  // 检出 V-09 静默组(ro-crate/prov.ttl/claim_graph/otel/data_manifest/README/code-MANIFEST 内容篡改)。
  // additive——无清单包(legacy/未导出 integrity.json)不回归,仅失全分量内容校验。
  if (existsSync(join(bundlePath, FAR_PROOF_INTEGRITY_FILE))) {
    const integrity = verifyFarProofPackageIntegrity(bundlePath);
    if (!integrity.ok) {
      for (const integrityError of integrity.errors) {
        errors.push(`INTEGRITY_${integrityError}`);
      }
    }
  }

  // DEF-18(F-V04-01 ②):DB↔导出锚比对——当验证者持有证据库(DB)时,把导出中每行的
  // request/response payload hash 列与 DB 落库值逐 seq 比对。一致伪造(重算 payload + 重算 hash 列)
  // 使库内自验不可检,但篡改前导出是唯一内容锚:篡改后 DB 的 hash ≠ 篡改前导出的 hash → 检出。
  // additive——不传 DB(仅验 bundle 自身)不回归,仅失 DB↔导出锚交叉校验。
  if (options.dbAnchor !== undefined) {
    const redactedPath = join(bundlePath, 'call_records.redacted.jsonl');
    if (existsSync(redactedPath)) {
      try {
        const exportedRows = readJsonlLines(redactedPath).map((line) => {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          return {
            seq: Number(parsed.seq),
            request_payload_hash: typeof parsed.request_payload_hash === 'string'
              ? parsed.request_payload_hash
              : null,
            response_payload_hash: typeof parsed.response_payload_hash === 'string'
              ? parsed.response_payload_hash
              : null,
          };
        });
        const anchor = verifyCallRecordExportAnchor(options.dbAnchor, exportedRows);
        if (!anchor.ok) {
          for (const seq of anchor.tamperedSeqs) {
            errors.push(
              `DB_EXPORT_ANCHOR_MISMATCH: seq=${seq} payload hash 与篡改前导出锚不一致(一致伪造检出·DEF-18)`,
            );
          }
          for (const drift of anchor.anchorDrift) {
            errors.push(`DB_EXPORT_ANCHOR_DRIFT: ${drift}(导出锚行集合与 DB 漂移·DEF-18)`);
          }
        }
      } catch (error) {
        errors.push(`DB_EXPORT_ANCHOR_UNREADABLE: ${errorMessage(error)}`);
      }
    } else {
      errors.push('DB_EXPORT_ANCHOR_MISSING: 传入 dbAnchor 但 bundle 无 call_records.redacted.jsonl');
    }
  }

  warnings.push(
    'Bundle format is V1 minimal self-verifiable export; it is not a third-party RO-Crate/PROV certification.',
  );

  // Ed25519 bundle 签名（DEF-18 收窄·additive）：仅当 <bundle>.sig.json sidecar 存在才验签。
  // sidecar 缺失 → skipped（零回归）；存在且失效 → 进 errors → ok=false → verify FAIL。
  const signature = verifyBundleSignature(bundlePath, options.expectedPubKeyPem);
  if (signature.ran && !signature.ok) {
    const evidence =
      signature.mismatchPaths !== undefined && signature.mismatchPaths.length > 0
        ? `paths differ: ${signature.mismatchPaths.slice(0, 5).join(', ')}${signature.mismatchPaths.length > 5 ? '…' : ''}`
        : (signature.reason ?? 'cryptographic signature invalid');
    errors.push(`ED25519_SIGNATURE_INVALID: ${evidence}`);
  }

  // Q3 mitigation：运行环境漂移检测（additive·warn，非 fail）。bundle 在环境 A 下导出，
  // 在环境 B 下复算 → 轻微数值漂移可能。data_manifest.envFingerprint 存在则比对当前环境并披露。
  // 旧 bundle 无此字段 → 跳过（零回归）。这是 honest disclosure：.far-proof 不锁环境（非 Docker
  // capsule），漂移只能检测不能消除。
  const manifestPath = join(bundlePath, 'data_manifest.json');
  if (existsSync(manifestPath)) {
    let recordedEnv: EnvFingerprint | undefined;
    try {
      recordedEnv = (JSON.parse(readFileSync(manifestPath, 'utf8')) as { readonly envFingerprint?: EnvFingerprint }).envFingerprint;
    } catch {
      // data_manifest 整体可读性由 integrity 检查负责；这里仅缺 envFingerprint → 视为旧 bundle 跳过。
      recordedEnv = undefined;
    }
    if (recordedEnv !== undefined) {
      const cmp = compareEnvFingerprint(recordedEnv, computeEnvFingerprint());
      if (!cmp.match) {
        warnings.push(
          `ENV_DRIFT: bundle was computed under a different runtime environment (${cmp.differences.join('; ')}). `.concat(
            'Recompute under the recorded environment for bit-exact reproducibility. Disclosure only — .far-proof locks evidence, not the full runtime (unlike a Docker capsule).',
          ),
        );
      }
    }
  }

  return {
    ok: errors.length === 0,
    bundlePath,
    mode,
    requiredFilesPresent: missingFiles.length === 0,
    missingFiles,
    proofEnvelopeRan,
    proofEnvelopeOk,
    proofEnvelopeCount,
    proofEnvelopeMismatches,
    chainRan,
    chain,
    signature,
    errors,
    warnings,
  };
}

function requiredFilesForMode(mode: FarProofBundleVerifyMode): readonly string[] {
  switch (mode) {
    case 'chain':
      return ['call_records.redacted.jsonl'];
    case 'envelope':
      return ['proof_envelopes.jsonl'];
    case 'full':
      return FAR_PROOF_REQUIRED_FILES;
  }
}

/**
 * 逐行验证 proof_envelopes.jsonl：proofHash 重算 + 信封间 prev_proof_hash 引用完整性。
 *
 * @param jsonlPath proof_envelopes.jsonl 文件路径。
 * @returns checked 行数、不匹配列表、引用悬空错误列表。
 * @throws 文件为空或不可读时抛出 Error。
 */
export function verifyProofEnvelopeJsonl(jsonlPath: string): {
  readonly checked: number;
  readonly mismatches: readonly ProofEnvelopeMismatch[];
  /** 链引用悬空(prev_proof_hash 既非 GENESIS 也不指向文件中任何在先信封)——F-V09-03 */
  readonly linkageErrors: readonly string[];
} {
  const lines = readJsonlLines(jsonlPath);
  if (lines.length === 0) {
    throw new Error(`${jsonlPath} contains no envelope rows`);
  }

  const mismatches: ProofEnvelopeMismatch[] = [];
  const linkageErrors: string[] = [];
  const seenProofHashes = new Set<string>();
  for (const line of lines) {
    const row = JSON.parse(line) as RawEnvelopeRow;
    // IC-01 版本派发(ADR-007 H3):无 URI=legacy v1;未知/伪造主版本 fail-closed 抛错(不翻转裁决)。
    // unknown extra field 不进入 rowToEnvelope/proofHash 输入(MINOR 单调兼容,裁决不翻转)。
    dispatchRulesetVerifier(row.ruleset_uri ?? null);
    const envelope = rowToEnvelope(row);
    const { proofHash: _stored, ...fieldsForHash } = envelope;
    void _stored;
    const recomputed = computeProofHash(fieldsForHash);
    if (recomputed !== envelope.proofHash) {
      mismatches.push({
        envelopeId: envelope.envelopeId,
        expected: envelope.proofHash,
        actual: recomputed,
      });
    }
    // F-V09-03 修复:信封间引用完整性。prev_proof_hash 必须是 GENESIS_PROOF_HASH
    // 或本文件中某个在先信封的 proof_hash;否则即 cherry-pick 删除/乱序/伪造引用。
    // 登记边界:追加自封印信封(prev 指向真实信封)与删除尾部信封仍不可检——
    // 信封集合完整性锚定(计数/清单入 data_manifest)属 DESIGN 域,见 FINDINGS F-V09-01。
    if (envelope.prevProofHash !== GENESIS_PROOF_HASH && !seenProofHashes.has(envelope.prevProofHash)) {
      linkageErrors.push(
        `PROOF_CHAIN_DANGLING: ${envelope.envelopeId} prev_proof_hash=${envelope.prevProofHash.slice(0, 16)}… 非 GENESIS 且不指向任何在先信封(删除/乱序/伪造引用)`,
      );
    }
    seenProofHashes.add(envelope.proofHash);
  }
  return { checked: lines.length, mismatches, linkageErrors };
}

/**
 * 验证 call_records.redacted.jsonl 哈希链：逐行检查 prev_hash 链接与 canonicalHash 重算。
 *
 * @param jsonlPath call_records.redacted.jsonl 文件路径。
 * @returns 链验证结果（ok、已验证条数、断裂位置与哈希）。
 */
export function verifyRedactedCallRecordsJsonl(jsonlPath: string): BundleChainResult {
  const lines = readJsonlLines(jsonlPath);
  let expectedPrevHash = GENESIS_PREV_HASH;
  let verifiedCount = 0;
  let chainHead: string | null = null;

  for (const line of lines) {
    const row = JSON.parse(line) as RedactedCallRecordRow;
    if (row.prev_hash !== expectedPrevHash) {
      return {
        ok: false,
        verifiedCount,
        brokenAtSeq: row.seq,
        expectedHash: expectedPrevHash,
        actualHash: row.prev_hash,
        chainHead,
      };
    }

    const recomputedHash = canonicalHash(rowToCallRecord(row));
    if (recomputedHash !== row.current_hash) {
      return {
        ok: false,
        verifiedCount,
        brokenAtSeq: row.seq,
        expectedHash: recomputedHash,
        actualHash: row.current_hash,
        chainHead,
      };
    }

    expectedPrevHash = row.current_hash;
    chainHead = row.current_hash;
    verifiedCount += 1;
  }

  return {
    ok: true,
    verifiedCount,
    brokenAtSeq: null,
    expectedHash: null,
    actualHash: null,
    chainHead,
  };
}

function readJsonlLines(path: string): string[] {
  if (!existsSync(path)) {
    throw new Error(`${path} not found`);
  }
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseJsonArrayChecks(raw: string): ProofCheckResult[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('checks is not a JSON array');
  }
  return parsed.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`checks[${index}] is not an object`);
    }
    const record = entry as Record<string, unknown>;
    const ruleId = String(record.rule_id ?? record.ruleId ?? '');
    const ruleName = String(record.rule_name ?? record.ruleName ?? '');
    const outcome = String(record.outcome) as CheckOutcome;
    const detail = String(record.detail ?? '');
    return { ruleId, ruleName, outcome, detail } as ProofCheckResult;
  });
}

function rowToEnvelope(row: RawEnvelopeRow): ProofEnvelope {
  if (row.sealed_by !== 'deterministic_sealer') {
    throw new Error(`sealed_by must be deterministic_sealer (actual: ${row.sealed_by})`);
  }
  return {
    envelopeId: row.envelope_id,
    claimId: row.claim_id,
    verdictNodeId: row.verdict_node_id,
    conclusion: row.conclusion as Verdict,
    proofHash: row.proof_hash,
    prevProofHash: row.prev_proof_hash,
    checks: parseJsonArrayChecks(row.checks),
    knownFailures: JSON.parse(row.known_failures) as string[],
    falsificationSpec: JSON.parse(row.falsification_spec) as FalsificationSpec,
    sourceAnchor: JSON.parse(row.source_anchor),
    reproHash: row.repro_hash,
    // legacy 行 ruleset_uri 缺席/NULL → 字段缺席(exactOptionalPropertyTypes),按 v1 默认派发
    ...(row.ruleset_uri === null || row.ruleset_uri === undefined
      ? {}
      : { rulesetUri: row.ruleset_uri }),
    sealedBy: row.sealed_by,
    sealedAt: row.sealed_at,
    createdAt: row.created_at,
  };
}

function emptyChainResult(): BundleChainResult {
  return {
    ok: false,
    verifiedCount: 0,
    brokenAtSeq: null,
    expectedHash: null,
    actualHash: null,
    chainHead: null,
  };
}

interface RawLifecycleRow {
  readonly event_id: string;
  readonly target_kind: string;
  readonly target_id: string;
  readonly from_state: string;
  readonly to_state: string;
  readonly actor: string;
  readonly reason: string;
  readonly prev_hash: string;
  readonly current_hash: string;
}

/** bundle 内 lifecycle_events.jsonl 独立校验结果：是否通过、已检查事件数、错误列表。 */
export interface LifecycleBundleVerifyResult {
  readonly ok: boolean;
  readonly checkedCount: number;
  readonly errors: readonly string[];
}

/**
 * V05-F5/F-V09-02:bundle 内 lifecycle_events.jsonl 独立校验(full 模式)。
 *   - 文件存在且非空 → 按目标重放:hash 链(prev/current 重算)+ fromState 连续性
 *     + ALLOWED_TRANSITIONS 迁移表(与 DB 侧 verifyLifecycleChain 同算法);
 *   - 文件缺失/为空但 claim_graph.lifecycleStates 非空 → LIFECYCLE_STRIPPED(墓碑抹除);
 *   - 重放导出的各目标终态与 claim_graph.lifecycleStates 不一致 → LIFECYCLE_STATE_MISMATCH;
 *   - 两侧皆无生命周期记录 → ok(无墓碑可验,legacy 兼容)。
 * 登记边界:攻击者按公开算法一致重写整条链(keyless hash 固有边界,V05-F7)不可检。
 */
export function verifyLifecycleEventsJsonl(
  lifecyclePath: string,
  claimGraphPath: string,
): LifecycleBundleVerifyResult {
  const errors: string[] = [];
  let declaredStates: Record<string, string> = {};
  if (existsSync(claimGraphPath)) {
    try {
      const graph = JSON.parse(readFileSync(claimGraphPath, 'utf8')) as { lifecycleStates?: Record<string, string> };
      declaredStates = graph.lifecycleStates ?? {};
    } catch (error) {
      return { ok: false, checkedCount: 0, errors: [`CLAIM_GRAPH_UNREADABLE: ${errorMessage(error)}`] };
    }
  }
  const declaredCount = Object.keys(declaredStates).length;

  if (!existsSync(lifecyclePath)) {
    if (declaredCount > 0) {
      errors.push(
        `LIFECYCLE_STRIPPED: claim_graph.lifecycleStates 声明 ${declaredCount} 个终态目标但 lifecycle_events.jsonl 缺失(墓碑抹除)`,
      );
    }
    return { ok: errors.length === 0, checkedCount: 0, errors };
  }

  const lines = readFileSync(lifecyclePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    if (declaredCount > 0) {
      errors.push(
        `LIFECYCLE_STRIPPED: claim_graph.lifecycleStates 声明 ${declaredCount} 个终态目标但 lifecycle_events.jsonl 为空(墓碑抹除)`,
      );
    }
    return { ok: errors.length === 0, checkedCount: 0, errors };
  }

  const GENESIS_EVENT_HASH = '0'.repeat(64);
  const perTargetPrev = new Map<string, string>();
  const perTargetState = new Map<string, LifecycleState>();
  let checked = 0;
  for (const line of lines) {
    let row: RawLifecycleRow;
    try {
      row = JSON.parse(line) as RawLifecycleRow;
    } catch (error) {
      errors.push(`LIFECYCLE_ROW_UNREADABLE: ${errorMessage(error)}`);
      continue;
    }
    const key = `${row.target_kind}:${row.target_id}`;
    const expectedPrev = perTargetPrev.get(key) ?? GENESIS_EVENT_HASH;
    if (row.prev_hash !== expectedPrev) {
      errors.push(`LIFECYCLE_CHAIN_BROKEN: ${key} event=${row.event_id} prev_hash 链接断裂`);
      continue;
    }
    const recomputed = computeEventHash({
      targetKind: row.target_kind as LifecycleTargetKind,
      targetId: row.target_id,
      fromState: row.from_state as LifecycleState,
      toState: row.to_state as LifecycleState,
      actor: row.actor,
      reason: row.reason,
      prevHash: row.prev_hash,
    });
    if (recomputed !== row.current_hash) {
      errors.push(`LIFECYCLE_CHAIN_BROKEN: ${key} event=${row.event_id} current_hash 重算不符(事件内容篡改)`);
      continue;
    }
    const expectedState = perTargetState.get(key) ?? 'active';
    if (row.from_state !== expectedState) {
      errors.push(
        `LIFECYCLE_CHAIN_BROKEN: ${key} event=${row.event_id} 状态连续性断裂(expected from=${expectedState}, got ${row.from_state})`,
      );
      continue;
    }
    const allowed = ALLOWED_TRANSITIONS[row.from_state as LifecycleState];
    if (allowed === undefined || !allowed.includes(row.to_state as LifecycleState)) {
      errors.push(
        `LIFECYCLE_CHAIN_BROKEN: ${key} event=${row.event_id} 非法迁移(${row.from_state} → ${row.to_state})`,
      );
      continue;
    }
    perTargetPrev.set(key, row.current_hash);
    perTargetState.set(key, row.to_state as LifecycleState);
    checked += 1;
  }

  if (errors.length === 0) {
    for (const [key, declared] of Object.entries(declaredStates)) {
      const derived = perTargetState.get(key);
      if (derived !== declared) {
        errors.push(
          `LIFECYCLE_STATE_MISMATCH: ${key} claim_graph 声明 '${declared}' 但事件链重放导出 '${derived ?? '(无事件)'}'`,
        );
      }
    }
  }
  return { ok: errors.length === 0, checkedCount: checked, errors };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
