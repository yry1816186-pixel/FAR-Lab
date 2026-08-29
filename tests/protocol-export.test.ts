import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CorpusSnapshot,
  EvidenceRelation,
  HypothesisCandidate,
  HypothesisScorecard,
  ProtocolSpec,
  ProvenanceReceipt,
  ResearchQuestion,
  ResearchRun,
  ScientificClaim,
  SourceDocument,
  applyProtocolRecord,
  newId,
  newProtocolExecution,
} from '../src/domain/index.js';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store, STAGE_ALL } from '../src/persistence/store.js';
import { openArtifactStore, type ArtifactStore } from '../src/persistence/artifacts.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { exportStage } from '../src/pipeline/stages/export.js';
import { buildPaperOutline, renderPaperMarkdown } from '../src/pipeline/paper-outline.js';
import { verifyBundle } from '../src/app/verify.js';
import { buildReproducibilityPackage } from '../src/report/package.js';
import { canonicalJson } from '../src/shared/crypto.js';
import type { StageContext } from '../src/pipeline/types.js';

// *** TEST-ONLY *** slice-4 contract: the protocol chain (frozen preregistration +
// human-attested ledger) must ride the reproducibility export end-to-end — minted into
// the bundle (protocolEvidence + verbatim limitations line), verified (new check:
// resolvability, count drift, artifact hashes, disclosure laundering guard), projected
// into the paper's limitations (protocol_deviations category) and written into the
// reproducibility package (protocol/ spec + ledger files). Harness mirrors
// pipeline-export.test.ts (raw Store + StageContext, scripted stub provider, no network).

let tmp: string;
let db: Db;
let store: Store;
let artifacts: ArtifactStore;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-protocol-export-'));
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

// Same createRun workaround as pipeline-export.test.ts: Store.appendEvent parses events
// with seq=0 while RunEvent requires a positive integer, so createRun always throws. The
// stages under test read domain objects, not the events table.
const createRunRow = (q: ResearchQuestion): ResearchRun => {
  const now = new Date().toISOString();
  const run = ResearchRun.parse({
    id: newId('run'),
    questionId: q.id,
    status: 'created',
    currentStage: 'scope',
    stages: STAGE_ALL.map((stage) => ({ stage, state: 'pending' })),
    createdAt: now,
    updatedAt: now,
    tags: [],
  });
  store.putObject('question', q);
  db.prepare(
    'INSERT INTO runs (id, question_id, status, current_stage, doc, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
  ).run(run.id, run.questionId, run.status, run.currentStage, JSON.stringify(run), now, now);
  return run;
};

const makeCtx = (run: ResearchRun): StageContext => ({
  run,
  store,
  artifacts,
  provider: createTestStubProvider([]),
  sourceFor: (family) => {
    throw new Error(`no source adapter available in test (family=${family})`);
  },
  recordReceipt: (partial) => {
    const receipt = ProvenanceReceipt.parse({
      ...partial,
      id: newId('rcp'),
      runId: run.id,
      at: partial.at ?? new Date().toISOString(),
    });
    store.putObject('receipt', receipt);
  },
  cancelled: () => false,
  log: () => {},
});

const seedGraph = () => {
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Why do CRISPR base editors cause off-target edits?',
    background: 'prior work shows motif-dependent off-targets',
    goalType: 'explanatory',
    scope: {
      domain: 'genome editing',
      phenomena: ['off-target edits'],
      inScope: ['CBE editors'],
      outOfScope: ['ABE editors'],
    },
    constraints: { assumptions: ['editing machinery acts locally'], dataConstraints: [] },
    createdAt: ts(1),
  });
  const run = createRunRow(q);

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
  const corpus = CorpusSnapshot.parse({
    id: newId('corp'),
    runId: run.id,
    queries: [{ purpose: 'discovery', text: 'base editing off-target' }],
    documentIds: [src.id],
    createdAt: ts(3),
    familyFailures: [],
  });
  const clm = ScientificClaim.parse({
    id: newId('clm'),
    runId: run.id,
    text: 'CBE causes C-to-T off-target mutations at specific motifs',
    locators: [{ sourceDocumentId: src.id, quote: 'off-target C-to-T mutations were observed' }],
    bindingStatus: 'verified',
    alignmentChecked: true,
    uncertainties: [],
  });
  const hyp = HypothesisCandidate.parse({
    id: newId('hyp'),
    runId: run.id,
    version: 0,
    statement: 'Off-targeting is driven by deaminase exposure duration',
    mechanism: 'longer exposure window increases bystander deamination',
    derivation: { strategy: 'mechanism_driven', rationale: 'from timing evidence', inputClaimIds: [clm.id] },
    assumptions: [],
    predictions: ['shortened exposure reduces off-target rate'],
    supportingClaimIds: [clm.id],
    counterClaimIds: [],
    uncertainties: [],
    noveltyLabel: 'evidence_grounded',
    testability: 'testable_now',
    clusterKey: 'duration-mechanism',
    createdAt: ts(4),
  });
  const score = HypothesisScorecard.parse({
    id: newId('sc'),
    runId: run.id,
    hypothesisId: hyp.id,
    dimensions: [
      {
        dimension: 'falsifiability',
        value: 0.7,
        rationale: 'clear decision rule on duration gradient',
        evidenceClaimIds: [],
        producer: 'test-stub',
        calibration: 'uncalibrated_llm_judgment',
      },
    ],
    overallRationale: 'grounded but narrow evidence base',
    rankedOutOf: 1,
    rank: 1,
  });
  const rel = EvidenceRelation.parse({
    id: newId('ev'),
    runId: run.id,
    relation: 'supports',
    claimId: clm.id,
    targetHypothesisId: hyp.id,
    rationale: 'direct measurement backs the duration mechanism',
    strength: 'moderate',
    uncertainties: [],
    createdAt: ts(5),
  });

  store.putObject('source_document', src);
  store.putObject('corpus_snapshot', corpus);
  store.putObject('claim', clm);
  store.putObject('hypothesis', hyp);
  store.putObject('scorecard', score);
  store.putObject('evidence_relation', rel);
  return { q, run, src, corpus, clm, hyp, score };
};

const seedProtocol = (runId: string, hypId: string) => {
  const protocol = ProtocolSpec.parse({
    id: newId('prt'),
    runId,
    planId: newId('pln'),
    planHash: 'b'.repeat(64),
    hypothesisIds: [hypId],
    title: 'Bench duration-series assay',
    objective: 'Measure off-target editing frequency across exposure durations at the bench',
    paradigm: 'bench',
    setting: 'molecular biology bench, standard BSL-1',
    arms: [
      { label: 'short-exposure', description: '6h exposure', isControl: true },
      { label: 'long-exposure', description: '48h exposure', isControl: false },
    ],
    materials: [{ name: 'HEK293T cells', quantity: '2 dishes', hazardClass: 'biological' }],
    instruments: [{ name: 'thermocycler', purpose: 'maintain exposure temperature' }],
    sampling: {
      unitLabel: 'culture dish',
      plannedN: 8,
      eligibilityIncludes: ['passage < 20'],
      eligibilityExcludes: ['mycoplasma positive'],
      blinding: 'open',
      biologicalReplicates: 4,
    },
    allocation: {
      scheme: 'complete_randomization',
      seed: 20260829,
      sequence: [0, 1, 2, 3, 4, 5, 6, 7].map((unitIndex) => ({
        unitIndex,
        arm: unitIndex % 2 === 0 ? 'short-exposure' : 'long-exposure',
      })),
    },
    steps: [
      {
        id: 'ps1',
        planStepId: newId('task'),
        title: 'Prepare cell dishes',
        action: 'Seed cells into 8 dishes and let them attach overnight before any exposure.',
        actor: 'researcher',
        materials: ['HEK293T cells'],
        instruments: [],
        duration: { value: 18, unit: 'hours' },
        conditions: '37C, 5% CO2',
        producesMeasurements: [],
        safetyNote: 'standard BSL-1 handling',
        confirmation: 'human_signed',
        dependsOn: [],
      },
      {
        id: 'ps2',
        planStepId: newId('task'),
        title: 'Run exposure series',
        action: 'Expose dishes per the allocated arm for the assigned duration, then fix samples for sequencing.',
        actor: 'technician',
        materials: ['HEK293T cells'],
        instruments: ['thermocycler'],
        duration: { value: 48, unit: 'hours' },
        conditions: 'sterile hood',
        producesMeasurements: ['off-target frequency'],
        confirmation: 'instrument_record',
        dependsOn: ['ps1'],
      },
    ],
    variables: [
      {
        name: 'off-target frequency',
        role: 'dependent',
        method: 'targeted deep sequencing, aligned-read counting',
        valueType: 'numeric',
        timepoints: ['after exposure'],
        qcRule: { kind: 'range', min: 0, max: 1 },
      },
    ],
    ethics: { requiresApproval: false, consentRequired: false, riskLevel: 'minimal', notes: [] },
    stopConditions: [{ kind: 'safety', detail: 'any contamination event stops the series' }],
    draftNotes: ['allocation committed deterministically by code'],
    status: 'registered',
    createdAt: ts(6),
    frozenAt: ts(6),
  });

  let execution = newProtocolExecution(protocol, newId('pex'), ts(7));
  // QC-FAILING measurement: declared range [0,1], recorded 150 — kept visible with verdict.
  const r1 = applyProtocolRecord(protocol, execution, {
    at: ts(8),
    actor: 'Tech One',
    kind: 'measurement',
    stepId: 'ps2',
    measurement: { variableName: 'off-target frequency', value: 150 },
  });
  if (!r1.ok) throw new Error(r1.error);
  execution = r1.execution;
  const r2 = applyProtocolRecord(protocol, execution, {
    at: ts(9),
    actor: 'Tech One',
    kind: 'deviation',
    stepId: 'ps2',
    deviation: {
      what: 'Dish 3 spilled during transfer',
      why: 'wet gloves at the hood',
      consequence: 'unit 3 excluded from analysis; effective n drops to 7',
    },
  });
  if (!r2.ok) throw new Error(r2.error);
  execution = r2.execution;

  store.putObject('protocol', protocol);
  store.putObject('protocol_execution', execution);
  return { protocol, execution };
};

describe('protocol chain in the export plane (slice 4)', () => {
  it('mints protocolEvidence + verbatim limitations line, verifies, and packages the ledger', async () => {
    const g = seedGraph();
    const { protocol, execution } = seedProtocol(g.run.id, g.hyp.id);

    const ctx = makeCtx(g.run);
    const outcome = await exportStage.execute(ctx);
    if (outcome.kind !== 'done') throw new Error(`expected done outcome, got ${outcome.kind}`);

    const bundles = store.listObjects('bundle', g.run.id);
    expect(bundles).toHaveLength(1);
    const bundle = bundles[0]!;

    // ---- bundle.protocolEvidence: ids, counts, content-addressed artifacts ----
    expect(bundle.protocolEvidence).toHaveLength(1);
    const pe = bundle.protocolEvidence![0]!;
    expect(pe.protocolId).toBe(protocol.id);
    expect(pe.executionId).toBe(execution.id);
    expect(pe.recordCount).toBe(2);
    expect(pe.deviations).toBe(1);
    expect(pe.qcFailedMeasurements).toBe(1);
    const specBytes = await artifacts.get(`sha256:${pe.protocolArtifactHash}`);
    expect(specBytes).toBe(canonicalJson(protocol));
    const ledgerBytes = await artifacts.get(`sha256:${pe.ledgerArtifactHash!}`);
    expect(ledgerBytes).toBe(canonicalJson(execution));

    // ---- limitations carry the protocol honesty line naming the protocol id ----
    const protoLine = bundle.limitations.find((l) => l.includes(protocol.id));
    expect(protoLine).toBeDefined();
    expect(protoLine!).toContain('1 项偏差');
    expect(protoLine!).toContain('1 项 QC 失败测量');
    expect(protoLine!).toContain('bench');

    // ---- verify: new check passes against the minted bundle ----
    const report1 = await verifyBundle(bundle.id, { store, artifacts });
    const check1 = report1.checks.find((c) => c.name === 'protocol_evidence_resolvable')!;
    expect(check1).toBeDefined();
    expect(check1.passed).toBe(true);
    expect(check1.detail).toContain('1 条 protocolEvidence');

    // ---- no re-export while the store matches the bundle (count-based applicable) ----
    expect(await exportStage.applicable(ctx)).toBe(false);

    // ---- paper: protocol_deviations limitation category with ledger counts ----
    const outline = buildPaperOutline(store, g.run.id, { now: '2026-08-29T00:00:00.000Z' });
    const protoLim = outline.limitations.find((l) => l.category === 'protocol_deviations')!;
    expect(protoLim).toBeDefined();
    expect(protoLim.counts).toEqual({ protocols: 1, ledgers: 1, deviations: 1, qcFailedMeasurements: 1 });
    const paperMd = renderPaperMarkdown(outline);
    expect(paperMd).toContain('**protocol_deviations**');
    expect(paperMd).toContain('Human-attested ledger');
    expect(paperMd).toContain('1 recorded deviation(s)');

    // ---- package: protocol/ spec + ledger files, manifest + README projections ----
    const outDir = path.join(tmp, 'pkg');
    const pkg = await buildReproducibilityPackage({ store, artifacts }, g.run.id, { outDir, pandoc: null });
    const specPath = `protocol/${protocol.id}.json`;
    const ledgerPath = `protocol/${execution.id}.ledger.json`;
    expect(pkg.files.map((f) => f.path)).toContain(specPath);
    expect(pkg.files.map((f) => f.path)).toContain(ledgerPath);
    expect(JSON.parse(fs.readFileSync(path.join(outDir, ...specPath.split('/')), 'utf8'))).toEqual(
      JSON.parse(canonicalJson(protocol)),
    );
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'MANIFEST.json'), 'utf8')) as {
      files: Record<string, { sha256: string }>;
    };
    expect(manifest.files[specPath]).toBeDefined();
    expect(manifest.files[ledgerPath]).toBeDefined();
    const readme = fs.readFileSync(path.join(outDir, 'README.md'), 'utf8');
    expect(readme).toContain('## Limitations (from the bundle, verbatim)');
    expect(readme).toContain(protocol.id);

    // ---- drift: a new human-attested record after the bundle forces re-export ----
    // (count-based: records 3 > recorded 2; deviations still match — single-cause drift)
    const r3 = applyProtocolRecord(protocol, execution, {
      at: ts(10),
      actor: 'Tech One',
      kind: 'step_started',
      stepId: 'ps1',
    });
    if (!r3.ok) throw new Error(r3.error);
    store.putObject('protocol_execution', r3.execution);
    expect(await exportStage.applicable(ctx)).toBe(true);
    const report2 = await verifyBundle(bundle.id, { store, artifacts });
    const check2 = report2.checks.find((c) => c.name === 'protocol_evidence_resolvable')!;
    expect(check2.passed).toBe(false);
    expect(check2.detail).toContain('重导出');
  });

  it('legacy bundle without protocolEvidence passes the new check with an absence note', async () => {
    const g = seedGraph();
    const ctx = makeCtx(g.run);
    const outcome = await exportStage.execute(ctx);
    if (outcome.kind !== 'done') throw new Error('expected done outcome');
    const bundle = store.listObjects('bundle', g.run.id)[0]!;
    expect(bundle.protocolEvidence ?? []).toHaveLength(0); // no protocol seeded → none minted

    // A pre-protocol bundle shape: same content, protocolEvidence absent.
    const legacyRaw = { ...bundle, id: newId('bnd') };
    delete legacyRaw.protocolEvidence;
    const legacy = (await import('../src/domain/index.js')).ReproducibilityBundle.parse(legacyRaw);
    store.putObject('bundle', legacy);

    const report = await verifyBundle(legacy.id, { store, artifacts });
    const check = report.checks.find((c) => c.name === 'protocol_evidence_resolvable')!;
    expect(check).toBeDefined();
    expect(check.passed).toBe(true);
    expect(check.detail).toContain('pre-protocol bundle');
  });
});
