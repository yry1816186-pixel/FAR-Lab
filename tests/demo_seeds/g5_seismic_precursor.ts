/**
 * Demo Seed: G5 地震前兆（Pre-seismic Electromagnetic Precursor Prediction）。
 *
 * 问题简述：震前 ULF/VLF 电磁异常声称可在 7 天窗口内预测 M≥5 地震（precision ≥ 0.80）。
 * 证据：地震前兆预测领域长期存在不可复现问题·无可靠可复现的 metric 证据 → UNTESTED。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/41_可证伪证据链_FEC.md §1 + 17_FINAL_AUDIT.md §7。
 *
 * verdict 设计：FEC evidences 为空数组 → decideVerdict 第一分支返回 UNTESTED，
 * untestedReason = 'no evidence collected for this claim'。
 * 诚实展示：FEC 对「无可复现证据」的声称诚实标 UNTESTED，而非伪造 CONFIRMED（反剧场红线）。
 *
 * 产出：raw input / SourceCard / 6-stage loop / VerdictNode(UNTESTED) / reproHash / GraphSubtree。
 * 全程 offline_replay adapter。
 */

import type { Database } from 'better-sqlite3';

import { runAgentLoop, DEFAULT_TERMINATION } from '../../src/agent_loop/fsm_runner.ts';
import { assemblePaper } from '../../src/agent_loop/paper_assembler.ts';
import { extractFinishReasonForOfflineReplay } from '../../src/agent_loop/run_stage.ts';
import { verifyChainHead } from '../../src/evidence_log/verifier.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';
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

export const G5_RAW_INPUT = [
  'Earthquake prediction via pre-seismic electromagnetic precursors: Ultra-Low Frequency (ULF,',
  '0.001–10 Hz) and Very-Low Frequency (VLF) magnetic anomalies have been reported hours to days',
  'before M ≥ 5 earthquakes. A predictive model claims these anomalies enable M ≥ 5 earthquake',
  'prediction within a 7-day window at precision ≥ 0.80 and recall ≥ 0.50. We assess whether the',
  'published evidence supports this predictive performance claim, given well-documented reproducibility',
  'failures, multiple-testing bias, and the absence of any prospective blind protocol in earthquake',
  'precursor research.',
].join(' ');

// ---------- SourceCard ----------

export const G5_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-g5-seismic-precursor-2026',
  url: 'https://doi.org/10.1016/j.pepi.2015.03.002',
  title: 'Pre-seismic Electromagnetic Anomalies: A Critical Review of ULF/VLF Earthquake Precursor Studies',
  sourceType: 'paper',
  publisher: 'Physics of the Earth and Planetary Interiors (Review)',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim:
    'Pre-seismic ULF/VLF anomalies lack reproducible predictive performance; published claims fail independent blind validation.',
  evidenceLevel: 'secondary',
  stability: 'time_sensitive',
  usedFor: 'scientific_evidence',
};

// ---------- Fixture payloads（六阶段·固体地球物理领域特定） ----------

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Assess whether pre-seismic ULF/VLF electromagnetic anomalies can predict M ≥ 5 earthquakes within a ' +
    '7-day window at precision ≥ 0.80, given the reproducibility crisis in earthquake prediction research.',
  scope:
    'Retrospective catalogs of reported ULF/VLF magnetic anomalies prior to M ≥ 5 earthquakes globally, ' +
    '2000–2024. Requires a prospective blind protocol (anomaly detection run without knowledge of ' +
    'subsequent seismicity) to eliminate hindsight bias — no such protocol exists in the literature.',
  keyTerms: [
    'ULF/VLF magnetic anomaly',
    'earthquake precursor',
    'precision (positive predictive value)',
    'prospective blind protocol',
    'multiple-testing bias',
    'hindsight bias',
    'VAN method',
  ],
  falsifiableAngle:
    'Testable ONLY via prospective blind prediction: run anomaly detection forward in time, score ' +
    'precision/recall against subsequently recorded M ≥ 5 events, with pre-registered thresholds. ' +
    'Retrospective "fits" do not count (hindsight bias).',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-g5-001',
      source: 'arxiv' as const,
      doi: '10.1016/j.pepi.2015.03.002',
      title: 'Critical Review: Statistical Assessment of Earthquake Electromagnetic Precursor Claims',
    },
    {
      evidenceId: 'ev-g5-002',
      source: 'arxiv' as const,
      doi: '10.1002/2014GL061789',
      title: 'Retrospective ULF Anomalies Before the 2011 Tohoku Earthquake: A Re-analysis',
    },
    {
      evidenceId: 'ev-g5-003',
      source: 'other' as const,
      doi: null,
      title: 'The Reproducibility Problem in Earthquake Prediction: A Community Position Statement',
    },
  ],
  knowledgeGraphSummary:
    'Earthquake electromagnetic precursor research spans decades (VAN method since 1980s, ULF since 1990s). ' +
    'Reported anomalies are typically identified retrospectively — the researcher knows an earthquake ' +
    'occurred and searches for preceding anomalies. This induces severe multiple-testing and hindsight ' +
    'bias. No study has used a pre-registered prospective blind protocol with fixed thresholds. Independent ' +
    're-analyses consistently fail to reproduce claimed precision. The claimed 0.80 precision is unsupported ' +
    'by any reproducible evidence. Key gap: the field lacks the prospective blind evidence required to ' +
    'elevate the claim above UNTESTED.',
  gaps: [
    'No prospective blind protocol — all "evidence" is retrospective (hindsight bias)',
    'Threshold selection post-hoc (p-hacking): anomaly window + magnitude cut tuned per event',
    'No independent reproduction of claimed 0.80 precision across different catalogs',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'Pre-seismic ULF/VLF electromagnetic anomalies enable M ≥ 5 earthquake prediction within a 7-day ' +
    'window at precision ≥ 0.80 and recall ≥ 0.50.',
  falsificationMethod: {
    prediction:
      'Prospective blind protocol: precision ≥ 0.80 over ≥ 20 forward predictions of M ≥ 5 events, with pre-registered anomaly thresholds.',
    metric: 'prediction_precision_7d',
    comparator: 'gt' as const,
    value: 0.8,
  },
  supportingCitations: ['ev-g5-002'],
  scopeSlipText:
    'Claim requires prospective blind evidence (forward-in-time prediction with fixed thresholds). ' +
    'Retrospective fits are excluded due to hindsight + multiple-testing bias.',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-g5-e1',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.81,
      source: {
        evidenceId: 'ev-g5-001',
        source: 'arxiv' as const,
        doi: '10.1016/j.pepi.2015.03.002',
        title: 'Critical Review: Statistical Assessment of Earthquake Electromagnetic Precursor Claims',
      },
    },
    {
      evidenceId: 'ev-g5-e2',
      supportsOrRefutes: 'neutral' as const,
      entailmentScore: 0.59,
      source: {
        evidenceId: 'ev-g5-002',
        source: 'arxiv' as const,
        doi: '10.1002/2014GL061789',
        title: 'Retrospective ULF Anomalies Before the 2011 Tohoku Earthquake: A Re-analysis',
      },
    },
    {
      evidenceId: 'ev-g5-e3',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.74,
      source: {
        evidenceId: 'ev-g5-003',
        source: 'other' as const,
        doi: null,
        title: 'The Reproducibility Problem in Earthquake Prediction: A Community Position Statement',
      },
    },
  ],
  conflictingEvidenceCount: 1,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: [
    'Global ULF/VLF magnetometer networks (INTERMAGNET + regional arrays)',
    'USGS/ISC M ≥ 5 earthquake catalog (independent of precursor claims)',
    'Pre-registered anomaly thresholds (locked before any forward prediction)',
  ],
  methodChoices: [
    'Prospective blind protocol: run anomaly detection forward, score against later seismicity',
    'Precision/recall with 7-day + 100 km space-time window, pre-registered',
    'Multiple-testing correction (Bonferroni over number of stations + frequency bands)',
  ],
  scheduleOrFeedback:
    'Phase 1: Lock anomaly thresholds + space-time window via pre-registration. ' +
    'Phase 2: Run forward predictions over ≥ 2 years. ' +
    'Phase 3: Score precision/recall against independent earthquake catalog.',
  executableChecks: [
    {
      ref: 'https://www.intermagnet.org/',
      exists: true,
      checkedAt: '2026-06-27T00:00:00.000Z',
    },
    {
      ref: 'https://earthquake.usgs.gov/earthquakes/search/',
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
    'Converged: claim is falsifiable (prospective blind precision threshold). ' +
    'However, no reproducible metric evidence exists in the literature → FEC verdict UNTESTED (honest).',
});

// ---------- FEC 三件套（UNTESTED 设计：evidences 为空·无可复现证据）----------

const G5_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    'Prospective blind protocol: precision ≥ 0.80 over ≥ 20 forward predictions of M ≥ 5 events, with pre-registered anomaly thresholds.',
  metric: 'prediction_precision_7d',
  falsificationThreshold: 0.8,
  thresholdSemantics: 'gt',
};

const G5_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 0.8,
};

// ---------- SourceAnchor ----------

const G5_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'g5'.repeat(20),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'g5'.repeat(32),
};

// ---------- runSeed ----------

/**
 * 执行 G5 地震前兆 demo seed（完整 6-stage agent loop + FEC 编排 → UNTESTED）。
 *
 * 全程 offline_replay（不依赖真实 API）；fresh-clone 无 key 也能跑。
 */
export async function runG5Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-g5-seismic-precursor',
    researchInput: G5_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'g5'.repeat(32),
    gitCommitSha: G5_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  // discriminatedUnion narrow（R10·禁 as 强转）
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('G5 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  // FEC evidences: 空数组 → decideVerdict 第一分支返回 UNTESTED。
  // 地震前兆领域无可复现的 metric 证据（所有"证据"均为回顾性·含 hindsight bias），
  // FEC 诚实标 UNTESTED 而非伪造 CONFIRMED（反剧场红线）。
  const g5Evidences: EvidenceRecord[] = [];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'g5'.repeat(32),
        gitCommitSha: G5_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: G5_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: G5_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: G5_FALSIFICATION_SPEC,
    thresholdSpec: G5_THRESHOLD_SPEC,
    evidences: g5Evidences,
    parentVerdictId: null,
    nodeKind: 'hypothesis',
  });

  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);
  const chainVerify = verifyChainHead(db);
  const paper = assemblePaper(state);
  const reproHash = verdictResult.verdictNode.currentHash;

  return {
    rawInput: G5_RAW_INPUT,
    sourceCard: G5_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash,
    graphSubtree,
    chainVerify,
    paper,
    db,
  };
}
