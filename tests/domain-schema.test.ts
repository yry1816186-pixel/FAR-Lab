import { describe, it, expect } from 'vitest';
import {
  ResearchQuestion, ResearchRun, RunEvent, SourceDocument, CorpusSnapshot,
  ScientificClaim, EvidenceRelation, HypothesisCandidate, HypothesisScorecard,
  ResearchPlan, FeedbackSignal, Revision, VersionDiff, ProvenanceReceipt,
  ReproducibilityBundle, newId, STAGE_ORDER,
} from '../src/domain/index.js';
import { canonicalSha256 } from '../src/shared/crypto.js';

const now = new Date().toISOString();
const runId = newId('run');

/** A complete, canonical object graph for one run — schema coherence contract. */
export const fullRunGraph = () => {
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'Why do CRISPR base editors cause off-target edits?',
    background: 'b', goalType: 'explanatory',
    scope: { domain: 'genome editing', phenomena: ['off-target edits'] },
    constraints: { assumptions: ['editing machinery acts locally'] },
    createdAt: now,
  });
  const run = ResearchRun.parse({
    id: runId, questionId: q.id, status: 'running', currentStage: 'build_evidence',
    stages: [
      { stage: 'scope', state: 'done', attempt: 1 },
      { stage: 'retrieve', state: 'done', attempt: 1, subtasks: { known: true, done: 3, total: 3 } },
      { stage: 'verify_sources', state: 'done', attempt: 1 },
      { stage: 'build_evidence', state: 'running', attempt: 1 },
    ],
    createdAt: now, updatedAt: now, tags: [],
  });
  const ev1 = RunEvent.parse({
    seq: 1, runId, at: now, type: 'run_created', status: 'created', detail: {},
  });
  const src = SourceDocument.parse({
    id: newId('src'), runId, family: 'openalex',
    identifiers: [{ kind: 'doi', value: '10.1000/example' }],
    title: 'A study', publicationYear: 2024, authors: ['A. Researcher'],
    contentDepth: 'abstract', accessState: 'open',
    contentHash: canonicalSha256({ title: 'A study', abstract: 'x' }),
    retrievedAt: now, parseStatus: 'ok', abstractText: 'abstract text',
  });
  const corp = CorpusSnapshot.parse({
    id: newId('corp'), runId,
    queries: [{ purpose: 'discovery', text: 'base editing off-target' }],
    documentIds: [src.id], createdAt: now, familyFailures: [],
  });
  const clm = ScientificClaim.parse({
    id: newId('clm'), runId,
    text: 'CBE causes C-to-T off-target mutations at specific motifs',
    locators: [{ sourceDocumentId: src.id, quote: 'off-target C-to-T mutations were observed' }],
    bindingStatus: 'verified', alignmentChecked: true,
  });
  const rel = EvidenceRelation.parse({
    id: newId('ev'), runId, relation: 'supports', claimId: clm.id,
    targetHypothesisId: undefined, rationale: 'direct measurement', strength: 'moderate',
    uncertainties: [], createdAt: now,
  });
  const hyp = HypothesisCandidate.parse({
    id: newId('hyp'), runId, version: 0,
    statement: 'Off-targeting is driven by deaminase expression duration',
    mechanism: 'longer exposure window increases bystander deamination',
    derivation: { strategy: 'mechanism_driven', rationale: 'from timing evidence', inputClaimIds: [clm.id] },
    assumptions: [{ id: 'a1', statement: 'deaminase acts independently of Cas9', kind: 'empirical', backingClaimIds: [] }],
    predictions: ['shortened exposure reduces off-target rate'],
    supportingClaimIds: [clm.id], counterClaimIds: [], uncertainties: [],
    noveltyLabel: 'evidence_grounded', testability: 'testable_now',
    falsification: {
      observable: 'off-target edit frequency per exposure duration',
      measurement: 'targeted deep sequencing across duration gradient',
      expectedRelation: 'monotonic increase with duration',
      decisionRule: '>=2x off-target rate at long vs short duration supports; no increase weakens',
      supportCondition: 'dose-response present', weakeningCondition: 'flat response',
      falsificationCondition: 'inverse or no relationship across independent cell lines',
      confounders: ['cell-cycle state'], alternativeExplanations: ['gRNA secondary structure'],
      dataRequirements: ['duration-series editing dataset'], method: 'controlled exposure series',
      failureInterpretation: 'duration hypothesis not supported; revisit mechanism class',
      completenessCheck: { passed: true, missing: [] },
    },
    clusterKey: 'duration-mechanism', createdAt: now,
  });
  const score = HypothesisScorecard.parse({
    id: newId('sc'), runId, hypothesisId: hyp.id,
    dimensions: [{
      dimension: 'evidence_grounding', value: 0.6, rationale: 'one supporting claim',
      evidenceClaimIds: [clm.id], producer: 'test', calibration: 'uncalibrated_llm_judgment',
    }],
    overallRationale: 'grounded but narrow', rankedOutOf: 3, rank: 1,
  });
  const plan = ResearchPlan.parse({
    id: newId('pln'), runId, objective: 'discriminate duration vs gRNA-structure mechanisms',
    hypothesisIds: [hyp.id], variables: ['exposure duration', 'off-target frequency'],
    controls: ['mock transfection'],
    dataRequirements: [{ name: 'duration series', variables: ['duration'], availability: 'must_collect' }],
    toolRequirements: [{ name: 'deep sequencing pipeline', purpose: 'quantify edits', kind: 'software' }],
    steps: [{ id: newId('task'), title: 'collect duration series', kind: 'experiment',
      method: 'transfect at 6 timepoints', inputs: ['cells'], outputs: ['sequencing data'],
      failureConditions: ['low transfection efficiency'] }],
    metrics: ['off-target/ontarget ratio'], decisionRules: {
      successCriterion: 'dose response with >=2x', weakeningCriterion: 'flat',
      falsificationCriterion: 'inverse across lines', stopCriterion: '3 independent lines' },
    risks: ['batch effects'], createdAt: now,
  });
  const fbk = FeedbackSignal.parse({
    id: newId('fbk'), runId, source: 'human_expert',
    content: 'gRNA structure confound must be controlled', provenance: 'expert review session',
    receivedAt: now,
  });
  const rev = Revision.parse({
    id: newId('rev'), runId, triggerFeedbackId: fbk.id,
    causalReason: 'expert identified uncontrolled confounder in plan',
    operations: [{ objectType: 'plan', objectId: plan.id, operation: 'modify',
      before: 'no gRNA control', after: 'add structure-matched gRNA control', reason: 'confounder control' }],
    fromVersionLabel: 'v0', toVersionLabel: 'v1',
    qualityDelta: { status: 'improved', claim: 'confounder addressed', evidenceRefs: [] },
    createdAt: now,
  });
  const diff = VersionDiff.parse({
    revisionId: rev.id, runId,
    entries: [{ objectType: 'plan', objectId: plan.id, summary: 'added structure-matched control', changedFields: ['controls'] }],
    semanticSummary: 'plan now controls gRNA structure confound', remainingUncertainties: [],
  });
  const receipt = ProvenanceReceipt.parse({
    id: newId('rcp'), runId, kind: 'model_call', executionMode: 'live', at: now,
    modelCall: { provider: 'deepseek', modelId: 'deepseek-chat', usage: { totalTokens: 100 },
      latencyMs: 500, requestHash: canonicalSha256({ m: 'q' }), outputHash: canonicalSha256({ m: 'a' }),
      finishReason: 'stop' },
    redactionNote: 'hashes only',
  });
  const bundle = ReproducibilityBundle.parse({
    id: newId('bnd'), runId, declaredEvidenceLevel: 'replay',
    codeRevision: 'abc123', environmentFingerprint: 'node24-win32',
    dependencyLockHash: canonicalSha256({ lock: true }), questionRef: q.id,
    corpusSnapshotRef: corp.id, sourceArtifactHashes: [src.contentHash],
    modelMetadata: [{ provider: 'deepseek', modelId: 'deepseek-chat', route: 'live' }],
    receiptIds: [receipt.id], finalArtifactHashes: [canonicalSha256({ final: true })],
    verificationInstructions: 'far verify <bundle>', limitations: ['LLM nondeterminism'], createdAt: now,
  });
  return { q, run, ev1, src, corp, clm, rel, hyp, score, plan, fbk, rev, diff, receipt, bundle };
};

describe('canonical domain schema', () => {
  it('parses a full run object graph without error', () => {
    const g = fullRunGraph();
    expect(g.run.id).toBe(runId);
    expect(g.hyp.falsification?.completenessCheck?.passed).toBe(true);
    expect(g.bundle.declaredEvidenceLevel).toBe('replay');
  });

  it('rejects claims without locators (fail-closed grounding)', () => {
    const g = fullRunGraph();
    expect(() => ScientificClaim.parse({ ...g.clm, locators: [] })).toThrow();
  });

  it('rejects plans without decision rules (executable-plan contract)', () => {
    const g = fullRunGraph();
    expect(() => ResearchPlan.parse({ ...g.plan, decisionRules: undefined })).toThrow();
  });

  it('rejects revisions without causal link to feedback', () => {
    const g = fullRunGraph();
    expect(() => Revision.parse({ ...g.rev, triggerFeedbackId: 'not_a_feedback_id' })).toThrow();
  });

  it('STAGE_ORDER covers all canonical stages exactly once', () => {
    expect(new Set(STAGE_ORDER).size).toBe(STAGE_ORDER.length);
    expect(STAGE_ORDER).toContain('critique_falsify');
  });

  it('rejects receipt with fabricated execution mode', () => {
    const g = fullRunGraph();
    expect(() => ProvenanceReceipt.parse({ ...g.receipt, executionMode: 'simulated' })).toThrow();
  });
});
