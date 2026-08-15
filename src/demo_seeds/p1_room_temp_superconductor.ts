/**
 * Demo Seed: P1 室温超导（Room-Temperature Superconductivity · LK-99 replication）。
 *
 * 问题简述：LK-99 材料声称在室温（≥ 300 K）常压下零电阻超导（Tc ≥ 300 K）。
 * 证据：独立复现实验（北大、普林斯顿、马克斯·普朗克等）测得电阻非零、无迈斯纳效应 → REFUTED。
 *
 *
 * verdict 设计：thresholdSpec semantics='gt' value=300（Tc K）；所有 evidence metricValue < 300
 * （实测电阻非零·无迈斯纳·复现失败）→ FEC 全 refutes → kernel REFUTED。
 * 诚实展示：FEC 正确驳斥「室温常压超导」的过度声称（实际为硫化亚铜杂质导致的电阻跳变·非超导）。
 *
 * 产出：raw input / SourceCard / 6-stage loop / VerdictNode(REFUTED) / reproHash / GraphSubtree。
 * 全程 offline_replay adapter。新增物理（凝聚态）域（原 6 seed 无物理）。
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
import type { DemoSeedResult } from './a4_planetary_orbit_decay.ts';

import { openDb, createSequentialGateway } from './helpers.ts';

// ---------- raw input text ----------

/** Constant: P1_RAW_INPUT. */
export const P1_RAW_INPUT = [
  'Room-temperature ambient-pressure superconductivity: LK-99 (Pb10-xCux(PO4)6O) reportedly exhibits',
  'zero electrical resistance and the Meissner effect at temperatures ≥ 300 K and ambient pressure,',
  'implying a superconducting transition temperature Tc ≥ 300 K. We assess whether the published',
  'evidence and independent replication attempts support a genuine superconducting transition, given',
  'well-documented confounds (Cu2S impurity structural transition near 385 K causing resistivity drops,',
  'absence of reproducible Meissner effect, and the failure of multiple independent labs to confirm).',
].join(' ');

// ---------- SourceCard ----------

/** Constant: P1_SOURCE_CARD. */
export const P1_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-p1-lk99-replication-2026',
  url: 'https://doi.org/10.1038/s41586-023-06674-2',
  title: 'LK-99 replication: absence of room-temperature superconductivity in Pb10-xCux(PO4)6O',
  sourceType: 'paper',
  publisher: 'Nature (Independent Replication)',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: 'Independent replications of LK-99 find no room-temperature superconductivity (Cu2S impurity transition, no Meissner effect).',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

// ---------- Fixture payloads（六阶段·凝聚态物理领域特定） ----------

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Test whether LK-99 (Pb10-xCux(PO4)6O) exhibits a genuine superconducting transition at Tc ≥ 300 K ' +
    'under ambient pressure, as claimed.',
  scope:
    'LK-99 synthesized pellets and thin films, ambient pressure. Metric: zero DC electrical resistance ' +
    '(ρ < 1e-8 Ω·m) AND definitive Meissner effect (volume susceptibility < -0.1) at T ≥ 300 K.',
  keyTerms: [
    'LK-99',
    'room-temperature superconductivity',
    'Meissner effect',
    'Cu2S impurity (covellite)',
    'structural phase transition (~385 K)',
    'ambient pressure',
    'four-probe resistivity',
  ],
  falsifiableAngle:
    'Testable: DC resistivity (four-probe) + SQUID magnetometry at T ≥ 300 K across independent syntheses; ' +
    'threshold Tc ≥ 300 K with zero resistance + diamagnetic susceptibility.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-p1-001',
      source: 'doi' as const,
      doi: '10.1038/s41586-023-06674-2',
      title: 'LK-99 replication: absence of room-temperature superconductivity (Peking U.)',
    },
    {
      evidenceId: 'ev-p1-002',
      source: 'doi' as const,
      doi: '10.1038/s41586-023-06473-6',
      title: 'Cu2S impurity phase transition explains the resistivity anomaly in LK-99 (Max Planck)',
    },
    {
      evidenceId: 'ev-p1-003',
      source: 'other' as const,
      doi: null,
      title: 'No Meissner effect observed in LK-99 at 300 K: SQUID magnetometry (Princeton)',
    },
  ],
  knowledgeGraphSummary:
    'The original LK-99 preprint reported a resistivity drop near 400 K and partial levitation, claimed as ' +
    'room-temperature superconductivity. Subsequent first-principles calculations and independent syntheses ' +
    'showed the resistivity anomaly coincides with the β→α structural transition of Cu2S impurity (~385 K), ' +
    'not a superconducting transition. No lab reproduced a Meissner effect above 200 K.',
  gaps: [
    'Original levitation consistent with ferromagnetism/diamagnetism, not superconducting Meissner',
    'Cu2S impurity structural transition (~385 K) mimics the resistivity drop',
    'No reproducible zero-resistance state (ρ < 1e-8 Ω·m) at T ≥ 300 K in any independent sample',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'LK-99 exhibits a genuine superconducting transition at Tc ≥ 300 K under ambient pressure, evidenced ' +
    'by zero DC resistivity (ρ < 1e-8 Ω·m) and a definitive Meissner effect (susceptibility < -0.1) at 300 K.',
  falsificationMethod: {
    prediction:
      'Independently synthesized LK-99 samples show ρ < 1e-8 Ω·m and susceptibility < -0.1 at T = 300 K, ' +
      'with Tc ≥ 300 K (i.e., superconductivity persists up to at least 300 K).',
    metric: 'critical_temperature_K',
    comparator: 'gt' as const,
    value: 300,
  },
  supportingCitations: [],
  scopeSlipText:
    'Scope strictly ambient-pressure bulk LK-99; excludes high-pressure hydride superconductors and ' +
    'thin-film strain-engineered variants.',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-p1-e1',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.9,
      source: {
        evidenceId: 'ev-p1-002',
        source: 'doi' as const,
        doi: '10.1038/s41586-023-06473-6',
        title: 'Cu2S impurity phase transition explains the resistivity anomaly in LK-99',
      },
    },
    {
      evidenceId: 'ev-p1-e2',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.85,
      source: {
        evidenceId: 'ev-p1-001',
        source: 'doi' as const,
        doi: '10.1038/s41586-023-06674-2',
        title: 'LK-99 replication: absence of room-temperature superconductivity',
      },
    },
    {
      evidenceId: 'ev-p1-e3',
      supportsOrRefutes: 'neutral' as const,
      entailmentScore: 0.4,
      source: {
        evidenceId: 'ev-p1-003',
        source: 'other' as const,
        doi: null,
        title: 'No Meissner effect observed in LK-99 at 300 K',
      },
    },
  ],
  conflictingEvidenceCount: 2,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: [
    'Independently synthesized LK-99 pellets (Peking U., Princeton, Max Planck)',
    'Four-probe DC resistivity vs temperature (2–400 K)',
    'SQUID magnetometry for Meissner susceptibility',
  ],
  methodChoices: [
    'Phase-pure vs Cu2S-contaminated sample comparison',
    'Resistivity threshold: ρ < 1e-8 Ω·m = superconducting',
    'Onset Tc extraction via 90% normal-state resistance criterion',
  ],
  scheduleOrFeedback:
    'Phase 1: Synthesize phase-characterized LK-99 (XRD). Phase 2: Four-probe resistivity vs T. ' +
    'Phase 3: SQUID Meissner check at 300 K. Compare observed Tc against ≥ 300 K threshold.',
  executableChecks: [
    {
      ref: 'https://www.nature.com/articles/s41586-023-06674-2',
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
    'Converged: claim is falsifiable (Tc ≥ 300 K + zero-ρ + Meissner gate). ' +
    'Independent replications refute room-temperature superconductivity (Cu2S impurity transition, no Meissner).',
});

// ---------- FEC 三件套（REFUTED 设计：所有实测 Tc < 300 K）----------

const P1_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    'Independently synthesized LK-99 shows superconducting transition Tc ≥ 300 K (zero-ρ + Meissner at 300 K).',
  metric: 'critical_temperature_K',
  falsificationThreshold: 300,
  thresholdSemantics: 'gt',
};

const P1_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 300,
};

// ---------- SourceAnchor ----------

const P1_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'p1'.repeat(20),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'p1'.repeat(32),
};

// ---------- runSeed ----------

/**
 * 执行 P1 室温超导 demo seed（完整 6-stage agent loop + FEC 编排 → REFUTED）。
 *
 * 全程 offline_replay（不依赖真实 API）；fresh-clone 无 key 也能跑。
 * 新增物理（凝聚态）域·verdict REFUTED（metric 实测 Tc < 300 K 阈值）。
 */
export async function runP1Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-p1-room-temp-superconductor',
    researchInput: P1_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'p1'.repeat(32),
    gitCommitSha: P1_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('P1 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  // FEC evidences: 所有实测 Tc < 300 K → evaluateThreshold(gt, ·, 300) 全 refutes → REFUTED。
  // 诚实展示：FEC 正确驳斥「室温常压超导」过度声称（实际无超导·Cu2S 杂质相变伪装电阻跳变）。
  const p1Evidences: EvidenceRecord[] = [
    {
      claim:
        'Cu2S-contaminated LK-99: resistivity drop at 385 K coincides with Cu2S β→α transition, not superconductivity (measured apparent Tc ~385 K is impurity artifact, true superconducting Tc undefined / not observed)',
      metricValue: 0,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: P1_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: P1_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'p1-ev1-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim:
        'Phase-pure LK-99 (no Cu2S): no zero-resistance state observed up to 400 K (ρ remains ~1e-4 Ω·m); no superconducting transition, Tc not reached',
      metricValue: 0,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: P1_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: P1_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'p1-ev2-hash'.repeat(4).padEnd(64, '0'),
      },
    },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'p1'.repeat(32),
        gitCommitSha: P1_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: P1_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: P1_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: P1_FALSIFICATION_SPEC,
    thresholdSpec: P1_THRESHOLD_SPEC,
    evidences: p1Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(p1Evidences, P1_FALSIFICATION_SPEC, P1_THRESHOLD_SPEC),
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'P1-ROOM-TEMP-SC',
        falsificationSpec: P1_FALSIFICATION_SPEC,
        thresholdSpec: P1_THRESHOLD_SPEC,
        frozenAt: P1_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });

  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);
  const chainVerify = verifyChainHead(db);
  const paper = assemblePaper(state);
  const reproHash = verdictResult.verdictNode.currentHash;

  return {
    rawInput: P1_RAW_INPUT,
    sourceCard: P1_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash,
    graphSubtree,
    chainVerify,
    paper,
    db,
  };
}
