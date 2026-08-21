#!/usr/bin/env node
/**
 * TEST-ONLY smoke backend for the web workbench — *** NOT A PRODUCT MOCK ***
 *
 * Boots the REAL kernel (real Store/SQLite, real HTTP server from src/server/api.ts)
 * in a throwaway temp data dir with:
 *   - the test-stub model provider (fails loudly if any model call happens), and
 *   - the documented executor test seam (same pattern as tests/api.test.ts):
 *     POST /runs marks stages done instead of running the live pipeline.
 * A small REAL object graph is seeded through the same zod-parsed domain objects
 * the pipeline persists, so every /api/v1 endpoint the frontend renders returns
 * authentic shapes. Purpose: contract smoke for web/src/api + optional UI
 * walkthrough preparation WITHOUT live model quota. Production walkthroughs must
 * use the real server (`node dist/server/main.js`) with live providers.
 *
 * Usage:
 *   1) npx tsc -p tsconfig.json --outDir <tmpdir>/farlab-smoke-dist   (from repo root)
 *   2) node web/scripts/smoke-server.mjs <tmpdir>/farlab-smoke-dist
 * Serves: http://127.0.0.1:8787 (static: web/dist when present). Prints seeded ids.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const distRoot = process.argv[2];
if (distRoot === undefined) {
  console.error('usage: node web/scripts/smoke-server.mjs <compiled-dist-root>');
  process.exit(2);
}
const importFrom = (rel) => import(pathToFileURL(path.join(distRoot, rel)).href);

const { createApp } = await importFrom('app/composition.js');
const { createApiServer } = await importFrom('server/api.js');
const { createTestStubProvider } = await importFrom('providers/test-stub.js');
const D = await importFrom('domain/index.js');

const sha256Hex = (s) => createHash('sha256').update(s).digest('hex');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-web-smoke-'));
const webDist = path.resolve(import.meta.dirname, '..', 'dist');
const app = await createApp({ dataDir, providerOverride: createTestStubProvider() });

// Executor test seam: complete the run in-store without touching model/source routes.
const executor = (runId) => {
  const run = app.store.getRun(runId);
  if (run) {
    const now = new Date().toISOString();
    for (const s of run.stages) { s.state = 'done'; s.endedAt = now; }
    run.status = 'completed';
    run.currentStage = 'export';
    delete run.lastError;
    app.store.updateRun(run);
    app.store.appendEvent(runId, { type: 'run_status_changed', status: 'completed', detail: { via: 'smoke-seam' } });
  }
  return Promise.resolve(run);
};

// ---- seed a real completed run (same parse patterns as tests/api.test.ts) ----
const ts = (i) => new Date(Date.now() - 60_000 + i * 1000).toISOString();
const seedIds = {};

const q = D.ResearchQuestion.parse({
  id: D.newId('q'), text: 'What mechanisms drive antibiotic resistance gene transfer in hospitals?',
  background: 'smoke seed', goalType: 'explanatory',
  scope: { domain: 'microbiology', phenomena: ['HGT of ARG in hospitals'], inScope: ['conjugation'], outOfScope: ['de novo mutation'] },
  constraints: { assumptions: ['seed assumption'] }, createdAt: ts(1),
});
const run = app.store.createRun(q);
seedIds.run = run.id;
for (const s of run.stages) { s.state = 'done'; s.endedAt = ts(40); }
run.status = 'completed'; run.currentStage = 'export';
app.store.updateRun(run);
app.store.appendEvent(run.id, { type: 'stage_done', stage: 'scope', detail: { summary: 'seeded' } });
app.store.appendEvent(run.id, { type: 'note', detail: { text: 'smoke fixture run' } });

const sourcePayloadPut = await app.artifacts.put('seed source payload (canonical)');
const src = D.SourceDocument.parse({
  id: D.newId('src'), runId: run.id, family: 'openalex',
  identifiers: [{ kind: 'doi', value: '10.1000/smoke-seed' }],
  title: 'Seed study of hospital HGT', publicationYear: 2024, authors: ['A. Researcher'],
  contentDepth: 'abstract', accessState: 'open', contentHash: sourcePayloadPut.hash,
  retrievedAt: ts(2), parseStatus: 'ok',
  verification: { method: 'crossref_doi', resolved: true, titleMatch: true, detail: 'seeded resolution', checkedAt: ts(2) },
});
app.store.putObject('source_document', src);

const corpus = D.CorpusSnapshot.parse({
  id: D.newId('corp'), runId: run.id,
  queries: [{ purpose: 'discovery', text: 'hospital HGT' }],
  documentIds: [src.id], createdAt: ts(3), familyFailures: [],
});
app.store.putObject('corpus_snapshot', corpus);

const clm = D.ScientificClaim.parse({
  id: D.newId('clm'), runId: run.id,
  text: 'Biofilms raise conjugation frequency in clinical settings',
  locators: [{ sourceDocumentId: src.id, quote: 'conjugation frequency increased in biofilm-grown clinical isolates' }],
  bindingStatus: 'verified', alignmentChecked: true, uncertainties: [],
});
app.store.putObject('claim', clm);

const hyp = D.HypothesisCandidate.parse({
  id: D.newId('hyp'), runId: run.id, version: 0,
  statement: 'Biofilm-associated conjugation dominates ARG spread in hospitals',
  mechanism: 'biofilms concentrate donors/recipients',
  derivation: { strategy: 'mechanism_driven', rationale: 'seed derivation', inputClaimIds: [clm.id] },
  assumptions: [{ id: 'a1', statement: 'biofilm density raises contact rate', kind: 'empirical', backingClaimIds: [] }],
  predictions: ['disrupting biofilms lowers transfer rate'], supportingClaimIds: [clm.id], counterClaimIds: [],
  uncertainties: [], noveltyLabel: 'evidence_grounded', testability: 'testable_now',
  falsification: {
    observable: 'transfer rate vs biofilm disruption', measurement: 'filter mating assays',
    expectedRelation: 'rate drops when biofilms are disrupted', decisionRule: 'drop > 2x supports',
    supportCondition: '>=2x reduction after disruption', weakeningCondition: '1-2x reduction',
    falsificationCondition: 'no reduction', confounders: [], alternativeExplanations: [],
    dataRequirements: [], method: 'in vitro conjugation assay', failureInterpretation: 'inconclusive',
    completenessCheck: { passed: true, missing: [] },
  },
  clusterKey: 'biofilm-conjugation', createdAt: ts(5),
});
app.store.putObject('hypothesis', hyp);

app.store.putObject('scorecard', D.HypothesisScorecard.parse({
  id: 'scorecard-smoke-1', runId: run.id, hypothesisId: hyp.id,
  dimensions: [
    { dimension: 'falsifiability', value: 0.7, rationale: 'clear decision rule', evidenceClaimIds: [], producer: 'smoke-seed', calibration: 'uncalibrated_llm_judgment' },
    { dimension: 'evidence_grounding', value: 0.6, qualitative: 'moderate', rationale: 'one verified claim', evidenceClaimIds: [clm.id], producer: 'smoke-seed', calibration: 'uncalibrated_llm_judgment' },
  ],
  overallRationale: 'grounded but narrow seed evidence', rankedOutOf: 1, rank: 1,
}));

app.store.putObject('evidence_relation', D.EvidenceRelation.parse({
  id: D.newId('ev'), runId: run.id, relation: 'supports', claimId: clm.id,
  targetHypothesisId: hyp.id, rationale: 'claim states conjugation rises in biofilms', strength: 'moderate',
  uncertainties: [], createdAt: ts(6),
}));
app.store.putObject('evidence_relation', D.EvidenceRelation.parse({
  id: D.newId('ev'), runId: run.id, relation: 'contradicts', claimId: clm.id,
  targetHypothesisId: hyp.id, rationale: 'seed counter relation', strength: 'unrated',
  uncertainties: [], createdAt: ts(7),
}));

app.store.putObject('plan', D.ResearchPlan.parse({
  id: D.newId('pln'), runId: run.id, objective: 'Quantify mechanism contributions to hospital ARG spread',
  hypothesisIds: [hyp.id], variables: ['biofilm prevalence'], controls: ['planktonic control'],
  inclusionCriteria: ['hospitals >= 100 beds'], exclusionCriteria: ['outbreak wards'],
  dataRequirements: [{ name: 'hospital metagenomes', variables: ['ARG', 'taxa'], availability: 'must_collect', sourceHint: 'prospective sampling' }],
  toolRequirements: [{ name: 'ResFinder', purpose: 'ARG detection', kind: 'software' }],
  steps: [{ id: D.newId('task'), title: 'Sample and sequence', kind: 'experiment', inputs: [], outputs: ['metagenomes'], method: 'prospective sampling', failureConditions: ['recruitment failure'], dependsOn: [], estimatedCost: 'High' }],
  metrics: ['per-ward mechanism share'], statistics: ['regression'],
  decisionRules: { successCriterion: 'shares differ >1.5x', weakeningCriterion: '1-1.5x', falsificationCriterion: 'no difference', stopCriterion: 'ethics block' },
  confounders: ['clonal spread'], alternativeExplanations: ['selection of residents'],
  resources: { compute: 'HPC', cost: 'seed', time: '24 months' }, risks: ['recruitment'], ethics: ['consent'],
  prerequisites: ['ethical approval'], expectedInformationGain: 'mechanism shares',
  alternativeBranches: ['fall back to conjugation only'], reproducibilityRequirements: ['deposit reads'],
  evidenceClaimIds: [clm.id], executabilityCheck: { passed: true, missing: [] }, createdAt: ts(8),
}));

const receipt = D.ProvenanceReceipt.parse({
  id: D.newId('rcp'), runId: run.id, kind: 'model_call', executionMode: 'live', at: ts(9),
  modelCall: {
    provider: 'test-stub', modelId: 'smoke-seed', usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    latencyMs: 5, requestHash: 'b'.repeat(64), outputHash: 'c'.repeat(64),
  },
  stage: 'generate_hypotheses', redactionNote: 'smoke seed receipt',
});
app.store.putObject('receipt', receipt);

const fbk = D.FeedbackSignal.parse({
  id: D.newId('fbk'), runId: run.id, source: 'human_expert',
  content: 'seed feedback: consider transformation contribution',
  provenance: 'smoke seed', receivedAt: ts(10),
});
app.store.putObject('feedback', fbk);
app.store.appendEvent(run.id, { type: 'feedback_received', detail: { feedbackId: fbk.id, source: fbk.source, via: 'seed' } });

const revision = D.Revision.parse({
  id: D.newId('rev'), runId: run.id, triggerFeedbackId: fbk.id,
  causalReason: 'feedback requested transformation coverage',
  operations: [{ objectType: 'hypothesis', objectId: hyp.id, operation: 'refine', before: 'conjugation only', after: 'conjugation + transformation', reason: 'cover transformation' }],
  fromVersionLabel: 'v0', toVersionLabel: 'v1',
  qualityDelta: { status: 'improved', claim: 'broader mechanism coverage', evidenceRefs: [] },
  createdAt: ts(11),
});
app.store.putObject('revision', revision);
app.store.appendEvent(run.id, { type: 'revision_created', detail: { revisionId: revision.id } });

app.store.putObject('version_diff', D.VersionDiff.parse({
  revisionId: revision.id, runId: run.id,
  entries: [{ objectType: 'hypothesis', objectId: hyp.id, summary: 'added transformation mechanism', changedFields: ['statement', 'mechanism'] }],
  semanticSummary: 'hypothesis widened to transformation', remainingUncertainties: ['relative rates unknown'],
}));

const REPORT_MD = '# FAR-Lab 研究报告（smoke seed）\n\nTEST-ONLY 确定性渲染内容。\n';
const reportPut = await app.artifacts.put(REPORT_MD);
let lockHash;
try { lockHash = sha256Hex(fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'package-lock.json'))); }
catch { lockHash = sha256Hex('missing'); }
const bundle = D.ReproducibilityBundle.parse({
  id: D.newId('bnd'), runId: run.id, declaredEvidenceLevel: 'replay', codeRevision: 'smoke-seed',
  environmentFingerprint: `node ${process.version} ${process.platform}`, dependencyLockHash: lockHash,
  questionRef: q.id, corpusSnapshotRef: corpus.id, sourceArtifactHashes: [src.contentHash],
  modelMetadata: [{ provider: 'test-stub', modelId: 'smoke-seed', route: 'live' }],
  receiptIds: [receipt.id], finalArtifactHashes: [reportPut.hash],
  verificationInstructions: 'smoke verification instructions', limitations: ['LLM 非确定性：seed 环境仅为形状冒烟'],
  createdAt: ts(12),
});
app.store.putObject('bundle', bundle);

// ---- serve ----
const api = createApiServer(app, { port: 8787, host: '127.0.0.1', executor, staticRoot: webDist });
const port = await api.start();
console.log(`[smoke TEST-ONLY] listening on http://127.0.0.1:${port} (data: ${dataDir}, static: ${fs.existsSync(webDist) ? webDist : 'not built'})`);
console.log(`[smoke] run=${run.id} bundle=${bundle.id} feedback=${fbk.id} revision=${revision.id}`);
const keepAlive = setInterval(() => {}, 1 << 30);
process.on('SIGINT', () => { clearInterval(keepAlive); void api.stop().then(() => app.close()).then(() => process.exit(0)); });
process.on('SIGTERM', () => { clearInterval(keepAlive); void api.stop().then(() => app.close()).then(() => process.exit(0)); });
