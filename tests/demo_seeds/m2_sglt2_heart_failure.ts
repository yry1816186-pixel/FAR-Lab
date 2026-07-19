/**
 * Demo Seed: M2 心衰住院（SGLT2 inhibitor cardiovascular benefit · 队列综合）。
 *
 * 问题简述：SGLT2 抑制剂（恩格列净/卡格列净/达格列净）声称降低 T2D 患者 心衰住院 ≥ 25%
 * （HR ≤ 0.75）。证据：EMPA-REG OUTCOME / CANVAS / DECLARE 三大 RCT 一致显示 27-35% 降低 → CONFIRMED。
 *
 * 历史溯源（已归档）: FAR_CHAIN_DEV_SPEC/41_可证伪证据链_FEC.md §1 + 17_FINAL_AUDIT.md §7。
 *
 * verdict 设计：thresholdSpec semantics='lt' value=0.75（HR·越低越好）；所有 evidence
 * metricValue（HR）≤ 0.75 且 supportsClaim=true → FEC 全 supports → kernel CONFIRMED（R7）。
 * 诚实展示：FEC 确认有跨多 RCT 一致强证据的声称（非全驳斥·展示 verdict 多样性）。
 *
 * 产出：raw input / SourceCard / 6-stage loop / VerdictNode(CONFIRMED) / reproHash / GraphSubtree。
 * 全程 offline_replay adapter。新增医学（心血管/内分泌）域。
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

export const M2_RAW_INPUT = [
  'SGLT2 inhibitor cardiovascular benefit: Empagliflozin (EMPA-REG OUTCOME), Canagliflozin (CANVAS),',
  'and Dapagliflozin (DECLARE-TIMI 58) collectively claim to reduce heart failure hospitalization in',
  'type 2 diabetes patients by ≥ 25% (pooled hazard ratio HR ≤ 0.75). We assess whether the published',
  'RCT evidence, across three independent large cardiovascular outcome trials, supports this robustly,',
  'given consistent direction-of-effect and narrow confidence intervals.',
].join(' ');

// ---------- SourceCard ----------

export const M2_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-m2-sglt2-cvot-2026',
  url: 'https://doi.org/10.1056/NEJMoa1905362',
  title: 'Dapagliflozin and Cardiovascular Outcomes in Type 2 Diabetes (DECLARE-TIMI 58)',
  sourceType: 'paper',
  publisher: 'NEJM (Cardiovascular Outcome Trial)',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: 'SGLT2 inhibitors reduce heart failure hospitalization by ≥25% (HR≤0.75) across EMPA-REG, CANVAS, DECLARE.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

// ---------- Fixture payloads（六阶段·心血管医学领域特定） ----------

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Test whether SGLT2 inhibitors reduce heart failure hospitalization in T2D patients by ≥ 25% (HR ≤ 0.75), ' +
    'as claimed across three cardiovascular outcome trials.',
  scope:
    'Adults with type 2 diabetes and established/high CV risk. Metric: hazard ratio (HR) for heart failure ' +
    'hospitalization (hHF) vs placebo, pooled across EMPA-REG OUTCOME, CANVAS, DECLARE-TIMI 58.',
  keyTerms: [
    'SGLT2 inhibitor',
    'empagliflozin',
    'canagliflozin',
    'dapagliflozin',
    'heart failure hospitalization (hHF)',
    'hazard ratio (HR)',
    'cardiovascular outcome trial (CVOT)',
  ],
  falsifiableAngle:
    'Testable: pooled HR for hHF ≤ 0.75 (≥ 25% relative risk reduction) with 95% CI upper bound < 0.85, ' +
    'across ≥ 3 independent RCTs showing consistent direction-of-effect.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-m2-001',
      source: 'arxiv' as const,
      doi: '10.1056/NEJMoa1504720',
      title: 'Empagliflozin, Cardiovascular Outcomes, and Mortality in T2D (EMPA-REG OUTCOME)',
    },
    {
      evidenceId: 'ev-m2-002',
      source: 'arxiv' as const,
      doi: '10.1056/NEJMoa1611925',
      title: 'Canagliflozin and Cardiovascular and Renal Events in T2D (CANVAS Program)',
    },
    {
      evidenceId: 'ev-m2-003',
      source: 'arxiv' as const,
      doi: '10.1056/NEJMoa1905362',
      title: 'Dapagliflozin and Cardiovascular Outcomes in T2D (DECLARE-TIMI 58)',
    },
  ],
  knowledgeGraphSummary:
    'Three independent large CVOTs (EMPA-REG OUTCOME n=7020, CANVAS n=10142, DECLARE n=17160) consistently ' +
    'show SGLT2 inhibitors reduce heart failure hospitalization by 27-35%. The direction-of-effect is ' +
    'uniform across trials, subgroups, and baseline HbA1c. Meta-analyses pool the HR near 0.69 with tight CIs.',
  gaps: [
    'Primary prevention subgroups (no prior CVD) show attenuated but still significant benefit',
    'Mechanism (ketone body energetics vs afterload reduction) remains debated but does not affect the outcome claim',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'SGLT2 inhibitors reduce heart failure hospitalization in adults with T2D by ≥ 25% (pooled HR ≤ 0.75), ' +
    'with consistent direction-of-effect across ≥ 3 independent cardiovascular outcome trials.',
  falsificationMethod: {
    prediction:
      'Pooled HR for hHF across EMPA-REG, CANVAS, DECLARE ≤ 0.75, with 95% CI upper bound < 0.85.',
    metric: 'hazard_ratio_hHF',
    comparator: 'lt' as const,
    value: 0.75,
  },
  supportingCitations: ['ev-m2-001', 'ev-m2-002', 'ev-m2-003'],
  scopeSlipText:
    'Scope: adults with T2D (with or without established CVD). Excludes heart failure patients without diabetes ' +
    '(separate indication, DAPA-HF, also positive but out of this claim scope).',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-m2-e1',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.88,
      source: {
        evidenceId: 'ev-m2-001',
        source: 'arxiv' as const,
        doi: '10.1056/NEJMoa1504720',
        title: 'Empagliflozin, Cardiovascular Outcomes, and Mortality in T2D (EMPA-REG OUTCOME)',
      },
    },
    {
      evidenceId: 'ev-m2-e2',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.85,
      source: {
        evidenceId: 'ev-m2-002',
        source: 'arxiv' as const,
        doi: '10.1056/NEJMoa1611925',
        title: 'Canagliflozin and Cardiovascular and Renal Events in T2D (CANVAS Program)',
      },
    },
    {
      evidenceId: 'ev-m2-e3',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.84,
      source: {
        evidenceId: 'ev-m2-003',
        source: 'arxiv' as const,
        doi: '10.1056/NEJMoa1905362',
        title: 'Dapagliflozin and Cardiovascular Outcomes in T2D (DECLARE-TIMI 58)',
      },
    },
  ],
  conflictingEvidenceCount: 0,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: [
    'EMPA-REG OUTCOME trial published HR for hHF',
    'CANVAS Program trial published HR for hHF',
    'DECLARE-TIMI 58 trial published HR for hHF',
  ],
  methodChoices: [
    'Inverse-variance fixed-effect meta-analysis of log-HR across 3 trials',
    'Cochran Q heterogeneity test (expect I² < 25% given consistency)',
    'Compare pooled HR against 0.75 threshold (≥ 25% risk reduction)',
  ],
  scheduleOrFeedback:
    'Phase 1: Extract trial-level hHF HR + 95% CI from each CVOT publication. ' +
    'Phase 2: Fixed-effect meta-analysis (log-HR pooling). Phase 3: Compare pooled HR vs 0.75 threshold.',
  executableChecks: [
    {
      ref: 'https://www.nejm.org/doi/10.1056/NEJMoa1504720',
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
    'Converged: claim is falsifiable (pooled HR ≤ 0.75 threshold + 3-trial consistency gate). ' +
    'Three independent CVOTs support ≥ 25% hHF reduction (EMPA-REG 35%, CANVAS 33%, DECLARE 27%).',
});

// ---------- FEC 三件套（CONFIRMED 设计：所有 HR ≤ 0.75 阈值）----------

const M2_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    'Pooled HR for heart failure hospitalization across 3 SGLT2 CVOTs ≤ 0.75 (≥ 25% risk reduction).',
  metric: 'hazard_ratio_hHF',
  falsificationThreshold: 0.75,
  thresholdSemantics: 'lt',
};

const M2_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'lt',
  value: 0.75,
};

// ---------- SourceAnchor ----------

const M2_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'm2'.repeat(20),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'm2'.repeat(32),
};

// ---------- runSeed ----------

/**
 * 执行 M2 心衰住院 demo seed（完整 6-stage agent loop + FEC 编排 → CONFIRMED）。
 *
 * 全程 offline_replay；fresh-clone 无 key 也能跑。新增医学（心血管/内分泌）域·verdict CONFIRMED。
 */
export async function runM2Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-m2-sglt2-heart-failure',
    researchInput: M2_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'm2'.repeat(32),
    gitCommitSha: M2_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('M2 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  // FEC evidences: 所有 HR ≤ 0.75（lt 阈值）→ 全 supports → R7 PRIMARY_TEST_CONFIRMS → CONFIRMED。
  // 诚实展示：FEC 确认有跨多独立 RCT 一致强证据的声称（EMPA-REG 0.65·CANVAS 0.67·DECLARE 0.73）。
  const m2Evidences: EvidenceRecord[] = [
    {
      claim:
        'EMPA-REG OUTCOME: hHF HR = 0.65 (95% CI 0.50-0.85) — 35% risk reduction (n=7020)',
      metricValue: 0.65,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: M2_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: M2_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'm2-ev1-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim:
        'CANVAS Program: hHF HR = 0.67 (95% CI 0.52-0.87) — 33% risk reduction (n=10142)',
      metricValue: 0.67,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: M2_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: M2_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'm2-ev2-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim:
        'DECLARE-TIMI 58: hHF HR = 0.73 (95% CI 0.61-0.88) — 27% risk reduction (n=17160)',
      metricValue: 0.73,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: M2_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: M2_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'm2-ev3-hash'.repeat(4).padEnd(64, '0'),
      },
    },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'm2'.repeat(32),
        gitCommitSha: M2_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: M2_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: M2_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: M2_FALSIFICATION_SPEC,
    thresholdSpec: M2_THRESHOLD_SPEC,
    evidences: m2Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(m2Evidences, M2_FALSIFICATION_SPEC, M2_THRESHOLD_SPEC),
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'M2-SGLT2-HEART-FAILURE',
        falsificationSpec: M2_FALSIFICATION_SPEC,
        thresholdSpec: M2_THRESHOLD_SPEC,
        frozenAt: M2_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });

  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);
  const chainVerify = verifyChainHead(db);
  const paper = assemblePaper(state);
  const reproHash = verdictResult.verdictNode.currentHash;

  return {
    rawInput: M2_RAW_INPUT,
    sourceCard: M2_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash,
    graphSubtree,
    chainVerify,
    paper,
    db,
  };
}
