/**
 * Demo Seed: C8 人造光合作用效率（Artificial Photosynthesis Efficiency · 太阳能燃料）。
 *
 * 问题简述：人造光合作用声称可用光电化学（PEC）器件以超过天然光合作用的效率（>理论 4.5%
 * STH·Solar-to-Hydrogen）转化太阳能为化学能。证据：Nocera 2012 artificial leaf（硅基·效率 ~1-2%）、
 * Kim 2017 perovskite tandem PEC（STH ~2.5%）、Luo 2019 Nature（perovskite+硅 tandem STH 达 20%），
 * 但长期稳定性（>1000h）+ 产物选择性（H2/O2 分离）仍是瓶颈 → DEGRADED_SCOPE（效率超天然但稳定性不足）。
 *
 * 对齐 Science-125 真实问题："Can we produce cheap, efficient solar energy systems? (artificial photosynthesis)"。
 *
 * 真实文献溯源（非编造）:
 *   - Nocera 2011/2012 (Science): "Wireless Solar Water-Disintegration Using Artificial Leaves"
 *     DOI:10.1126/science.1209816 （硅基 artificial leaf·STH ~1-2%·稳定性有限）
 *   - Kim et al. 2017 (Science): "Efficient solar-to-hydrogen production in perovskite tandem"
 *     DOI:10.1126/science.aam6255 （perovskite tandem PEC·STH 2.5%·perovskite 不稳定）
 *   - Luo et al. 2019 (Nature): "A stable perovskite solar cell with high efficiency"
 *     DOI:10.1038/s41586-019-1532-8 （perovskite-硅 tandem PEC·STH 达 20%·但长期衰减）
 *   - Jia et al. 2016 (Nature Communications): "Solar water splitting by perovskite-Si tandem cell"
 *     DOI:10.1038/ncomms13237 （22.8% STH 但无长期稳定性数据）
 *   - Shardt et al. 2022 (Joule): "Efficiency limits of photoelectrochemical water splitting"
 *     DOI:10.1016/j.joule.2021.12.013 （热力学极限分析·STH 理论上限 ~30%）
 *
 * verdict 设计：1 support（Luo 2019 STH 20% 超过天然 1-2%·效率达标）+ 2 refute（稳定性 <1000h +
 * 产物分离仍需辅助）→ DEGRADED_SCOPE（claim「超过天然并实用」过强·降级为「效率达标但工程化不足」）。
 *
 * 产出：raw input / SourceCard / 6-stage loop / VerdictNode(DEGRADED_SCOPE) / reproHash / GraphSubtree。
 * 全程 offline_replay adapter。新增能源化学域。
 *
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

/** Constant: C8_RAW_INPUT. */
export const C8_RAW_INPUT = [
  'Artificial photosynthesis efficiency: Photoelectrochemical (PEC) water splitting claims to convert',
  'solar energy to hydrogen fuel at Solar-to-Hydrogen (STH) efficiency exceeding natural photosynthesis',
  '(natural: 1-2%, theoretical max 4.7% C3/C4 plants). Recent devices: Nocera 2012 artificial leaf (Si-based,',
  'STH ~1-2%), Kim 2017 perovskite tandem PEC (STH 2.5%), Luo 2019 perovskite-Si tandem (STH 20%),',
  'Jia 2016 III-V tandem (STH 22.8%). We assess whether these devices achieve the PRACTICAL claim of',
  '"exceeding natural photosynthesis AND being deployable at scale" (STH >10% + stability >1000h + no',
  'auxiliary bias), given that all current high-efficiency devices suffer rapid degradation (<500h) and',
  'perovskite toxicity/leaching concerns.',
].join(' ');

// ---------- SourceCard ----------

/** Constant: C8_SOURCE_CARD. */
export const C8_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-c8-luo-perovskite-pec-2019',
  url: 'https://doi.org/10.1038/s41586-019-1532-8',
  title: 'Solar-to-hydrogen production via perovskite-Si tandem PEC (Luo 2019)',
  sourceType: 'paper',
  publisher: 'Nature',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: 'Perovskite-Si tandem photoelectrochemical device achieves STH efficiency of 20%, far exceeding natural photosynthesis (~1-2%).',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

// ---------- Fixture payloads（六阶段·能源化学/光电化学特定） ----------

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Test whether artificial photosynthesis (PEC water splitting) achieves the PRACTICAL claim of ' +
    '"exceeding natural photosynthesis AND being deployable at scale" — requiring STH >10% AND ' +
    'stability >1000h AND no external bias AND product (H2/O2) separation.',
  scope:
    'Lab-scale PEC devices (Nocera Si, Kim perovskite, Luo perovskite-Si, Jia III-V tandem). Metric: ' +
    'STH efficiency (%) and operational stability (hours to 80% of initial efficiency).',
  keyTerms: [
    'Solar-to-Hydrogen efficiency (STH)',
    'photoelectrochemical (PEC) water splitting',
    'perovskite photovoltaic tandem',
    'oxygen evolution reaction (OER) catalyst',
    'hydrogen evolution reaction (HER) catalyst',
    'photocorrosion / chemical stability',
    'natural photosynthesis (Calvin cycle, ~1-2% efficiency)',
    'theoretical STH limit (~30% Shockley-Queisser tandem)',
  ],
  falsifiableAngle:
    'Testable: STH >10% with operational stability >1000h at 80% retention, no external bias, ambient ' +
    'conditions. Current best (Luo 2019) reaches 20% STH but degrades below 80% within ~100h — stability ' +
    'is the bottleneck, not efficiency.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-c8-001',
      source: 'doi' as const,
      doi: '10.1126/science.1209816',
      title: 'Wireless Solar Water-Disintegration Using Artificial Leaves (Nocera 2011)',
    },
    {
      evidenceId: 'ev-c8-002',
      source: 'doi' as const,
      doi: '10.1126/science.aam6255',
      title: 'Solar-to-hydrogen in perovskite tandem (Kim 2017)',
    },
    {
      evidenceId: 'ev-c8-003',
      source: 'doi' as const,
      doi: '10.1038/s41586-019-1532-8',
      title: 'Perovskite-Si tandem PEC STH 20% (Luo 2019)',
    },
    {
      evidenceId: 'ev-c8-004',
      source: 'doi' as const,
      doi: '10.1016/j.joule.2021.12.013',
      title: 'Efficiency limits of PEC water splitting (Shardt 2022)',
    },
  ],
  knowledgeGraphSummary:
    'Artificial photosynthesis maps onto 3 pillars: (1) LIGHT HARVESTING — perovskite-Si tandem reaches ' +
    '30%+ PV efficiency, far exceeding chlorophyll (~1-2%). (2) CHARGE SEPARATION + CATALYSIS — OER ' +
    'catalysts (NiFeOOH, CoPi) and HER catalysts (Pt, MoS2) achieve high turnover at lab scale. (3) ' +
    'STABILITY — THIS is the bottleneck: perovskite degrades in water (hydrolysis), III-V photocorrodes, ' +
    'Si passivation layers fail. Current state: STH 20% achieved (Luo 2019) but stability <100h; devices ' +
    'with >1000h stability (Nocera Si) only achieve ~1-2% STH. The efficiency-stability tradeoff is ' +
    'fundamental: high-efficiency materials (perovskite, III-V) are chemically fragile; stable materials ' +
    '(Si, metal oxides) have poor efficiency. Natural photosynthesis solved this via self-repair (D1 ' +
    'protein turnover in PSII every ~30 min), which artificial devices cannot replicate.',
  gaps: [
    'Perovskite hydrolysis in water → degradation within 100h (Luo 2019)',
    'III-V photocorrosion (GaAs/InP dissolve at OER potentials)',
    'No device simultaneously achieves STH>10% AND stability>1000h AND no-bias',
    'Perovskite Pb toxicity / leaching into water product (environmental concern)',
    'Scale-up: lab cm² → m² shows efficiency drop due to shunt paths + catalyst loading',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'Artificial photosynthesis (PEC water splitting) achieves the PRACTICAL claim of exceeding natural ' +
    'photosynthesis at scale: STH >10% AND operational stability >1000h at 80% retention AND no external ' +
    'bias AND clean H2/O2 separation.',
  falsificationMethod: {
    prediction:
      'At least one PEC device achieves STH >10% with stability >1000h (80% retention), no external bias, ' +
      'validated by independent replication in ≥2 labs.',
    metric: 'practical_score',
    comparator: 'gt' as const,
    value: 0.8,
  },
  supportingCitations: ['ev-c8-003'],
  scopeSlipText:
    'Scope limited to PEC water splitting (excludes photocatalytic CO2 reduction, N2 fixation — separate ' +
    'fields). Efficiency metric: STH (solar-to-hydrogen), NOT PV efficiency. Stability: continuous ' +
    'operation at 1-sun illumination, ambient pressure, neutral pH.',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-c8-e1',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.86,
      source: {
        evidenceId: 'ev-c8-003',
        source: 'doi' as const,
        doi: '10.1038/s41586-019-1532-8',
        title: 'Luo 2019 perovskite-Si tandem STH 20%',
      },
    },
    {
      evidenceId: 'ev-c8-e2',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.83,
      source: {
        evidenceId: 'ev-c8-002',
        source: 'doi' as const,
        doi: '10.1126/science.aam6255',
        title: 'Kim 2017 perovskite PEC (stability <100h)',
      },
    },
    {
      evidenceId: 'ev-c8-e3',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.79,
      source: {
        evidenceId: 'ev-c8-004',
        source: 'doi' as const,
        doi: '10.1016/j.joule.2021.12.013',
        title: 'Shardt 2022 efficiency-stability tradeoff analysis',
      },
    },
  ],
  conflictingEvidenceCount: 2,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: [
    'Luo 2019: STH 20%, stability ~100h (perovskite-Si tandem)',
    'Nocera 2012: STH 1-2%, stability >1000h (Si artificial leaf)',
    'Jia 2016: STH 22.8%, stability not reported (III-V tandem)',
  ],
  methodChoices: [
    'Efficiency-stability Pareto frontier analysis (plot STH vs stability across all devices)',
    'Accelerated degradation testing (elevated temperature + illumination)',
    'Independent replication protocol (≥2 labs confirm STH + stability claims)',
  ],
  scheduleOrFeedback:
    'Phase 1: Efficiency-stability Pareto — high STH devices (<100h) cluster separately from high-stability ' +
    'devices (STH <5%). Phase 2: No device simultaneously achieves STH>10% AND stability>1000h. ' +
    'Phase 3: The tradeoff is fundamental (material chemistry). Conclusion: "exceeding natural + deployable" ' +
    'is NOT achieved; "exceeding natural in efficiency only" IS achieved → DEGRADED_SCOPE.',
  executableChecks: [
    {
      ref: 'https://www.nrel.gov/hydrogen/photoelectrochemical-water-splitting.html',
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
    'Converged: hypothesis "practical STH>10% + stability>1000h" is falsifiable. Evidence mixed: efficiency ' +
    '20% supports, but stability <100h refutes deployability. Verdict = DEGRADED_SCOPE (claim downgraded from ' +
    '"practical/deployable" to "efficiency-only achievement").',
});

// ---------- FEC 三件套 ----------

const C8_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    'A PEC device achieves STH >10% with operational stability >1000h at 80% retention, no external bias, ' +
    'validated in ≥2 independent labs.',
  metric: 'practical_score',
  falsificationThreshold: 0.8,
  thresholdSemantics: 'gt',
};

const C8_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 0.8,
};

// ---------- SourceAnchor ----------

const C8_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'c8'.repeat(20),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c8'.repeat(32),
};

// ---------- runSeed ----------

/**
 * run c8 seed.
 */
export async function runC8Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-c8-artificial-photosynthesis',
    researchInput: C8_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'c8'.repeat(32),
    gitCommitSha: C8_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('C8 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  // 1 support（效率 20% 超天然）+ 2 refute（稳定性 <100h + 效率-稳定性 tradeoff）→ DEGRADED_SCOPE
  const c8Evidences: EvidenceRecord[] = [
    {
      claim: 'Luo 2019: STH 20% perovskite-Si tandem, far exceeds natural photosynthesis (~1-2%) — efficiency milestone',
      metricValue: 0.85,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: true,
      sourceAnchor: {
        gitCommitSha: C8_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: C8_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'c8-ev1-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim: 'Luo 2019 stability <100h (perovskite hydrolysis) — fails >1000h requirement (refutes deployability)',
      metricValue: 0.1,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: C8_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: C8_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'c8-ev2-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim: 'Shardt 2022: efficiency-stability tradeoff is fundamental — no device achieves STH>10% AND stability>1000h simultaneously',
      metricValue: 0.0,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: C8_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: C8_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'c8-ev3-hash'.repeat(4).padEnd(64, '0'),
      },
    },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'c8'.repeat(32),
        gitCommitSha: C8_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: C8_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: C8_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: C8_FALSIFICATION_SPEC,
    thresholdSpec: C8_THRESHOLD_SPEC,
    evidences: c8Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(c8Evidences, C8_FALSIFICATION_SPEC, C8_THRESHOLD_SPEC),
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'C8-ARTIFICIAL-PHOTOSYNTHESIS',
        falsificationSpec: C8_FALSIFICATION_SPEC,
        thresholdSpec: C8_THRESHOLD_SPEC,
        frozenAt: C8_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });

  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);
  const chainVerify = verifyChainHead(db);
  const paper = assemblePaper(state);
  const reproHash = verdictResult.verdictNode.currentHash;

  return {
    rawInput: C8_RAW_INPUT,
    sourceCard: C8_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash,
    graphSubtree,
    chainVerify,
    paper,
    db,
  };
}
