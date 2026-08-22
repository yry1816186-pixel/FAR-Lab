import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CorpusSnapshot,
  EvidenceBody,
  EvidenceRelation,
  ExperimentRun,
  ExperimentSpec,
  HypothesisCandidate,
  HypothesisScorecard,
  HypothesisTournament,
  ResearchPlan,
  ResearchQuestion,
  ReproducibilityBundle,
  ScientificClaim,
  SourceDocument,
  StatReport,
  buildAchAnalysis,
  newId,
} from '../src/domain/index.js';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore, type ArtifactStore } from '../src/persistence/artifacts.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { exportStage } from '../src/pipeline/stages/export.js';
import { buildPaperOutline, renderPaperMarkdown } from '../src/pipeline/paper-outline.js';
import type { StageContext } from '../src/pipeline/types.js';
import type { PaperOutline } from '../src/domain/index.js';
import { sha256Hex } from '../src/shared/crypto.js';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createApiServer } from '../src/server/api.js';
import type { ApiServer } from '../src/server/api.js';

// *** TEST-ONLY *** BP-3 research-product layer: a realistic in-memory fixture graph
// (question / 3 sources / 5 claims / 3 hypotheses / scorecards / tournament / evidence
// bodies / ACH / plan / one executed experiment with stat report) drives the paper
// outline projection; the API block mirrors tests/api.test.ts's createApp harness.

let tmp: string;
let db: Db;
let store: Store;
let artifacts: ArtifactStore;

const T0 = Date.parse('2026-08-23T00:00:00.000Z');
const ts = (i: number) => new Date(T0 + i * 1000).toISOString();
const NOW = ts(100);
const ghost = (prefix: string) => `${prefix}_${'0'.repeat(26)}`; // well-formed but nonexistent

interface Fixture {
  runId: string;
  question: ResearchQuestion;
  srcResolved: SourceDocument;
  srcArxiv: SourceDocument;
  srcDupDoi: SourceDocument;
  claims: ScientificClaim[];
  hyps: HypothesisCandidate[];
  statReport: StatReport;
  experimentRun: ExperimentRun;
  plan: ResearchPlan;
}

/** The full realistic graph (spec fixture: 3 sources, 5 claims, 3 hypotheses, ...). */
const seedFixture = (): Fixture => {
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Why do CRISPR base editors cause off-target edits?',
    background: 'prior work shows motif-dependent off-targets',
    goalType: 'explanatory',
    scope: { domain: 'genome editing', phenomena: ['off-target edits'] },
    constraints: {},
    createdAt: ts(1),
  });
  store.putObject('question', q);
  const run = store.createRun(q);
  const runId = run.id;

  const srcResolved = SourceDocument.parse({
    id: newId('src'),
    runId,
    family: 'openalex',
    identifiers: [{ kind: 'doi', value: '10.1000/example-resolved' }],
    title: 'Resolved study of off-target editing (50% & scale_test)',
    publicationYear: 2024,
    authors: ['A. Researcher'],
    venue: 'Nature Biotechnology',
    contentDepth: 'abstract',
    accessState: 'open',
    contentHash: 'a'.repeat(64),
    retrievedAt: ts(2),
    parseStatus: 'ok',
    verification: { method: 'crossref_doi', resolved: true, titleMatch: true, checkedAt: ts(2) },
  });
  const srcArxiv = SourceDocument.parse({
    id: newId('src'),
    runId,
    family: 'arxiv',
    identifiers: [{ kind: 'arxiv', value: '2401.00000' }],
    title: 'Unresolvable preprint',
    publicationYear: 2023,
    contentDepth: 'metadata_only',
    accessState: 'unknown',
    contentHash: 'b'.repeat(64),
    retrievedAt: ts(3),
    parseStatus: 'ok',
    verification: { method: 'arxiv_id', resolved: false, detail: 'id not found', checkedAt: ts(3) },
  });
  const srcDupDoi = SourceDocument.parse({
    id: newId('src'),
    runId,
    family: 'crossref',
    identifiers: [{ kind: 'doi', value: '10.1000/example-resolved' }], // SAME paper via another family
    title: 'Duplicate DOI record of the resolved study',
    publicationYear: 2024,
    authors: ['A. Researcher'],
    contentDepth: 'abstract',
    accessState: 'open',
    contentHash: 'c'.repeat(64),
    retrievedAt: ts(4),
    parseStatus: 'ok',
    verification: { method: 'crossref_doi', resolved: true, titleMatch: true, checkedAt: ts(4) },
  });
  store.putObject('corpus_snapshot', CorpusSnapshot.parse({
    id: newId('corp'),
    runId,
    queries: [{ purpose: 'discovery', text: 'base editing off-target' }],
    documentIds: [srcResolved.id, srcArxiv.id, srcDupDoi.id],
    createdAt: ts(5),
    familyFailures: [],
  }));
  store.putObject('source_document', srcResolved);
  store.putObject('source_document', srcArxiv);
  store.putObject('source_document', srcDupDoi);

  const mkClaim = (src: SourceDocument, i: number, text: string, bindingStatus: ScientificClaim['bindingStatus']): ScientificClaim =>
    ScientificClaim.parse({
      id: newId('clm'),
      runId,
      text,
      locators: [{ sourceDocumentId: src.id, quote: 'verbatim excerpt' }],
      bindingStatus,
      alignmentChecked: bindingStatus === 'verified',
      uncertainties: [],
      createdAt: ts(i),
    });
  const c1 = mkClaim(srcResolved, 6, 'CBE causes C-to-T off-target mutations at specific motifs', 'verified');
  const c2 = mkClaim(srcResolved, 7, 'Exposure duration correlates with bystander deamination count', 'verified');
  const c3 = mkClaim(srcArxiv, 8, 'Off-target rate doubles every 24h of exposure', 'resolved_unaligned');
  const c4 = mkClaim(srcArxiv, 9, 'Unresolvable identifier makes this claim unverifiable', 'unresolved');
  const c5 = mkClaim(srcDupDoi, 10, 'Motif context modulates off-target efficiency', 'verified');
  const claims = [c1, c2, c3, c4, c5];
  for (const c of claims) store.putObject('claim', c);

  const mkFalsification = (provenance: 'model-stipulated' | 'evidence-derived' | 'mixed') => ({
    observable: 'off-target edit frequency per exposure duration',
    measurement: 'targeted deep sequencing across duration gradient',
    expectedRelation: 'monotonic increase with duration',
    decisionRule: '>=2x off-target rate at long vs short duration supports',
    decisionRuleProvenance: provenance,
    supportCondition: 'dose-response present',
    weakeningCondition: 'flat response',
    falsificationCondition: 'inverse or no relationship across independent cell lines',
    method: 'controlled exposure series',
    failureInterpretation: 'duration hypothesis not supported',
    completenessCheck: { passed: true, missing: [] },
  });

  const hyp1 = HypothesisCandidate.parse({
    id: newId('hyp'), runId, version: 0,
    statement: 'Off-targeting is driven by deaminase exposure duration',
    mechanism: 'longer exposure increases bystander deamination',
    derivation: { strategy: 'mechanism_driven', rationale: 'from timing evidence', inputClaimIds: [c1.id] },
    supportingClaimIds: [c1.id, c2.id],
    counterClaimIds: [c3.id],
    uncertainties: ['dose-response shape unknown', 'single-cell-line evidence only'],
    noveltyLabel: 'evidence_grounded',
    testability: 'testable_now',
    falsification: mkFalsification('model-stipulated'),
    clusterKey: 'duration-mechanism',
    createdAt: ts(11),
  });
  const hyp2 = HypothesisCandidate.parse({
    id: newId('hyp'), runId, version: 0,
    statement: 'Off-targeting is driven by gRNA secondary structure',
    mechanism: 'structured gRNA slows Cas9 release',
    derivation: { strategy: 'contradiction_driven', rationale: 'countervailing reports', inputClaimIds: [c5.id] },
    supportingClaimIds: [c5.id],
    counterClaimIds: [],
    uncertainties: ['motif specificity unmeasured'],
    noveltyLabel: 'mixed',
    testability: 'testable_with_data',
    falsification: mkFalsification('evidence-derived'),
    clusterKey: 'structure-mechanism',
    createdAt: ts(12),
  });
  const hyp3 = HypothesisCandidate.parse({
    id: newId('hyp'), runId, version: 0,
    statement: 'Off-targeting reflects cell-cycle state rather than editor kinetics',
    mechanism: 'replication timing exposes loci asymmetrically',
    derivation: { strategy: 'boundary_condition', rationale: 'population variance unexplained', inputClaimIds: [] },
    supportingClaimIds: [ghost('clm')], // dangling ref — must be dropped, never rendered
    counterClaimIds: [],
    uncertainties: [],
    noveltyLabel: 'novel_speculation',
    testability: 'testable_with_data',
    falsification: mkFalsification('mixed'),
    clusterKey: 'cell-cycle',
    createdAt: ts(13),
  });
  const hyps = [hyp1, hyp2, hyp3];
  for (const h of hyps) store.putObject('hypothesis', h);

  // scorecards: 2 dims each — 5 of 6 uncalibrated
  const dim = (d: 'falsifiability' | 'evidence_grounding', uncalibrated: boolean, rationale: string) => ({
    dimension: d,
    value: 0.7,
    rationale,
    evidenceClaimIds: [],
    producer: 'test-stub',
    calibration: (uncalibrated ? 'uncalibrated_llm_judgment' : 'deterministic') as 'uncalibrated_llm_judgment' | 'deterministic',
  });
  hyps.forEach((h, i) => {
    store.putObject('scorecard', HypothesisScorecard.parse({
      id: newId('sc'), runId, hypothesisId: h.id,
      dimensions: [
        dim('falsifiability', true, 'clear decision rule'),
        dim('evidence_grounding', !(i === 0), 'grounding from stored claims'),
      ],
      overallRationale: `rationale for ${h.id}`,
      rankedOutOf: 3,
      rank: i + 1,
      createdAt: ts(14 + i),
    }));
  });

  const rel1 = EvidenceRelation.parse({ id: newId('ev'), runId, relation: 'supports', claimId: c1.id, targetHypothesisId: hyp1.id, rationale: 'direct measurement', strength: 'moderate', createdAt: ts(17) });
  const rel2 = EvidenceRelation.parse({ id: newId('ev'), runId, relation: 'supports', claimId: c2.id, targetHypothesisId: hyp1.id, rationale: 'duration correlation', strength: 'weak', createdAt: ts(18) });
  const rel3 = EvidenceRelation.parse({ id: newId('ev'), runId, relation: 'contradicts', claimId: c3.id, targetHypothesisId: hyp1.id, rationale: 'incompatible with monotonic story', strength: 'weak', createdAt: ts(19) });
  const rel4 = EvidenceRelation.parse({ id: newId('ev'), runId, relation: 'supports', claimId: c5.id, targetHypothesisId: hyp2.id, rationale: 'motif context evidence', strength: 'strong', createdAt: ts(20) });
  const rel5 = EvidenceRelation.parse({ id: newId('ev'), runId, relation: 'weakens', claimId: c5.id, targetHypothesisId: hyp3.id, rationale: 'motif evidence fits structure better than cell cycle', strength: 'weak', createdAt: ts(21) });
  const relations = [rel1, rel2, rel3, rel4, rel5];
  for (const r of relations) store.putObject('evidence_relation', r);

  store.putObject('tournament', HypothesisTournament.parse({
    id: newId('trn'), runId, participantIds: hyps.map((h) => h.id),
    matches: [{ aId: hyp1.id, bId: hyp2.id, aFirstVerdict: 'a', bFirstVerdict: 'a', rationale: 'duration evidence is more direct', producer: 'test-stub', outcome: 'a' }],
    standings: [
      { hypothesisId: hyp1.id, btScore: 1.5, wins: 2, losses: 0, ties: 0, winRate: 1, rank: 1 },
      { hypothesisId: hyp2.id, btScore: 0.9, wins: 1, losses: 1, ties: 0, winRate: 0.5, rank: 2 },
      { hypothesisId: hyp3.id, btScore: 0.4, wins: 0, losses: 2, ties: 0, winRate: 0, rank: 3 },
    ],
    algorithm: 'bradley-terry-ilsr-v1',
    uncertainty: 'small tournament (test fixture)',
    createdAt: ts(22),
  }));

  const mkBody = (h: HypothesisCandidate, independentSources: number, band: EvidenceBody['logLrBand']): EvidenceBody =>
    EvidenceBody.parse({
      id: newId('evb'), runId, hypothesisId: h.id,
      independentSources,
      sumLogLrLow: 0.5, sumLogLrHigh: 1.0,
      logLrBand: band,
      qbafScore: 0.6,
      proofStandard: 'preponderance',
      experimentalAxes: 0,
      promotion: independentSources >= 2 ? 'orthogonal' : 'literature_only_unverified',
      disclosure: `fixture body for ${h.id}`,
      createdAt: ts(23),
    });
  store.putObject('evidence_body', mkBody(hyp1, 1, 'moderate_support'));
  store.putObject('evidence_body', mkBody(hyp2, 2, 'strong_support'));
  store.putObject('evidence_body', mkBody(hyp3, 0, 'none'));

  store.putObject('ach_analysis', buildAchAnalysis({
    id: newId('ach'), runId, hypothesisIds: hyps.map((h) => h.id), relations, now: ts(24),
  }));

  const plan = ResearchPlan.parse({
    id: newId('pln'), runId,
    objective: 'Discriminate duration-driven vs structure-driven off-target mechanisms',
    hypothesisIds: [hyp1.id, hyp2.id],
    steps: [
      { id: newId('task'), title: 'collect duration series', kind: 'experiment', inputs: ['cells'], outputs: ['sequencing data'], method: 'transfect at 6 timepoints', failureConditions: ['low transfection efficiency'], dependsOn: [] },
      { id: newId('task'), title: 'quantify off-target edits', kind: 'data_analysis', inputs: ['sequencing data'], outputs: ['edit-rate table'], method: 'aligned-read counting', failureConditions: ['low coverage'], dependsOn: [] },
      { id: newId('task'), title: 'fit dose-response model', kind: 'tool_run', inputs: ['edit-rate table'], outputs: ['slope estimate'], method: 'bootstrap regression', failureConditions: ['no convergence'], dependsOn: [] },
    ],
    metrics: ['off-target/on-target ratio'],
    decisionRules: { successCriterion: 's', weakeningCriterion: 'w', falsificationCriterion: 'f', stopCriterion: 't' },
    multipleTestingPolicy: 'single_primary',
    planHash: 'd'.repeat(64),
    frozenAt: ts(25),
    createdAt: ts(25),
  });
  store.putObject('plan', plan);

  const spec = ExperimentSpec.parse({
    id: newId('xsp'), runId, planId: plan.id, planStepId: plan.steps[0]!.id,
    version: 1,
    question: q.text,
    datasets: [{ source: { resolver: 'local', path: 'tests/fixtures/dur.csv' }, targetColumn: 'offtarget', split: { method: 'random', ratios: { train: 0.8, val: 0, test: 0.2 }, seed: 1 } }],
    models: [
      { name: 'baseline', builderId: 'dummy_most_frequent', seed: 1 },
      { name: 'lr', builderId: 'logistic_regression', seed: 1 },
    ],
    metrics: ['accuracy'],
    comparisons: [{
      id: 'cmp-main', metricKey: 'accuracy', kind: 'paired_diff', modelAIdx: 1, modelBIdx: 0,
      direction: 'above', threshold: 0.01, thresholdProvenance: 'model-stipulated',
      hypothesisId: hyp1.id, primary: true, mde: 0.05,
    }],
    statistics: { test: 'paired_bootstrap_ci', alpha: 0.05, analysisSeed: 1, ciLevel: 0.95 },
    approvals: [{ hypothesisId: hyp1.id, comparisonIds: ['cmp-main'], decisionRuleSnapshot: 'rule snapshot', approvedBy: 'tester', approvedAt: ts(26) }],
    createdAt: ts(26),
  });
  store.putObject('experiment_spec', spec);

  const statReport = StatReport.parse({
    id: newId('srep'), runId,
    experimentRunId: newId('xrun'),
    comparisonId: 'cmp-main',
    metricKey: 'accuracy',
    primary: true,
    pointEstimate: 0.02,
    ci: { level: 0.95, low: 0.012, high: 0.028 },
    test: { kind: 'paired_bootstrap_ci', alpha: 0.05, nBoot: 2000 },
    effect: { kind: 'paired_diff', value: 0.02 },
    hypothesisId: hyp1.id,
    hypothesisVersion: 0,
    thresholdProvenance: 'model-stipulated',
    verdict: 'supports',
    verdictDerivation: 'CI low 0.012 > threshold 0.01',
    createdAt: ts(27),
  });
  const experimentRun = ExperimentRun.parse({
    id: statReport.experimentRunId, runId, specId: spec.id,
    specHash: 'e'.repeat(64),
    status: 'completed', attempts: 1, executor: 'local',
    resultIds: [], statReportIds: [statReport.id],
    createdAt: ts(28),
  });
  store.putObject('experiment_run', experimentRun);
  store.putObject('stat_report', statReport);

  return { runId, question: q, srcResolved, srcArxiv, srcDupDoi, claims, hyps, statReport, experimentRun, plan };
};

const makeCtx = (runId: string): StageContext => {
  const run = store.getRun(runId);
  if (run === null) throw new Error(`fixture run missing: ${runId}`);
  return {
    run,
    store,
    artifacts,
    provider: createTestStubProvider([]), // export performs no model call; empty script fails loudly
    sourceFor: () => {
      throw new Error('no source adapter in test');
    },
    recordReceipt: () => {},
    cancelled: () => false,
    log: () => {},
  };
};

describe('buildPaperOutline (BP-3 projection)', () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-paper-'));
    db = openDb(path.join(tmp, 'state.db'));
    store = new Store(db);
    artifacts = openArtifactStore(path.join(tmp, 'artifacts'));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('projects every section from the fixture and every reference id resolves to a stored object', () => {
    const g = seedFixture();
    const outline = buildPaperOutline(store, g.runId, { now: NOW });

    const hypIds = new Set(g.hyps.map((h) => h.id as string));
    const claimIds = new Set(g.claims.map((c) => c.id as string));
    const srcIds = new Set([g.srcResolved.id, g.srcArxiv.id, g.srcDupDoi.id] as string[]);

    // abstract source refs resolve by kind
    for (const p of outline.abstractPoints) {
      if (p.sourceRef.kind === 'hypothesis') expect(hypIds.has(p.sourceRef.id)).toBe(true);
      else if (p.sourceRef.kind === 'claim') expect(claimIds.has(p.sourceRef.id)).toBe(true);
      else expect(p.sourceRef.id).toBe(g.experimentRun.id);
    }
    // contributions / results / plan / counter evidence / references all resolve
    for (const c of outline.introduction.contributions) expect(hypIds.has(c.hypothesisId)).toBe(true);
    expect(outline.methods.planRef).toBe(g.plan.id);
    for (const r of outline.results) expect(hypIds.has(r.hypothesisId)).toBe(true);
    for (const c of outline.discussion.counterEvidenceHighlights) expect(claimIds.has(c.claimId)).toBe(true);
    for (const ref of outline.references) expect(srcIds.has(ref.sourceDocumentId)).toBe(true);

    // ranking projection: 3 ranked hypotheses, hyp1 first with tournament + evidence band + verdict
    expect(outline.results.map((r) => r.hypothesisId)).toEqual(g.hyps.map((h) => h.id));
    const top = outline.results[0]!;
    expect(top.rank).toBe(1);
    expect(top.btScore).toBeCloseTo(1.5, 6);
    expect(top.winRate).toBeCloseTo(1, 6);
    expect(top.evidenceBand).toBe('moderate_support');
    expect(top.experimentVerdicts).toEqual([{
      comparison: 'cmp-main',
      metric: 'accuracy',
      verdict: 'supports',
      ciLow: 0.012,
      ciHigh: 0.028,
      threshold: 0.01, // joined from the persisted experiment spec's comparison
    }]);

    // counter-evidence highlights come from stored counter relations (contradicts + weakens)
    expect(outline.discussion.counterEvidenceHighlights.map((c) => c.relation).sort()).toEqual(['contradicts', 'weakens']);

    // the dangling ghost claim on hyp3 never appears anywhere
    expect(JSON.stringify(outline)).not.toContain(ghost('clm'));

    // preregistration projection from the frozen plan
    expect(outline.methods.preregistration).toEqual({
      frozen: true,
      planHash: 'd'.repeat(64),
      multipleTestingPolicy: 'single_primary',
    });

    // uncertainty inventory is monotonic: ALL entries preserved verbatim
    expect(outline.conclusion.openUncertainties).toEqual([
      { hypothesisId: g.hyps[0]!.id, text: 'dose-response shape unknown' },
      { hypothesisId: g.hyps[0]!.id, text: 'single-cell-line evidence only' },
      { hypothesisId: g.hyps[1]!.id, text: 'motif specificity unmeasured' },
    ]);
  });

  it('synthesizes limitations whose counts match fixture reality exactly', () => {
    const g = seedFixture();
    const outline = buildPaperOutline(store, g.runId, { now: NOW });
    const byCat = new Map(outline.limitations.map((l) => [l.category, l] as const));
    expect([...byCat.keys()].sort()).toEqual([
      'evidence_ceiling', 'experiment_coverage', 'single_source_evidence_bodies',
      'stipulated_thresholds', 'uncalibrated_judgment_density', 'uncertainty_inventory',
      'unresolved_source_verification',
    ]);

    expect(byCat.get('evidence_ceiling')!.counts).toEqual({ sources: 3, metadataOnly: 1, abstractOnly: 2, fullTextOrData: 0 });
    expect(byCat.get('uncalibrated_judgment_density')!.counts).toEqual({ dimensions: 6, uncalibratedLlmJudgment: 5 });
    expect(byCat.get('stipulated_thresholds')!.counts).toEqual({ hypotheses: 3, modelStipulated: 1, mixed: 1 });
    expect(byCat.get('unresolved_source_verification')!.counts).toEqual({ claims: 5, verified: 3, resolvedUnaligned: 1, unresolved: 1, missing: 0 });
    expect(byCat.get('single_source_evidence_bodies')!.counts).toEqual({ evidenceBodies: 3, singleSource: 2 });
    expect(byCat.get('experiment_coverage')!.counts).toEqual({ rankedHypotheses: 3, withExperimentVerdict: 1, withoutExperimentVerdict: 2 });
    expect(byCat.get('uncertainty_inventory')!.counts).toEqual({ hypotheses: 3, hypothesesWithUncertainties: 2, uncertaintyEntries: 3 });

    // every limitation detail cites its counts (no bare adjectives)
    for (const l of outline.limitations) {
      for (const v of Object.values(l.counts)) expect(l.detail).toContain(String(v));
    }
  });

  it('emits valid, deduped, escaped BibTeX from stored metadata only', () => {
    const g = seedFixture();
    const outline = buildPaperOutline(store, g.runId, { now: NOW });

    // srcDupDoi shares srcResolved's DOI -> exactly two entries survive (DOI dedupe)
    expect(outline.references).toHaveLength(2);
    const keys = outline.references.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length); // unique keys
    expect(keys).toEqual(['Researcher2024Resolved', 'anonymous2023Unresolvable']);

    const article = outline.references.find((r) => r.key === 'Researcher2024Resolved')!;
    expect(article.sourceDocumentId).toBe(g.srcResolved.id);
    expect(article.bibtex.startsWith('@article{Researcher2024Resolved,')).toBe(true);
    expect(article.bibtex).toContain('journal = {Nature Biotechnology}');
    expect(article.bibtex).toContain('doi = {10.1000/example-resolved}');
    // latex specials in the stored title are escaped
    expect(article.bibtex).toContain('50\\% \\& scale\\_test');

    const misc = outline.references.find((r) => r.key === 'anonymous2023Unresolvable')!;
    expect(misc.sourceDocumentId).toBe(g.srcArxiv.id);
    expect(misc.bibtex.startsWith('@misc{anonymous2023Unresolvable,')).toBe(true);
    expect(misc.bibtex).toContain('note = {arXiv: 2401.00000}');
    expect(misc.bibtex).not.toContain('author ='); // authors never invented

    for (const ref of outline.references) {
      // balanced braces
      expect(ref.bibtex.split('{').length - 1).toBe(ref.bibtex.split('}').length - 1);
      // no unescaped specials remain inside field values (check % & _ not preceded by backslash)
      expect(ref.bibtex.match(/(?<!\\)[%&]/g)).toBeNull();
    }
  });

  it('renders the full IMRaD markdown skeleton with the standing disclosure', () => {
    const g = seedFixture();
    const outline = buildPaperOutline(store, g.runId, { now: NOW });
    const md = renderPaperMarkdown(outline);

    for (const section of [
      '## Abstract', '## 1 Introduction', '## 2 Methods', '## 3 Results',
      '## 4 Discussion', '## 5 Limitations', '## 6 Conclusion and Future Work', '## References',
    ]) {
      expect(md).toContain(section);
    }
    expect(md).toContain(`# ${g.question.text}`);
    expect(md).toContain('UNCALIBRATED decision aids'); // standing disclosure line
    expect(md).toContain('uncalibrated decision aids'); // repeated where scores are shown
    expect(md).toContain('(source: hypothesis `'); // abstract points cite sourceRefs
    expect(md).toContain('verdict=supports'); // stat-report projection
    expect(md).toContain('frozen=true'); // preregistration projection
    expect(md).toContain('```bibtex'); // references block
    // every limitation category line lands in Section 5
    for (const l of outline.limitations) expect(md).toContain(`**${l.category}**`);
    // full uncertainty inventory preserved in Section 6
    for (const u of outline.conclusion.openUncertainties) expect(md).toContain(u.text);
  });

  it('is deterministic: identical store + fixed clock -> identical outline JSON', () => {
    const g = seedFixture();
    const a = buildPaperOutline(store, g.runId, { now: NOW });
    const b = buildPaperOutline(store, g.runId, { now: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(renderPaperMarkdown(a)).toBe(renderPaperMarkdown(b));
  });

  it('degrades honestly on a bare run (question only): 7 zero-count limitations, no fabricated sections', () => {
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'Bare question', background: '', goalType: 'exploratory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: ts(1),
    });
    store.putObject('question', q);
    const run = store.createRun(q);
    const outline: PaperOutline = buildPaperOutline(store, run.id, { now: NOW });

    expect(outline.results).toEqual([]);
    expect(outline.introduction.contributions).toEqual([]);
    expect(outline.methods.planRef).toBeNull();
    expect(outline.methods.stepsSummary).toEqual([]);
    expect(outline.methods.preregistration).toEqual({ frozen: false });
    expect(outline.references).toEqual([]);
    expect(outline.limitations).toHaveLength(7); // all categories present with zero counts
    expect(outline.limitations.every((l) => Object.values(l.counts).every((v) => v === 0))).toBe(true);
    const md = renderPaperMarkdown(outline);
    expect(md).toContain('## 3 Results');
    expect(md).toContain('(No results: no hypotheses are stored for this run.)');
    expect(md).not.toContain('question object missing'); // question EXISTS here — no false degradation
    expect(outline.title).toBe('Bare question');
  });
});

describe('export stage paper artifact (BP-3 wiring)', () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-paper-export-'));
    db = openDb(path.join(tmp, 'state.db'));
    store = new Store(db);
    artifacts = openArtifactStore(path.join(tmp, 'artifacts'));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('persists the paper markdown as a third artifact and hashes it into the bundle', async () => {
    const g = seedFixture();
    const outcome = await exportStage.execute(makeCtx(g.runId));
    if (outcome.kind !== 'done') throw new Error('expected done outcome');

    const artifactRefs = outcome.artifacts ?? [];
    expect(artifactRefs).toHaveLength(3); // report, bundle, paper
    const bundles = store.listObjects('bundle', g.runId);
    expect(bundles).toHaveLength(1);
    const bundle = bundles[0]!;

    const paperRef = bundle.paperOutlineRef;
    expect(paperRef).toBeDefined();
    expect(paperRef).toBe(artifactRefs[2]);
    const paper = await artifacts.get(artifactRefs[2]!);
    expect(paper).toContain('## Abstract');
    expect(paper).toContain('## References');
    expect(bundle.finalArtifactHashes[1]).toBe(sha256Hex(paper!));
    const report = await artifacts.get(artifactRefs[0]!);
    expect(bundle.finalArtifactHashes[0]).toBe(sha256Hex(report!)); // report stays [0]
  });
});

// ---- HTTP surface (mirrors tests/api.test.ts's createApp harness, minimal) ----

let apiTmp: string;
let apiApp: App;
let api: ApiServer;
let apiBase: string;
let paperRunId = '';
let preBp3RunId = '';

describe('GET /api/v1/runs/:id/paper', () => {
  beforeAll(async () => {
    apiTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-paper-api-'));
    apiApp = await createApp({ dataDir: apiTmp, providerOverride: createTestStubProvider([]) });

    // run WITH a paper artifact (post-BP3 bundle)
    const q1 = ResearchQuestion.parse({
      id: newId('q'), text: 'Paper-serving run', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: ts(1),
    });
    const r1 = apiApp.store.createRun(q1);
    paperRunId = r1.id;
    const paperMd = '# Paper skeleton (seed)\n\n## Abstract\nseeded\n';
    const paperPut = await apiApp.artifacts.put(paperMd);
    const reportPut = await apiApp.artifacts.put('# report (seed)\n');
    apiApp.store.putObject('bundle', ReproducibilityBundle.parse({
      id: newId('bnd'), runId: r1.id, declaredEvidenceLevel: 'replay',
      codeRevision: 'unknown', environmentFingerprint: 'node test', dependencyLockHash: 'a'.repeat(64),
      questionRef: q1.id, corpusSnapshotRef: 'missing:corpus_snapshot',
      sourceArtifactHashes: [], modelMetadata: [], receiptIds: [],
      finalArtifactHashes: [reportPut.hash, paperPut.hash],
      paperOutlineRef: paperPut.ref,
      verificationInstructions: 'far verify <id>', limitations: ['seed'],
      createdAt: ts(2),
    }));

    // run whose bundle PREDATES BP-3 (no paperOutlineRef) -> honest 404
    const q2 = ResearchQuestion.parse({
      id: newId('q'), text: 'Pre-BP3 run', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: ts(3),
    });
    const r2 = apiApp.store.createRun(q2);
    preBp3RunId = r2.id;
    apiApp.store.putObject('bundle', ReproducibilityBundle.parse({
      id: newId('bnd'), runId: r2.id, declaredEvidenceLevel: 'replay',
      codeRevision: 'unknown', environmentFingerprint: 'node test', dependencyLockHash: 'a'.repeat(64),
      questionRef: q2.id, corpusSnapshotRef: 'missing:corpus_snapshot',
      sourceArtifactHashes: [], modelMetadata: [], receiptIds: [],
      finalArtifactHashes: [reportPut.hash],
      verificationInstructions: 'far verify <id>', limitations: ['seed'],
      createdAt: ts(4),
    }));

    api = createApiServer(apiApp, { port: 0, executor: () => Promise.resolve(null), staticRoot: path.join(apiTmp, 'no-web-dist') });
    const port = await api.start();
    apiBase = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await api.stop();
    apiApp.close();
    fs.rmSync(apiTmp, { recursive: true, force: true });
  });

  it('serves the paper markdown (200, text/markdown)', async () => {
    const res = await fetch(`${apiBase}/api/v1/runs/${paperRunId}/paper`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect(await res.text()).toContain('## Abstract');
  });

  it('404s honestly for a pre-BP3 bundle and for a run without any bundle', async () => {
    const pre = await fetch(`${apiBase}/api/v1/runs/${preBp3RunId}/paper`);
    expect(pre.status).toBe(404);
    const body = (await pre.json()) as { error: { code: string; runId: string } };
    expect(body.error.code).toBe('not_found');
    expect(body.error.runId).toBe(preBp3RunId);

    const noBundle = await fetch(`${apiBase}/api/v1/runs/run_${'1'.repeat(26)}/paper`);
    expect(noBundle.status).toBe(404); // unknown run id -> 404 envelope
  });
});
