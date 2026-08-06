/**
 * Demo Seed: C3 催化剂活性（Catalyst Turnover Number Prediction）。
 *
 * 问题简述：DFT+ML 流水线声称在「所有过渡金属催化剂」上预测转化数（TON）相对误差 ≤ 15%
 * （MAPE ≤ 0.15）。证据仅覆盖单原子催化剂（SAC）子集 → scope 比 claim 窄 → DEGRADED_SCOPE。
 *
 * 历史溯源（已归档）: FAR_CHAIN_DEV_SPEC/41_可证伪证据链_FEC.md §1 + 17_FINAL_AUDIT.md §7。
 *
 * verdict 设计：thresholdSpec semantics='lt' value=0.15；FEC evidences 含 1 条
 * scopeNarrowerThanClaim=true（SAC 子集·非全部过渡金属）→ decideVerdict 优先返回 DEGRADED_SCOPE
 * （scopeSlipText 自动取该 evidence.claim）。诚实展示：FEC 能识别「scope 滑动」陷阱。
 *
 * 产出：raw input / SourceCard / 6-stage loop / VerdictNode(DEGRADED_SCOPE) / reproHash / GraphSubtree。
 * 全程 offline_replay adapter。
 */

import { runAgentLoop, DEFAULT_TERMINATION } from '../../src/agent_loop/fsm_runner.ts';
import { assemblePaper } from '../../src/agent_loop/paper_assembler.ts';
import { extractFinishReasonForOfflineReplay } from '../../src/agent_loop/run_stage.ts';
import { verifyChainHead } from '../../src/evidence_log/verifier.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';
import { makeLegacyCompatFec } from '../../src/falsifiability/index.ts';
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

/** Constant: C3_RAW_INPUT. */
export const C3_RAW_INPUT = [
  'DFT-computed and ML-augmented catalyst screening: a pipeline combining density functional theory',
  '(DFT) reactivity descriptors with graph neural networks claims to predict catalyst turnover number',
  '(TON) within 15% relative error (MAPE ≤ 0.15) across all transition-metal catalysts. We test whether',
  'this accuracy holds, and critically, whether the validation set is representative of the claimed scope',
  '(all transition-metal catalysts including bulk surfaces, alloys, and single-atom catalysts), or whether',
  'the reported MAPE is achievable only on a narrow subset (single-atom catalysts, SAC).',
].join(' ');

// ---------- SourceCard ----------

/** Constant: C3_SOURCE_CARD. */
export const C3_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-c3-catalyst-2026',
  url: 'https://opencatalystproject.org/',
  title: 'Open Catalyst 2020 (OC20): DFT-Labeled Catalysis Dataset for Transition-Metal Surfaces',
  sourceType: 'dataset',
  publisher: 'Open Catalyst Project (Meta AI)',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim:
    'DFT+ML TON prediction achieves MAPE = 0.12 on single-atom catalyst (SAC) subset, but generalization to all transition-metal catalysts is unvalidated.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

// ---------- Fixture payloads（六阶段·计算化学/催化领域特定） ----------

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Assess whether a DFT+ML catalyst-screening pipeline predicts turnover number (TON) within 15% ' +
    'relative error (MAPE ≤ 0.15) across all transition-metal catalysts, and whether the validation ' +
    'scope matches the claim or is restricted to a narrow subset.',
  scope:
    'Transition-metal catalysts for CO2 reduction and oxygen evolution reactions: bulk transition-metal ' +
    'surfaces, alloys, and single-atom catalysts (SAC). Claim covers ALL three classes; validation must ' +
    'not be restricted to any one class. Evaluation metric: mean absolute percentage error (MAPE) of ' +
    'predicted vs DFT-computed TON.',
  keyTerms: [
    'turnover number (TON)',
    'density functional theory (DFT)',
    'graph neural network (GNN)',
    'single-atom catalyst (SAC)',
    'MAPE (mean absolute percentage error)',
    'Open Catalyst 2020 (OC20)',
    'scope slip',
  ],
  falsifiableAngle:
    'Testable: MAPE of TON prediction across a held-out set spanning ALL three catalyst classes, ' +
    'with per-class breakdown to detect scope restriction (single-class accuracy ≠ all-class accuracy).',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-c3-001',
      source: 'doi' as const,
      doi: '10.1021/acscatal.0c04525',
      title: 'Open Catalyst 2020 (OC20) Dataset and Large-Scale Benchmarks for Machine Learning in Catalysis',
    },
    {
      evidenceId: 'ev-c3-002',
      source: 'doi' as const,
      doi: '10.1038/s41929-021-00673-x',
      title: 'Single-Atom Catalysts for CO2 Reduction: DFT Descriptor Design and ML Screening',
    },
    {
      evidenceId: 'ev-c3-003',
      source: 'other' as const,
      doi: null,
      title: 'Generalization Gap in ML Catalyst Models: Bulk Surfaces vs Single-Atom Catalysts',
    },
  ],
  knowledgeGraphSummary:
    'DFT+ML catalyst screening pipelines (e.g., SchNet, GemNet, Equiformer on OC20) achieve low MAPE ' +
    'on in-distribution test sets, but the distribution is heavily skewed by catalyst class. Single-atom ' +
    'catalysts (SAC) have simpler local environments and lower prediction variance, inflating headline ' +
    'accuracy. Bulk transition-metal surfaces and random alloys show 2–3× higher MAPE due to coverage ' +
    'effects, adsorbate-adsorbate interactions, and surface reconstruction. Key gap: claims of "all ' +
    'transition-metal catalysts" accuracy are often validated only on the easier SAC subset.',
  gaps: [
    'SAC subset dominates OC20 test splits, masking poor bulk-surface performance',
    'TON extrapolation beyond DFT training coverage (high-coverage regimes) is untested',
    'No standardized per-class MAPE reporting to expose scope restriction',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'A DFT+ML pipeline predicts catalyst turnover number (TON) within 15% relative error (MAPE ≤ 0.15) ' +
    'across all transition-metal catalysts (bulk surfaces, alloys, and single-atom catalysts).',
  falsificationMethod: {
    prediction:
      'MAPE ≤ 0.15 on a held-out test set spanning all three catalyst classes, with no class exceeding 0.20.',
    metric: 'ton_mape',
    comparator: 'lt' as const,
    value: 0.15,
  },
  supportingCitations: ['ev-c3-001', 'ev-c3-002'],
  scopeSlipText:
    'Claim covers all transition-metal catalysts (bulk + alloy + SAC). Validation restricted to any single ' +
    'class constitutes scope slip and must be flagged as DEGRADED_SCOPE.',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-c3-e1',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.84,
      source: {
        evidenceId: 'ev-c3-002',
        source: 'doi' as const,
        doi: '10.1038/s41929-021-00673-x',
        title: 'Single-Atom Catalysts for CO2 Reduction: DFT Descriptor Design and ML Screening',
      },
    },
    {
      evidenceId: 'ev-c3-e2',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.79,
      source: {
        evidenceId: 'ev-c3-003',
        source: 'other' as const,
        doi: null,
        title: 'Generalization Gap in ML Catalyst Models: Bulk Surfaces vs Single-Atom Catalysts',
      },
    },
    {
      evidenceId: 'ev-c3-e3',
      supportsOrRefutes: 'neutral' as const,
      entailmentScore: 0.58,
      source: {
        evidenceId: 'ev-c3-001',
        source: 'doi' as const,
        doi: '10.1021/acscatal.0c04525',
        title: 'Open Catalyst 2020 (OC20) Dataset and Large-Scale Benchmarks for Machine Learning in Catalysis',
      },
    },
  ],
  conflictingEvidenceCount: 1,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: [
    'Open Catalyst 2020 (OC20) — DFT-relaxed adsorbate-catalyst configurations',
    'Per-class stratified test split (bulk surface / random alloy / single-atom)',
    'Independent TON labels from fixed DFT functional (RPBE with dispersion)',
  ],
  methodChoices: [
    'Graph neural network training (Equiformer backbone) on DFT descriptors',
    'Per-class MAPE breakdown (bulk / alloy / SAC) to detect scope restriction',
    'Permutation test: shuffle class labels → confirm MAPE gap is not chance',
  ],
  scheduleOrFeedback:
    'Phase 1: Train DFT+ML pipeline on OC20 training split. ' +
    'Phase 2: Evaluate on stratified test set with per-class MAPE. ' +
    'Phase 3: If SAC-only achieves MAPE ≤ 0.15 but bulk > 0.20 → flag DEGRADED_SCOPE.',
  executableChecks: [
    {
      ref: 'https://github.com/Open-Catalyst-Project/ocp',
      exists: true,
      checkedAt: '2026-06-27T00:00:00.000Z',
    },
    {
      ref: 'https://pubs.acs.org/doi/10.1021/acscatal.0c04525',
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
    'Converged: claim is falsifiable (MAPE threshold + per-class breakdown). ' +
    'Evidence shows SAC-only MAPE meets 0.15 but the validation scope is narrower than the all-catalyst claim.',
});

// ---------- FEC 三件套（DEGRADED_SCOPE 设计：SAC 子集 scope 比 claim 窄）----------

const C3_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction: 'MAPE ≤ 0.15 on a held-out test set spanning all three catalyst classes, with no class exceeding 0.20.',
  metric: 'ton_mape',
  falsificationThreshold: 0.15,
  thresholdSemantics: 'lt',
};

const C3_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'lt',
  value: 0.15,
};

// ---------- SourceAnchor ----------

const C3_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'c3'.repeat(20),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c3'.repeat(32),
};

// ---------- runSeed ----------

/**
 * 执行 C3 催化剂活性 demo seed（完整 6-stage agent loop + FEC 编排 → DEGRADED_SCOPE）。
 *
 * 全程 offline_replay（不依赖真实 API）；fresh-clone 无 key 也能跑。
 */
export async function runC3Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-c3-catalyst-activity',
    researchInput: C3_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'c3'.repeat(32),
    gitCommitSha: C3_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  // discriminatedUnion narrow（R10·禁 as 强转）
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('C3 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  // FEC evidences: ev1 在 SAC 子集上 MAPE=0.12（满足 0.15 threshold）但 scopeNarrowerThanClaim=true
  // （只覆盖 SAC·非全部过渡金属）→ decideVerdict 优先返回 DEGRADED_SCOPE，scopeSlipText = ev1.claim。
  // ev2 在 bulk 表面 MAPE=0.31（超 threshold·refutes）但被 DEGRADED_SCOPE 优先级覆盖。
  // 诚实展示：FEC 识别「scope 滑动」——用易子集的精度冒充全集精度是经典 p-hacking 陷阱。
  const c3Evidences: EvidenceRecord[] = [
    {
      claim:
        'On the single-atom catalyst (SAC) subset (32 compounds): MAPE = 0.12 — within the 0.15 threshold, ' +
        'BUT this scope is narrower than the claim (SAC only, not all transition-metal catalysts).',
      metricValue: 0.12,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: true,
      sourceAnchor: {
        gitCommitSha: C3_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: C3_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'c3-ev1-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim:
        'On bulk transition-metal surfaces (OC20): MAPE = 0.31 — exceeds the 0.15 threshold (coverage + reconstruction effects).',
      metricValue: 0.31,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: C3_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: C3_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'c3-ev2-hash'.repeat(4).padEnd(64, '0'),
      },
    },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'c3'.repeat(32),
        gitCommitSha: C3_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: C3_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: C3_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: C3_FALSIFICATION_SPEC,
    thresholdSpec: C3_THRESHOLD_SPEC,
    evidences: c3Evidences,
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'C3-CATALYST-ACTIVITY',
        falsificationSpec: C3_FALSIFICATION_SPEC,
        thresholdSpec: C3_THRESHOLD_SPEC,
        frozenAt: C3_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });

  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);
  const chainVerify = verifyChainHead(db);
  const paper = assemblePaper(state);
  const reproHash = verdictResult.verdictNode.currentHash;

  return {
    rawInput: C3_RAW_INPUT,
    sourceCard: C3_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash,
    graphSubtree,
    chainVerify,
    paper,
    db,
  };
}
