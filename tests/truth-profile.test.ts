import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CorpusSnapshot, ProvenanceReceipt, ReproducibilityBundle, ResearchQuestion, newId } from '../src/domain/index.js';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { verifyBundle } from '../src/app/verify.js';
import { classifyTruth, truthDisclosureLine, truthProfileFromReceipts } from '../src/app/truth-profile.js';

// *** TEST-ONLY *** execution-truth plane (§5.5): deterministic classification rules over
// receipts, the disclosure line, and the verify-side regression lock that keeps non-live
// bundles from hiding their truth class. No network, no provider.

let tmp: string;
let db: Db;
let store: Store;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-truth-'));
  db = openDb(path.join(tmp, 'state.db'));
  store = new Store(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const at = (i: number) => new Date(1_700_000_000_000 + i * 1000).toISOString();

const modelReceipt = (runId: string, mode: 'live' | 'test') =>
  ProvenanceReceipt.parse({
    id: newId('rcp'), runId, kind: 'model_call', executionMode: mode, at: at(1),
    modelCall: { provider: 'p', modelId: 'm', usage: {}, latencyMs: 1, requestHash: 'a'.repeat(64), outputHash: 'b'.repeat(64) },
  });

const retrievalReceipt = (runId: string, cache?: 'hit' | 'stale' | 'replay') =>
  ProvenanceReceipt.parse({
    id: newId('rcp'), runId, kind: 'source_retrieval', executionMode: 'live', at: at(2),
    sourceRetrieval: { family: 'openalex', query: 'q', httpStatus: 200, resultCount: 1, contentHashes: [], ...(cache !== undefined ? { cache } : {}) },
  });

const exportReceipt = (runId: string) =>
  ProvenanceReceipt.parse({ id: newId('rcp'), runId, kind: 'export', executionMode: 'live', at: at(3) });

describe('classifyTruth — ordered rules over external-evidence receipts', () => {
  const m = { live: 0, test: 0 };
  const r = { live: 0, hit: 0, stale: 0, replay: 0 };

  it('empty when no model/retrieval evidence exists (local export/tool receipts are not inputs)', () => {
    expect(classifyTruth({ ...m }, { ...r })).toBe('empty');
  });

  it('live for live model calls and for live-only retrieval', () => {
    expect(classifyTruth({ live: 3, test: 0 }, { ...r })).toBe('live');
    expect(classifyTruth({ live: 0, test: 0 }, { live: 2, hit: 1, stale: 1, replay: 0 })).toBe('live');
  });

  it('mixed when live and test model calls coexist, or live models ran over replayed retrieval', () => {
    expect(classifyTruth({ live: 2, test: 1 }, { ...r })).toBe('mixed');
    expect(classifyTruth({ live: 2, test: 0 }, { live: 0, hit: 0, stale: 0, replay: 3 })).toBe('mixed');
  });

  it('synthetic for test-only model calls', () => {
    expect(classifyTruth({ live: 0, test: 4 }, { live: 1, hit: 0, stale: 0, replay: 0 })).toBe('synthetic');
  });

  it('recorded_replay when nothing touched the external world this run', () => {
    expect(classifyTruth({ ...m }, { live: 0, hit: 2, stale: 0, replay: 0 })).toBe('recorded_replay');
    expect(classifyTruth({ ...m }, { live: 0, hit: 0, stale: 1, replay: 2 })).toBe('recorded_replay');
  });
});

describe('truthProfileFromReceipts — counts and disclosure line', () => {
  it('classifies a full receipt mix and renders every count in the disclosure', () => {
    const runId = newId('run');
    const receipts = [
      modelReceipt(runId, 'live'), modelReceipt(runId, 'live'), modelReceipt(runId, 'test'),
      retrievalReceipt(runId), retrievalReceipt(runId, 'hit'), retrievalReceipt(runId, 'stale'),
      retrievalReceipt(runId, 'replay'), exportReceipt(runId),
    ];
    const p = truthProfileFromReceipts(runId, receipts);
    expect(p.klass).toBe('mixed');
    expect(p.modelCalls).toEqual({ live: 2, test: 1 });
    expect(p.retrieval).toEqual({ live: 1, hit: 1, stale: 1, replay: 1 });
    expect(p.totalReceipts).toBe(8);
    const line = truthDisclosureLine(p);
    expect(line).toContain('mixed');
    expect(line).toContain('live 模型调用 2 次');
    expect(line).toContain('确定性测试调用 1 次');
    expect(line).toContain('记录重放 1 次');
    expect(line).toContain('共 8 条回执');
  });

  it('store-backed projection reads the run receipts (empty class for export-only)', () => {
    const runId = newId('run');
    for (const r of [exportReceipt(runId), exportReceipt(runId)]) store.putObject('receipt', r);
    const p = truthProfileFromReceipts(runId, store.listObjects('receipt', runId) as ProvenanceReceipt[]);
    expect(p.klass).toBe('empty');
    expect(p.totalReceipts).toBe(2);
  });
});

describe('verify enforcement — non-live bundles must disclose their truth class', () => {
  const buildBundle = async (runId: string, receiptIds: string[], limitations: string[], route: 'live' | 'test_only'): Promise<string> => {
    const artifacts = openArtifactStore(path.join(tmp, 'artifacts'));
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'does X cause Y?', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: at(0),
    });
    const corpus = CorpusSnapshot.parse({
      id: newId('corp'), runId, queries: [{ purpose: 'discovery', text: 'q' }], documentIds: [], createdAt: at(0), familyFailures: [],
    });
    store.putObject('question', q);
    store.putObject('corpus_snapshot', corpus);
    const final = await artifacts.put('# report');
    const bundle = ReproducibilityBundle.parse({
      id: newId('bnd'), runId, declaredEvidenceLevel: 'replay', codeRevision: 'unknown',
      environmentFingerprint: 'node test', dependencyLockHash: 'a'.repeat(64),
      questionRef: q.id, corpusSnapshotRef: corpus.id, sourceArtifactHashes: [],
      modelMetadata: [{ provider: 'p', modelId: 'm', route }], receiptIds, finalArtifactHashes: [final.hash],
      verificationInstructions: 'far verify <id>', limitations, createdAt: at(9),
    });
    store.putObject('bundle', bundle);
    return bundle.id;
  };

  it('fails the receipts check when a synthetic run hides its class (no disclosure line)', async () => {
    const runId = newId('run');
    const r1 = modelReceipt(runId, 'test');
    store.putObject('receipt', r1);
    const bundleId = await buildBundle(runId, [r1.id], ['模型环节为 LLM 生成、具有非确定性。'], 'test_only');
    const report = await verifyBundle(bundleId, { store, artifacts: openArtifactStore(path.join(tmp, 'artifacts')) });
    const check = report.checks.find((c) => c.name === 'receipts_readable_and_model_metadata_consistent');
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain('执行真实性为 synthetic');
  });

  it('passes when the disclosure line is present, and live runs need none', async () => {
    const runId = newId('run');
    const r1 = modelReceipt(runId, 'test');
    store.putObject('receipt', r1);
    const withLine = await buildBundle(runId, [r1.id], ['模型环节为 LLM 生成、具有非确定性。', truthDisclosureLine(truthProfileFromReceipts(runId, [r1]))], 'test_only');
    const artifacts = openArtifactStore(path.join(tmp, 'artifacts'));
    const report1 = await verifyBundle(withLine, { store, artifacts });
    const check1 = report1.checks.find((c) => c.name === 'receipts_readable_and_model_metadata_consistent');
    expect(check1?.passed).toBe(true);

    const runId2 = newId('run');
    const r2 = modelReceipt(runId2, 'live');
    store.putObject('receipt', r2);
    const liveBundle = await buildBundle(runId2, [r2.id], ['模型环节为 LLM 生成、具有非确定性。'], 'live');
    const report2 = await verifyBundle(liveBundle, { store, artifacts });
    const check2 = report2.checks.find((c) => c.name === 'receipts_readable_and_model_metadata_consistent');
    expect(check2?.passed).toBe(true);
    expect(check2?.detail).toContain('执行真实性=live');
  });
});
