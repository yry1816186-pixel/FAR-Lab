/**
 * Demo Seed: B3 CRISPR-Cas9 脱靶效应（Off-target Effects · 基因组编辑精准性）。
 *
 * 问题简述：CRISPR-Cas9 声称「脱靶编辑率 < 0.1%（媲美自然突变背景）」。但大规模脱靶检测
 * （GUIDE-seq / CIRCLE-seq / Digenome-seq）显示脱靶率因 sgRNA/cell type/chromatin 状态高度变异
 * （0.01% - 3%）→ INCONCLUSIVE（部分设计达标·部分不达标·无统一结论）。
 *
 * 对齐 Science-125 真实问题："How can gene editing be made safe enough for clinical use?"。
 *
 * 真实文献溯源（非编造）:
 *   - Tsai et al. 2015 (Nature Biotechnology): "GUIDE-seq enables genome-wide profiling of off-target"
 *     DOI:10.1038/nbt.3117 （GUIDE-seq 方法·发现更多脱靶位点）
 *   - Tsai & Joung 2016 (Nature Reviews Genetics): "Defining and improving the genome-wide specificities"
 *     DOI:10.1038/nrg.2016.28 （脱靶检测方法综述）
 *   - Anzalone et al. 2019 (Nature): "Search-and-replace genome editing without double-strand breaks"
 *     DOI:10.1038/s41586-019-1711-4 （prime editing·更精准·脱靶更低）
 *   - Kosicki et al. 2018 (Nature Biotechnology): "Repair of double-strand breaks leads to large deletions"
 *     DOI:10.1038/nbt.4192 （意外大片段缺失+复杂染色体重排）
 *   - Doench et al. 2016 (Nature Biotechnology): "Optimized sgRNA design to maximize activity + minimize"
 *     DOI:10.1038/nbt.3437 （sgRNA 设计规则·Rule Set 2）
 *
 * verdict 设计：2 support（prime editing 脱靶更低 + 优化 sgRNA 设计降低脱靶·方向支持）+ 1 refute
 * （GUIDE-seq 实测脱靶 0.01-3% 因位点高度变异·部分远超 0.1%）→ R5 INCONCLUSIVE（矛盾证据）。
 *
 * 产出：raw input / SourceCard / 6-stage loop / VerdictNode(INCONCLUSIVE) / reproHash / GraphSubtree。
 * 全程 offline_replay adapter。新增基因组学域。
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

/** Constant: B3_RAW_INPUT. */
export const B3_RAW_INPUT = [
  'CRISPR-Cas9 off-target effects: Gene therapy claims that CRISPR-Cas9 achieves off-target editing',
  'rate <0.1% (comparable to spontaneous mutation background), enabling safe clinical use. We assess',
  'whether this claim holds against genome-wide off-target detection (GUIDE-seq, CIRCLE-seq, Digenome-seq),',
  'which reveal off-target rates ranging from 0.01% to 3% depending on sgRNA design, target site, chromatin',
  'state, and cell type. The claim is further complicated by: (1) prime editing (Anzalone 2019) achieving',
  'lower off-target rates, (2) unexpected large deletions and chromosomal rearrangements (Kosicki 2018),',
  'and (3) p53-mediated selection bias in primary cells. We assess whether "<0.1% universally" is supported.',
].join(' ');

// ---------- SourceCard ----------

/** Constant: B3_SOURCE_CARD. */
export const B3_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-b3-tsai-guide-seq-2015',
  url: 'https://doi.org/10.1038/nbt.3117',
  title: 'GUIDE-seq enables genome-wide profiling of off-target cleavage (Tsai 2015)',
  sourceType: 'paper',
  publisher: 'Nature Biotechnology',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: 'GUIDE-seq reveals CRISPR-Cas9 off-target sites genome-wide; rates range 0.01%-3% by sgRNA and cell type.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

// ---------- Fixture payloads（六阶段·基因组学特定） ----------

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Test whether CRISPR-Cas9 achieves off-target editing rate <0.1% universally (comparable to spontaneous ' +
    'mutation background), as claimed for safe clinical gene therapy.',
  scope:
    'CRISPR-Cas9 (SpCas9) with diverse sgRNAs across human cell lines (HEK293, K562, iPSCs, primary T-cells). ' +
    'Metric: off-target indel frequency at GUIDE-seq/CIRCLE-seq/Digenome-seq detected sites, normalized to ' +
    'on-target efficiency.',
  keyTerms: [
    'CRISPR-Cas9 (SpCas9)',
    'single guide RNA (sgRNA)',
    'off-target editing',
    'GUIDE-seq (genome-wide off-target detection)',
    'CIRCLE-seq / Digenome-seq (in vitro off-target)',
    'prime editing (PE2/PE3 · Anzalone 2019)',
    'p53-mediated selection bias',
    'large deletion / chromosomal rearrangement (Kosicki)',
  ],
  falsifiableAngle:
    'Testable: off-target rate <0.1% at ALL GUIDE-seq detected sites, across ALL cell types, for ALL sgRNAs. ' +
    'If any sgRNA/cell-type combination shows >0.1% at any site, the "universally safe" claim is falsified.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-b3-001',
      source: 'doi' as const,
      doi: '10.1038/nbt.3117',
      title: 'GUIDE-seq off-target profiling (Tsai 2015)',
    },
    {
      evidenceId: 'ev-b3-002',
      source: 'doi' as const,
      doi: '10.1038/s41586-019-1711-4',
      title: 'Prime editing search-and-replace (Anzalone 2019)',
    },
    {
      evidenceId: 'ev-b3-003',
      source: 'doi' as const,
      doi: '10.1038/nbt.4192',
      title: 'Large deletions from DSB repair (Kosicki 2018)',
    },
    {
      evidenceId: 'ev-b3-004',
      source: 'doi' as const,
      doi: '10.1038/nbt.3437',
      title: 'Optimized sgRNA design Rule Set 2 (Doench 2016)',
    },
  ],
  knowledgeGraphSummary:
    'CRISPR off-target specificity depends on: (1) sgRNA sequence (seed region tolerance to mismatches), ' +
    '(2) chromatin accessibility (open chromatin = more off-target), (3) cell type (expression of DNA repair ' +
    'factors varies), (4) Cas9 variant (SpCas9-HF1, eSpCas9 have improved specificity but trade off on-target). ' +
    'GUIDE-seq (Tsai 2015) revealed off-targets missed by PCR-based assays, with rates 0.01-3%. Prime editing ' +
    '(Anzalone 2019) eliminates DSB → much lower off-target (<0.1%) but at cost of editing efficiency (1-50%). ' +
    'Unexpected large deletions (Kosicki 2018) at on-target site are a SEPARATE safety concern not captured ' +
    'by off-target rate. Key insight: "off-target <0.1%" is achievable for PRIME editing with optimized sgRNA ' +
    'but NOT universally for standard Cas9.',
  gaps: [
    'Off-target rate 0.01-3% — 300x variation across sgRNA/cell-type combinations',
    'Large deletions + complex rearrangements at on-target site (Kosicki 2018) not in off-target metric',
    'p53 selection bias: cells with efficient repair (often cancer-prone) are preferentially edited',
    'Prime editing efficiency 1-50% (vs Cas9 60-95%) — lower efficiency limits clinical use',
    'In vivo off-target detection is harder than in vitro (tissue heterogeneity)',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'CRISPR-Cas9 achieves off-target editing rate <0.1% universally (at all detectable sites, all cell types, ' +
    'all sgRNAs), enabling safe clinical gene therapy without individual sgRNA validation.',
  falsificationMethod: {
    prediction:
      'GUIDE-seq + CIRCLE-seq + Digenome-seq on ≥50 sgRNAs across ≥3 cell types show <0.1% off-target at ' +
      'ALL detected sites, with no large deletions or chromosomal rearrangements at on-target sites.',
    metric: 'max_offtarget_rate',
    comparator: 'lt' as const,
    value: 0.001,
  },
  supportingCitations: ['ev-b3-002', 'ev-b3-004'],
  scopeSlipText:
    'Scope: standard SpCas9 ribonucleoprotein delivery. Excludes prime editing and base editing (separate ' +
    'platforms with different off-target profiles). Cell types: HEK293, K562, iPSC, primary T-cells.',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-b3-e1',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.80,
      source: {
        evidenceId: 'ev-b3-004',
        source: 'doi' as const,
        doi: '10.1038/nbt.3437',
        title: 'Optimized sgRNA design reduces off-target (Doench 2016)',
      },
    },
    {
      evidenceId: 'ev-b3-e2',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.75,
      source: {
        evidenceId: 'ev-b3-002',
        source: 'doi' as const,
        doi: '10.1038/s41586-019-1711-4',
        title: 'Prime editing off-target <0.1% (Anzalone 2019)',
      },
    },
    {
      evidenceId: 'ev-b3-e3',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.88,
      source: {
        evidenceId: 'ev-b3-001',
        source: 'doi' as const,
        doi: '10.1038/nbt.3117',
        title: 'GUIDE-seq shows 0.01-3% off-target variation (Tsai 2015)',
      },
    },
  ],
  conflictingEvidenceCount: 1,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: [
    'GUIDE-seq datasets: ≥50 sgRNAs × 3 cell types (HEK293, K562, iPSC)',
    'CIRCLE-seq in vitro: ~500 sgRNAs genome-wide cleavage sites',
    'Prime editing datasets: PE3 off-target rates',
  ],
  methodChoices: [
    'Max off-target rate across all sites per sgRNA (worst-case analysis)',
    'Off-target rate distribution (median + 95th percentile)',
    'Large deletion frequency at on-target site (long-read sequencing)',
  ],
  scheduleOrFeedback:
    'Phase 1: GUIDE-seq meta-analysis — off-target rates 0.01-3% (300x range). Phase 2: Some sgRNAs <0.1%, ' +
    'others 0.5-3%. Phase 3: Prime editing <0.1% but lower on-target efficiency. Conclusion: "<0.1% universally" ' +
    'is NOT supported for standard Cas9; IS supported for prime editing with optimized sgRNA. The claim is ' +
    'context-dependent → INCONCLUSIVE.',
  executableChecks: [
    {
      ref: 'https://www.synthego.com/blogs/crispr-off-target',
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
    'Converged: hypothesis "<0.1% universally" is falsifiable. Evidence contradictory: optimized sgRNA + prime ' +
    'editing support, but GUIDE-seq shows 0.01-3% variation refutes universality. Verdict = INCONCLUSIVE.',
});

// ---------- FEC 三件套 ----------

const B3_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    'GUIDE-seq + CIRCLE-seq across ≥50 sgRNAs × 3 cell types show max off-target <0.1% at all sites, ' +
    'no large deletions, for standard SpCas9.',
  metric: 'max_offtarget_rate',
  falsificationThreshold: 0.001,
  thresholdSemantics: 'lt',
};

const B3_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'lt',
  value: 0.001,
};

// ---------- SourceAnchor ----------

const B3_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b3'.repeat(20),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'b3'.repeat(32),
};

// ---------- runSeed ----------

/**
 * run b3 seed.
 */
export async function runB3Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-b3-crispr-offtarget',
    researchInput: B3_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'b3'.repeat(32),
    gitCommitSha: B3_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('B3 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  // 2 support（优化 sgRNA + prime editing）+ 1 refute（GUIDE-seq 0.01-3% 变异）→ R5 INCONCLUSIVE
  const b3Evidences: EvidenceRecord[] = [
    {
      claim: 'Doench 2016 Rule Set 2: optimized sgRNA design reduces off-target to <0.1% for best designs',
      metricValue: 0.0008,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: B3_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: B3_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'b3-ev1-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim: 'Anzalone 2019 prime editing: no DSB, off-target <0.1% across tested sites',
      metricValue: 0.0005,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: B3_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: B3_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'b3-ev2-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim: 'Tsai 2015 GUIDE-seq: off-target 0.01-3% (300x range) — worst sgRNAs far exceed 0.1% threshold',
      metricValue: 0.03,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: B3_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: B3_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'b3-ev3-hash'.repeat(4).padEnd(64, '0'),
      },
    },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'b3'.repeat(32),
        gitCommitSha: B3_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: B3_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: B3_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: B3_FALSIFICATION_SPEC,
    thresholdSpec: B3_THRESHOLD_SPEC,
    evidences: b3Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(b3Evidences, B3_FALSIFICATION_SPEC, B3_THRESHOLD_SPEC),
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'B3-CRISPR-OFFTARGET',
        falsificationSpec: B3_FALSIFICATION_SPEC,
        thresholdSpec: B3_THRESHOLD_SPEC,
        frozenAt: B3_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });

  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);
  const chainVerify = verifyChainHead(db);
  const paper = assemblePaper(state);
  const reproHash = verdictResult.verdictNode.currentHash;

  return {
    rawInput: B3_RAW_INPUT,
    sourceCard: B3_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash,
    graphSubtree,
    chainVerify,
    paper,
    db,
  };
}
