/**
 * Demo Seed: E2 碳通量（Carbon Flux Estimation in Terrestrial Ecosystems）。
 *
 * 问题简述：陆地生态系统碳通量（NEE/GPP/Re）估算中，
 * 涡度相关法（Eddy Covariance）与遥感驱动的光能利用率模型（如 MODIS MOD17）
 * 之间存在系统性偏差。如何量化并缩小这一偏差？
 *
 * Authority: FAR_CHAIN_DEV_SPEC/41_可证伪证据链_FEC.md §1 + 17_FINAL_AUDIT.md §7。
 *
 * 产出：raw input 文本、SourceCard、VerdictNode、reproHash、GraphSubtree、evidence_log 记录。
 * 全程 offline_replay adapter。
 */

import type { Database } from 'better-sqlite3';

import { runAgentLoop, DEFAULT_TERMINATION } from '../../src/agent_loop/fsm_runner.ts';
import { assemblePaper } from '../../src/agent_loop/paper_assembler.ts';
import { extractFinishReasonForOfflineReplay } from '../../src/agent_loop/run_stage.ts';
import { verifyChainHead } from '../../src/evidence_log/verifier.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';
import { bridgeLegacyEvidencesToStatistics, makeLegacyCompatFec } from '../../src/falsifiability/index.ts';
import { getSubtree } from '../../src/api/internal/graph_subtree.ts';
import type { LoopState, ResearchPaperOutput } from '../../src/agent_loop/types.ts';
import type { SourceAnchor } from '../../src/evidence_log/types.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  ThresholdSpec,
  VerdictNode,
} from '../../src/falsifiability/types.ts';
import type { SourceCard } from '../../src/audit/source_card.ts';
import type { GraphSubtree } from '../../src/api/types.ts';
import type { VerifyResult } from '../../src/evidence_log/types.ts';

import { openDb, createSequentialGateway } from './helpers.ts';
import type { DemoSeedResult } from './a4_planetary_orbit_decay.ts';

// ---------- raw input text ----------

export const E2_RAW_INPUT = [
  'Terrestrial ecosystem carbon flux estimation: Eddy Covariance (EC) towers provide',
  'direct measurements of Net Ecosystem Exchange (NEE), but spatial coverage is sparse.',
  'Satellite-driven Light Use Efficiency (LUE) models (e.g., MODIS MOD17, VPM) provide',
  'global coverage but show systematic biases relative to EC ground truth, particularly:',
  '(1) overestimation of GPP in water-limited ecosystems (drylands, savannas) by 15–40%,',
  '(2) underestimation of ecosystem respiration (Re) during non-growing seasons by 10–25%.',
  'We investigate: can a simple water-stress scalar (based on Land Surface Water Index, LSWI)',
  'applied to the MOD17 LUE algorithm reduce the RMSE between MOD17-GPP and EC-GPP',
  'by at least 20% across ≥10 FLUXNET sites spanning 3+ biome types?',
].join(' ');

// ---------- SourceCard ----------

export const E2_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-e2-carbon-flux-2026',
  url: 'https://fluxnet.org/data/fluxnet2015-dataset/',
  title: 'FLUXNET2015: Eddy Covariance Carbon Flux Measurements Across Global Biomes',
  sourceType: 'dataset',
  publisher: 'FLUXNET / AmeriFlux / ICOS',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim:
    'MODIS MOD17 GPP overestimates EC-GPP by 15–40% in water-limited ecosystems; ' +
    'a water-stress scalar based on LSWI can reduce this bias.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

// ---------- Fixture payloads ----------

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Quantify whether incorporating a Land Surface Water Index (LSWI)-based water-stress scalar ' +
    'into the MOD17 Light Use Efficiency algorithm significantly reduces RMSE between ' +
    'satellite-derived GPP and Eddy Covariance tower GPP across diverse biomes.',
  scope:
    'FLUXNET2015 Tier 1 sites (≥10 sites) spanning at least 3 biome types: deciduous broadleaf ' +
    'forest (DBF), evergreen needleleaf forest (ENF), and savanna/grassland (SAV/GRA). ' +
    'Study period: 2007–2014 (overlap of MODIS Terra/Aqua + FLUXNET2015). ' +
    'Excludes sites with < 70% data coverage during growing season.',
  keyTerms: [
    'Net Ecosystem Exchange (NEE)',
    'Gross Primary Production (GPP)',
    'Eddy Covariance (EC)',
    'Light Use Efficiency (LUE)',
    'MODIS MOD17',
    'Land Surface Water Index (LSWI)',
    'FLUXNET2015',
    'water-stress scalar',
  ],
  falsifiableAngle:
    'Testable: paired t-test of RMSE(GPP_MOD17, EC_GPP) vs RMSE(GPP_MOD17+LSWI, EC_GPP) ' +
    'across ≥10 FLUXNET sites, with Cohen\'s d effect size ≥ 0.5.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-e2-001',
      source: 'arxiv' as const,
      doi: '10.1016/j.rse.2018.09.012',
      title:
        'Global Evaluation of MODIS GPP Products Against FLUXNET Eddy Covariance Measurements',
    },
    {
      evidenceId: 'ev-e2-002',
      source: 'arxiv' as const,
      doi: '10.1111/gcb.14621',
      title:
        'Water Stress Effects on Light Use Efficiency: A Synthesis of FLUXNET Observations',
    },
    {
      evidenceId: 'ev-e2-003',
      source: 'ads' as const,
      doi: null,
      title: 'LSWI as a Proxy for Vegetation Water Content: Validation Against In-Situ Measurements',
    },
    {
      evidenceId: 'ev-e2-004',
      source: 'other' as const,
      doi: null,
      title: 'Improved MOD17 Algorithm: Incorporating Water and Temperature Scalars',
    },
  ],
  knowledgeGraphSummary:
    'MODIS MOD17 GPP product uses a fixed maximum LUE (ε_max) per biome type, scaled only ' +
    'by temperature and VPD (vapor pressure deficit). This misses soil moisture limitation, ' +
    'leading to systematic GPP overestimation in water-limited ecosystems. LSWI (derived from ' +
    'MODIS NIR and SWIR bands) correlates strongly (r = 0.72–0.85) with in-situ soil moisture ' +
    'and plant water content. Adding an LSWI-based water scalar to MOD17 has been proposed ' +
    'but not systematically validated across FLUXNET biomes.',
  gaps: [
    'LSWI saturation in dense canopies (LAI > 5)',
    'Mismatch between MODIS 500m pixel and EC tower footprint (typically 100m–1km)',
    'Growing season definition varies across biomes (phenology mismatch)',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'Adding an LSWI-based water-stress scalar (W_s = min(1, (LSWI - LSWI_min) / (LSWI_max - LSWI_min))) ' +
    'to the MOD17 LUE algorithm reduces RMSE between satellite-GPP and EC-GPP by ≥ 20% ' +
    'across ≥10 FLUXNET sites spanning ≥3 biomes, with Cohen\'s d ≥ 0.5 (medium effect).',
  falsificationMethod: {
    prediction:
      'Mean RMSE reduction ≥ 20% with paired t-test p < 0.05 and Cohen\'s d ≥ 0.5',
    metric: 'rmse_reduction_percent',
    comparator: 'gt' as const,
    value: 20,
  },
  supportingCitations: ['ev-e2-001', 'ev-e2-002', 'ev-e2-004'],
  scopeSlipText:
    'Scope limited to growing-season months (defined per-site by GPP > 10% annual max for ≥3 consecutive days). ' +
    'Excludes sites where LSWI_max - LSWI_min < 0.05 (insufficient dynamic range).',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-e2-e1',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.89,
      source: {
        evidenceId: 'ev-e2-001',
        source: 'arxiv' as const,
        doi: '10.1016/j.rse.2018.09.012',
        title:
          'Global Evaluation of MODIS GPP Products Against FLUXNET Eddy Covariance Measurements',
      },
    },
    {
      evidenceId: 'ev-e2-e2',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.85,
      source: {
        evidenceId: 'ev-e2-002',
        source: 'arxiv' as const,
        doi: '10.1111/gcb.14621',
        title:
          'Water Stress Effects on Light Use Efficiency: A Synthesis of FLUXNET Observations',
      },
    },
    {
      evidenceId: 'ev-e2-e3',
      supportsOrRefutes: 'neutral' as const,
      entailmentScore: 0.62,
      source: {
        evidenceId: 'ev-e2-003',
        source: 'ads' as const,
        doi: null,
        title: 'LSWI as a Proxy for Vegetation Water Content: Validation Against In-Situ Measurements',
      },
    },
  ],
  conflictingEvidenceCount: 0,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: [
    'FLUXNET2015 Tier 1 (daily GPP from nighttime partitioning, NEE_USTAR50)',
    'MODIS MOD17A2H v006 (8-day GPP, 500m)',
    'MODIS MOD09A1 v006 (8-day surface reflectance for LSWI)',
  ],
  methodChoices: [
    'Site-level MODIS pixel extraction (nearest 500m pixel to tower coordinates)',
    'LSWI computation from MODIS NIR (band 2) and SWIR (band 6): LSWI = (ρ_NIR − ρ_SWIR)/(ρ_NIR + ρ_SWIR)',
    'Growing-season filtering per site via GPP threshold',
    'Paired t-test of RMSE before vs after LSWI scalar, with Cohen\'s d effect size',
  ],
  scheduleOrFeedback:
    'Phase 1: Extract MODIS GPP + reflectance time series for each FLUXNET site. ' +
    'Phase 2: Compute LSWI and water scalar W_s, apply to MOD17 ε_max. ' +
    'Phase 3: Compare RMSE(GPP_original, EC_GPP) vs RMSE(GPP_LSWI, EC_GPP), compute effect size.',
  executableChecks: [
    {
      ref: 'https://fluxnet.org/data/fluxnet2015-dataset/',
      exists: true,
      checkedAt: '2026-06-27T00:00:00.000Z',
    },
    {
      ref: 'https://lpdaac.usgs.gov/products/mod17a2hv006/',
      exists: true,
      checkedAt: '2026-06-27T00:00:00.000Z',
    },
  ],
});

const makeFeedbackPayloadConverge = () => ({
  kind: 'feedback' as const,
  feedbackSignal: {
    continueIteration: false,
    iterationNumber: 1,
    maxIterations: 3,
    refinements: [],
  },
  iterationSummary:
    'Converged: LSWI water-stress scalar hypothesis is falsifiable (RMSE reduction threshold + ' +
    'effect size gate), evidence records support the approach with entailment 0.62–0.89.',
});

// ---------- FEC 三件套 ----------

const E2_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    'Mean RMSE reduction ≥ 20% with paired t-test p < 0.05 and Cohen\'s d ≥ 0.5',
  metric: 'rmse_reduction_percent',
  falsificationThreshold: 20,
  thresholdSemantics: 'gt',
};

const E2_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 20,
};

const E2_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'e2'.repeat(20),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'e2'.repeat(32),
};

// ---------- runSeed ----------

export async function runE2Seed(): Promise<DemoSeedResult> {
  const db = openDb();

  const fixtureContents: readonly string[] = [
    JSON.stringify(makeUnderstandingPayload()),
    JSON.stringify(makeIntegrationPayload()),
    JSON.stringify(makeHypothesisPayload()),
    JSON.stringify(makeEvidencePayload()),
    JSON.stringify(makePlanPayload()),
    JSON.stringify(makeFeedbackPayloadConverge()),
  ];
  const gateway = createSequentialGateway(fixtureContents);

  const state = await runAgentLoop({
    runId: 'demo-e2-carbon-flux',
    researchInput: E2_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'e2'.repeat(32),
    gitCommitSha: E2_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('E2 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  // FalsificationSpec: semantics='gt', falsificationThreshold=20
  // metricValue must be >= 20 to support claim (RMSE reduction % > 20%)
  const e2Evidences: EvidenceRecord[] = [
    {
      claim:
        'Original MOD17 RMSE = 3.8 gC/m²/day; LSWI-corrected RMSE = 2.6 gC/m²/day; ' +
        'reduction = (3.8-2.6)/3.8 × 100 = 31.6% across 12 FLUXNET sites',
      metricValue: 31.6,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: E2_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: E2_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'e2-ev1-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim:
        'Cohen\'s d = 0.62 (medium-to-large effect) for paired RMSE before vs after LSWI scalar, ' +
        'p = 0.008 (paired t-test, N=12 sites, 3 biomes)',
      metricValue: 27.4,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: E2_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: E2_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'e2-ev2-hash'.repeat(4).padEnd(64, '0'),
      },
    },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'e2'.repeat(32),
        gitCommitSha: E2_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: E2_SOURCE_ANCHOR.isoTimestamp,
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
    },
    callAudit: {
      requestPayload: JSON.stringify({ hypothesis: hypothesisPayload.claim }),
      responsePayload: JSON.stringify(hypothesisPayload),
      finishReason: 'stop',
      usageTokensTotal: 256,
    },
    appendOptions: { providerProfile: 'offline_replay' },
    evidencePayload: { claim: hypothesisPayload.claim, hypothesisPayload },
    sourceAnchor: E2_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: E2_FALSIFICATION_SPEC,
    thresholdSpec: E2_THRESHOLD_SPEC,
    evidences: e2Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(e2Evidences, E2_FALSIFICATION_SPEC, E2_THRESHOLD_SPEC),
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'E2-CARBON-FLUX',
        falsificationSpec: E2_FALSIFICATION_SPEC,
        thresholdSpec: E2_THRESHOLD_SPEC,
        frozenAt: E2_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });

  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);
  const chainVerify = verifyChainHead(db);
  const paper = assemblePaper(state);
  const reproHash = verdictResult.verdictNode.currentHash;

  return {
    rawInput: E2_RAW_INPUT,
    sourceCard: E2_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash,
    graphSubtree,
    chainVerify,
    paper,
    db,
  };
}
