import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { EvidenceLevel, ReproducibilityBundle } from '../domain/provenance.js';
import type { ProvenanceReceipt } from '../domain/provenance.js';
import { sha256Hex } from '../shared/crypto.js';
import type { DomainObject, ObjectKind, Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';

/**
 * Third-party bundle verification (ACC-14, mission §56 Inspect/Validate/Re-execute/
 * Compare). Every check is really executed against the store, the artifact store and
 * the local environment — no check may assume or fabricate a pass. Invariant: a
 * report always carries the same 11 checks in the same order (VERIFY_CHECK_NAMES);
 * checks that cannot run fail closed with passed=false, never silently skipped.
 */

export const VERIFY_CHECK_NAMES = [
  'bundle_readable_and_schema_valid',
  'source_artifact_hashes',
  'final_artifact_hashes',
  'receipts_readable_and_model_metadata_consistent',
  'corpus_snapshot_ref_resolvable',
  'question_ref_resolvable',
  'verification_instructions_present',
  'limitations_nonempty',
  'dependency_lock_hash_matches',
  'declared_evidence_level_valid',
  'claim_taint_labels_present',
] as const;
export type VerifyCheckName = (typeof VERIFY_CHECK_NAMES)[number];

export const VerificationCheck = z.object({
  name: z.string(),
  passed: z.boolean(),
  detail: z.string(),
});
export type VerificationCheck = z.infer<typeof VerificationCheck>;

export const VerificationReport = z.object({
  bundleId: z.string(),
  runId: z.string(),
  declaredEvidenceLevel: z.string(),
  verifiedAt: z.string().datetime(),
  checks: z.array(VerificationCheck),
  /** 'verified' all pass | 'degraded' only env/lock drift (check 9) fails | 'failed' anything else fails. */
  verdict: z.enum(['verified', 'failed', 'degraded']),
  failedChecks: z.array(z.string()),
  /** Present when the declared level implies re-execution (replay/recompute). */
  replayGuidance: z.string().optional(),
});
export type VerificationReport = z.infer<typeof VerificationReport>;

export interface VerifyDeps {
  store: Store;
  artifacts: ArtifactStore;
}

const LOCK_CHECK: VerifyCheckName = 'dependency_lock_hash_matches';

/** Same basis as the export stage: hash the real file, or the documented placeholder when unreadable. */
const readDependencyLock = (): { hash: string; missing: boolean } => {
  try {
    return { hash: sha256Hex(fs.readFileSync(path.join(process.cwd(), 'package-lock.json'))), missing: false };
  } catch {
    return { hash: sha256Hex('missing'), missing: true };
  }
};

/** Probe one content-addressed artifact: must exist and sha256(content) must equal the hash. */
const probeArtifact = async (artifacts: ArtifactStore, hash: string): Promise<string | null> => {
  const content = await artifacts.get(hash);
  if (content === null) return '工件在 artifact store 中不存在';
  return sha256Hex(content) === hash ? null : '内容 sha256 与声明的哈希不一致（文件损坏或非内容寻址）';
};

const probeArtifacts = async (
  artifacts: ArtifactStore,
  hashes: readonly string[],
  name: VerifyCheckName,
): Promise<VerificationCheck> => {
  const problems: string[] = [];
  for (const hash of hashes) {
    const problem = await probeArtifact(artifacts, hash);
    if (problem) problems.push(`${hash.slice(0, 16)}… ${problem}`);
  }
  return {
    name,
    passed: problems.length === 0,
    detail: problems.length === 0
      ? `${hashes.length} 个哈希全部在 artifact store 中存在且内容 sha256 一致`
      : `${problems.length}/${hashes.length} 个哈希校验失败：${problems.join('；')}`,
  };
};

/** Readability + executionMode/modelMetadata set-consistency (mission §56 re-execute facts). */
const checkReceipts = (store: Store, bundle: ReproducibilityBundle): VerificationCheck => {
  const name: VerifyCheckName = 'receipts_readable_and_model_metadata_consistent';
  const problems: string[] = [];
  const receipts: ProvenanceReceipt[] = [];
  for (const id of bundle.receiptIds) {
    try {
      const r = store.getObject('receipt', id);
      if (r === null) problems.push(`receipt 不存在：${id}`);
      else receipts.push(r);
    } catch (e) {
      problems.push(`receipt 读取失败（fail-closed）：${id} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Actual (provider|modelId) pairs from model_call receipts, with liveness per pair.
  const actual = new Map<string, { pair: string; anyLive: boolean }>();
  for (const r of receipts) {
    if (r.kind !== 'model_call' || !r.modelCall) continue;
    const key = `${r.modelCall.provider}|${r.modelCall.modelId}`;
    const entry = actual.get(key) ?? { pair: key, anyLive: false };
    if (r.executionMode === 'live') entry.anyLive = true;
    actual.set(key, entry);
  }
  const declared = new Map<string, ReproducibilityBundle['modelMetadata'][number]>(
    bundle.modelMetadata.map((m) => [`${m.provider}|${m.modelId}`, m] as const),
  );

  for (const key of actual.keys()) {
    if (!declared.has(key)) problems.push(`receipts 中存在 modelMetadata 未声明的模型组合：${key}`);
  }
  for (const [key, meta] of declared) {
    const seen = actual.get(key);
    if (!seen) {
      problems.push(`modelMetadata 声明了 receipts 中不存在的模型组合：${key}`);
      continue;
    }
    const routeOk = seen.anyLive
      ? meta.route === 'live' || meta.route === 'live_official'
      : meta.route === 'test_only';
    if (!routeOk) {
      problems.push(
        `route 与 executionMode 不一致：${key} 声明 route=${meta.route}，但 receipts 中该组合${seen.anyLive ? '存在 live 调用' : '全部非 live'}`,
      );
    }
  }

  const pairsText = (pairs: readonly string[]): string => `{${pairs.join(', ')}}`;
  return {
    name,
    passed: problems.length === 0,
    detail: problems.length === 0
      ? `${bundle.receiptIds.length} 条 receipt 全部可读取；receipts 模型组合 ${pairsText([...actual.keys()])} 与 modelMetadata ${pairsText([...declared.keys()])} 一致（含 route/executionMode 方向）`
      : problems.join('；'),
  };
};

/** fail-closed getObject: a corrupt row must fail the check, not crash the report. */
const tryGetObject = <K extends ObjectKind>(
  store: Store,
  kind: K,
  id: string,
): { ok: true; obj: DomainObject<K> } | { ok: false; msg: string } => {
  try {
    const obj = store.getObject(kind, id);
    return obj === null ? { ok: false, msg: `${kind} 对象不存在：${id}` } : { ok: true, obj };
  } catch (e) {
    return { ok: false, msg: `${kind} 读取异常（fail-closed）：${e instanceof Error ? e.message : String(e)}` };
  }
};

/** Recompute the lock hash and compare — drift is reported, never silently passed. */
const checkDependencyLock = (bundle: ReproducibilityBundle): VerificationCheck => {
  const current = readDependencyLock();
  const envNow = `node ${process.version} ${process.platform}`;
  const envNote = envNow === bundle.environmentFingerprint
    ? ''
    : `；环境指纹漂移：声明「${bundle.environmentFingerprint}」，当前「${envNow}」`;
  const passed = current.hash === bundle.dependencyLockHash;
  return {
    name: LOCK_CHECK,
    passed,
    detail: passed
      ? `与当前 package-lock.json 的 sha256 一致（${current.hash.slice(0, 16)}…）${envNote}`
      : `不一致：声明 ${bundle.dependencyLockHash}，当前重算 ${current.hash}` +
        `${current.missing ? '（当前 package-lock.json 不可读，按 sha256("missing") 占位重算）' : ''}${envNote} — 环境漂移，如实报告`,
  };
};

const buildReplayGuidance = (bundle: ReproducibilityBundle): string => {
  const level = bundle.declaredEvidenceLevel;
  if (level !== 'replay' && level !== 'recompute') return '';
  return [
    `重放指引（declaredEvidenceLevel=${level}）：按 bundle.verificationInstructions 执行 —— ${bundle.verificationInstructions}`,
    '1) 从存储读取 receiptIds 对应的每条 receipt，核对模型调用与来源检索事实；',
    '2) 在工件库按 sourceArtifactHashes 逐个取回来源快照，比对 sha256；',
    '3) 按 finalArtifactHashes 取回导出工件，比对 sha256；',
    level === 'recompute'
      ? '4) recompute 级别另需在 dependencyLockHash 锁定的依赖环境中重算确定性环节并比对输出哈希。'
      : '4) 在 codeRevision/dependencyLockHash 对应的环境中重放。注意 limitations：LLM 环节非确定性，重放核验的是输入快照、receipts 与工件哈希，不承诺逐字节一致的再生成。',
  ].join('\n');
};

/**
 * Verify a reproducibility bundle to its declared evidence level. Pure read path:
 * store + artifact store are only read; the environment probe reads package-lock.json.
 */
export async function verifyBundle(bundleId: string, deps: VerifyDeps): Promise<VerificationReport> {
  const { store, artifacts } = deps;
  const verifiedAt = new Date().toISOString();
  const checks: VerificationCheck[] = [];

  // ---- check 1: bundle readable + zod valid (getObject already fail-closed parses; re-validated explicitly) ----
  let bundle: ReproducibilityBundle | null = null;
  let readError = '';
  try {
    const raw = store.getObject('bundle', bundleId);
    if (raw === null) {
      readError = `bundle 不存在：${bundleId}`;
    } else {
      const revalidated = ReproducibilityBundle.safeParse(raw);
      if (!revalidated.success) readError = `zod 校验失败：${revalidated.error.message}`;
      else bundle = revalidated.data;
    }
  } catch (e) {
    readError = `bundle 读取异常（fail-closed）：${e instanceof Error ? e.message : String(e)}`;
  }
  checks.push({
    name: 'bundle_readable_and_schema_valid',
    passed: bundle !== null,
    detail: bundle !== null
      ? `读取并 zod 校验通过（runId=${bundle.runId}，declaredEvidenceLevel=${bundle.declaredEvidenceLevel}，receipts=${bundle.receiptIds.length}，sourceHashes=${bundle.sourceArtifactHashes.length}，finalHashes=${bundle.finalArtifactHashes.length}）`
      : readError,
  });

  if (bundle === null) {
    // fail closed: the remaining checks cannot run and must not claim a pass
    for (const name of VERIFY_CHECK_NAMES.slice(1)) {
      checks.push({ name, passed: false, detail: '无法执行：bundle 对象不可读（fail-closed）' });
    }
  } else {
    // ---- checks 2/3: every declared artifact hash exists with matching content ----
    checks.push(await probeArtifacts(artifacts, bundle.sourceArtifactHashes, 'source_artifact_hashes'));
    checks.push(await probeArtifacts(artifacts, bundle.finalArtifactHashes, 'final_artifact_hashes'));

    // ---- check 4: receipts + modelMetadata consistency ----
    checks.push(checkReceipts(store, bundle));

    // ---- checks 5/6: referenced domain objects resolvable ----
    const corpus = tryGetObject(store, 'corpus_snapshot', bundle.corpusSnapshotRef);
    checks.push({
      name: 'corpus_snapshot_ref_resolvable',
      passed: corpus.ok,
      detail: corpus.ok
        ? `已解析（${corpus.obj.id}，documents=${corpus.obj.documentIds.length}，queries=${corpus.obj.queries.length}）`
        : corpus.msg,
    });
    const question = tryGetObject(store, 'question', bundle.questionRef);
    checks.push({
      name: 'question_ref_resolvable',
      passed: question.ok,
      detail: question.ok
        ? `已解析（${question.obj.id}）：「${question.obj.text.slice(0, 60)}」`
        : question.msg,
    });

    // ---- check 7: verification instructions present (non-blank) ----
    checks.push({
      name: 'verification_instructions_present',
      passed: bundle.verificationInstructions.trim().length > 0,
      detail: bundle.verificationInstructions.trim().length > 0
        ? `非空（${bundle.verificationInstructions.length} 字符）`
        : 'verificationInstructions 为空或全空白 — 第三方无法据此重放',
    });

    // ---- check 8: honesty gate — empty limitations = fail (LLM non-determinism always exists) ----
    const meaningful = bundle.limitations.filter((l) => l.trim().length > 0);
    checks.push({
      name: 'limitations_nonempty',
      passed: meaningful.length > 0,
      detail: meaningful.length > 0
        ? `${meaningful.length} 条非空 limitation（诚实性硬门：LLM 非确定性必须声明）`
        : 'limitations 为空 — LLM 非确定性必然存在，空 limitations 即不诚实',
    });

    // ---- check 9: dependency lock recomputed and compared ----
    checks.push(checkDependencyLock(bundle));

    // ---- check 10: declared evidence level is a legal enum ----
    const levelOk = EvidenceLevel.safeParse(bundle.declaredEvidenceLevel).success;
    checks.push({
      name: 'declared_evidence_level_valid',
      passed: levelOk,
      detail: levelOk
        ? `合法枚举值「${bundle.declaredEvidenceLevel}」（inspect|replay|recompute）`
        : `非法值「${bundle.declaredEvidenceLevel}」— 必须是 inspect|replay|recompute 之一`,
    });

    // ---- check 11 (re-audit taint enforcement): claims must carry taint labels ----
    // derived_untrusted content may enter exports ONLY labeled. Claims persisted
    // before the field existed are disclosed as legacy (pass with count) — the
    // check fails only when the bundle's own claims are label-less, i.e. produced
    // by a build that dropped the labeling discipline.
    const runClaims = store.listObjects('claim', bundle.runId) as unknown as Array<{ taint?: string }>;
    const labeled = runClaims.filter((c) => c.taint === 'derived_untrusted' || c.taint === 'trusted' || c.taint === 'untrusted_literal');
    const unlabeled = runClaims.length - labeled.length;
    checks.push({
      name: 'claim_taint_labels_present',
      passed: runClaims.length === 0 || unlabeled === 0,
      detail: runClaims.length === 0
        ? '（本 run 无 claim — 检查空转通过）'
        : unlabeled === 0
          ? `${labeled.length} 条 claim 全部携带 taint 标签（derived_untrusted 不得无标导出）`
          : `${unlabeled}/${runClaims.length} 条 claim 缺少 taint 标签 — 无标 derived_untrusted 禁止导出（T2 硬不变量）`,
    });
  }

  const failed = checks.filter((c) => !c.passed);
  const verdict: VerificationReport['verdict'] =
    failed.length === 0 ? 'verified'
    : failed.length === 1 && failed[0]!.name === LOCK_CHECK ? 'degraded'
    : 'failed';

  const replayGuidance = bundle !== null ? buildReplayGuidance(bundle) : '';
  return VerificationReport.parse({
    bundleId,
    runId: bundle?.runId ?? 'unknown',
    declaredEvidenceLevel: bundle?.declaredEvidenceLevel ?? 'unknown',
    verifiedAt,
    checks,
    verdict,
    failedChecks: failed.map((c) => c.name),
    ...(replayGuidance.length > 0 ? { replayGuidance } : {}),
  });
}
