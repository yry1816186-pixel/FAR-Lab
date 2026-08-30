import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { EvidenceLevel, ReproducibilityBundle } from '../domain/provenance.js';
import type { ProvenanceReceipt } from '../domain/provenance.js';
import { truthProfileFromReceipts } from './truth-profile.js';
import { sha256Hex } from '../shared/crypto.js';
import type { DomainObject, ObjectKind, Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';

/**
 * Third-party bundle verification (ACC-14, mission §56 Inspect/Validate/Re-execute/
 * Compare). Every check is really executed against the store, the artifact store and
 * the local environment — no check may assume or fabricate a pass. Invariant: a
 * report always carries the same 16 checks in the same order (VERIFY_CHECK_NAMES);
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
  'hypothesis_template_content_absent',
  'paper_outline_ref_resolvable',
  'figures_tables_refs_resolvable',
  'protocol_evidence_resolvable',
  'data_plane_evidence_resolvable',
];
export type VerifyCheckName = (typeof VERIFY_CHECK_NAMES)[number];

export const VerificationCheck = z.object({
  name: z.string(),
  passed: z.boolean(),
  detail: z.string(),
  /**
   * True when the check passed VACUOUSLY (the bundle declares nothing this
   * check inspects — legacy/pre-feature bundles). A vacuous pass must never be
   * read as strong verification; consumers aggregate it into vacuousChecks.
   */
  vacuous: z.boolean().optional(),
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
  /** Checks that passed vacuously (legacy bundle declares nothing they inspect) — never read as strong verification. */
  vacuousChecks: z.array(z.string()).optional(),
  /** Present when the declared level implies re-execution (replay/recompute). */
  replayGuidance: z.string().optional(),
});
export type VerificationReport = z.infer<typeof VerificationReport>;

export interface VerifyDeps {
  store: Store;
  artifacts: ArtifactStore;
}

const LOCK_CHECK: VerifyCheckName = 'dependency_lock_hash_matches';

/** Walk up from THIS module's directory (same basis as the export stage's lock read,
 * WP2 F2): `far verify` may run from any cwd, and a cwd-relative read would compare
 * the user's unrelated lockfile against the bundle's declared hash. */
const findUp = (name: string, fromDir: string): string | null => {
  let dir = path.resolve(fromDir);
  for (;;) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

/** Same basis as the export stage: hash the real file, or the documented placeholder when unreadable. */
const readDependencyLock = (): { hash: string; missing: boolean } => {
  const lockPath = process.env.FARLAB_LOCKFILE_PATH
    ?? findUp('package-lock.json', import.meta.dirname ?? process.cwd());
  try {
    if (lockPath === null) throw new Error('not found');
    return { hash: sha256Hex(fs.readFileSync(lockPath)), missing: false };
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

/** Binary-safe artifact probe: dataset records may reference BINARY blobs (e.g. the
 * raw NetCDF) — ArtifactStore.get is utf8-text by contract, so hash the
 * content-addressed FILE instead of round-tripping bytes through a text decode. */
const probeArtifactFile = (artifacts: ArtifactStore, hash: string): string | null => {
  try {
    const file = artifacts.path(hash);
    return sha256Hex(fs.readFileSync(file)) === hash ? null : '内容 sha256 与声明的哈希不一致（文件损坏或非内容寻址）';
  } catch (e) {
    if (e instanceof Error && (e as NodeJS.ErrnoException).code === 'ENOENT') return '工件在 artifact store 中不存在';
    return `工件不可读：${e instanceof Error ? e.message : String(e)}`;
  }
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

  // §5.5 run-level truth disclosure: a bundle whose receipt set is not fully live
  // MUST carry the execution-truth limitation line naming its ACTUAL class (audit
  // P2-1: presence alone could launder a wrong class). Regression lock keeping
  // synthetic/replayed/mixed runs from hiding inside a reproducible-live bundle.
  const truth = truthProfileFromReceipts(bundle.runId, receipts);
  if (truth.klass !== 'live' && !bundle.limitations.some((l) => l.includes('执行真实性') && l.includes(`：${truth.klass}`))) {
    problems.push(`bundle 执行真实性为 ${truth.klass} 但 limitations 未携带命名该类别的执行真实性披露行`);
  }

  const pairsText = (pairs: readonly string[]): string => `{${pairs.join(', ')}}`;
  return {
    name,
    passed: problems.length === 0,
    detail: problems.length === 0
      ? `${bundle.receiptIds.length} 条 receipt 全部可读取；receipts 模型组合 ${pairsText([...actual.keys()])} 与 modelMetadata ${pairsText([...declared.keys()])} 一致（含 route/executionMode 方向）；执行真实性=${truth.klass}`
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
    const runClaims = store.listObjects('claim', bundle.runId);
    const labeled = runClaims.filter((c) => c.taint === 'derived_untrusted' || c.taint === 'trusted' || c.taint === 'untrusted_literal');
    const unlabeled = runClaims.length - labeled.length;
    checks.push({
      name: 'claim_taint_labels_present',
      passed: runClaims.length === 0 || unlabeled === 0,
      vacuous: runClaims.length === 0,
      detail: runClaims.length === 0
        ? '（本 run 无 claim — 检查空转通过）'
        : unlabeled === 0
          ? `${labeled.length} 条 claim 全部携带 taint 标签（derived_untrusted 不得无标导出）`
          : `${unlabeled}/${runClaims.length} 条 claim 缺少 taint 标签 — 无标 derived_untrusted 禁止导出（T2 硬不变量）`,
    });

    // ---- check 12 (real-content discipline): template hypotheses must not ride a bundle ----
    // The export chain excludes offline-wire template hypotheses from every
    // scientific projection; a bundle whose hypothesisJsonLd (or whose run's
    // stored hypotheses) still carries them was minted by a build that dropped
    // that discipline. Same predicate as domain/scientific-state.ts
    // isTemplateHypothesis, inlined here because the bundle layer stores the
    // SWAN projection, not HypothesisCandidate objects.
    const templateStatement = /^Offline hypothesis/i;
    const templateMechanism = /A deterministic offline mechanism/i;
    const jsonLdTemplate = (bundle.hypothesisJsonLd ?? []).filter((j) => {
      const s = typeof (j as { statement?: unknown }).statement === 'string' ? (j as { statement: string }).statement : JSON.stringify(j);
      return templateStatement.test(s) || templateMechanism.test(s);
    }).length;
    checks.push({
      name: 'hypothesis_template_content_absent',
      passed: jsonLdTemplate === 0,
      detail: jsonLdTemplate === 0
        ? `${(bundle.hypothesisJsonLd ?? []).length} 条 hypothesisJsonLd 无模板内容（real-content 投影干净）`
        : `${jsonLdTemplate}/${(bundle.hypothesisJsonLd ?? []).length} 条 hypothesisJsonLd 为离线模板内容 — 模板内容不得作为科学产物入 bundle`,
    });

    // ---- checks 13/14 (export-audit Q3 gap): shipped-artifact refs must resolve ----
    // figures/tables/paperOutline ride in the bundle as content-addressed REFS that
    // verify never probed (only sourceArtifactHashes/finalArtifactHashes were). A
    // dangling or corrupt ref means the shipped package cannot be rebuilt from the
    // artifact store — the reproducibility claim would be hollow. Fields are
    // optional for pre-BP3 bundles: absent = not declared (pass with a note —
    // legacy bundles must not start failing on fields that did not exist).
    const probeRef = async (ref: string): Promise<string | null> => {
      const hash = ref.startsWith('sha256:') ? ref.slice('sha256:'.length) : ref;
      const problem = await probeArtifact(artifacts, hash);
      return problem === null ? null : `${ref.slice(0, 16)}… ${problem}`;
    };
    const paperRef = bundle.paperOutlineRef;
    let paperRefProblem: string | null = null;
    if (paperRef !== undefined) paperRefProblem = await probeRef(paperRef);
    checks.push({
      name: 'paper_outline_ref_resolvable',
      passed: paperRefProblem === null,
      vacuous: paperRef === undefined,
      detail: paperRef === undefined
        ? '（pre-BP3 bundle：未声明 paperOutlineRef — 检查空转通过）'
        : paperRefProblem === null
          ? `paperOutlineRef 已解析且内容 sha256 一致（${paperRef.slice(0, 16)}…）`
          : paperRefProblem,
    });
    const figures = bundle.figures ?? [];
    const tables = bundle.tables ?? [];
    const refProblems: string[] = [];
    for (const f of figures) {
      const p = await probeRef(f.ref);
      if (p !== null) refProblems.push(`figure ${f.name}: ${p}`);
    }
    for (const t of tables) {
      const p = await probeRef(t.ref);
      if (p !== null) refProblems.push(`table ${t.name}: ${p}`);
    }
    checks.push({
      name: 'figures_tables_refs_resolvable',
      passed: refProblems.length === 0,
      vacuous: figures.length + tables.length === 0,
      detail: figures.length + tables.length === 0
        ? '（本 bundle 未声明 figures/tables 引用 — 检查空转通过）'
        : refProblems.length === 0
          ? `${figures.length} figure(s) + ${tables.length} table(s) 引用全部解析且哈希一致`
          : `${refProblems.length}/${figures.length + tables.length} 个引用校验失败：${refProblems.join('；')}`,
    });

    // ---- check 15 (slice-4 protocol chain): declared protocol evidence resolves ----
    // Optional field: absent on pre-protocol bundles → pass with a note (same rule as
    // paperOutlineRef/figures/tables — legacy bundles must not start failing on fields
    // that did not exist when they were minted).
    const protoEvidence = bundle.protocolEvidence ?? [];
    const protoProblems: string[] = [];
    for (const pe of protoEvidence) {
      const proto = tryGetObject(store, 'protocol', pe.protocolId);
      if (!proto.ok) protoProblems.push(proto.msg);
      if (pe.executionId !== null) {
        const ledger = tryGetObject(store, 'protocol_execution', pe.executionId);
        if (!ledger.ok) {
          protoProblems.push(ledger.msg);
        } else {
          if (ledger.obj.protocolId !== pe.protocolId) {
            protoProblems.push(`台账 ${pe.executionId} 属于协议 ${ledger.obj.protocolId}，bundle 声明的是 ${pe.protocolId}`);
          }
          if (ledger.obj.records.length !== pe.recordCount) {
            protoProblems.push(`台账 ${pe.executionId} 现有 ${ledger.obj.records.length} 条记录，bundle 铸造时为 ${pe.recordCount} — store 已越过 bundle，需重导出`);
          }
          if (ledger.obj.deviations.length !== pe.deviations
            || ledger.obj.measurements.filter((m) => !m.qcPassed).length !== pe.qcFailedMeasurements) {
            protoProblems.push(`台账 ${pe.executionId} 的偏差/QC 计数与 bundle 声明不符 — 需重导出`);
          }
        }
      }
      const specProblem = await probeArtifact(artifacts, pe.protocolArtifactHash);
      if (specProblem !== null) protoProblems.push(`协议 ${pe.protocolId} 工件：${specProblem}`);
      if (pe.ledgerArtifactHash !== null) {
        const ledgerProblem = await probeArtifact(artifacts, pe.ledgerArtifactHash);
        if (ledgerProblem !== null) protoProblems.push(`台账 ${pe.executionId} 工件：${ledgerProblem}`);
      }
      // laundering guard (truth-klass pattern): deviations/QC failures MUST carry a
      // limitations line naming the protocol id — evidence without disclosure is
      // not exportable.
      if ((pe.deviations > 0 || pe.qcFailedMeasurements > 0)
        && !bundle.limitations.some((l) => l.includes(pe.protocolId))) {
        protoProblems.push(`协议 ${pe.protocolId} 声明 ${pe.deviations} 项偏差/${pe.qcFailedMeasurements} 项 QC 失败，但 limitations 中没有点名该协议的披露行`);
      }
    }
    checks.push({
      name: 'protocol_evidence_resolvable',
      passed: protoProblems.length === 0,
      vacuous: protoEvidence.length === 0,
      detail: protoEvidence.length === 0
        ? '（pre-protocol bundle：未声明 protocolEvidence — 检查空转通过）'
        : protoProblems.length === 0
          ? `${protoEvidence.length} 条 protocolEvidence 全部解析：对象可读、归属/记录数/偏差/QC 计数一致、工件哈希核验通过、披露行在册`
          : protoProblems.join('；'),
    });

    // ---- check 16 (AOSSA data plane, audit scientific W3): dataset + numerical
    // evidence re-derives from the store and its artifacts resolve. Optional
    // field: absent on pre-data-plane bundles → pass with a note (legacy rule).
    const dataEvidence = bundle.datasetEvidence ?? [];
    const dataProblems: string[] = [];
    for (const de of dataEvidence) {
      const rec = tryGetObject(store, 'dataset_record', de.datasetRecordId);
      if (!rec.ok) { dataProblems.push(rec.msg); continue; }
      if (rec.obj.contentRef !== de.contentRef || rec.obj.format !== de.format || rec.obj.name !== de.name) {
        dataProblems.push(`dataset ${de.datasetRecordId} 的 name/format/contentRef 与 store 不符 — 需重导出`);
      }
      if (rec.obj.lineage.map((l) => l.kind).join('>') !== de.lineageKinds.join('>')) {
        dataProblems.push(`dataset ${de.datasetRecordId} 的 lineage 已变化（bundle ${de.lineageKinds.join('>')} vs store ${rec.obj.lineage.map((l) => l.kind).join('>')}）— 需重导出`);
      }
      const refProblem = probeArtifactFile(artifacts, de.contentRef.replace('sha256:', ''));
      if (refProblem !== null) dataProblems.push(`dataset ${de.datasetRecordId} 工件：${refProblem}`);
    }
    // experimentEvidence artifact hashes (result-set per-row refs, training logs,
    // FEM measurement tables since W3) must all resolve in the artifact store.
    for (const xe of bundle.experimentEvidence ?? []) {
      for (const h of xe.artifactHashes) {
        const p = await probeArtifact(artifacts, h);
        if (p !== null) dataProblems.push(`experiment ${xe.experimentRunId} 工件 ${h.slice(0, 12)}…：${p}`);
      }
    }
    checks.push({
      name: 'data_plane_evidence_resolvable',
      passed: dataProblems.length === 0,
      vacuous: dataEvidence.length === 0 && (bundle.experimentEvidence ?? []).length === 0,
      detail: dataEvidence.length === 0 && (bundle.experimentEvidence ?? []).length === 0
        ? '（pre-data-plane bundle：未声明 datasetEvidence/experimentEvidence — 检查空转通过）'
        : dataProblems.length === 0
          ? `${dataEvidence.length} 条 datasetEvidence 全部再解析：字段与 store 一致、lineage 一致、工件哈希核验通过；experimentEvidence 工件引用全部解析`
          : `${dataProblems.length} 处数据面证据校验失败：${dataProblems.join('；')}`,
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
    vacuousChecks: checks.filter((c) => c.vacuous === true).map((c) => c.name),
    ...(replayGuidance.length > 0 ? { replayGuidance } : {}),
  });
}
