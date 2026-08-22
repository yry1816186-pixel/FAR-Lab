import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createApiServer } from '../src/server/api.js';
import type { ApiServer } from '../src/server/api.js';
import { openDb } from '../src/persistence/db.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import {
  CorpusSnapshot,
  EvidenceRelation,
  FeedbackSignal,
  HypothesisCandidate,
  HypothesisScorecard,
  ProvenanceReceipt,
  ResearchPlan,
  ResearchQuestion,
  ReproducibilityBundle,
  Revision,
  ScientificClaim,
  SourceDocument,
  VersionDiff,
  newId,
} from '../src/domain/index.js';

// *** TEST-ONLY *** HTTP API layer over the real kernel: real Store/SQLite in a throwaway
// temp dir, real object graph pre-seeded (pipeline stages are NOT run — the provider is
// an empty scripted stub that fails loudly if any model call happens), and run execution
// injected through the documented executor test seam (an immediately-resolving executor,
// NOT a mock of the orchestrator).

let tmp: string;
let app: App;
let api: ApiServer;
let staticApi: ApiServer;
let base: string;
let staticBase: string;
let staticPort = 0;

/** Executor test seam: records calls; completes the run in store unless blockNext is set. */
let blockNext = false;
const blockers: Array<() => void> = [];
const executorCalls: string[] = [];
const executor = (runId: string): Promise<unknown> =>
  new Promise((resolve) => {
    executorCalls.push(runId);
    if (blockNext) {
      blockers.push(() => resolve(null));
      return;
    }
    const run = app.store.getRun(runId);
    if (run) {
      const now = new Date().toISOString();
      for (const s of run.stages) {
        s.state = 'done';
        s.endedAt = now;
      }
      run.status = 'completed';
      run.currentStage = 'export';
      delete run.lastError;
      app.store.updateRun(run);
    }
    resolve(run);
  });

// ---- seeded fixture graph ---------------------------------------------------

const T0 = Date.now() - 200_000;
const ts = (i: number) => new Date(T0 + i * 1000).toISOString();
const REPORT_MD = '# FAR-Lab 研究报告（test seed）\n\n来自预置对象图的确定性报告内容。\n';

let run1 = ''; // completed run with the full object graph (bundle NEWER than revision)
let run2 = ''; // run whose revision is NEWER than its bundle (re-exportable)
let run3 = ''; // partial run with lastError, no objects
let run4 = ''; // corrupted doc row (fail-closed 500 path)
let q1 = '';
let plan1 = '';
let hyp1 = '';
let bundle1 = '';
let reportHash = '';

const seedCompletedRun = async (): Promise<void> => {
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Why do CRISPR base editors cause off-target edits?',
    background: 'prior work shows motif-dependent off-targets',
    goalType: 'explanatory',
    scope: { domain: 'genome editing', phenomena: ['off-target edits'] },
    constraints: {},
    createdAt: ts(1),
  });
  q1 = q.id;
  const run = app.store.createRun(q);
  run1 = run.id;
  for (const s of run.stages) {
    s.state = 'done';
    s.endedAt = ts(40);
  }
  run.status = 'completed';
  run.currentStage = 'export';
  app.store.updateRun(run);
  app.store.appendEvent(run.id, { type: 'stage_done', stage: 'scope', detail: { summary: 'seeded' } });
  app.store.appendEvent(run.id, { type: 'note', detail: { text: 'seeded fixture run' } });

  const src = SourceDocument.parse({
    id: newId('src'),
    runId: run.id,
    family: 'openalex',
    identifiers: [{ kind: 'doi', value: '10.1000/example-resolved' }],
    title: 'Resolved study of off-target editing',
    publicationYear: 2024,
    authors: ['A. Researcher'],
    contentDepth: 'abstract',
    accessState: 'open',
    contentHash: 'a'.repeat(64),
    retrievedAt: ts(2),
    parseStatus: 'ok',
    verification: { method: 'crossref_doi', resolved: true, titleMatch: true, detail: 'doi resolved', checkedAt: ts(2) },
  });
  app.store.putObject('source_document', src);

  const corpus = CorpusSnapshot.parse({
    id: newId('corp'),
    runId: run.id,
    queries: [{ purpose: 'discovery', text: 'base editing off-target' }],
    documentIds: [src.id],
    createdAt: ts(3),
    familyFailures: [],
  });
  app.store.putObject('corpus_snapshot', corpus);

  const clm = ScientificClaim.parse({
    id: newId('clm'),
    runId: run.id,
    text: 'CBE causes C-to-T off-target mutations at specific motifs',
    locators: [{ sourceDocumentId: src.id, quote: 'off-target C-to-T mutations were observed' }],
    bindingStatus: 'verified',
    alignmentChecked: true,
    uncertainties: [],
  });
  app.store.putObject('claim', clm);

  const hyp = HypothesisCandidate.parse({
    id: newId('hyp'),
    runId: run.id,
    version: 0,
    statement: 'Off-targeting is driven by deaminase exposure duration',
    mechanism: 'longer exposure window increases bystander deamination',
    derivation: { strategy: 'mechanism_driven', rationale: 'from timing evidence', inputClaimIds: [clm.id] },
    assumptions: [{ id: 'a1', statement: 'deaminase acts independently of Cas9', kind: 'empirical', backingClaimIds: [] }],
    predictions: ['shortened exposure reduces off-target rate'],
    supportingClaimIds: [clm.id],
    counterClaimIds: [],
    uncertainties: [],
    noveltyLabel: 'evidence_grounded',
    testability: 'testable_now',
    clusterKey: 'duration-mechanism',
    createdAt: ts(5),
  });
  hyp1 = hyp.id;
  app.store.putObject('hypothesis', hyp);

  app.store.putObject(
    'scorecard',
    HypothesisScorecard.parse({
      id: 'scorecard-seed-1',
      runId: run.id,
      hypothesisId: hyp.id,
      dimensions: [
        {
          dimension: 'falsifiability',
          value: 0.7,
          rationale: 'clear decision rule',
          evidenceClaimIds: [],
          producer: 'test-stub',
          calibration: 'uncalibrated_llm_judgment',
        },
      ],
      overallRationale: 'grounded but narrow evidence base',
      rankedOutOf: 1,
      rank: 1,
    }),
  );

  app.store.putObject(
    'evidence_relation',
    EvidenceRelation.parse({
      id: newId('ev'),
      runId: run.id,
      relation: 'supports',
      claimId: clm.id,
      targetHypothesisId: hyp.id,
      rationale: 'direct measurement backs the duration mechanism',
      strength: 'moderate',
      uncertainties: [],
      createdAt: ts(6),
    }),
  );

  const plan = ResearchPlan.parse({
    id: newId('pln'),
    runId: run.id,
    objective: 'Discriminate duration-driven vs structure-driven off-target mechanisms',
    hypothesisIds: [hyp.id],
    variables: ['exposure duration'],
    controls: ['mock transfection'],
    inclusionCriteria: [],
    exclusionCriteria: [],
    dataRequirements: [],
    toolRequirements: [],
    steps: [
      {
        id: newId('task'),
        title: 'collect duration series',
        kind: 'experiment',
        inputs: ['cells'],
        outputs: ['sequencing data'],
        method: 'transfect at 6 timepoints',
        failureConditions: ['low transfection efficiency'],
        dependsOn: [],
      },
    ],
    metrics: ['off-target/on-target ratio'],
    statistics: [],
    decisionRules: {
      successCriterion: '>=2x off-target increase',
      weakeningCriterion: 'flat response',
      falsificationCriterion: 'no relationship across cell lines',
      stopCriterion: '3 cell lines completed',
    },
    confounders: [],
    alternativeExplanations: [],
    resources: {},
    risks: [],
    ethics: [],
    prerequisites: [],
    evidenceClaimIds: [clm.id],
    executabilityCheck: { passed: true, missing: [] },
    createdAt: ts(10),
  });
  plan1 = plan.id;
  app.store.putObject('plan', plan);

  // feedback + revision + diff — createdAt BEFORE the bundle so run1 is NOT re-exportable
  const fbk = FeedbackSignal.parse({
    id: newId('fbk'),
    runId: run.id,
    source: 'human_expert',
    content: 'consider strand bias in the analysis',
    provenance: 'test seed',
    receivedAt: ts(20),
  });
  app.store.putObject('feedback', fbk);
  const revision = Revision.parse({
    id: newId('rev'),
    runId: run.id,
    triggerFeedbackId: fbk.id,
    causalReason: 'expert noted strand bias as confounder',
    operations: [
      {
        objectType: 'hypothesis',
        objectId: hyp.id,
        operation: 'refine',
        before: 'v0',
        after: 'v1',
        reason: 'strand bias must be controlled',
      },
    ],
    fromVersionLabel: `${hyp.id}@v0`,
    toVersionLabel: `${hyp.id}@v1`,
    qualityDelta: { status: 'improved', claim: 'expert judgment (seed)', evidenceRefs: [] },
    createdAt: ts(30),
  });
  app.store.putObject('revision', revision);
  app.store.putObject(
    'version_diff',
    VersionDiff.parse({
      revisionId: revision.id,
      runId: run.id,
      entries: [{ objectType: 'hypothesis', objectId: hyp.id, summary: 'added strand-bias control', changedFields: ['statement'] }],
      semanticSummary: 'feedback propagated to hypothesis v1',
      remainingUncertainties: [],
    }),
  );

  const receipt = ProvenanceReceipt.parse({
    id: newId('rcp'),
    runId: run.id,
    kind: 'export',
    executionMode: 'live',
    at: ts(95),
    stage: 'export',
  });
  app.store.putObject('receipt', receipt);

  // the report artifact is content-addressed: the bundle's finalArtifactHashes[0] must
  // resolve to REAL bytes in the artifact store (GET /report serves exactly this)
  const reportPut = await app.artifacts.put(REPORT_MD);
  reportHash = reportPut.hash;

  // bundle createdAt (ts 98) is NEWER than the revision (ts 30) => run1 is NOT re-exportable
  const bundle = ReproducibilityBundle.parse({
    id: newId('bnd'),
    runId: run.id,
    declaredEvidenceLevel: 'replay',
    codeRevision: 'unknown',
    environmentFingerprint: 'node test win32',
    dependencyLockHash: 'a'.repeat(64), // deliberately wrong => verify verdict 'degraded'
    questionRef: q.id,
    corpusSnapshotRef: corpus.id,
    sourceArtifactHashes: [],
    modelMetadata: [],
    receiptIds: [receipt.id],
    finalArtifactHashes: [reportHash],
    verificationInstructions: 'far verify <bundle-id> (test seed)',
    limitations: ['LLM 环节存在非确定性（seed）'],
    createdAt: ts(98),
  });
  bundle1 = bundle.id;
  app.store.putObject('bundle', bundle);
};

const seedRun2 = async (): Promise<void> => {
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Question for re-export flow',
    background: '',
    goalType: 'explanatory',
    scope: { domain: 'd', phenomena: ['p'] },
    constraints: {},
    createdAt: ts(50),
  });
  const run = app.store.createRun(q);
  run2 = run.id;
  // stale bundle first…
  app.store.putObject(
    'bundle',
    ReproducibilityBundle.parse({
      id: newId('bnd'),
      runId: run.id,
      declaredEvidenceLevel: 'inspect',
      codeRevision: 'unknown',
      environmentFingerprint: 'node test',
      dependencyLockHash: 'b'.repeat(64),
      questionRef: q.id,
      corpusSnapshotRef: 'corp_ghost',
      sourceArtifactHashes: [],
      modelMetadata: [],
      receiptIds: [],
      finalArtifactHashes: [],
      verificationInstructions: 'far verify <id>',
      limitations: ['LLM 非确定性'],
      createdAt: ts(60),
    }),
  );
  // …then a newer feedback + revision (the re-export precondition)
  const fbk = FeedbackSignal.parse({
    id: newId('fbk'),
    runId: run.id,
    source: 'reviewer',
    content: 'plan needs a power analysis',
    provenance: 'test seed',
    receivedAt: ts(70),
  });
  app.store.putObject('feedback', fbk);
  app.store.putObject(
    'revision',
    Revision.parse({
      id: newId('rev'),
      runId: run.id,
      triggerFeedbackId: fbk.id,
      causalReason: 'reviewer required power analysis',
      operations: [{ objectType: 'plan', objectId: 'pln_ghost', operation: 'modify', reason: 'add power analysis' }],
      fromVersionLabel: 'pre',
      toVersionLabel: 'post',
      qualityDelta: { status: 'improved', claim: 'seed', evidenceRefs: [] },
      createdAt: ts(80), // newer than the bundle at ts(60)
    }),
  );
};

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-api-'));
  app = await createApp({
    dataDir: tmp,
    providerOverride: createTestStubProvider([]), // no live route; empty script fails loudly if called
  });

  await seedCompletedRun();
  await seedRun2();
  // run3: partial with a visible failure
  const q3 = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Question for a partial run',
    background: '',
    goalType: 'exploratory',
    scope: { domain: 'd', phenomena: ['p'] },
    constraints: {},
    createdAt: ts(90),
  });
  const r3 = app.store.createRun(q3);
  run3 = r3.id;
  r3.status = 'partial';
  r3.currentStage = 'retrieve';
  r3.lastError = 'retrieve failed: source unavailable (seed)';
  const rec = r3.stages.find((s) => s.stage === 'retrieve');
  if (rec) {
    rec.state = 'failed';
    rec.error = 'retrieve failed: source unavailable (seed)';
  }
  app.store.updateRun(r3);

  // run4: valid row; its doc gets corrupted (and restored) inside the fail-closed test
  const q4 = ResearchQuestion.parse({
    id: newId('q'),
    text: 'corrupt run',
    background: '',
    goalType: 'explanatory',
    scope: { domain: 'd', phenomena: ['p'] },
    constraints: {},
    createdAt: ts(95),
  });
  const r4 = app.store.createRun(q4);
  run4 = r4.id;

  // main API server: staticRoot points at a directory that does not exist (no fake frontend)
  api = createApiServer(app, { port: 0, executor, staticRoot: path.join(tmp, 'no-web-dist') });
  const port = await api.start();
  base = `http://127.0.0.1:${port}`;

  // second server with a real static root for the file-serving tests
  const staticRoot = path.join(tmp, 'web-dist');
  fs.mkdirSync(path.join(staticRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(staticRoot, 'index.html'), '<!doctype html><title>far workbench</title>');
  fs.writeFileSync(path.join(staticRoot, 'assets', 'style.css'), 'body{margin:0}');
  staticApi = createApiServer(app, { port: 0, executor, staticRoot });
  staticPort = await staticApi.start();
  staticBase = `http://127.0.0.1:${staticPort}`;
});

afterAll(async () => {
  for (const release of blockers) release();
  await Promise.allSettled([api.stop(), staticApi.stop()]);
  app.close();
});

// ---- helpers ---------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- HTTP-layer tests assert arbitrary JSON shapes
type Json = any;

const getJson = async (url: string): Promise<{ status: number; body: Json; contentType: string }> => {
  const res = await fetch(url);
  return {
    status: res.status,
    body: await res.json(),
    contentType: res.headers.get('content-type') ?? '',
  };
};

const postJson = async (url: string, body: unknown): Promise<{ status: number; body: Json }> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text.length > 0 ? JSON.parse(text) : null };
};

/** Raw request that preserves the exact path (fetch/URL normalize dot segments away). */
const rawGet = (port: number, rawPath: string): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method: 'GET' }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });

const waitUntil = async (pred: () => boolean, ms = 5000): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('waitUntil: condition not met in time');
};

// ---- runs list / detail ------------------------------------------------------

describe('GET /api/v1/runs and /api/v1/runs/:id', () => {
  it('lists runs with domain progress and no invented fields', async () => {
    const { status, body } = await getJson(`${base}/api/v1/runs`);
    expect(status).toBe(200);
    const ids = body.runs.map((r: { id: string }) => r.id);
    expect(ids).toContain(run1);
    expect(ids).toContain(run3);
    const completed = body.runs.find((r: { id: string }) => r.id === run1);
    expect(completed.status).toBe('completed');
    expect(completed.currentStage).toBe('export');
    expect(typeof completed.createdAt).toBe('string');
    expect(completed.progress).toEqual({ done: 9, total: 9 }); // core stages only (feedback/revise excluded)
    expect(completed.lastError).toBeUndefined();
    const partial = body.runs.find((r: { id: string }) => r.id === run3);
    expect(partial.lastError).toContain('retrieve failed');
    expect(partial.progress).toEqual({ done: 0, total: 9 }); // failed stage: honestly not done
    for (const r of body.runs) {
      const keys = Object.keys(r);
      expect(keys.every((k) => ['id', 'status', 'currentStage', 'createdAt', 'lastError', 'progress'].includes(k))).toBe(true);
    }
  });

  it('returns the full run document for a known run', async () => {
    const { status, body } = await getJson(`${base}/api/v1/runs/${run1}`);
    expect(status).toBe(200);
    expect(body.id).toBe(run1);
    expect(body.status).toBe('completed');
    expect(Array.isArray(body.stages)).toBe(true);
    expect(body.stages).toHaveLength(11);
    expect(body.lastError).toBeUndefined();
  });

  it('404s with the error envelope for an unknown run', async () => {
    const ghost = `run_${'0'.repeat(26)}`;
    const { status, body } = await getJson(`${base}/api/v1/runs/${ghost}`);
    expect(status).toBe(404);
    expect(body.error).toEqual({
      code: 'not_found',
      message: expect.stringContaining(ghost),
      retryable: false,
      runId: ghost,
    });
  });

  it('500s with retryable=true when the run doc is corrupt (fail-closed, visible)', async () => {
    // corrupt the doc via a second connection, then restore it so later list reads stay healthy
    const original = JSON.stringify(app.store.getRun(run4));
    const db2 = openDb(path.join(tmp, 'far.db'));
    try {
      db2.prepare('UPDATE runs SET doc = ? WHERE id = ?').run('{"id": "run_broken_not_json', run4);
    } finally {
      db2.close();
    }
    try {
      const { status, body } = await getJson(`${base}/api/v1/runs/${run4}`);
      expect(status).toBe(500);
      expect(body.error.code).toBe('internal');
      expect(body.error.retryable).toBe(true);
    } finally {
      const db3 = openDb(path.join(tmp, 'far.db'));
      db3.prepare('UPDATE runs SET doc = ? WHERE id = ?').run(original, run4);
      db3.close();
    }
  });

  it('projects leaseInfo so the UI can surface frozen-run state (D-060)', async () => {
    const { status, body } = await getJson(`${base}/api/v1/runs/${run1}`);
    expect(status).toBe(200);
    expect(typeof body.leaseInfo.live).toBe('boolean');
    expect(body.leaseInfo).toHaveProperty('holder');
    // no executor holds a lease in these tests — live must be false, holder null
    expect(body.leaseInfo.live).toBe(false);
    expect(body.leaseInfo.holder).toBeNull();
  });

  it('lists bundles as a first-class resource (D-060: replaces client event-regex scan)', async () => {
    const { status, body } = await getJson(`${base}/api/v1/runs/${run1}/bundles`);
    expect(status).toBe(200);
    expect(Array.isArray(body.bundles)).toBe(true);
    expect(body.bundles.length).toBeGreaterThan(0);
    const seeded = body.bundles.find((b: { id: string }) => b.id === bundle1);
    expect(seeded).toBeDefined();
    expect(seeded.evidenceLevel).toBeDefined();

    const ghost = `run_${'0'.repeat(26)}`;
    const ghostRes = await getJson(`${base}/api/v1/runs/${ghost}/bundles`);
    expect(ghostRes.status).toBe(404);
  });

  it('GET /api/v1/health reports real DB state and route readiness without key values (D-060)', async () => {
    const { status, body } = await getJson(`${base}/api/v1/health`);
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
    expect(Array.isArray(body.providers)).toBe(true);
    const deepseek = body.providers.find((p: { name: string }) => p.name === 'deepseek');
    expect(deepseek).toBeDefined();
    expect(typeof deepseek.liveReady).toBe('boolean');
    // no key material may ever appear on the health surface
    expect(JSON.stringify(body)).not.toMatch(/sk-[A-Za-z0-9]/);
    expect(typeof body.time).toBe('string');
  });

  it('404s JSON for unknown routes and wrong methods', async () => {
    const unknown = await getJson(`${base}/api/v1/nope`);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('not_found');
    const wrongMethod = await fetch(`${base}/api/v1/runs`, { method: 'DELETE' });
    expect(wrongMethod.status).toBe(404);
    expect((await wrongMethod.json()).error.code).toBe('not_found');
  });
});

// ---- events -----------------------------------------------------------------

describe('GET /api/v1/runs/:id/events', () => {
  it('returns the run event stream ascending with seq', async () => {
    const { status, body } = await getJson(`${base}/api/v1/runs/${run1}/events`);
    expect(status).toBe(200);
    expect(body.events.length).toBeGreaterThanOrEqual(3);
    const seqs = body.events.map((e: { seq: number }) => e.seq);
    expect([...seqs].sort((a: number, b: number) => a - b)).toEqual(seqs);
    expect(body.events[0].type).toBe('run_created');
  });

  it('filters incrementally by afterSeq', async () => {
    const all = (await getJson(`${base}/api/v1/runs/${run1}/events`)).body.events;
    const firstSeq = all[0].seq;
    const rest = (await getJson(`${base}/api/v1/runs/${run1}/events?afterSeq=${firstSeq}`)).body.events;
    expect(rest).toHaveLength(all.length - 1);
    expect(rest.every((e: { seq: number }) => e.seq > firstSeq)).toBe(true);
    const lastSeq = all[all.length - 1].seq;
    const none = (await getJson(`${base}/api/v1/runs/${run1}/events?afterSeq=${lastSeq}`)).body.events;
    expect(none).toHaveLength(0);
  });

  it('400s on a non-numeric afterSeq and 404s for an unknown run', async () => {
    const bad = await getJson(`${base}/api/v1/runs/${run1}/events?afterSeq=abc`);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('validation');
    const ghost = await getJson(`${base}/api/v1/runs/run_${'0'.repeat(26)}/events`);
    expect(ghost.status).toBe(404);
  });
});

// ---- resource endpoints -----------------------------------------------------

describe('run resource endpoints', () => {
  it('GET question returns the question object', async () => {
    const { status, body } = await getJson(`${base}/api/v1/runs/${run1}/question`);
    expect(status).toBe(200);
    expect(body.id).toBe(q1);
    expect(body.text).toContain('CRISPR');
  });

  it('GET sources/evidence/hypotheses/revisions/receipts return the stored graph', async () => {
    const sources = (await getJson(`${base}/api/v1/runs/${run1}/sources`)).body;
    expect(sources.sources).toHaveLength(1);
    expect(sources.sources[0].family).toBe('openalex');

    const evidence = (await getJson(`${base}/api/v1/runs/${run1}/evidence`)).body;
    expect(evidence.claims).toHaveLength(1);
    expect(evidence.relations).toHaveLength(1);
    expect(evidence.relations[0].relation).toBe('supports');

    const hyps = (await getJson(`${base}/api/v1/runs/${run1}/hypotheses`)).body;
    expect(hyps.hypotheses).toHaveLength(1);
    expect(hyps.hypotheses[0].id).toBe(hyp1);
    expect(hyps.scorecards).toHaveLength(1);
    expect(hyps.scorecards[0].hypothesisId).toBe(hyp1);

    const revs = (await getJson(`${base}/api/v1/runs/${run1}/revisions`)).body;
    expect(revs.feedbacks).toHaveLength(1);
    expect(revs.revisions).toHaveLength(1);
    expect(revs.versionDiffs).toHaveLength(1);

    const receipts = (await getJson(`${base}/api/v1/runs/${run1}/receipts`)).body;
    expect(receipts.receipts).toHaveLength(1);
    expect(receipts.receipts[0].kind).toBe('export');
  });

  it('GET plan returns the latest plan, or null with 200 when none exists', async () => {
    const withPlan = (await getJson(`${base}/api/v1/runs/${run1}/plan`)).body;
    expect(withPlan.plan.id).toBe(plan1);
    expect(withPlan.plan.objective).toContain('Discriminate');
    const without = await getJson(`${base}/api/v1/runs/${run3}/plan`);
    expect(without.status).toBe(200);
    expect(without.body.plan).toBeNull();
  });

  it('GET report serves the latest bundle report artifact as text/markdown', async () => {
    const res = await fetch(`${base}/api/v1/runs/${run1}/report`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(await res.text()).toBe(REPORT_MD);
  });

  it('GET report 404s when no bundle exists', async () => {
    const { status, body } = await getJson(`${base}/api/v1/runs/${run3}/report`);
    expect(status).toBe(404);
    expect(body.error.code).toBe('not_found');
  });
});

// ---- POST /runs (async create) ----------------------------------------------

describe('POST /api/v1/runs', () => {
  it('creates a run, returns 202 immediately, and completion becomes visible by polling', async () => {
    const before = executorCalls.length;
    const { status, body } = await postJson(`${base}/api/v1/runs`, {
      text: 'What drives spectral diffusion in single-molecule measurements?',
      domain: 'biophysics',
      goalType: 'predictive',
    });
    expect(status).toBe(202);
    expect(body.runId).toMatch(/^run_[0-9a-z]{20,32}$/);
    const runId = body.runId as string;

    await waitUntil(() => app.store.getRun(runId)?.status === 'completed');
    expect(executorCalls.length).toBeGreaterThan(before);

    const detail = (await getJson(`${base}/api/v1/runs/${runId}`)).body;
    expect(detail.status).toBe('completed');
    expect(detail.stages.every((s: { state: string }) => s.state === 'done')).toBe(true);

    const list = (await getJson(`${base}/api/v1/runs`)).body.runs as Array<{ id: string; progress?: { done: number; total: number } }>;
    const listed = list.find((r) => r.id === runId);
    expect(listed?.progress).toEqual({ done: 9, total: 9 });

    const question = (await getJson(`${base}/api/v1/runs/${runId}/question`)).body;
    expect(question.goalType).toBe('predictive');
    expect(question.scope.domain).toBe('biophysics');
  });

  it('400s on missing/empty text, bad goalType, non-object body and invalid JSON', async () => {
    const noText = await postJson(`${base}/api/v1/runs`, {});
    expect(noText.status).toBe(400);
    expect(noText.body.error.code).toBe('validation');
    expect(noText.body.error.message).toContain('text');

    const emptyText = await postJson(`${base}/api/v1/runs`, { text: '   ' });
    expect(emptyText.status).toBe(400);

    const badGoal = await postJson(`${base}/api/v1/runs`, { text: 'q', goalType: 'bogus' });
    expect(badGoal.status).toBe(400);
    expect(badGoal.body.error.message).toContain('explanatory');

    const arrayBody = await postJson(`${base}/api/v1/runs`, '[1,2]');
    expect(arrayBody.status).toBe(400);

    const brokenJson = await postJson(`${base}/api/v1/runs`, '{"text": ');
    expect(brokenJson.status).toBe(400);
    expect(brokenJson.body.error.message).toContain('not valid JSON');
  });

  it('400s when the body exceeds the 1MB cap', async () => {
    const { status, body } = await postJson(`${base}/api/v1/runs`, { text: 'x'.repeat(1_100_000) });
    expect(status).toBe(400);
    expect(body.error.message).toContain('exceeds');
  });
});

// ---- cancel / resume ----------------------------------------------------------

describe('POST cancel and resume', () => {
  it('cancel on an unknown run 404s', async () => {
    const ghost = `run_${'0'.repeat(26)}`;
    const { status, body } = await postJson(`${base}/api/v1/runs/${ghost}/cancel`, {});
    expect(status).toBe(404);
    expect(body.error.runId).toBe(ghost);
  });

  it('cancel on an active run requests cancellation truthfully', async () => {
    const { status, body } = await postJson(`${base}/api/v1/runs/${run3}/cancel`, {});
    expect(status).toBe(202);
    expect(body.requested).toBe(true);
    expect(app.store.getRun(run3)?.cancelRequested).toBe(true);
  });

  it('cancel on a completed run reports requested:false (nothing active)', async () => {
    const { status, body } = await postJson(`${base}/api/v1/runs/${run1}/cancel`, {});
    expect(status).toBe(202);
    expect(body.requested).toBe(false);
    expect(body.reason).toContain('completed');
  });

  it('resume 404s for unknown runs and executes asynchronously otherwise', async () => {
    const ghost = await postJson(`${base}/api/v1/runs/run_${'0'.repeat(26)}/resume`, {});
    expect(ghost.status).toBe(404);

    const { status, body } = await postJson(`${base}/api/v1/runs/${run3}/resume`, {});
    expect(status).toBe(202);
    expect(body.runId).toBe(run3);
    await waitUntil(() => app.store.getRun(run3)?.status === 'completed');
  });

  it('resume on an already-executing run returns 409 already_running', async () => {
    blockNext = true;
    try {
      const created = await postJson(`${base}/api/v1/runs`, { text: 'run that will block in the executor' });
      expect(created.status).toBe(202);
      const runId = created.body.runId as string;
      const dupResume = await postJson(`${base}/api/v1/runs/${runId}/resume`, {});
      expect(dupResume.status).toBe(409);
      expect(dupResume.body.error).toMatchObject({ code: 'already_running', retryable: false, runId });
      const dupReexport = await postJson(`${base}/api/v1/runs/${runId}/reexport`, {});
      expect(dupReexport.status).toBe(409);
      for (const release of blockers.splice(0)) release(); // release the blocked execution
    } finally {
      blockNext = false;
    }
  });
});

// ---- feedback ----------------------------------------------------------------

describe('POST /api/v1/runs/:id/feedback', () => {
  it('records a signal with CLI-identical semantics (201 + persisted + evented)', async () => {
    const before = executorCalls.length; // feedback must NOT trigger execution
    const { status, body } = await postJson(`${base}/api/v1/runs/${run1}/feedback`, {
      source: 'human_expert',
      content: 'Please weigh strand bias more strongly.',
    });
    expect(status).toBe(201);
    expect(body.feedbackId).toMatch(/^fbk_[0-9a-z]{20,32}$/);
    expect(executorCalls.length).toBe(before);

    const revs = (await getJson(`${base}/api/v1/runs/${run1}/revisions`)).body;
    expect(revs.feedbacks.some((f: { id: string }) => f.id === body.feedbackId)).toBe(true);
    const events = (await getJson(`${base}/api/v1/runs/${run1}/events`)).body.events;
    const last = events[events.length - 1];
    expect(last.type).toBe('feedback_received');
    expect(last.detail.feedbackId).toBe(body.feedbackId);
    expect(last.detail.via).toBe('http');
  });

  it('supports validated targets pointing at real objects', async () => {
    const { status, body } = await postJson(`${base}/api/v1/runs/${run1}/feedback`, {
      source: 'reviewer',
      content: 'this hypothesis needs a sharper decision rule',
      targetKind: 'hypothesis',
      targetId: hyp1,
    });
    expect(status).toBe(201);
    const stored = app.store.getObject('feedback', body.feedbackId);
    expect(stored?.target).toEqual({ kind: 'hypothesis', id: hyp1 });
  });

  it('existence-checks evidence_relation targets too (D-060 audit-1 fix: mapping was missing)', async () => {
    const rels = app.store.listObjects('evidence_relation', run1);
    expect(rels.length).toBeGreaterThan(0);
    const relId = rels[0]!.id;
    const ghostRel = `ev_${'0'.repeat(26)}`;

    const ghost = await postJson(`${base}/api/v1/runs/${run1}/feedback`, {
      source: 'reviewer',
      content: 'x',
      targetKind: 'evidence_relation',
      targetId: ghostRel,
    });
    expect(ghost.status).toBe(400);
    expect(ghost.body.error.message).toContain(ghostRel);

    const real = await postJson(`${base}/api/v1/runs/${run1}/feedback`, {
      source: 'reviewer',
      content: 'this support relation looks overstated',
      targetKind: 'evidence_relation',
      targetId: relId,
    });
    expect(real.status).toBe(201);
    const stored = app.store.getObject('feedback', real.body.feedbackId);
    expect(stored?.target).toEqual({ kind: 'evidence_relation', id: relId });
  });

  it('400s on invalid source, empty content, half-given target and fail-closed missing target', async () => {
    const badSource = await postJson(`${base}/api/v1/runs/${run1}/feedback`, { source: 'gossip', content: 'x' });
    expect(badSource.status).toBe(400);
    expect(badSource.body.error.message).toContain('human_expert');

    const noContent = await postJson(`${base}/api/v1/runs/${run1}/feedback`, { source: 'reviewer' });
    expect(noContent.status).toBe(400);
    expect(noContent.body.error.message).toContain('content');

    const halfTarget = await postJson(`${base}/api/v1/runs/${run1}/feedback`, {
      source: 'reviewer',
      content: 'x',
      targetKind: 'hypothesis',
    });
    expect(halfTarget.status).toBe(400);
    expect(halfTarget.body.error.message).toContain('together');

    const ghostHyp = `hyp_${'0'.repeat(26)}`;
    const missingTarget = await postJson(`${base}/api/v1/runs/${run1}/feedback`, {
      source: 'reviewer',
      content: 'x',
      targetKind: 'hypothesis',
      targetId: ghostHyp,
    });
    expect(missingTarget.status).toBe(400);
    expect(missingTarget.body.error.message).toContain(ghostHyp);

    const badKind = await postJson(`${base}/api/v1/runs/${run1}/feedback`, {
      source: 'reviewer',
      content: 'x',
      targetKind: 'galaxy',
      targetId: 'x',
    });
    expect(badKind.status).toBe(400);
  });

  it('404s for an unknown run and persists nothing', async () => {
    const ghost = `run_${'0'.repeat(26)}`;
    const { status } = await postJson(`${base}/api/v1/runs/${ghost}/feedback`, { source: 'reviewer', content: 'x' });
    expect(status).toBe(404);
  });
});

// ---- reexport ----------------------------------------------------------------

describe('POST /api/v1/runs/:id/reexport', () => {
  it('202s only when a revision is newer than the latest bundle', async () => {
    const before = executorCalls.length;
    const { status, body } = await postJson(`${base}/api/v1/runs/${run2}/reexport`, {});
    expect(status).toBe(202);
    expect(body.runId).toBe(run2);
    await waitUntil(() => executorCalls.includes(run2));
    expect(executorCalls.length).toBeGreaterThan(before);
  });

  it('400s when the bundle is already newer than every revision (nothing to re-export)', async () => {
    const { status, body } = await postJson(`${base}/api/v1/runs/${run1}/reexport`, {});
    expect(status).toBe(400);
    expect(body.error.code).toBe('validation');
    expect(body.error.message).toContain('nothing to re-export');
  });

  it('400s when no bundle exists and 404s for unknown runs', async () => {
    const noBundle = await postJson(`${base}/api/v1/runs/${run3}/reexport`, {});
    expect(noBundle.status).toBe(400);
    expect(noBundle.body.error.message).toContain('no bundle');
    const ghost = await postJson(`${base}/api/v1/runs/run_${'0'.repeat(26)}/reexport`, {});
    expect(ghost.status).toBe(404);
  });
});

// ---- verify ------------------------------------------------------------------

describe('GET /api/v1/verify/:bundleId', () => {
  it('returns a real VerificationReport for the seeded bundle (lock drift => degraded)', async () => {
    const { status, body } = await getJson(`${base}/api/v1/verify/${bundle1}`);
    expect(status).toBe(200);
    expect(body.bundleId).toBe(bundle1);
    expect(body.runId).toBe(run1);
    expect(body.checks).toHaveLength(10);
    expect(body.checks.map((c: { name: string }) => c.name)[0]).toBe('bundle_readable_and_schema_valid');
    expect(body.checks.every((c: { passed: boolean; detail: string }) => typeof c.passed === 'boolean' && c.detail.length > 0)).toBe(true);
    expect(['verified', 'failed', 'degraded']).toContain(body.verdict);
    expect(body.replayGuidance).toContain('far verify');
  });

  it('returns a fail-closed failed report (not 404) for an unknown bundle', async () => {
    const ghost = `bnd_${'0'.repeat(26)}`;
    const { status, body } = await getJson(`${base}/api/v1/verify/${ghost}`);
    expect(status).toBe(200);
    expect(body.verdict).toBe('failed');
    expect(body.runId).toBe('unknown');
    expect(body.checks.every((c: { passed: boolean }) => c.passed === false)).toBe(true);
  });
});

// ---- static frontend -----------------------------------------------------------

describe('static serving', () => {
  it('GET / tells the truth (hint JSON) when web/dist is missing', async () => {
    const { status, body, contentType } = await getJson(`${base}/`);
    expect(status).toBe(200);
    expect(contentType).toContain('application/json');
    expect(body.frontend.built).toBe(false);
    expect(body.api).toBe('/api/v1');
  });

  it('serves index, assets with correct mime, and SPA fallback from web/dist', async () => {
    const index = await fetch(`${staticBase}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toContain('text/html');
    expect(await index.text()).toContain('far workbench');

    const css = await fetch(`${staticBase}/assets/style.css`);
    expect(css.status).toBe(200);
    expect(css.headers.get('content-type')).toContain('text/css');

    const spa = await fetch(`${staticBase}/runs/some-client-route`);
    expect(spa.status).toBe(200);
    expect(spa.headers.get('content-type')).toContain('text/html');
    expect(await spa.text()).toContain('far workbench');
  });

  it('rejects path traversal with 404 (encoded or plain)', async () => {
    const encoded = await rawGet(staticPort, '/..%2f..%2fpackage.json');
    expect(encoded.status).toBe(404);
    const withSep = await rawGet(staticPort, '/assets/..%2f..%2ffar.db');
    expect(withSep.status).toBe(404);
    const missing = await fetch(`${staticBase}/assets/nope.js`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).toContain('application/json'); // error envelope
  });
});
