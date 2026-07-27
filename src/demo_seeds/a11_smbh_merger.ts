/**
 * Demo Seed: A11 超大质量黑洞并合与星系演化（Supermassive Black Hole Merger）。
 *
 * 问题简述：超大质量黑洞（SMBH）并合是星系并合的必然产物。恒星质量级双黑洞并合已被
 * LIGO/Virgo 直接探测（GW150914、GW151226、GW170104 等，O1-O4 累计≥90 候选事件）；
 * SMBH 并合信号以纳赫兹引力波背景（GWB）被脉冲星计时阵列（NANOGrav 2023, EPTA, PPTA）
 * 间接确证；星系中心黑洞质量-核球速度弥散 M-sigma 关系（Kormendy & Ho 2013）为 SMBH
 * 与宿主星系共演化提供了强有力证据 → CONFIRMED。
 *
 * 对齐 Science-125 真实问题："Supermassive Black Hole Merger and Galaxy Evolution"。
 *
 * 真实文献溯源:
 *   - LIGO/Virgo Collaboration 2016 (PRL): "Observation of Gravitational Waves from a Binary Black Hole Merger"
 *     DOI:10.1103/PhysRevLett.116.061102 （GW150914·人类首次直接探测引力波）
 *   - Abbott et al. 2017 (ApJL): "Multi-messenger Observations of a Binary Neutron Star Merger"
 *     DOI:10.3847/2041-8213/aa920c （GW170817·开启多信使天文学时代）
 *   - Graham et al. 2015 (Nature): "A possible close supermassive black-hole binary in a quasar with optical periodicity"
 *     DOI:10.1038/nature14181 （OJ 287·SMBH 双星候选体）
 *   - Kormendy & Ho 2013 (ARAA): "Coevolution (or not) of supermassive black holes and host galaxies"
 *     DOI:10.1146/annurev-astro-082708-101811 （M-sigma 关系·共演化奠基文献）
 *
 * verdict 设计：CONFIRMED — 恒星质量 BH 并合已有 LIGO 直接探测（≥90 候选事件跨 O1-O4）；
 * SMBH 并合在纳赫兹引力波背景（NANOGrav 2023 Hellings-Downs 相关性 ~4σ）证据齐备；
 * Kormendy & Ho 2013 综述确认 SMBH-星系共演化（M-sigma 关系 scatter ~0.3 dex）。
 *
 * 历史溯源（已归档）: FAR_CHAIN_DEV_SPEC/41_可证伪证据链_FEC.md §1（Science-125 种子）+ 17 §7.
 */

import { runAgentLoop, DEFAULT_TERMINATION } from '../../src/agent_loop/fsm_runner.ts';
import { assemblePaper } from '../../src/agent_loop/paper_assembler.ts';
import { extractFinishReasonForOfflineReplay } from '../../src/agent_loop/run_stage.ts';
import { verifyChainHead } from '../../src/evidence_log/verifier.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';
import { bridgeLegacyEvidencesToStatistics, makeLegacyCompatFec } from '../../src/falsifiability/index.ts';
import { getSubtree } from '../../src/api/internal/graph_subtree.ts';
import type { SourceAnchor } from '../../src/evidence_log/types.ts';
import type { EvidenceRecord, FalsificationSpec, ThresholdSpec } from '../../src/falsifiability/types.ts';
import type { SourceCard } from '../../src/schema/enums.ts';
import { openDb, createSequentialGateway } from './helpers.ts';
import type { DemoSeedResult } from './a4_planetary_orbit_decay.ts';

export const A11_RAW_INPUT = [
  'Supermassive black hole (SMBH) mergers are a natural consequence of hierarchical galaxy assembly.',
  'When two galaxies merge, their central SMBHs form a bound binary that hardens via dynamical friction,',
  'stellar scattering, and gravitational wave (GW) emission. Stellar-mass binary black hole (BBH) mergers',
  'have been directly detected by LIGO/Virgo: GW150914 (2015, first detection), GW151226, GW170104, and',
  '≥90 additional candidates across O1-O4 runs (GWTC-3 catalog + O4a). For SMBH binaries (10^6-10^10 M☉),',
  'the GW signal lies in the nanohertz band, accessible only via pulsar timing arrays (PTAs). NANOGrav',
  '(2023, 15-year dataset) reported the Hellings-Downs spatial correlation at ~4σ significance — the',
  'hallmark of an isotropic stochastic GW background (GWB) consistent with an SMBH binary population.',
  'Additionally, the M-sigma relation (Kormendy & Ho 2013) between SMBH mass and host galaxy bulge',
  'velocity dispersion provides strong support for SMBH-galaxy coevolution across cosmic time. We assess',
  'the claim that binary black hole mergers are common throughout the Universe and produce detectable',
  'gravitational waves across the mass spectrum from stellar-mass to supermassive.',
].join(' ');

export const A11_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-a11-ligo-gw150914-2016',
  url: 'https://doi.org/10.1103/PhysRevLett.116.061102',
  title: 'Observation of Gravitational Waves from a Binary Black Hole Merger (LIGO/Virgo 2016)',
  sourceType: 'paper',
  publisher: 'Physical Review Letters',
  fetchedAt: '2026-07-27T00:00:00.000Z',
  claim: 'First direct detection of gravitational waves from a binary black hole merger (GW150914 at 5.1σ).',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Assess whether binary black hole mergers are common throughout the Universe, producing detectable ' +
    'gravitational waves across the mass spectrum from stellar-mass (LIGO band, 10-1000 Hz) to ' +
    'supermassive (PTA nanohertz band, 1-100 nHz).',
  scope:
    'Stellar-mass BBH (10-100 M☉) via LIGO/Virgo/KAGRA O1-O4 runs; SMBH binaries (10^6-10^10 M☉) ' +
    'via pulsar timing arrays (NANOGrav, EPTA, PPTA); SMBH-galaxy coevolution via M-sigma relation ' +
    '(Kormendy & Ho 2013). Metric: cumulative BBH detection count + GWB detection significance.',
  keyTerms: [
    'supermassive black hole (SMBH)',
    'binary black hole (BBH) merger',
    'gravitational wave (GW)',
    'LIGO/Virgo/KAGRA',
    'pulsar timing array (PTA)',
    'NANOGrav',
    'Hellings-Downs correlation',
    'nanohertz GW background (GWB)',
    'M-sigma relation',
    'galaxy-SMBH coevolution',
    'OJ 287',
    'dynamical friction',
  ],
  falsifiableAngle:
    'Testable: ≥50 BBH detections across O1-O4 runs AND pulsar timing array GWB detection at >3σ ' +
    'with Hellings-Downs spatial correlation. Current status: ≥90 O1-O4 BBH candidates (GWTC-3 + O4a) ' +
    '+ NANOGrav 2023 Hellings-Downs ~4σ → CONFIRMED.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-a11-001',
      source: 'doi' as const,
      doi: '10.1103/PhysRevLett.116.061102',
      title: 'LIGO/Virgo 2016 GW150914 first direct BBH detection',
    },
    {
      evidenceId: 'ev-a11-002',
      source: 'doi' as const,
      doi: '10.3847/2041-8213/aa920c',
      title: 'Abbott 2017 GW170817 multi-messenger astronomy',
    },
    {
      evidenceId: 'ev-a11-003',
      source: 'doi' as const,
      doi: '10.1038/nature14181',
      title: 'Graham 2015 OJ 287 SMBH binary candidate',
    },
    {
      evidenceId: 'ev-a11-004',
      source: 'doi' as const,
      doi: '10.1146/annurev-astro-082708-101811',
      title: 'Kormendy & Ho 2013 SMBH-galaxy coevolution review',
    },
  ],
  knowledgeGraphSummary:
    'Evidence is OVERWHELMINGLY STRONG: (1) LIGO/Virgo directly detected GW150914 (5.1σ, M_chirp ~28 M☉, ' +
    'd_L ~410 Mpc) in 2015, confirming BBH mergers exist and are detectable; (2) O1-O4 cumulative yield ' +
    '≥90 BBH candidates (GWTC-3 catalog + O4a), detection rate ~1/week in O3, consistent with population ' +
    'synthesis predictions; (3) NANOGrav 2023 (15-year dataset) detected the Hellings-Downs spatial ' +
    'correlation at ~4σ — the smoking-gun signature of an isotropic nanohertz GWB consistent with an SMBH ' +
    'binary population; (4) Kormendy & Ho 2013 reviewed the M-sigma relation: M_BH ∝ σ^(4-5) (bulge ' +
    'velocity dispersion), scatter ~0.3 dex, implying SMBH and host galaxy coevolve through merger-driven ' +
    'accretion and feedback. Key gaps: no single SMBH binary resolved individually in PTA data (only GWB ' +
    'detected); OJ 287 optical periodicity claims debated (alternative: precessing jet model); LISA not yet ' +
    'launched (2030s) — direct SMBH merger GW detection pending.',
  gaps: [
    'No individually resolved SMBH binary in PTA data (only stochastic GWB detected)',
    'OJ 287 periodicity debated — precessing jet vs binary model',
    'LISA not yet launched (planned 2030s) — direct SMBH merger GW detection pending',
    'GWTC-3 completeness limited at high redshift (z > 1) and low mass (M_chirp < 5 M☉)',
    'PTA GWB spectral index γ measurement still uncertain (±0.5)',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'Binary black hole mergers are common in the Universe, producing detectable gravitational waves. ' +
    'LIGO-Virgo has detected ≥90 BBH candidates across O1-O4 runs, and NANOGrav 2023 confirms the ' +
    'stochastic nanohertz GWB consistent with an SMBH binary population. The M-sigma relation ' +
    '(Kormendy & Ho 2013) independently supports SMBH-galaxy coevolution through mergers.',
  falsificationMethod: {
    prediction:
      '≥50 BBH detections across LIGO-Virgo O1-O4 observing runs, AND pulsar timing array GWB ' +
      'detection at >3σ significance with Hellings-Downs spatial correlation.',
    metric: 'detection_count',
    comparator: 'gt' as const,
    value: 50,
  },
  supportingCitations: ['ev-a11-001', 'ev-a11-002', 'ev-a11-004'],
  scopeSlipText:
    'Scope: stellar-mass BBH (10-100 M☉) in LIGO band (10-1000 Hz) + SMBH binaries (10^6-10^10 M☉) ' +
    'in PTA band (1-100 nHz). Excludes intermediate-mass BH (10^2-10^5 M☉, LISA band, not yet launched). ' +
    'Excludes binary neutron star mergers (GW170817-type, different mass regime).',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-a11-e1',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.98,
      source: {
        evidenceId: 'ev-a11-001',
        source: 'doi' as const,
        doi: '10.1103/PhysRevLett.116.061102',
        title: 'LIGO/Virgo 2016 GW150914 first direct BBH detection',
      },
    },
    {
      evidenceId: 'ev-a11-e2',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.94,
      source: {
        evidenceId: 'ev-a11-002',
        source: 'doi' as const,
        doi: '10.3847/2041-8213/aa920c',
        title: 'Abbott 2017 GW170817 multi-messenger astronomy',
      },
    },
    {
      evidenceId: 'ev-a11-e3',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.88,
      source: {
        evidenceId: 'ev-a11-004',
        source: 'doi' as const,
        doi: '10.1146/annurev-astro-082708-101811',
        title: 'Kormendy & Ho 2013 SMBH-galaxy coevolution review',
      },
    },
  ],
  conflictingEvidenceCount: 0,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: [
    'GWTC-3 (LIGO/Virgo O1-O3 BBH catalog)',
    'NANOGrav 15-year dataset (67 pulsars, 3-15 yr baselines)',
    'EPTA Data Release 2 (25 pulsars, ~25 yr baselines)',
    'PPTA Data Release 3 (32 pulsars, ~18 yr baselines)',
    'Kormendy & Ho 2013 M-sigma compilation',
  ],
  methodChoices: [
    'Bayesian GW population inference (Power Law + Peak mass model)',
    'Hellings-Downs spatial correlation significance test (noise-marginalized)',
    'M-sigma regression with intrinsic scatter estimation (LINMIX_ERR)',
    'GW background spectral index γ measurement (γ = 13/3 for circular, GW-driven binaries)',
    'Cross-correlation between PTA datasets (NANOGrav × EPTA × PPTA)',
  ],
  scheduleOrFeedback:
    'Phase 1 (complete): LIGO O1-O3 ≥90 BBH candidates, GWTC-3 published. ' +
    'Phase 2 (complete): NANOGrav 2023 Hellings-Downs correlation ~4σ. ' +
    'Phase 3 (ongoing): LIGO O4 running (2023-2025), expected ~200 total BBH by end of O4. ' +
    'Phase 4 (future): LISA launch 2030s for direct SMBH merger GW detection in millihertz band. ' +
    'Phase 5 (future): SKA + next-gen PTA (IPTA DR3) for individual SMBH binary resolution. ' +
    'Conclusion: overwhelming evidence across mass scales → CONFIRMED.',
  executableChecks: [
    { ref: 'https://gwosc.org', exists: true, checkedAt: '2026-07-27T00:00:00.000Z' },
    { ref: 'https://nanograv.org', exists: true, checkedAt: '2026-07-27T00:00:00.000Z' },
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
    'Converged: LIGO direct BBH detections (≥90 candidates) + NANOGrav nanohertz GWB (Hellings-Downs ~4σ) ' +
    '+ M-sigma coevolution evidence (Kormendy & Ho 2013) provide overwhelming, multi-scale confirmation. ' +
    'No conflicting evidence. CONFIRMED.',
});

const A11_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    '≥50 binary black hole merger detections across LIGO-Virgo O1-O4 observing runs, AND pulsar timing ' +
    'array GWB detection at >3σ significance with Hellings-Downs spatial correlation.',
  metric: 'detection_count',
  falsificationThreshold: 50,
  thresholdSemantics: 'gt',
};

const A11_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 50,
};

const A11_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: ('a11'.repeat(14)).slice(0, 40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-07-27T00:00:00.000Z',
  rawResponseHash: ('a11'.repeat(22)).slice(0, 64),
};

export async function runA11Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-a11-smbh-merger',
    researchInput: A11_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'a11'.repeat(32),
    gitCommitSha: A11_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('A11 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  const a11Evidences: EvidenceRecord[] = [
    {
      claim:
        'GW150914 (LIGO 2016): first direct BBH merger detection at 5.1σ, chirp mass ~28 M☉, ' +
        'luminosity distance ~410 Mpc — confirms BBH mergers exist and produce detectable GWs.',
      metricValue: 0.98,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: A11_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: A11_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'a11-ev1-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim:
        'GWTC-3 catalog: ≥90 BBH candidates across O1-O3 runs, detection rate ~1/week in O3 — ' +
        'BBH mergers are common events, consistent with population synthesis predictions.',
      metricValue: 0.94,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: A11_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: A11_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'a11-ev2-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim:
        'NANOGrav 2023 15-year dataset: Hellings-Downs spatial correlation detected at ~4σ — ' +
        'smoking-gun signature of isotropic nanohertz GWB consistent with SMBH binary population.',
      metricValue: 0.91,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: A11_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: A11_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'a11-ev3-hash'.repeat(4).padEnd(64, '0'),
      },
    },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'a11'.repeat(32),
        gitCommitSha: A11_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: A11_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: A11_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: A11_FALSIFICATION_SPEC,
    thresholdSpec: A11_THRESHOLD_SPEC,
    evidences: a11Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(
      a11Evidences,
      A11_FALSIFICATION_SPEC,
      A11_THRESHOLD_SPEC,
    ),
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'A11-SMBH-MERGER',
        falsificationSpec: A11_FALSIFICATION_SPEC,
        thresholdSpec: A11_THRESHOLD_SPEC,
        frozenAt: A11_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });

  return {
    rawInput: A11_RAW_INPUT,
    sourceCard: A11_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash: verdictResult.verdictNode.currentHash,
    graphSubtree: getSubtree(db, verdictResult.verdictNode.verdictId),
    chainVerify: verifyChainHead(db),
    paper: assemblePaper(state),
    db,
  };
}
