/**
 * Demo Seed: A16 脉冲星P0（Pulsar P0 Period Derivative Anomaly）。
 *
 * 问题简述：脉冲星 P0（初始自转周期）与 Ṗ（周期导数）的异常关系——
 * 某些年轻脉冲星的制动指数 n < 3，暗示非纯磁偶极辐射机制。
 *
 * 历史溯源（已归档）: FAR_CHAIN_DEV_SPEC/41_可证伪证据链_FEC.md §1 + 17_FINAL_AUDIT.md §7。
 *
 * 产出：raw input 文本、SourceCard、VerdictNode、reproHash、GraphSubtree、evidence_log 记录。
 * 全程 offline_replay adapter。
 */

import { runAgentLoop, DEFAULT_TERMINATION } from '../../src/agent_loop/fsm_runner.ts';
import { assemblePaper } from '../../src/agent_loop/paper_assembler.ts';
import { extractFinishReasonForOfflineReplay } from '../../src/agent_loop/run_stage.ts';
import { verifyChainHead } from '../../src/evidence_log/verifier.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';
import { bridgeLegacyEvidencesToStatistics, makeLegacyCompatFec } from '../../src/falsifiability/index.ts';
import { getSubtree } from '../../src/api/internal/graph_subtree.ts';
import type { SourceAnchor } from '../../src/evidence_log/types.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  ThresholdSpec,
} from '../../src/falsifiability/types.ts';
import type { SourceCard } from '../../src/schema/enums.ts';

import { openDb, createSequentialGateway } from './helpers.ts';
import type { DemoSeedResult } from './a4_planetary_orbit_decay.ts';

// ---------- raw input text ----------

/** Constant: A16_RAW_INPUT. */
export const A16_RAW_INPUT = [
  'Pulsar braking indices: most radio pulsars are modeled as magnetic dipole radiators',
  'with braking index n = 3. However, measured braking indices for young pulsars',
  '(characteristic age τ_c < 10⁵ yr) deviate significantly from n = 3, with observed',
  'values ranging from n ≈ 0.9 to n ≈ 2.8. The pulsar P₀ (birth period) distribution',
  'inferred from Ṗ measurements depends critically on the assumed braking law.',
  'We investigate: what fraction of young pulsars in the ATNF catalog show braking',
  'index n significantly different from 3 at ≥2σ, and does the inferred P₀ distribution',
  'shift systematically when a generalized braking law (n free parameter) is used',
  'instead of the standard n=3 assumption?',
].join(' ');

// ---------- SourceCard ----------

/** Constant: A16_SOURCE_CARD. */
export const A16_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-a16-pulsar-p0-2026',
  url: 'https://www.atnf.csiro.au/research/pulsar/psrcat/',
  title: 'ATNF Pulsar Catalogue v2.4: Braking Indices and P₀ Inference',
  sourceType: 'dataset',
  publisher: 'ATNF / CSIRO',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim:
    '≥30% of young pulsars (τ_c < 10⁵ yr) have braking index n ≠ 3 at ≥2σ, ' +
    'implying non-dipole braking components.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

// ---------- Fixture payloads ----------

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Determine the fraction of young pulsars (τ_c < 10⁵ yr) in the ATNF catalog whose ' +
    'measured braking index n deviates from the canonical n = 3 at ≥2σ significance.',
  scope:
    'ATNF Pulsar Catalogue v2.4 entries with: (1) measured P and Ṗ, (2) measured or ' +
    'constrainable Ṗ̈ (second period derivative), (3) characteristic age τ_c < 10⁵ yr. ' +
    'Excludes millisecond pulsars (P < 10 ms, Ṗ < 10⁻²⁰) and binary pulsars with ' +
    'significant kinematic corrections.',
  keyTerms: [
    'braking index n',
    'pulsar P₀ birth period',
    'period derivative Ṗ',
    'magnetic dipole radiation',
    'ATNF Pulsar Catalogue',
    'characteristic age τ_c',
    'generalized braking law',
  ],
  falsifiableAngle:
    'Testable: compute braking index n = 2 - PṖ̈/Ṗ² for all qualifying pulsars, ' +
    'binomial test whether fraction with |n-3|/σ_n ≥ 2 exceeds 30%.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-a16-001',
      source: 'doi' as const,
      doi: '10.1093/mnras/stz400',
      title: 'The ATNF Pulsar Catalogue: Status and Braking Index Measurements',
    },
    {
      evidenceId: 'ev-a16-002',
      source: 'doi' as const,
      doi: '10.1103/PhysRevD.99.083009',
      title: 'Generalized Braking Law for Pulsar Spin-down: Implications for P₀',
    },
    {
      evidenceId: 'ev-a16-003',
      source: 'ads' as const,
      doi: null,
      title: 'Measurement of Ṗ̈ for 50 Young Pulsars from Jodrell Bank Timing',
    },
  ],
  knowledgeGraphSummary:
    'Pulsar braking index n ≡ νν̈/ν̇² relates to the spin-down mechanism. Pure magnetic ' +
    'dipole radiation predicts n = 3. Observed n ranges 0.9–3.2, with ~40% of measured ' +
    'pulsars showing n < 2.5. The inferred birth period P₀ = P[1 - (n-1)τ/τ_c]^{1/(n-1)} ' +
    'is highly sensitive to n: using n=3 when true n=2.5 biases P₀ by ~30%.',
  gaps: [
    'Ṗ̈ measurements available for only ~15% of young pulsars',
    'Timing noise (red noise in residuals) can mimic Ṗ̈ signal',
    'Gap between ATNF catalog entries and published braking index papers',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'At least 30% of young pulsars (τ_c < 10⁵ yr) with measured Ṗ̈ have braking index ' +
    '|n - 3| / σ_n ≥ 2, and the inferred P₀ distribution under generalized braking law ' +
    '(n free) is shifted to shorter periods compared to the n ≡ 3 assumption.',
  falsificationMethod: {
    prediction:
      'Binomial test p < 0.01 for H₀: "fraction of pulsars with |n-3|/σ_n ≥ 2 is ≤ 20%"',
    metric: 'binomial_p_value',
    comparator: 'lt' as const,
    value: 0.01,
  },
  supportingCitations: ['ev-a16-001', 'ev-a16-002'],
  scopeSlipText:
    'Limited to pulsars with published Ṗ̈ measurements (N ≈ 25). ' +
    'Excludes pulsars where Ṗ̈ is an upper limit only (no σ_Ṗ̈).',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-a16-e1',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.91,
      source: {
        evidenceId: 'ev-a16-001',
        source: 'doi' as const,
        doi: '10.1093/mnras/stz400',
        title: 'The ATNF Pulsar Catalogue: Status and Braking Index Measurements',
      },
    },
    {
      evidenceId: 'ev-a16-e2',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.83,
      source: {
        evidenceId: 'ev-a16-002',
        source: 'doi' as const,
        doi: '10.1103/PhysRevD.99.083009',
        title: 'Generalized Braking Law for Pulsar Spin-down: Implications for P₀',
      },
    },
  ],
  conflictingEvidenceCount: 0,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: ['ATNF Pulsar Catalogue v2.4', 'Jodrell Bank Timing Archive', 'NANOGrav 15-year dataset'],
  methodChoices: [
    'Monte Carlo Ṗ̈ uncertainty propagation',
    'Binomial exact test (Clopper-Pearson) for fraction comparison',
    'Two-sample KS test for P₀ distributions (n=3 vs n free)',
  ],
  scheduleOrFeedback:
    'Phase 1: Query ATNF catalog, filter τ_c < 10⁵ yr, cross-match with published Ṗ̈. ' +
    'Phase 2: Compute n and σ_n per pulsar, count n-outliers. ' +
    'Phase 3: Bootstrap P₀ distribution under both braking laws, compare medians.',
  executableChecks: [
    {
      ref: 'https://www.atnf.csiro.au/research/pulsar/psrcat/',
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
    'Converged: hypothesis is falsifiable via binomial test on braking index outliers, ' +
    'evidence records show high entailment (0.83–0.91).',
});

// ---------- FEC 三件套 ----------

const A16_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    'Binomial test p < 0.01 for H₀: "fraction of pulsars with |n-3|/σ_n ≥ 2 is ≤ 20%"',
  metric: 'binomial_p_value',
  falsificationThreshold: 0.01,
  thresholdSemantics: 'lt',
};

const A16_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'lt',
  value: 0.01,
};

const A16_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b6'.repeat(20),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'b6'.repeat(32),
};

// ---------- runSeed ----------

/**
 * run a16 seed.
 */
export async function runA16Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-a16-pulsar-p0',
    researchInput: A16_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'b6'.repeat(32),
    gitCommitSha: A16_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('A16 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  // FalsificationSpec: semantics='lt', falsificationThreshold=0.01
  // metricValue must be <= 0.01 to support claim (binomial p-value < 0.01)
  const a16Evidences: EvidenceRecord[] = [
    {
      claim: 'Binomial exact test p = 0.003 (Clopper-Pearson) for H₀: fraction ≤ 20%',
      metricValue: 0.003,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: A16_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: A16_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'b6-ev1-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim:
        'Bootstrap P₀ median: 18 ± 4 ms (n=3 assumption) vs 12 ± 3 ms (n free), ' +
        'Cohen\'s d = 0.71 for distribution shift',
      metricValue: 0.005,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: A16_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: A16_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'b6-ev2-hash'.repeat(4).padEnd(64, '0'),
      },
    },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'b6'.repeat(32),
        gitCommitSha: A16_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: A16_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: A16_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: A16_FALSIFICATION_SPEC,
    thresholdSpec: A16_THRESHOLD_SPEC,
    evidences: a16Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(a16Evidences, A16_FALSIFICATION_SPEC, A16_THRESHOLD_SPEC),
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'A16-PULSAR-P0',
        falsificationSpec: A16_FALSIFICATION_SPEC,
        thresholdSpec: A16_THRESHOLD_SPEC,
        frozenAt: A16_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });

  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);
  const chainVerify = verifyChainHead(db);
  const paper = assemblePaper(state);
  const reproHash = verdictResult.verdictNode.currentHash;

  return {
    rawInput: A16_RAW_INPUT,
    sourceCard: A16_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash,
    graphSubtree,
    chainVerify,
    paper,
    db,
  };
}
