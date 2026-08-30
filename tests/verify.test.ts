import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CorpusSnapshot, ProvenanceReceipt, ReproducibilityBundle, ResearchQuestion, newId } from '../src/domain/index.js';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { sha256Hex } from '../src/shared/crypto.js';
import { VerificationReport, VERIFY_CHECK_NAMES, verifyBundle } from '../src/app/verify.js';

// *** TEST-ONLY *** fixture: a minimal but fully legal reproducibility bundle hand-built
// against a throwaway temp SQLite db + artifact store (no network, no live provider).
// Every hash in the bundle addresses real content we put into the artifact store, so the
// verification path exercises real sha256 recomputation, not mocks.

let tmp: string;
let db: Db;
let store: Store;
let artifacts: ReturnType<typeof openArtifactStore>;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-verify-'));
  db = openDb(path.join(tmp, 'state.db'));
  store = new Store(db);
  artifacts = openArtifactStore(path.join(tmp, 'artifacts'));
});

afterEach(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const base = Date.now();
const ts = (i: number) => new Date(base + i * 1000).toISOString();
const ghost = (prefix: string) => `${prefix}_${'0'.repeat(26)}`; // well-formed but nonexistent

const lockHashHere = (): string => sha256Hex(fs.readFileSync(path.join(process.cwd(), 'package-lock.json')));

const modelCallReceipt = (runId: string): ProvenanceReceipt =>
  ProvenanceReceipt.parse({
    id: newId('rcp'),
    runId,
    kind: 'model_call',
    executionMode: 'live',
    at: ts(1),
    modelCall: {
      provider: 'test-stub',
      modelId: 'test-stub',
      usage: {},
      latencyMs: 5,
      requestHash: sha256Hex('request'),
      outputHash: sha256Hex('output'),
    },
  });

const exportReceipt = (runId: string): ProvenanceReceipt =>
  ProvenanceReceipt.parse({
    id: newId('rcp'),
    runId,
    kind: 'export',
    executionMode: 'live',
    at: ts(2),
    redactionNote: 'deterministic render of stored objects; no model call involved',
  });

interface WorldRefs {
  runId: string;
  question: ResearchQuestion;
  corpus: CorpusSnapshot;
  srcA: { hash: string };
  srcB: { hash: string };
  final: { hash: string };
  r1: ProvenanceReceipt;
  r2: ProvenanceReceipt;
  bundle: ReproducibilityBundle;
}

/** Builds and persists a fully valid world; `mutate` tweaks the bundle draft BEFORE zod parse. */
const buildWorld = async (
  mutate?: (draft: Record<string, unknown>, refs: Omit<WorldRefs, 'bundle'>) => void,
): Promise<WorldRefs> => {
  const runId = newId('run');
  const question = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Why do CRISPR base editors cause off-target edits?',
    background: '',
    goalType: 'explanatory',
    scope: { domain: 'genome editing', phenomena: ['off-target edits'] },
    constraints: {},
    createdAt: ts(0),
  });
  const corpus = CorpusSnapshot.parse({
    id: newId('corp'),
    runId,
    queries: [{ purpose: 'discovery', text: 'base editing off-target' }],
    documentIds: [],
    createdAt: ts(3),
    familyFailures: [],
  });
  store.putObject('question', question);
  store.putObject('corpus_snapshot', corpus);

  const srcA = await artifacts.put('{"normalized":"source snapshot A"}');
  const srcB = await artifacts.put('{"normalized":"source snapshot B"}');
  const final = await artifacts.put('# FAR-Lab 研究报告（测试工件）\n');

  const r1 = modelCallReceipt(runId);
  const r2 = exportReceipt(runId);
  store.putObject('receipt', r1);
  store.putObject('receipt', r2);

  const refs = { runId, question, corpus, srcA, srcB, final, r1, r2 };
  const draft: Record<string, unknown> = {
    id: newId('bnd'),
    runId,
    declaredEvidenceLevel: 'replay',
    codeRevision: 'unknown',
    environmentFingerprint: `node ${process.version} ${process.platform}`,
    dependencyLockHash: lockHashHere(),
    questionRef: question.id,
    corpusSnapshotRef: corpus.id,
    sourceArtifactHashes: [srcA.hash, srcB.hash],
    modelMetadata: [{ provider: 'test-stub', modelId: 'test-stub', route: 'live' }],
    receiptIds: [r1.id, r2.id],
    finalArtifactHashes: [final.hash],
    verificationInstructions: 'far verify --bundle <id>（第三方核验：按 receiptIds 比对 receipts、按 sourceArtifactHashes 比对来源快照、按 finalArtifactHashes 比对导出工件）',
    limitations: ['模型环节为 LLM 生成、具有非确定性：不保证重新生成逐字节一致的输出。'],
    createdAt: ts(4),
  };
  mutate?.(draft, refs);
  const bundle = ReproducibilityBundle.parse(draft);
  store.putObject('bundle', bundle);
  return { ...refs, bundle };
};

const byName = (report: VerificationReport) => new Map(report.checks.map((c) => [c.name, c]));

/** All checks except `exceptName` must pass — proves single-cause failures. */
const expectOnlyFailure = (report: VerificationReport, exceptName: string): void => {
  expect(report.failedChecks).toEqual([exceptName]);
  const m = byName(report);
  for (const name of VERIFY_CHECK_NAMES) {
    if (name !== exceptName) expect(m.get(name)?.passed, `check "${name}" should pass`).toBe(true);
  }
};

describe('verifyBundle', () => {
  it('verifies a fully legal bundle: all 10 checks pass, verdict verified', async () => {
    const w = await buildWorld();
    const report = await verifyBundle(w.bundle.id, { store, artifacts });

    expect(report.verdict).toBe('verified');
    expect(report.failedChecks).toEqual([]);
    expect(report.bundleId).toBe(w.bundle.id);
    expect(report.runId).toBe(w.runId);
    expect(report.declaredEvidenceLevel).toBe('replay');
    // fixed shape: same 10 checks in the same order — third parties can key on names
    expect(report.checks.map((c) => c.name)).toEqual([...VERIFY_CHECK_NAMES]);
    const m = byName(report);
    for (const name of VERIFY_CHECK_NAMES) expect(m.get(name)?.passed, `check "${name}"`).toBe(true);

    // spot-check the real-work details of the non-trivial checks
    expect(m.get('receipts_readable_and_model_metadata_consistent')?.detail).toContain('2 条 receipt 全部可读取');
    expect(m.get('dependency_lock_hash_matches')?.detail).toContain('一致');
    expect(m.get('question_ref_resolvable')?.detail).toContain('off-target');

    // replay guidance points at the bundle's verificationInstructions
    expect(report.replayGuidance).toBeTruthy();
    expect(report.replayGuidance).toContain(w.bundle.verificationInstructions);

    // the report itself satisfies the published schema (machine-readable contract)
    expect(() => VerificationReport.parse(report)).not.toThrow();
  });

  it('marks vacuous passes on a minimal (pre-feature) bundle — never readable as strong verification', async () => {
    const w = await buildWorld();
    const report = await verifyBundle(w.bundle.id, { store, artifacts });
    expect(report.verdict).toBe('verified');
    expect(report.vacuousChecks).toEqual(expect.arrayContaining([
      'claim_taint_labels_present',
      'paper_outline_ref_resolvable',
      'figures_tables_refs_resolvable',
      'protocol_evidence_resolvable',
      'data_plane_evidence_resolvable',
    ]));
    const m = byName(report);
    for (const name of report.vacuousChecks ?? []) expect(m.get(name)?.vacuous).toBe(true);
    for (const name of VERIFY_CHECK_NAMES) {
      if ((report.vacuousChecks ?? []).includes(name)) continue;
      expect(m.get(name)?.vacuous ?? false, name).toBe(false);
    }
  });

  it('fails when a sourceArtifactHash is tampered (artifact not found at that address)', async () => {
    const tampered = sha256Hex('tampered-source');
    const w = await buildWorld((draft) => {
      (draft.sourceArtifactHashes as string[])[0] = tampered;
    });
    const report = await verifyBundle(w.bundle.id, { store, artifacts });

    expect(report.verdict).toBe('failed');
    expectOnlyFailure(report, 'source_artifact_hashes');
    const check = byName(report).get('source_artifact_hashes');
    expect(check?.detail).toContain(tampered.slice(0, 16));
    expect(check?.detail).toContain('不存在');
  });

  it('fails when an artifact file is deleted from the store', async () => {
    const w = await buildWorld();
    fs.rmSync(artifacts.path(w.final.hash));
    const report = await verifyBundle(w.bundle.id, { store, artifacts });

    expect(report.verdict).toBe('failed');
    expectOnlyFailure(report, 'final_artifact_hashes');
    expect(byName(report).get('final_artifact_hashes')?.detail).toContain('不存在');
  });

  it('fails on empty limitations (honesty hard gate: LLM non-determinism must be declared)', async () => {
    const w = await buildWorld((draft) => {
      draft.limitations = [];
    });
    const report = await verifyBundle(w.bundle.id, { store, artifacts });

    expect(report.verdict).toBe('failed');
    expectOnlyFailure(report, 'limitations_nonempty');
    expect(byName(report).get('limitations_nonempty')?.detail).toContain('不诚实');
  });

  it('degrades (not fails) when only the dependency lock hash drifted', async () => {
    const stale = sha256Hex('stale-lock-from-another-env');
    const w = await buildWorld((draft) => {
      draft.dependencyLockHash = stale;
    });
    const report = await verifyBundle(w.bundle.id, { store, artifacts });

    expect(report.verdict).toBe('degraded');
    expectOnlyFailure(report, 'dependency_lock_hash_matches');
    const check = byName(report).get('dependency_lock_hash_matches');
    expect(check?.detail).toContain(stale);          // declared value surfaced
    expect(check?.detail).toContain(lockHashHere()); // current value surfaced — no silent pass
  });

  it('returns a fail-closed failed report for a nonexistent bundleId (no throw)', async () => {
    const report = await verifyBundle(ghost('bnd'), { store, artifacts });

    expect(report.verdict).toBe('failed');
    expect(report.runId).toBe('unknown');
    expect(report.declaredEvidenceLevel).toBe('unknown');
    expect(report.replayGuidance).toBeUndefined();
    // shape invariant holds; nothing claims a pass when the bundle cannot even be read
    expect(report.checks.map((c) => c.name)).toEqual([...VERIFY_CHECK_NAMES]);
    expect(report.checks.every((c) => !c.passed)).toBe(true);
    expect(report.checks[0]?.detail).toContain('不存在');
  });

  it('fails when modelMetadata declares a model pair absent from the receipts', async () => {
    const w = await buildWorld((draft) => {
      (draft.modelMetadata as { provider: string; modelId: string; route: string }[]).push({
        provider: 'ghost-provider',
        modelId: 'ghost-model',
        route: 'test_only',
      });
    });
    const report = await verifyBundle(w.bundle.id, { store, artifacts });

    expect(report.verdict).toBe('failed');
    expectOnlyFailure(report, 'receipts_readable_and_model_metadata_consistent');
    expect(byName(report).get('receipts_readable_and_model_metadata_consistent')?.detail).toContain('ghost-provider|ghost-model');
  });

  it('fails when a receiptId dangles (receipt not in store)', async () => {
    const missingId = ghost('rcp');
    const w = await buildWorld((draft, refs) => {
      draft.receiptIds = [refs.r1.id, missingId];
    });
    const report = await verifyBundle(w.bundle.id, { store, artifacts });

    expect(report.verdict).toBe('failed');
    expectOnlyFailure(report, 'receipts_readable_and_model_metadata_consistent');
    expect(byName(report).get('receipts_readable_and_model_metadata_consistent')?.detail).toContain(missingId);
  });

  it('fails when a receipt route contradicts the declared modelMetadata route', async () => {
    // declared route 'live' but the only model_call receipt ran in test mode
    const runId = newId('run');
    const testModeReceipt = ProvenanceReceipt.parse({
      ...modelCallReceipt(runId), id: newId('rcp'), executionMode: 'test',
    });
    store.putObject('receipt', testModeReceipt);
    const question = ResearchQuestion.parse({
      id: newId('q'), text: 'q', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: ts(0),
    });
    store.putObject('question', question);
    const corpus = CorpusSnapshot.parse({
      id: newId('corp'), runId, queries: [{ purpose: 'discovery', text: 't' }],
      documentIds: [], createdAt: ts(1), familyFailures: [],
    });
    store.putObject('corpus_snapshot', corpus);
    const final = await artifacts.put('final artifact');
    const bundle = ReproducibilityBundle.parse({
      id: newId('bnd'), runId, declaredEvidenceLevel: 'inspect', codeRevision: 'unknown',
      environmentFingerprint: `node ${process.version} ${process.platform}`,
      dependencyLockHash: lockHashHere(),
      questionRef: question.id, corpusSnapshotRef: corpus.id,
      sourceArtifactHashes: [], modelMetadata: [{ provider: 'test-stub', modelId: 'test-stub', route: 'live' }],
      receiptIds: [testModeReceipt.id], finalArtifactHashes: [final.hash],
      verificationInstructions: 'inspect only', limitations: ['非确定性'],
      createdAt: ts(2),
    });
    store.putObject('bundle', bundle);

    const report = await verifyBundle(bundle.id, { store, artifacts });
    expect(report.verdict).toBe('failed');
    expectOnlyFailure(report, 'receipts_readable_and_model_metadata_consistent');
    expect(byName(report).get('receipts_readable_and_model_metadata_consistent')?.detail).toContain('route 与 executionMode 不一致');
    // inspect level => no replay guidance
    expect(report.replayGuidance).toBeUndefined();
  });
});
