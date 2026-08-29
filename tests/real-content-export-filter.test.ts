import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  HypothesisCandidate,
  HypothesisScorecard,
  HypothesisTournament,
  ResearchPlan,
  ResearchQuestion,
  ScientificClaim,
  SourceDocument,
  newId,
} from '../src/domain/index.js';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore, type ArtifactStore } from '../src/persistence/artifacts.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { exportStage } from '../src/pipeline/stages/export.js';
import { buildPaperOutline } from '../src/pipeline/paper-outline.js';
import type { StageContext } from '../src/pipeline/types.js';

/**
 * Real-content discipline — EXPORT-CHAIN regression (export-audit P0, owner
 * directive 2026-08-29). A LEGACY run whose store carries offline-template
 * hypotheses ("Offline hypothesis N") must never project them as scientific
 * content: not the report §5/§6, not the IMRaD paper abstract/results, not the
 * bundle's SWAN JSON-LD. They stay stored (audit truth plane) with a visible
 * exclusion disclosure in both the report's missing-items and the paper's
 * limitations.
 */

let tmp: string;
let db: Db;
let store: Store;
let artifacts: ArtifactStore;

const T0 = Date.parse('2026-08-29T00:00:00.000Z');
const ts = (i: number) => new Date(T0 + i * 1000).toISOString();

const seedLegacyMixedRun = () => {
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Do biofilms accelerate horizontal ARG transfer?',
    background: '',
    goalType: 'explanatory',
    scope: { domain: 'microbiology', phenomena: ['ARG transfer'] },
    constraints: {},
    createdAt: ts(1),
  });
  store.putObject('question', q);
  const run = store.createRun(q);
  const runId = run.id;

  const src = SourceDocument.parse({
    id: newId('src'),
    runId,
    family: 'openalex',
    identifiers: [{ kind: 'doi', value: '10.1000/biofilm-arg' }],
    title: 'Conjugation assay across biofilm stages',
    publicationYear: 2024,
    authors: ['A. Researcher'],
    contentDepth: 'abstract',
    accessState: 'open',
    contentHash: 'a'.repeat(64),
    retrievedAt: ts(2),
    parseStatus: 'ok',
    verification: { method: 'crossref_doi', resolved: true, titleMatch: true, checkedAt: ts(2) },
  });
  store.putObject('source_document', src);

  const claim = ScientificClaim.parse({
    id: newId('clm'),
    runId,
    text: 'Conjugation frequency in mature biofilms is 10-fold higher than in planktonic culture',
    locators: [{ sourceDocumentId: src.id, quote: '10-fold higher conjugation frequency' }],
    bindingStatus: 'verified',
    alignmentChecked: true,
  });
  store.putObject('claim', claim);

  const mkHyp = (statement: string, mechanism: string, strategy: HypothesisCandidate['derivation']['strategy']) =>
    HypothesisCandidate.parse({
      id: newId('hyp'), runId, version: 0,
      statement,
      mechanism,
      derivation: { strategy, rationale: 'legacy fixture', inputClaimIds: [] },
      assumptions: [],
      predictions: [],
      supportingClaimIds: [],
      counterClaimIds: [],
      uncertainties: [],
      noveltyLabel: 'mixed',
      testability: 'testable_with_data',
      clusterKey: 'legacy',
      createdAt: ts(3),
    });

  // Two TEMPLATE hypotheses exactly matching the offline wire's observed shapes
  // (domain/scientific-state.ts isTemplateHypothesis regexes) ranked 1-2, and
  // one REAL hypothesis ranked 3 — the legacy mixed store export-audit found.
  const hypT1 = mkHyp('Offline hypothesis 1', 'A deterministic offline mechanism for hypothesis 1', 'mechanism_driven');
  const hypT2 = mkHyp('Offline hypothesis 2', 'A deterministic offline mechanism for hypothesis 2', 'mechanism_driven');
  const hypReal = mkHyp('Mature-biofilm matrix trapping enriches conjugative contact', 'EPS matrix localizes donor-recipient pairs', 'mechanism_driven');
  for (const h of [hypT1, hypT2, hypReal]) store.putObject('hypothesis', h);

  const dim = (d: 'falsifiability' | 'evidence_grounding') => ({
    dimension: d, value: 0.7, rationale: 'fixture', evidenceClaimIds: [],
    producer: 'test-stub', calibration: 'deterministic' as const,
  });
  for (const [h, rank] of [[hypT1, 1], [hypT2, 2], [hypReal, 3]] as const) {
    store.putObject('scorecard', HypothesisScorecard.parse({
      id: newId('sc'), runId, hypothesisId: h.id,
      dimensions: [dim('falsifiability'), dim('evidence_grounding')],
      overallRationale: `legacy rationale for ${h.id}`,
      rankedOutOf: 3, rank, createdAt: ts(4 + rank),
    }));
  }

  store.putObject('tournament', HypothesisTournament.parse({
    id: newId('trn'), runId, participantIds: [hypT1.id, hypT2.id, hypReal.id],
    matches: [{ aId: hypT1.id, bId: hypReal.id, aFirstVerdict: 'a', bFirstVerdict: 'a', rationale: 'legacy fixture match', producer: 'test-stub', outcome: 'a' }],
    standings: [
      { hypothesisId: hypT1.id, btScore: 1.4, wins: 2, losses: 0, ties: 0, winRate: 1, rank: 1 },
      { hypothesisId: hypT2.id, btScore: 0.8, wins: 1, losses: 1, ties: 0, winRate: 0.5, rank: 2 },
      { hypothesisId: hypReal.id, btScore: 0.4, wins: 0, losses: 2, ties: 0, winRate: 0, rank: 3 },
    ],
    algorithm: 'bradley-terry-ilsr-v1',
    uncertainty: 'legacy fixture',
    createdAt: ts(8),
  }));

  // The offline wire's plan objective (offline.ts researchPlanDesign) — legacy
  // template plan that must not project into report §7 / paper Methods either.
  store.putObject('plan', ResearchPlan.parse({
    id: newId('pln'), runId,
    objective: 'Offline development plan: discriminate the candidate hypotheses for the question',
    hypothesisIds: [hypT1.id],
    variables: ['x'], controls: [], inclusionCriteria: [], exclusionCriteria: [], dataRequirements: [], toolRequirements: [],
    steps: [
      { id: newId('task'), title: 'collect', kind: 'data_analysis', inputs: [], outputs: ['t'], method: 'm', failureConditions: [], dependsOn: [] },
      { id: newId('task'), title: 'analyze', kind: 'data_analysis', inputs: ['t'], outputs: ['r'], method: 'm', failureConditions: [], dependsOn: [] },
      { id: newId('task'), title: 'report', kind: 'data_analysis', inputs: ['r'], outputs: ['d'], method: 'm', failureConditions: [], dependsOn: [] },
    ],
    metrics: ['m1', 'm2'], statistics: [],
    decisionRules: { successCriterion: 's', weakeningCriterion: 'w', falsificationCriterion: 'f', stopCriterion: 'p' },
    confounders: [], alternativeExplanations: [], resources: { compute: 'low', cost: 'low', time: '1 month' }, risks: [], ethics: [], prerequisites: [], alternativeBranches: [], reproducibilityRequirements: [],
    createdAt: ts(9),
  }));

  return { runId, hypReal };
};

const makeCtx = (runId: string): StageContext => {
  const run = store.getRun(runId);
  if (run === null) throw new Error(`fixture run missing: ${runId}`);
  return {
    run, store, artifacts,
    provider: createTestStubProvider([]),
    sourceFor: () => { throw new Error('no source adapter in test'); },
    recordReceipt: () => {},
    cancelled: () => false,
    log: () => {},
  };
};

describe('real-content discipline: legacy template hypotheses never project into the export chain', () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-export-filter-'));
    db = openDb(path.join(tmp, 'state.db'));
    store = new Store(db);
    artifacts = openArtifactStore(path.join(tmp, 'artifacts'));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('paper outline: only the real hypothesis projects; exclusion disclosed in limitations', () => {
    const { runId, hypReal } = seedLegacyMixedRun();
    const outline = buildPaperOutline(store, runId);
    const statements = outline.results.map((r) => r.statement);
    expect(statements).toEqual([hypReal.statement]);
    const flat = JSON.stringify(outline);
    expect(flat).not.toContain('Offline hypothesis');
    expect(flat).not.toContain('deterministic offline mechanism');
    const excl = outline.limitations.find((l) => l.category === 'template_content_excluded');
    expect(excl).toBeDefined();
    expect(excl?.counts.templateHypothesesExcluded).toBe(2);
    expect(excl?.counts.hypothesesProjected).toBe(1);
  });

  it('export stage: report, paper markdown and bundle JSON-LD exclude template hypotheses; missing-items disclose the count', async () => {
    const { runId, hypReal } = seedLegacyMixedRun();
    const outcome = await exportStage.execute(makeCtx(runId));
    if (outcome.kind !== 'done') throw new Error(`expected done, got ${outcome.kind}`);

    const refs = outcome.artifacts ?? [];
    expect(refs).toHaveLength(3); // report, bundle, paper
    const report = await artifacts.get(refs[0]!);
    const paper = await artifacts.get(refs[2]!);
    expect(report).not.toBeNull();
    expect(paper).not.toBeNull();
    expect(report).not.toContain('Offline hypothesis');
    expect(report).not.toContain('Offline development plan');
    expect(paper).not.toContain('Offline hypothesis');
    expect(paper).not.toContain('Offline development plan');
    expect(report).toContain(hypReal.statement.slice(0, 40));
    expect(report).toContain('2 条假设为离线路由模板内容');
    expect(report).toContain('1 条研究计划为离线路由模板内容');
    expect(paper).toContain('template_content_excluded');

    const bundle = store.listObjects('bundle', runId)[0]!;
    expect(bundle.hypothesisJsonLd).toBeDefined();
    expect(bundle.hypothesisJsonLd!.map((j) => JSON.stringify(j))).toHaveLength(1);
    expect(JSON.stringify(bundle.hypothesisJsonLd)).not.toContain('Offline hypothesis');
    expect(bundle.limitations.some((l) => l.includes('离线路由模板内容'))).toBe(true);
  });
});
