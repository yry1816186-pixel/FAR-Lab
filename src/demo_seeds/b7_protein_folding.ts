/**
 * Demo Seed: B7 蛋白质折叠（Protein Structure Prediction Hard Targets）。
 *
 * 问题简述：ML 蛋白质结构预测（AlphaFold2 类）在 CASP15 free-modelling（hard）靶标上的
 * 实际 TM-score 中位数，是否达到声称的 ≥ 0.85？证据显示实际 0.68–0.71 → 预测 REFUTED。
 *
 * 历史溯源（已归档）: FAR_CHAIN_DEV_SPEC/41_可证伪证据链_FEC.md §1 + 17_FINAL_AUDIT.md §7。
 *
 * verdict 设计：thresholdSpec semantics='gt' value=0.85；所有 evidence metricValue < 0.85
 * → evaluateThreshold 全 refutes → decideVerdict REFUTED（诚实展示 FEC 能正确驳斥过度声称）。
 *
 * 产出：raw input / SourceCard / 6-stage loop / VerdictNode(REFUTED) / reproHash / GraphSubtree。
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

export const B7_RAW_INPUT = [
  'Protein structure prediction: AlphaFold2 and successor ML methods achieve near-experimental',
  'accuracy on template-based targets, but free-modelling (FM) targets — proteins with no homologous',
  'templates — remain the frontier. The community claims modern methods achieve median TM-score',
  '≥ 0.85 on CASP15 FM targets, indicating near-correct global fold. We test this claim:',
  'does the median TM-score of top-ranked FM submissions on CASP15 actually reach ≥ 0.85,',
  'and what is the distribution across single-domain vs multi-domain FM targets?',
].join(' ');

// ---------- SourceCard ----------

export const B7_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-b7-protein-folding-2026',
  url: 'https://predictioncenter.org/casp15/results.cgi',
  title: 'CASP15 Free-Modelling Target TM-score Distribution (Official Assessment)',
  sourceType: 'dataset',
  publisher: 'Protein Structure Prediction Center (CASP)',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim:
    'Median TM-score of top-ranked CASP15 FM targets is 0.68–0.71, well below the 0.85 claimed for near-correct fold.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

// ---------- Fixture payloads（六阶段·结构生物学领域特定） ----------

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Test whether ML protein structure prediction methods achieve median TM-score ≥ 0.85 on CASP15 ' +
    'free-modelling (hard) targets, as claimed by the community.',
  scope:
    'CASP15 (15th Critical Assessment of Protein Structure Prediction) free-modelling (FM) targets only — ' +
    'proteins with no detectable homologous templates. Excludes TBM (template-based modelling) and ' +
    'TBM/FM overlap targets. Evaluation metric: TM-score of rank-1 model vs experimental structure.',
  keyTerms: [
    'TM-score',
    'CASP15',
    'free-modelling (FM)',
    'AlphaFold2',
    'MSA (multiple sequence alignment)',
    'template-based modelling (TBM)',
    'global fold correctness',
  ],
  falsifiableAngle:
    'Testable: median TM-score of rank-1 models across all CASP15 FM targets, with ≥0.85 threshold ' +
    'for "near-correct global fold" and per-target bootstrap confidence intervals.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-b7-001',
      source: 'doi' as const,
      doi: '10.1038/s41586-021-03819-2',
      title: 'AlphaFold2: Highly Accurate Protein Structure Prediction with Deep Learning',
    },
    {
      evidenceId: 'ev-b7-002',
      source: 'other' as const,
      doi: null,
      title: 'CASP15 Official Assessment: Free-Modelling Target Evaluation',
    },
    {
      evidenceId: 'ev-b7-003',
      source: 'doi' as const,
      doi: '10.1093/nar/gkac1080',
      title: 'Protein Data Bank: The Single Global Archive of Macromolecular Structures',
    },
  ],
  knowledgeGraphSummary:
    'AlphaFold2 revolutionized structure prediction, achieving median GDT_TS > 90 on CASP14 TBM targets. ' +
    'However, FM targets (no templates) remain harder: CASP14 FM median TM-score was ~0.75. ' +
    'For CASP15, methods incorporated larger MSA depths and improved attention mechanisms, but ' +
    'multi-domain FM targets with inter-domain flexibility continue to challenge global fold accuracy. ' +
    'Key gap: claims of ≥0.85 median TM-score on FM targets conflate TBM/FM overlap cases.',
  gaps: [
    'Conflation of TBM/FM-overlap targets with true FM in headline accuracy numbers',
    'Multi-domain FM targets show large per-domain accuracy but poor global TM-score',
    'Rank-1 model selection vs best-of-5 model selection inflates reported accuracy',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'Modern ML methods achieve median TM-score ≥ 0.85 on CASP15 true free-modelling (FM) targets ' +
    '(no template homology), indicating near-correct global fold prediction.',
  falsificationMethod: {
    prediction:
      'Median TM-score of rank-1 models across CASP15 FM targets ≥ 0.85, with lower bootstrap CI ≥ 0.80.',
    metric: 'tm_score_median',
    comparator: 'gt' as const,
    value: 0.85,
  },
  supportingCitations: ['ev-b7-001'],
  scopeSlipText:
    'Scope strictly limited to CASP15 FM-only targets (no template homology, E-value > 0.001 against PDB). ' +
    'Excludes TBM and TBM/FM-overlap domains where template information inflates accuracy.',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-b7-e1',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.82,
      source: {
        evidenceId: 'ev-b7-002',
        source: 'other' as const,
        doi: null,
        title: 'CASP15 Official Assessment: Free-Modelling Target Evaluation',
      },
    },
    {
      evidenceId: 'ev-b7-e2',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.78,
      source: {
        evidenceId: 'ev-b7-001',
        source: 'doi' as const,
        doi: '10.1038/s41586-021-03819-2',
        title: 'AlphaFold2: Highly Accurate Protein Structure Prediction with Deep Learning',
      },
    },
    {
      evidenceId: 'ev-b7-e3',
      supportsOrRefutes: 'neutral' as const,
      entailmentScore: 0.51,
      source: {
        evidenceId: 'ev-b7-003',
        source: 'doi' as const,
        doi: '10.1093/nar/gkac1080',
        title: 'Protein Data Bank: The Single Global Archive of Macromolecular Structures',
      },
    },
  ],
  conflictingEvidenceCount: 2,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: [
    'CASP15 FM target submissions (official targets T1104–T1170 FM subset)',
    'Experimental reference structures from PDB (deposited after CASP15)',
    'TM-score reference implementation (TMalign / MMalign)',
  ],
  methodChoices: [
    'Rank-1 model extraction per FM target (official assessment protocol)',
    'TM-score computation against experimental structure (TM-score in [0,1])',
    'Median + bootstrap 95% CI across FM targets, stratified by single/multi-domain',
  ],
  scheduleOrFeedback:
    'Phase 1: Download CASP15 FM target rank-1 models + experimental structures. ' +
    'Phase 2: Compute TM-score per target via TMalign. ' +
    'Phase 3: Aggregate median + bootstrap CI, compare against 0.85 threshold.',
  executableChecks: [
    {
      ref: 'https://predictioncenter.org/casp15/targets.cgi',
      exists: true,
      checkedAt: '2026-06-27T00:00:00.000Z',
    },
    {
      ref: 'https://www.rcsb.org/',
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
    'Converged: claim is falsifiable (median TM-score threshold + bootstrap CI gate). ' +
    'Evidence from CASP15 official assessment refutes the ≥0.85 claim (observed 0.68–0.71).',
});

// ---------- FEC 三件套（REFUTED 设计：所有 metric < 0.85 threshold）----------

const B7_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    'Median TM-score of rank-1 models across CASP15 FM targets ≥ 0.85, with lower bootstrap CI ≥ 0.80.',
  metric: 'tm_score_median',
  falsificationThreshold: 0.85,
  thresholdSemantics: 'gt',
};

const B7_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 0.85,
};

// ---------- SourceAnchor ----------

const B7_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b7'.repeat(20),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'b7'.repeat(32),
};

// ---------- runSeed ----------

/**
 * 执行 B7 蛋白质折叠 demo seed（完整 6-stage agent loop + FEC 编排 → REFUTED）。
 *
 * 全程 offline_replay（不依赖真实 API）；fresh-clone 无 key 也能跑。
 */
export async function runB7Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-b7-protein-folding',
    researchInput: B7_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'b7'.repeat(32),
    gitCommitSha: B7_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  // discriminatedUnion narrow（R10·禁 as 强转）
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('B7 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  // FEC evidences: 所有 metricValue < 0.85 → evaluateThreshold(gt, ·, 0.85) 全 refutes → REFUTED。
  // 诚实展示：FEC 正确驳斥「FM 靶标 median TM-score ≥ 0.85」的过度声称（实际 0.68–0.71）。
  const b7Evidences: EvidenceRecord[] = [
    {
      claim:
        'CASP15 true-FM targets rank-1 models: median TM-score = 0.71 (95% bootstrap CI [0.66, 0.76])',
      metricValue: 0.71,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: B7_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: B7_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'b7-ev1-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim:
        'Multi-domain FM subset: median TM-score = 0.68 (inter-domain flexibility degrades global fold)',
      metricValue: 0.68,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: B7_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: B7_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'b7-ev2-hash'.repeat(4).padEnd(64, '0'),
      },
    },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'b7'.repeat(32),
        gitCommitSha: B7_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: B7_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: B7_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: B7_FALSIFICATION_SPEC,
    thresholdSpec: B7_THRESHOLD_SPEC,
    evidences: b7Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(b7Evidences, B7_FALSIFICATION_SPEC, B7_THRESHOLD_SPEC),
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'B7-PROTEIN-FOLDING',
        falsificationSpec: B7_FALSIFICATION_SPEC,
        thresholdSpec: B7_THRESHOLD_SPEC,
        frozenAt: B7_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });

  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);
  const chainVerify = verifyChainHead(db);
  const paper = assemblePaper(state);
  const reproHash = verdictResult.verdictNode.currentHash;

  return {
    rawInput: B7_RAW_INPUT,
    sourceCard: B7_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash,
    graphSubtree,
    chainVerify,
    paper,
    db,
  };
}
