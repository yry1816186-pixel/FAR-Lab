import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CorpusSnapshot,
  EvidenceRelation,
  HypothesisCandidate,
  HypothesisScorecard,
  ProvenanceReceipt,
  ResearchQuestion,
  ResearchRun,
  ScientificClaim,
  SourceDocument,
  newId,
} from '../src/domain/index.js';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store, STAGE_ALL } from '../src/persistence/store.js';
import { openArtifactStore, type ArtifactStore } from '../src/persistence/artifacts.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { planStage, checkPlanExecutability } from '../src/pipeline/stages/plan.js';
import { MemoryItemSchema } from '../src/domain/memory.js';
import { exportStage } from '../src/pipeline/stages/export.js';
import type { StageContext } from '../src/pipeline/types.js';
import { canonicalJson, canonicalSha256, sha256Hex } from '../src/shared/crypto.js';

// *** TEST-ONLY *** fixture graph: question / corpus / 2 sources (1 resolved, 1 resolution
// failed) / 2 claims (1 verified, 1 resolved_unaligned) / 1 hypothesis with falsification /
// 1 scorecard / 2 evidence relations. All persistence is a throwaway temp SQLite db +
// artifact store; the only provider is the scripted test stub (no network).

let tmp: string;
let db: Db;
let store: Store;
let artifacts: ArtifactStore;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-plan-export-'));
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

const seedRun = () => {
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Why do CRISPR base editors cause off-target edits?',
    background: 'prior work shows motif-dependent off-targets',
    goalType: 'explanatory',
    scope: {
      domain: 'genome editing',
      phenomena: ['off-target edits'],
      temporalBoundary: '2015-2026 literature',
      inScope: ['CBE editors', 'mammalian cells'],
      outOfScope: ['ABE editors'],
    },
    constraints: {
      assumptions: ['editing machinery acts locally'],
      dataConstraints: ['public datasets only'],
    },
    createdAt: ts(1),
  });
  const run = createRunRow(q);

  const srcResolved = SourceDocument.parse({
    id: newId('src'),
    runId: run.id,
    family: 'openalex',
    identifiers: [{ kind: 'doi', value: '10.1000/example-resolved' }],
    title: 'Resolved study of off-target editing',
    publicationYear: 2024,
    authors: ['A. Researcher'],
    contentDepth: 'abstract',
    accessState: 'open',
    contentHash: canonicalSha256({ title: 'Resolved study' }),
    retrievedAt: ts(2),
    parseStatus: 'ok',
    verification: { method: 'crossref_doi', resolved: true, titleMatch: true, detail: 'doi resolved', checkedAt: ts(2) },
  });
  const srcFailed = SourceDocument.parse({
    id: newId('src'),
    runId: run.id,
    family: 'arxiv',
    identifiers: [{ kind: 'arxiv', value: '2401.00000' }],
    title: 'Unresolvable preprint',
    publicationYear: 2023,
    contentDepth: 'metadata_only',
    accessState: 'unknown',
    contentHash: canonicalSha256({ title: 'Unresolvable preprint' }),
    retrievedAt: ts(3),
    parseStatus: 'ok',
    verification: { method: 'arxiv_id', resolved: false, detail: 'id not found', checkedAt: ts(3) },
  });
  const corpus = CorpusSnapshot.parse({
    id: newId('corp'),
    runId: run.id,
    queries: [{ purpose: 'discovery', text: 'base editing off-target' }],
    documentIds: [srcResolved.id, srcFailed.id],
    createdAt: ts(4),
    familyFailures: [],
  });

  const clmVerified = ScientificClaim.parse({
    id: newId('clm'),
    runId: run.id,
    text: 'CBE causes C-to-T off-target mutations at specific motifs',
    locators: [{ sourceDocumentId: srcResolved.id, quote: 'off-target C-to-T mutations were observed' }],
    bindingStatus: 'verified',
    alignmentChecked: true,
    uncertainties: ['single-cell-line evidence only'],
  });
  const clmUnaligned = ScientificClaim.parse({
    id: newId('clm'),
    runId: run.id,
    text: 'Off-target rate doubles every 24h of exposure',
    locators: [{ sourceDocumentId: srcFailed.id, quote: 'unrelated abstract text' }],
    bindingStatus: 'resolved_unaligned',
    alignmentChecked: true,
    uncertainties: [],
  });

  const hyp = HypothesisCandidate.parse({
    id: newId('hyp'),
    runId: run.id,
    version: 0,
    statement: 'Off-targeting is driven by deaminase exposure duration',
    mechanism: 'longer exposure window increases bystander deamination',
    derivation: { strategy: 'mechanism_driven', rationale: 'from timing evidence', inputClaimIds: [clmVerified.id] },
    assumptions: [{ id: 'a1', statement: 'deaminase acts independently of Cas9', kind: 'empirical', backingClaimIds: [] }],
    predictions: ['shortened exposure reduces off-target rate'],
    supportingClaimIds: [clmVerified.id],
    counterClaimIds: [clmUnaligned.id],
    uncertainties: ['dose-response shape unknown'],
    noveltyLabel: 'evidence_grounded',
    testability: 'testable_now',
    falsification: {
      observable: 'off-target edit frequency per exposure duration',
      measurement: 'targeted deep sequencing across duration gradient',
      expectedRelation: 'monotonic increase with duration',
      decisionRule: '>=2x off-target rate at long vs short duration supports; no increase weakens',
      decisionRuleProvenance: 'model-stipulated', // W5/S3: thresholds the model chose itself
      supportCondition: 'dose-response present',
      weakeningCondition: 'flat response',
      falsificationCondition: 'inverse or no relationship across independent cell lines',
      confounders: ['cell-cycle state'],
      alternativeExplanations: ['gRNA secondary structure'],
      dataRequirements: ['duration-series editing dataset'],
      method: 'controlled exposure series',
      failureInterpretation: 'duration hypothesis not supported; revisit mechanism class',
      completenessCheck: { passed: true, missing: [] },
    },
    clusterKey: 'duration-mechanism',
    createdAt: ts(5),
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
      {
        dimension: 'evidence_grounding',
        value: 0.5,
        rationale: 'one verified supporting claim',
        evidenceClaimIds: [clmVerified.id],
        producer: 'test-stub',
        calibration: 'uncalibrated_llm_judgment',
      },
    ],
    overallRationale: 'grounded but narrow evidence base',
    rankedOutOf: 1,
    rank: 1,
  });

  const relSupports = EvidenceRelation.parse({
    id: newId('ev'),
    runId: run.id,
    relation: 'supports',
    claimId: clmVerified.id,
    targetHypothesisId: hyp.id,
    rationale: 'direct measurement backs the duration mechanism',
    strength: 'moderate',
    uncertainties: [],
    createdAt: ts(6),
  });
  const relContradicts = EvidenceRelation.parse({
    id: newId('ev'),
    runId: run.id,
    relation: 'contradicts',
    claimId: clmUnaligned.id,
    targetHypothesisId: hyp.id,
    rationale: 'counter observation incompatible with monotonic duration story',
    strength: 'weak',
    uncertainties: [],
    createdAt: ts(7),
  });

  store.putObject('source_document', srcResolved);
  store.putObject('source_document', srcFailed);
  store.putObject('corpus_snapshot', corpus);
  store.putObject('claim', clmVerified);
  store.putObject('claim', clmUnaligned);
  store.putObject('hypothesis', hyp);
  store.putObject('scorecard', score);
  store.putObject('evidence_relation', relSupports);
  store.putObject('evidence_relation', relContradicts);

  return { q, run, srcResolved, srcFailed, corpus, clmVerified, clmUnaligned, hyp, score, relSupports, relContradicts };
};

/**
 * WORKAROUND for a pre-existing store bug (NOT fixed here — store.ts is a read-only
 * contract for this task): Store.appendEvent parses events with seq=0 while RunEvent
 * requires seq to be a POSITIVE integer, so Store.createRun always throws. We mirror
 * createRun's INSERT directly and persist the question via putObject, skipping the
 * broken event append. The stages under test read domain objects, not the events table.
 */
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

const makeCtx = (run: ResearchRun, provider: StageContext['provider']): StageContext => ({
  run,
  store,
  artifacts,
  provider,
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
    // no store.appendEvent here: pre-existing seq=0 bug (see createRunRow note); the
    // receipt OBJECT is the provenance authority consumed by plan/export stages.
  },
  cancelled: () => false,
  log: () => {},
});

/** A fully valid plan draft (3 steps, 2 metrics, complete decision rules). */
const validPlanDraft = (hypothesisIds: string[], evidenceClaimIds: string[]) => ({
  objective: 'Discriminate duration-driven vs structure-driven off-target mechanisms',
  hypothesisIds,
  variables: ['exposure duration', 'off-target frequency'],
  controls: ['mock transfection'],
  inclusionCriteria: ['duration-series data with matched cell lines'],
  exclusionCriteria: ['non-genomic off-target assays'],
  dataRequirements: [
    { name: 'duration series', variables: ['duration', 'off-target count'], availability: 'must_collect', sourceHint: 'lab notebook / GEO' },
  ],
  toolRequirements: [{ name: 'deep sequencing pipeline', purpose: 'quantify edit rates', kind: 'software' }],
  steps: [
    { id: newId('task'), title: 'collect duration series', kind: 'experiment', inputs: ['cells'], outputs: ['sequencing data'], method: 'transfect at 6 timepoints', failureConditions: ['low transfection efficiency'] },
    { id: newId('task'), title: 'quantify off-target edits', kind: 'data_analysis', inputs: ['sequencing data'], outputs: ['edit-rate table'], method: 'aligned-read counting with UMI dedup', failureConditions: ['coverage below 100x'] },
    { id: newId('task'), title: 'fit dose-response model', kind: 'tool_run', inputs: ['edit-rate table'], outputs: ['slope estimate'], method: 'bootstrap regression on duration gradient', failureConditions: ['model fails convergence'] },
  ],
  metrics: ['off-target/on-target ratio', 'duration-response slope'],
  statistics: ['bootstrap 95% CI'],
  decisionRules: {
    successCriterion: '>=2x off-target increase at long vs short duration',
    weakeningCriterion: 'flat response across durations',
    falsificationCriterion: 'inverse or no relationship in >=3 independent cell lines',
    stopCriterion: '3 independent cell lines completed',
  },
  confounders: ['cell-cycle state'],
  alternativeExplanations: ['gRNA secondary structure'],
  resources: { compute: '1 workstation', cost: 'low', time: '3 months' },
  risks: ['batch effects'],
  ethics: ['in-vitro only'],
  prerequisites: ['biosafety approval'],
  expectedInformationGain: 'separates two mechanism classes',
  alternativeBranches: ['test structure-matched gRNA first'],
  reproducibilityRequirements: ['publish analysis script + random seed'],
  evidenceClaimIds,
});

const stubFor = (draft: unknown) => createTestStubProvider([{ rawOutput: JSON.stringify(draft) }]);

describe('plan stage', () => {
  it('is applicable when no plan exists, and not applicable once one is stored', async () => {
    const g = seedRun();
    const ctx = makeCtx(g.run, stubFor(validPlanDraft([g.hyp.id], [g.clmVerified.id])));
    expect(await planStage.applicable(ctx)).toBe(true);
    await planStage.execute(ctx);
    expect(await planStage.applicable(ctx)).toBe(false);
  });

  it('generates an executable plan for the top-ranked hypothesis (happy path)', async () => {
    const g = seedRun();
    const ctx = makeCtx(g.run, stubFor(validPlanDraft([g.hyp.id], [g.clmVerified.id])));

    const outcome = await planStage.execute(ctx);
    expect(outcome.kind).toBe('done');

    const plans = store.listObjects('plan', g.run.id);
    expect(plans).toHaveLength(1);
    const plan = plans[0]!;
    expect(plan.hypothesisIds).toEqual([g.hyp.id]);
    expect(plan.evidenceClaimIds).toContain(g.clmVerified.id);
    expect(plan.objective).toContain('Discriminate');
    expect(plan.executabilityCheck?.passed).toBe(true);
    expect(plan.executabilityCheck?.missing).toEqual([]);
    if (outcome.kind === 'done') expect(outcome.summary).toContain('executabilityCheck passed');

    // provenance: the model call behind the plan left a receipt
    const receipts = store.listObjects('receipt', g.run.id);
    expect(receipts.filter((r) => r.kind === 'model_call')).toHaveLength(1);
  });

  it('rejects model output without decisionRules (zod fail-closed, nothing persisted)', async () => {
    const g = seedRun();
    const draft = validPlanDraft([g.hyp.id], [g.clmVerified.id]) as Record<string, unknown>;
    delete draft.decisionRules;
    const ctx = makeCtx(g.run, stubFor(draft));

    await expect(planStage.execute(ctx)).rejects.toThrow(/invalid_output.*decisionRules|decisionRules.*invalid_output/s);
    expect(store.listObjects('plan', g.run.id)).toHaveLength(0);
  });

  it('flags insufficient steps via the deterministic executabilityCheck', async () => {
    const g = seedRun();
    const draft = validPlanDraft([g.hyp.id], [g.clmVerified.id]);
    const short = { ...draft, steps: draft.steps.slice(0, 2) };
    const ctx = makeCtx(g.run, stubFor(short));

    const outcome = await planStage.execute(ctx);
    expect(outcome.kind).toBe('done');

    const plan = store.listObjects('plan', g.run.id)[0]!;
    expect(plan.steps).toHaveLength(2);
    expect(plan.executabilityCheck?.passed).toBe(false);
    expect(plan.executabilityCheck?.missing.some((m) => m.includes('steps') || m.includes('步骤'))).toBe(true);
    if (outcome.kind === 'done') expect(outcome.summary).toContain('FAILED');
  });

  it('flags nonexistent hypothesis references and filters dangling claim references', async () => {
    const g = seedRun();
    const ghostHyp = ghost('hyp');
    const ghostClm = ghost('clm');
    const draft = validPlanDraft([g.hyp.id, ghostHyp], [g.clmVerified.id, ghostClm]);
    const ctx = makeCtx(g.run, stubFor(draft));

    await planStage.execute(ctx);
    const plan = store.listObjects('plan', g.run.id)[0]!;

    // invalid hypothesis reference => deterministic check failure (visible, not silent)
    expect(plan.executabilityCheck?.passed).toBe(false);
    expect(plan.executabilityCheck?.missing.some((m) => m.includes(ghostHyp))).toBe(true);
    // dangling claim reference => filtered out, only real ids survive
    expect(plan.evidenceClaimIds).toEqual([g.clmVerified.id]);
  });

  it('honestly skips (does not throw or fabricate) when the run has no hypotheses at all', async () => {
    const g = seedRun();
    db.raw.prepare('DELETE FROM objects WHERE kind=?').run('hypothesis');
    const ctx = makeCtx(g.run, stubFor(validPlanDraft([g.hyp.id], [g.clmVerified.id])));
    // Changed behavior (W4 evaluation finding): an evidence-starved run must complete
    // honestly with a visible skip, not hard-fail and not fabricate a plan.
    const outcome = await planStage.execute(ctx);
    expect(outcome.kind).toBe('skipped');
    if (outcome.kind === 'skipped') expect(outcome.reason).toMatch(/no defensible hypotheses/);
    expect(store.listObjects('plan', g.run.id)).toHaveLength(0);
  });

  it('sanitizes fabricated task refs and fails the gate on dropped dependencies (not silent)', async () => {
    const g = seedRun();
    const draft = validPlanDraft([g.hyp.id], [g.clmVerified.id]);
    // well-formed TaskId that is NOT a step id of this plan (mirrors run_7zez1a8ezbbrrgw9begtta0gsw)
    const ghostTask = 'task_1a2b3c4d5e6f7a8b9c0d1e2f';
    const step1Id = draft.steps[0]!.id;
    draft.steps[1]!.inputs = [...draft.steps[1]!.inputs, ghostTask];
    draft.steps[1]!.dependsOn = [ghostTask];
    draft.steps[2]!.dependsOn = [step1Id]; // a valid dependency must survive sanitization
    const ctx = makeCtx(g.run, stubFor(draft));

    await planStage.execute(ctx);
    const plan = store.listObjects('plan', g.run.id)[0]!;

    // inputs: only the dangling task_ ref is removed; other inputs untouched
    expect(plan.steps[1]!.inputs).toEqual(['sequencing data']);
    // dependsOn: invalid ref dropped, valid ref kept. NOTE: the server now canonicalizes
    // step ids (model ids remapped), so the surviving dep is step1's CANONICAL id, not the draft id.
    expect(plan.steps[1]!.dependsOn).toEqual([]);
    const canonicalStep1Id = plan.steps[0]!.id;
    expect(plan.steps[2]!.dependsOn).toEqual([canonicalStep1Id]);
    expect(canonicalStep1Id).toMatch(/^task_[0-9a-z]{20,32}$/);
    // dependency loss escalates into executabilityCheck.missing — visible, gate fails
    expect(plan.executabilityCheck?.passed).toBe(false);
    expect(
      plan.executabilityCheck?.missing.some((m) => m.includes(ghostTask) && m.includes('依赖缺失')),
    ).toBe(true);
  });

  it('keeps claim-id and free-text inputs while dropping only dangling task_ refs (gate can still pass)', async () => {
    const g = seedRun();
    const draft = validPlanDraft([g.hyp.id], [g.clmVerified.id]);
    const ghostTask = 'task_2b3c4d5e6f7a8b9c0d1e2f3a';
    draft.steps[0]!.inputs = [g.clmVerified.id, 'lab notebook resource', ghostTask];
    const ctx = makeCtx(g.run, stubFor(draft));

    await planStage.execute(ctx);
    const plan = store.listObjects('plan', g.run.id)[0]!;
    // non-task refs survive (claim ids / free text are legal inputs); only task_ refs must resolve
    expect(plan.steps[0]!.inputs).toEqual([g.clmVerified.id, 'lab notebook resource']);
    // dropped input ref is warning-level: the gate itself is not failed by an input drop alone
    expect(plan.executabilityCheck?.passed).toBe(true);
  });

  it('checkPlanExecutability enforces task-reference integrity directly (defense in depth)', () => {
    const hypId = ghost('hyp');
    const ghostTask = `task_${'9'.repeat(24)}`;
    const mkStep = (id: string, extra: Partial<{ inputs: string[]; dependsOn: string[] }>) => ({
      id,
      title: `step ${id.slice(5, 7)}`,
      kind: 'experiment' as const,
      inputs: ['cells'],
      outputs: [],
      method: 'do the work',
      failureConditions: ['it breaks'],
      dependsOn: [],
      ...extra,
    });
    const check = checkPlanExecutability(
      {
        objective: 'discriminate mechanisms',
        hypothesisIds: [hypId],
        steps: [
          mkStep(`task_${'a'.repeat(24)}`, {}),
          mkStep(`task_${'b'.repeat(24)}`, { inputs: [ghostTask, 'clm_x', 'free-text dataset'], dependsOn: [ghostTask] }),
          mkStep(`task_${'c'.repeat(24)}`, {}),
        ],
        metrics: ['m1', 'm2'],
        decisionRules: {
          successCriterion: 's',
          weakeningCriterion: 'w',
          falsificationCriterion: 'f',
          stopCriterion: 't',
        },
        dataRequirements: [],
      },
      [hypId],
    );
    expect(check.passed).toBe(false);
    expect(check.missing.some((m) => m.includes('inputs 含无效步骤引用') && m.includes(ghostTask))).toBe(true);
    expect(check.missing.some((m) => m.includes('dependsOn 引用不存在的步骤') && m.includes(ghostTask))).toBe(true);
  });

  it('multiple-testing discipline (POPPER-extracted): required for multi-hypothesis plans, optional for single-hypothesis', () => {
    const h1 = `hyp_${'1'.repeat(26)}`;
    const h2 = `hyp_${'2'.repeat(26)}`;
    const base = {
      objective: 'discriminate mechanisms',
      steps: [
        { id: `task_${'a'.repeat(24)}`, title: 's1', kind: 'experiment' as const, inputs: [], outputs: [], method: 'do', failureConditions: ['x'], dependsOn: [] },
        { id: `task_${'b'.repeat(24)}`, title: 's2', kind: 'analysis' as const, inputs: [], outputs: [], method: 'do', failureConditions: ['x'], dependsOn: [] },
        { id: `task_${'c'.repeat(24)}`, title: 's3', kind: 'analysis' as const, inputs: [], outputs: [], method: 'do', failureConditions: ['x'], dependsOn: [] },
      ],
      metrics: ['m1', 'm2'],
      decisionRules: { successCriterion: 's', weakeningCriterion: 'w', falsificationCriterion: 'f', stopCriterion: 't' },
      dataRequirements: [],
    };
    // multi-hypothesis WITHOUT policy -> hard failure naming the discipline
    const noPolicy = checkPlanExecutability({ ...base, hypothesisIds: [h1, h2] }, [h1, h2]);
    expect(noPolicy.passed).toBe(false);
    expect(noPolicy.missing.some((m) => m.includes('multipleTestingPolicy 缺失'))).toBe(true);
    // multi-hypothesis WITH an explicit policy (any of the three) -> passes
    for (const policy of ['single_primary', 'alpha_spending', 'e_value_accumulation'] as const) {
      const withPolicy = checkPlanExecutability({ ...base, hypothesisIds: [h1, h2], multipleTestingPolicy: policy }, [h1, h2]);
      expect(withPolicy.passed).toBe(true);
    }
    // single-hypothesis plan without policy -> one primary comparison by construction, passes
    const single = checkPlanExecutability({ ...base, hypothesisIds: [h1] }, [h1]);
    expect(single.passed).toBe(true);
  });
});

describe('export stage', () => {
  const runPlanThenExport = async (g: ReturnType<typeof seedRun>) => {
    const planCtx = makeCtx(g.run, stubFor(validPlanDraft([g.hyp.id], [g.clmVerified.id])));
    await planStage.execute(planCtx);
    // export performs no model call: an EMPTY stub script fails loudly if that ever changes.
    const exportCtx = makeCtx(g.run, createTestStubProvider([]));
    const outcome = await exportStage.execute(exportCtx);
    return { outcome, exportCtx };
  };

  it('is applicable before the bundle exists and not after', async () => {
    const g = seedRun();
    const { outcome, exportCtx } = await runPlanThenExport(g);
    expect(outcome.kind).toBe('done');
    expect(await exportStage.applicable(exportCtx)).toBe(false);
  });

  it('re-exports when the corpus grew beyond the bundle\'s covered sources (§5.2 evidence debt, audit P1-1)', async () => {
    const g = seedRun();
    const { exportCtx } = await runPlanThenExport(g);
    expect(await exportStage.applicable(exportCtx)).toBe(false);
    // counter-search-style growth: one more source doc than the bundle covers
    const before = store.listObjects('source_document', g.run.id).length;
    store.putObject('source_document', SourceDocument.parse({
      id: newId('src'), runId: g.run.id, family: 'openalex',
      identifiers: [{ kind: 'doi', value: '10.1/counter-new' }],
      title: 'Post-bundle counter evidence', authors: [],
      contentDepth: 'abstract', accessState: 'open',
      contentHash: 'b'.repeat(64), retrievedAt: new Date().toISOString(), parseStatus: 'ok',
    }));
    expect(store.listObjects('source_document', g.run.id).length).toBe(before + 1);
    expect(await exportStage.applicable(exportCtx)).toBe(true);
  });

  it('renders all 9 report sections strictly from stored objects', async () => {
    const g = seedRun();
    const { outcome } = await runPlanThenExport(g);
    if (outcome.kind !== 'done') throw new Error('expected done outcome');
    // BP-3: report, bundle, paper markdown (report stays [0]; CLI//report rely on it)
    expect(outcome.artifacts).toHaveLength(3);
    const report = await artifacts.get(outcome.artifacts[0]!);
    expect(report).toBeTruthy();
    const paper = await artifacts.get(outcome.artifacts[2]!);
    expect(paper).toContain('## Abstract');

    const headings = [
      '## 1. 问题与范围',
      '## 2. 语料与来源核验',
      '## 3. 声明与绑定状态',
      '## 4. 证据关系汇总',
      '## 5. 假设（排序代表）',
      '## 6. 排序与评分',
      '## 7. 研究计划',
      '## 8. 不确定性与未决问题',
      '## 9. 溯源（Provenance）摘要',
    ];
    for (const h of headings) expect(report).toContain(h);

    // section 1: question + scope + constraints
    expect(report).toContain(g.q.text);
    expect(report).toContain('public datasets only');
    // section 2: verification results and content-hash prefixes
    expect(report).toContain('resolved=true');
    expect(report).toContain('resolved=false');
    expect(report).toContain(g.srcResolved.contentHash.slice(0, 12));
    expect(report).toContain(g.srcFailed.contentHash.slice(0, 12));
    // section 3: binding status counts + unaligned claims made explicit
    expect(report).toContain('resolved_unaligned');
    expect(report).toContain(g.clmUnaligned.id);
    // section 4: relation counts + key counter evidence rendered from stored claims/sources.
    // (W2 behavior change: the line now carries the claim TEXT and source TITLE — the old
    // assertion on the rationale string was replaced because generic rationale lines were
    // the defect being fixed; claiming the claim-text line is strictly more specific.)
    expect(report).toContain('supports：1 条');
    expect(report).toContain('contradicts：1 条');
    expect(report).toContain(`[contradicts] ${g.clmUnaligned.text}`);
    expect(report).toContain(`来源: ${g.srcFailed.title}`);
    expect(report).toContain('strength=weak');
    // section 5: hypothesis essentials
    expect(report).toContain(g.hyp.statement);
    expect(report).toContain('completenessCheck');
    expect(report).toContain('簇内候选数');
    // W5/S3: model-stipulated thresholds get the prominent warning in §5
    expect(report).toContain('⚠ 阈值为模型拟定，无证据来源');
    // W5/S4: noveltyLabel carries the corpus-relative qualifier at the presentation point
    expect(report).toContain(
      `noveltyLabel：${g.hyp.noveltyLabel}（仅相对本 run 检索语料判定，未做全文献新颖性检索）`,
    );
    // section 6: fixed decision-aid disclaimer
    expect(report).toContain('分数为可检查的决策辅助，非客观概率');
    // section 7: plan fields + executability outcome
    expect(report).toContain('executabilityCheck：通过');
    expect(report).toContain('判停判据');
    // W5/S5: evidence-ceiling declaration computed from the store (2 sources: 1 abstract, 1 metadata_only)
    expect(report).toContain('证据上限声明');
    expect(report).toContain('本计划基于 2 篇来源（1 篇摘要级/1 篇元数据级）生成');
    expect(report).toContain('资源规模、样本量与量化阈值为模型拟定值');
    expect(report).toContain('decisionRuleProvenance');
    // section 8: recorded uncertainties from claims and hypotheses
    expect(report).toContain('single-cell-line evidence only');
    expect(report).toContain('dose-response shape unknown');
    // section 9: honest execution-mode status (test-stub receipts are NOT live)
    expect(report).toContain('executionMode 全部为 live：否');
    expect(report).toContain('模型调用：1 次');
  });

  it('builds an honest replay bundle (hashes, limitations, unknown revision, env, lock)', async () => {
    const g = seedRun();
    delete process.env.FARLAB_GIT_COMMIT; // code revision genuinely unknown in tests
    const { outcome } = await runPlanThenExport(g);
    if (outcome.kind !== 'done') throw new Error('expected done outcome');

    const bundles = store.listObjects('bundle', g.run.id);
    expect(bundles).toHaveLength(1);
    const bundle = bundles[0]!;

    expect(bundle.declaredEvidenceLevel).toBe('replay');
    // D-EV1 provenance fix: env override first, else honest git rev-parse fallback —
    // never a fabricated revision; a valid hex sha or the literal 'unknown'.
    expect(bundle.codeRevision).toMatch(/^[0-9a-f]{7,40}$|^unknown$/);
    if (bundle.codeRevision !== 'unknown') {
      const real = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
      expect(bundle.codeRevision).toBe(real); // inside this repo the fallback must be exact
    }
    expect(bundle.environmentFingerprint).toBe(`node ${process.version} ${process.platform}`);
    const lockPath = path.join(process.cwd(), 'package-lock.json');
    const expectedLock = fs.existsSync(lockPath)
      ? sha256Hex(fs.readFileSync(lockPath))
      : sha256Hex('missing');
    expect(bundle.dependencyLockHash).toBe(expectedLock);
    expect(bundle.questionRef).toBe(g.q.id);
    expect(bundle.corpusSnapshotRef).toBe(g.corpus.id);
    expect(bundle.sourceArtifactHashes).toEqual([g.srcResolved.contentHash, g.srcFailed.contentHash]);
    expect(bundle.verificationInstructions).toContain('far verify');

    // receipts: plan model_call (test mode) + export receipt (live), aggregated honestly
    const receipts = store.listObjects('receipt', g.run.id);
    expect(bundle.receiptIds).toHaveLength(receipts.length);
    expect(bundle.modelMetadata).toEqual([{ provider: 'test-stub', modelId: 'test-stub', route: 'test_only' }]);

    // final artifact hashes cover the rendered report AND the BP-3 paper markdown
    const report = await artifacts.get(outcome.artifacts[0]!);
    const paper = await artifacts.get(outcome.artifacts[2]!);
    expect(bundle.finalArtifactHashes).toEqual([sha256Hex(report!), sha256Hex(paper!)]);
    expect(bundle.paperOutlineRef).toBe(outcome.artifacts[2]);

    // mandatory honesty: LLM non-determinism + missing/non-live items
    expect(bundle.limitations.some((l) => l.includes('非确定性'))).toBe(true);
    expect(bundle.limitations.some((l) => l.includes('resolved_unaligned'))).toBe(true);
    expect(bundle.limitations.some((l) => l.includes('非 live'))).toBe(true);

    // bundle artifact is content-addressed and byte-identical to the canonical form
    const bundleArtifact = await artifacts.get(outcome.artifacts[1]!);
    expect(bundleArtifact).toBe(canonicalJson(bundle));
    expect(outcome.summary).toContain(outcome.artifacts[1]!);
  });
});

// ---------------------------------------------------------------------------
// RU-1 memory conditioning: plan-stage injection + export disclosure
// ---------------------------------------------------------------------------

describe('plan + export — RU-1 memory conditioning', () => {
  const runPlanWithCapture = async (g: ReturnType<typeof seedRun>, withMemory: boolean) => {
    if (withMemory) {
      store.putMemory(MemoryItemSchema.parse({
        id: 'mem_plancond000000000000000000a',
        kind: 'experiment_outcome', entityType: 'experiment',
        title: 'CRISPR off-target duration experiment failed',
        body: 'duration-response experiment on off-target edits failed: cell-line confounder dominated the effect',
        status: 'active', outcome: 'failed', failureReason: 'cell-line confounder dominated',
        trustClass: 'own_unverified', taint: 'trusted',
        provenance: { runId: 'run_prior00000000000000000000aaa' },
        createdAt: ts(0), lastAccessedAt: ts(0),
      }));
    }
    const reqs: Array<{ task: string; userPayload: unknown; systemPrompt?: string }> = [];
    const inner = createTestStubProvider([{ rawOutput: JSON.stringify(validPlanDraft([g.hyp.id], [g.clmVerified.id])) }]);
    const provider: StageContext['provider'] = {
      name: inner.name,
      liveReady: inner.liveReady,
      async structuredCall(req, parse) {
        reqs.push({ task: req.task, userPayload: req.userPayload, systemPrompt: req.systemPrompt });
        return inner.structuredCall(req, parse);
      },
    };
    const ctx = makeCtx(g.run, provider);
    const outcome = await planStage.execute(ctx);
    return { outcome, ctx, reqs };
  };

  it('plan receives prior failed outcomes with trust labels; event + summary disclose; export renders the §9 line', async () => {
    const g = seedRun();
    const { outcome, reqs } = await runPlanWithCapture(g, true);
    expect(outcome.kind).toBe('done');

    const planReq = reqs.find((r) => r.task === 'research-plan-design');
    expect(planReq).toBeDefined();
    const input = ((planReq!.userPayload as { input?: Record<string, unknown> })?.input ?? {}) as Record<string, unknown>;
    const mem = input.priorResearchMemory as Array<{ id: string; trustClass: string }>;
    expect(mem).toBeDefined();
    expect(mem[0]!.id).toBe('mem_plancond000000000000000000a');
    expect(mem[0]!.trustClass).toBe('own_unverified');
    expect(String(planReq!.systemPrompt)).toContain('priorResearchMemory');

    const note = store.listEvents(g.run.id).find((e) => (e.detail as { reason?: string })?.reason === 'memory_conditioning');
    expect(note).toBeDefined();
    expect(note!.stage).toBe('plan');
    expect(outcome.kind === 'done' ? outcome.summary : '').toMatch(/memory conditioning \(RU-1\): 1 prior workspace outcome/);

    // export discloses the conditioning in §9 (auditable event is the truth source)
    const exportCtx = makeCtx(g.run, createTestStubProvider([]));
    const exportOutcome = await exportStage.execute(exportCtx);
    expect(exportOutcome.kind).toBe('done');
    const report = await artifacts.get(exportOutcome.kind === 'done' ? exportOutcome.artifacts[0]! : 'sha256:0');
    expect(report).toContain('工作区记忆调节');
    // full-line assertion: the stage attribution renders (envelope stage, not 'unknown')
    expect(report).toMatch(/作为数据注入 plan 生成——非本轮证据/);
  });

  it('control: no memory -> plan payload lacks the block; no event; no export line', async () => {
    const g = seedRun();
    const { outcome, reqs } = await runPlanWithCapture(g, false);
    expect(outcome.kind).toBe('done');
    const planReq = reqs.find((r) => r.task === 'research-plan-design');
    const input = ((planReq!.userPayload as { input?: Record<string, unknown> })?.input ?? {}) as Record<string, unknown>;
    expect(input.priorResearchMemory).toBeUndefined();
    expect(outcome.kind === 'done' ? outcome.summary : '').not.toMatch(/memory conditioning/);
    const exportCtx = makeCtx(g.run, createTestStubProvider([]));
    const exportOutcome = await exportStage.execute(exportCtx);
    expect(exportOutcome.kind).toBe('done');
    const report = await artifacts.get(exportOutcome.kind === 'done' ? exportOutcome.artifacts[0]! : 'sha256:0');
    expect(report).not.toContain('工作区记忆调节');
  });
});
