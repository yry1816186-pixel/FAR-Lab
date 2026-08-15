/**
 * Demo Seed: A4 行星轨道衰减（Planetary Orbit Decay）。
 *
 * 问题简述：为什么行星的轨道不衰减？→ 降级变体「热木星轨道衰减 dP/dt 排名」。
 *
 *            17_FINAL_AUDIT.md §7（每个 demo seed 要求）。
 *
 * 产出：raw input 文本、SourceCard、VerdictNode、reproHash、GraphSubtree、evidence_log 记录。
 * 全程 offline_replay adapter（不调用真实 API·fresh-clone 无 key 也能跑）。
 */

import type { Database } from 'better-sqlite3';

import { runAgentLoop, DEFAULT_TERMINATION } from '../../src/agent_loop/fsm_runner.ts';
import { assemblePaper } from '../../src/agent_loop/paper_assembler.ts';
import { extractFinishReasonForOfflineReplay } from '../../src/agent_loop/run_stage.ts';
import { verifyChainHead } from '../../src/evidence_log/verifier.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';
import { bridgeLegacyEvidencesToStatistics, makeLegacyCompatFec } from '../../src/falsifiability/index.ts';
import { getSubtree } from '../../src/api/internal/graph_subtree.ts';
import type { LoopState } from '../../src/agent_loop/types.ts';
import type { ResearchPaperOutput } from '../../src/agent_loop/types.ts';
import type { SourceAnchor } from '../../src/evidence_log/types.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  ThresholdSpec,
  VerdictNode,
} from '../../src/falsifiability/types.ts';
import type { SourceCard } from '../../src/schema/enums.ts';
import type { GraphSubtree } from '../../src/api/types.ts';
import type { VerifyResult } from '../../src/evidence_log/types.ts';

import { openDb, createSequentialGateway } from './helpers.ts';

// ---------- raw input text ----------

/** Constant: A4_RAW_INPUT. */
export const A4_RAW_INPUT = [
  'Why don\'t planetary orbits decay? In classical mechanics, two-body orbits are stable,',
  'but general relativity predicts orbital energy loss via gravitational wave emission.',
  'For Hot Jupiter exoplanets with orbital periods < 10 days, tidal dissipation and',
  'gravitational radiation should cause measurable orbital period decay (dP/dt < 0).',
  'We investigate: what is the ranked list of Hot Jupiter systems by |dP/dt|,',
  'and which systems show statistically significant (≥3σ) period decay consistent',
  'with both tidal and GR predictions?',
].join(' ');

// ---------- SourceCard ----------

/** Constant: A4_SOURCE_CARD. */
export const A4_SOURCE_CARD: SourceCard = {
  // ⚠ DEMO FICTIONAL REFERENCE (NEEDS_HUMAN_OPERATION): the arXiv ID below was a synthetic
  // placeholder for this demo seed, NOT a real published paper. Hot-Jupiter orbital decay is a
  // genuine research field — see Patra et al. 2017 ApJL, Maciejewski et al. 2018, Yee et al. 2020
  // ApJL (WASP-12b). Replace with a real DOI / arXiv ID before any academic citation.
  sourceId: 'sc-a4-hotjupiter-2026',
  url: 'https://example.org/farlab-demo-fictional-ref-a4-hot-jupiter-decay',
  title: 'Hot Jupiter Orbital Decay: A Survey of Transit Timing Variations',
  sourceType: 'paper',
  publisher: 'arXiv / ADS',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: 'Hot Jupiters with P < 1 day show measurable dP/dt via TTV, consistent with tidal + GR predictions.',
  evidenceLevel: 'primary',
  stability: 'stable',
  usedFor: 'scientific_evidence',
};

// ---------- Fixture payloads（六阶段·天文学领域特定） ----------

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Investigate whether Hot Jupiter exoplanets exhibit measurable orbital period decay (dP/dt < 0) ' +
    'consistent with combined tidal dissipation and gravitational radiation predictions.',
  scope:
    'Hot Jupiter systems with orbital period P < 10 days, observed via transit timing variations (TTV) ' +
    'over ≥5-year baselines. Scope limited to systems with published O-C (observed minus calculated) diagrams.',
  keyTerms: [
    'Hot Jupiter',
    'orbital decay',
    'transit timing variation (TTV)',
    'tidal dissipation',
    'gravitational radiation',
    'O-C diagram',
    'dP/dt',
  ],
  falsifiableAngle:
    'Testable: rank Hot Jupiters by |dP/dt| magnitude, test whether systems with P < 1 day ' +
    'show dP/dt significantly more negative than systems with 1 < P < 10 days (Wilcoxon rank-sum).',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-a4-001',
      source: 'doi' as const,
      doi: '10.3847/1538-4357/ac8e9a',
      title: 'Tidal Dissipation in Hot Jupiter Systems: A Comprehensive Review',
    },
    {
      evidenceId: 'ev-a4-002',
      source: 'ads' as const,
      doi: null,
      title: 'Transit Timing Variations Catalog (TTVcat v3.0)',
    },
    {
      evidenceId: 'ev-a4-003',
      source: 'doi' as const,
      doi: '10.1038/s41586-023-05923-x',
      title: 'Gravitational Wave Background from Short-Period Exoplanets',
    },
  ],
  knowledgeGraphSummary:
    'Hot Jupiter orbital decay maps onto two competing mechanisms: (1) stellar tidal dissipation ' +
    '(dominant at P < 2 days) and (2) gravitational radiation (dominant at very short P, ~hours). ' +
    'Observed TTV catalogs contain ~200 systems with P < 10 days, of which ~30 have ≥5-year O-C baselines. ' +
    'Key gap: no published ranked list of systems by |dP/dt| with uncertainty quantification.',
  gaps: [
    'Incomplete O-C coverage for systems with P > 5 days',
    'TTV noise from stellar activity cycles (spot modulation)',
    'No standardized dP/dt uncertainty propagation across catalogs',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'Hot Jupiters with P < 1 day have |dP/dt| > 10 ms/yr at ≥3σ confidence, ' +
    'and TTV-derived dP/dt values are consistent with combined tidal+GR model within 2σ.',
  falsificationMethod: {
    prediction:
      'At least 5 Hot Jupiters with P < 1 day show |dP/dt| > 10 ms/yr at ≥3σ, ' +
      'and the median |dP/dt| for P<1d exceeds that for 1d<P<10d by factor ≥3.',
    metric: 'effect_size_cohens_d',
    comparator: 'gt' as const,
    value: 0.8,
  },
  supportingCitations: ['ev-a4-001', 'ev-a4-002'],
  scopeSlipText:
    'Scope limited to systems with published TTV O-C diagrams and ≥5-year baselines. ' +
    'Excludes systems where stellar activity dominates timing noise (spot modulation amplitude > 3× transit depth).',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-a4-e1',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.94,
      source: {
        evidenceId: 'ev-a4-001',
        source: 'doi' as const,
        doi: '10.3847/1538-4357/ac8e9a',
        title: 'Tidal Dissipation in Hot Jupiter Systems: A Comprehensive Review',
      },
    },
    {
      evidenceId: 'ev-a4-e2',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.87,
      source: {
        evidenceId: 'ev-a4-002',
        source: 'ads' as const,
        doi: null,
        title: 'Transit Timing Variations Catalog (TTVcat v3.0)',
      },
    },
    {
      evidenceId: 'ev-a4-e3',
      supportsOrRefutes: 'neutral' as const,
      entailmentScore: 0.55,
      source: {
        evidenceId: 'ev-a4-003',
        source: 'doi' as const,
        doi: '10.1038/s41586-023-05923-x',
        title: 'Gravitational Wave Background from Short-Period Exoplanets',
      },
    },
  ],
  conflictingEvidenceCount: 0,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: ['TTVcat v3.0', 'NASA Exoplanet Archive (NExScI)', 'ExoFOP-TESS'],
  methodChoices: [
    'Linear ephemeris fitting with O-C residual extraction',
    'Wilcoxon rank-sum test (P<1d vs 1d<P<10d dP/dt distributions)',
    'Combined tidal+GR model χ² goodness-of-fit',
  ],
  scheduleOrFeedback:
    'Phase 1: Query TTVcat for all Hot Jupiters with P<10d and baseline≥5yr. ' +
    'Phase 2: Fit linear+quadratic ephemerides per system, extract dP/dt with MCMC uncertainty. ' +
    'Phase 3: Rank by |dP/dt|, flag systems with ≥3σ significance.',
  executableChecks: [
    {
      ref: 'https://exoplanetarchive.ipac.caltech.edu',
      exists: true,
      checkedAt: '2026-06-27T00:00:00.000Z',
    },
    {
      ref: 'https://exofop.ipac.caltech.edu/tess/',
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
    'Converged: hypothesis is falsifiable (effect size threshold + statistical significance gate), ' +
    'evidence records support the claim with entailment scores 0.87-0.94.',
});

// ---------- FEC 三件套（FalsificationSpec + ThresholdSpec + EvidenceRecord[]）----------

const A4_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    'At least 5 Hot Jupiters with P < 1 day show |dP/dt| > 10 ms/yr at ≥3σ, ' +
    'and the median |dP/dt| for P<1d exceeds that for 1d<P<10d by factor ≥3.',
  metric: 'effect_size_cohens_d',
  falsificationThreshold: 0.8,
  thresholdSemantics: 'gt',
};

const A4_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 0.8,
};

// ---------- SourceAnchor ----------

const A4_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'a4'.repeat(20),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'a4'.repeat(32),
};

// ---------- DemoSeedResult（每个 seed 的统一产出契约）----------

/** Result/output structure for demo seed result. */
export interface DemoSeedResult {
  /** 原始输入文本 */
  readonly rawInput: string;
  /** 证据源卡片 */
  readonly sourceCard: SourceCard;
  /** 六阶段循环终态 */
  readonly loopState: LoopState;
  /** 裁决节点（FEC 编排层产出） */
  readonly verdictNode: VerdictNode;
  /** 复现哈希（从 call_records 链头取） */
  readonly reproHash: string;
  /** 证据图子树 */
  readonly graphSubtree: GraphSubtree;
  /** 链式验证结果 */
  readonly chainVerify: VerifyResult;
  /** 研究论文输出 */
  readonly paper: ResearchPaperOutput;
  /** 数据库实例（调用方负责 close） */
  readonly db: Database;
}

// ---------- runSeed ----------

/**
 * 执行 A4 行星轨道衰减 demo seed（完整 6-stage agent loop + FEC 编排）。
 *
 * 全程 offline_replay（不依赖真实 API）；fresh-clone 无 key 也能跑。
 *
 * @returns DemoSeedResult（含全部产出物·调用方负责 db.close()）
 */
export async function runA4Seed(): Promise<DemoSeedResult> {
  const db = openDb();

  // ① 构造六阶段 fixture payloads（JSON 字符串供 gateway 按序返回）
  const fixtureContents: readonly string[] = [
    JSON.stringify(makeUnderstandingPayload()),
    JSON.stringify(makeIntegrationPayload()),
    JSON.stringify(makeHypothesisPayload()),
    JSON.stringify(makeEvidencePayload()),
    JSON.stringify(makePlanPayload()),
    JSON.stringify(makeFeedbackPayloadConverge()),
  ];
  const gateway = createSequentialGateway(fixtureContents);

  // ② 跑六阶段 agent loop
  const state = await runAgentLoop({
    runId: 'demo-a4-planetary-orbit-decay',
    researchInput: A4_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'a4'.repeat(32),
    gitCommitSha: A4_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  // ③ FEC 编排：将 stage3 hypothesis 锚定为 VerdictNode
  const stage3 = state.artifacts[2];
  // discriminatedUnion narrow（R10·禁 as 强转）
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('A4 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  const a4Evidences: EvidenceRecord[] = [
    {
      claim: 'TTVcat systems with P<1d show median |dP/dt| = 15.3 ms/yr',
      metricValue: 0.92,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: A4_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: A4_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'a4-ev1-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim: 'Systems with 1d<P<10d show median |dP/dt| = 3.1 ms/yr',
      metricValue: -0.15,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: A4_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: A4_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'a4-ev2-hash'.repeat(4).padEnd(64, '0'),
      },
    },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'a4'.repeat(32),
        gitCommitSha: A4_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: A4_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: A4_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: A4_FALSIFICATION_SPEC,
    thresholdSpec: A4_THRESHOLD_SPEC,
    evidences: a4Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(a4Evidences, A4_FALSIFICATION_SPEC, A4_THRESHOLD_SPEC),
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'A4-PLANETARY-ORBIT-DECAY',
        falsificationSpec: A4_FALSIFICATION_SPEC,
        thresholdSpec: A4_THRESHOLD_SPEC,
        frozenAt: A4_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });

  // ④ 查 GraphSubtree
  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);

  // ⑤ 验证链式 hash
  const chainVerify = verifyChainHead(db);

  // ⑥ 组装论文
  const paper = assemblePaper(state);

  // ⑦ 取 reproHash（从 verdictNode.currentHash 或 chainHead）
  const reproHash = verdictResult.verdictNode.currentHash;

  return {
    rawInput: A4_RAW_INPUT,
    sourceCard: A4_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash,
    graphSubtree,
    chainVerify,
    paper,
    db,
  };
}
