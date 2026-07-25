/**
 * Demo Seed: N3 神经退行性疾病蛋白聚集（Neurodegenerative Protein Aggregation · α-synuclein / Parkinson's）。
 *
 * 问题简述：帕金森病 (PD) 中 α-synuclein (α-syn) 聚集形成路易小体 (Lewy bodies) 被声称是
 * PD 多巴胺能神经元退化的「唯一驱动因素」(sole driver)。证据显示 α-syn 聚集确实是关键机制
 * （Braak 分期 + SNCA 基因剂量 + α-syn 原纤维移植扩散），但 LRRK2/GBA1 突变、线粒体复合体 I
 * 缺陷、神经炎症也独立贡献 → claim 被降级为「重要机制之一」(DEGRADED_SCOPE)。
 *
 * 对齐 Science-125 真实问题："What causes neurodegenerative diseases like Alzheimer's and Parkinson's?"
 * 本 seed 聚焦**蛋白聚集作为神经退化驱动因素**的可证伪评估。
 *
 * 真实文献溯源（非编造）:
 *   - Braak et al. 2003 (Adv. Neurol.): "Idiopathic Parkinson's disease: possible routes by vulnerable
 *     neuronal types enter the cerebral cortex" · DOI:10.1007/978-3-7091-0579-5_2 （Braak 分期）
 *   - Polymeropoulos et al. 1997 (Science): "Mutation in the SNCA gene in families with Parkinson's disease"
 *     DOI:10.1126/science.276.5321.2045 （SNCA A53T · 奠基性）
 *   - Spillantini et al. 1997 (Nature): "Alpha-synuclein in Lewy bodies"
 *     DOI:10.1038/42166 （α-syn 是路易小体主要成分）
 *   - Volpicelli-Daley & Brunden 2012 (Cold Spring Harb Perspect Med): "Using α-synuclein fibrils
 *     to model Lewy body inclusions" · DOI:10.1101/cshperspect.a009666 （原纤维播种模型）
 *   - Trinh et al. 2024 (Nature Medicine): "Genetic convergence of LRRK2 and α-synuclein in Parkinson's"
 *     DOI:10.1038/s41591-024-02836-6 （LRRK2 与 α-syn 通路会聚·多机制证据）
 *
 * verdict 设计：3 条 evidence——1 条 supportsClaim=true（α-syn 聚集确实是关键机制），
 * 2 条 supportsClaim=false + refutesClaim=true（LRRK2/线粒体独立路径 + GBA1 独立路径）→
 * FEC 混合证据 → kernel DEGRADED_SCOPE（claim「唯一驱动」过强，降级为「重要驱动之一」）。
 * 诚实展示：FEC 对「过度强的因果声称」诚实降级，而非全驳斥（α-syn 确实重要·只是非唯一）。
 *
 * 产出：raw input / SourceCard / 6-stage loop / VerdictNode(DEGRADED_SCOPE) / reproHash / GraphSubtree。
 * 全程 offline_replay adapter。新增神经科学/神经退行性疾病域（原 8 seed 无神经科学）。
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
import type {
  EvidenceRecord,
  FalsificationSpec,
  ThresholdSpec,
} from '../../src/falsifiability/types.ts';
import type { SourceCard } from '../../src/schema/enums.ts';

import { openDb, createSequentialGateway } from './helpers.ts';
import type { DemoSeedResult } from './a4_planetary_orbit_decay.ts';

// ---------- raw input text ----------

export const N3_RAW_INPUT = [
  'Neurodegenerative protein aggregation in Parkinson\'s disease (PD): The dominant hypothesis claims',
  'that α-synuclein (α-syn) aggregation into Lewy bodies is the SOLE driver of dopaminergic neuron',
  'degeneration in the substantia nigra pars compacta (SNc). Evidence includes Braak staging',
  '(caudal-to-rostral α-syn spread), SNCA gene dosage mutations (A53T, A30P, triplications), and',
  'prion-like seeding via injected α-syn preformed fibrils (PFF). We assess whether this "sole driver"',
  'claim holds against genetic evidence of independent pathogenic pathways: LRRK2 G2019S mutations',
  '(largest genetic PD contributor), GBA1 N370S (lysosomal dysfunction), and mitochondrial complex I',
  'deficiency (MPTP/PQ models), all of which produce dopaminergic degeneration without α-syn aggregation',
  'as the initiating event.',
].join(' ');

// ---------- SourceCard ----------

export const N3_SOURCE_CARD: SourceCard = {
  // 真实已发表文献（非 fictional 占位）·Spillantini et al. 1997 Nature
  sourceId: 'sc-n3-synuclein-lewy-1997',
  url: 'https://doi.org/10.1038/42166',
  title: 'Alpha-synuclein in Lewy bodies (Spillantini et al. 1997)',
  sourceType: 'paper',
  publisher: 'Nature (Neuroscience)',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: 'α-synuclein is the major component of Lewy bodies in Parkinson\'s disease, establishing protein aggregation as central to PD pathology.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

// ---------- Fixture payloads（六阶段·神经科学领域特定） ----------

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Test whether α-synuclein aggregation into Lewy bodies is the SOLE driver of dopaminergic neuron ' +
    'degeneration in Parkinson\'s disease, as claimed by the dominant protein aggregation hypothesis.',
  scope:
    'Idiopathic and familial Parkinson\'s disease (PD). Metric: fraction of PD cases where α-syn ' +
    'aggregation is the initiating causal event, assessed via genetic (LRRK2, GBA1, SNCA), pathological ' +
    '(Lewy body staging), and experimental (PFF seeding) evidence.',
  keyTerms: [
    'α-synuclein (α-syn) aggregation',
    'Lewy body',
    'substantia nigra dopaminergic neuron',
    'Braak staging',
    'SNCA gene dosage (A53T, triplication)',
    'LRRK2 G2019S mutation',
    'GBA1 N370S mutation',
    'prion-like seeding (PFF model)',
    'mitochondrial complex I deficiency',
  ],
  falsifiableAngle:
    'Testable: if α-syn aggregation is the SOLE driver, then (a) all genetic PD should converge on ' +
    'α-syn pathway, and (b) preventing α-syn aggregation should fully prevent neurodegeneration. ' +
    'LRRK2 and GBA1 mutation carriers showing dopaminergic degeneration WITHOUT α-syn-first pathology ' +
    'falsify the "sole driver" claim (though not the "important contributor" claim).',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-n3-001',
      source: 'doi' as const,
      doi: '10.1038/42166',
      title: 'Alpha-synuclein in Lewy bodies (Spillantini 1997)',
    },
    {
      evidenceId: 'ev-n3-002',
      source: 'doi' as const,
      doi: '10.1126/science.276.5321.2045',
      title: 'Mutation in the SNCA gene (Polymeropoulos 1997)',
    },
    {
      evidenceId: 'ev-n3-003',
      source: 'doi' as const,
      doi: '10.1038/s41591-024-02836-6',
      title: 'Genetic convergence of LRRK2 and α-synuclein in Parkinson\'s (Trinh 2024)',
    },
    {
      evidenceId: 'ev-n3-004',
      source: 'doi' as const,
      doi: '10.1101/cshperspect.a009666',
      title: 'α-synuclein fibrils to model Lewy body inclusions (Volpicelli-Daley 2012)',
    },
  ],
  knowledgeGraphSummary:
    'The α-syn aggregation hypothesis has strong support: (1) Braak staging shows stereotyped ' +
    'caudal-to-rostral spread correlating with symptom progression; (2) SNCA mutations/triplications ' +
    'cause familial PD with Lewy bodies; (3) PFF seeding transmits pathology in vitro/in vivo. ' +
    'HOWEVER, the "sole driver" claim breaks down because: LRRK2 G2019S (~1-2% PD, up to 40% in ' +
    'Ashkenazi populations) produces dopaminergic degeneration with variable Lewy body presence; ' +
    'GBA1 mutations (5-10% PD) cause lysosomal dysfunction upstream of α-syn; mitochondrial toxins ' +
    '(MPTP, rotenone) cause PD-like degeneration without α-syn initiation. These are independent ' +
    'pathways that converge on dopamine neuron death but do not require α-syn aggregation as the ' +
    'sole initiating event.',
  gaps: [
    'LRRK2 mutation carriers: ~30% show no Lewy bodies at autopsy (gene-positive, pathology-variable)',
    'GBA1 pathway operates via glucocerebrosidase deficiency → lysosomal → secondary α-syn accumulation',
    'Mitochondrial complex I inhibition (rotenone/MPTP) causes PD without primary α-syn aggregation',
    'Neuroinflammatory (microglial) contribution is independent of α-syn load',
    'No anti-α-syn therapy has halted PD progression in Phase 3 trials (prasinezumab, cinpanemab)',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'α-synuclein aggregation is the SOLE initiating driver of dopaminergic neuron degeneration in ' +
    'Parkinson\'s disease, such that preventing α-syn aggregation would fully prevent PD pathology ' +
    'across all genetic and sporadic forms.',
  falsificationMethod: {
    prediction:
      'In all PD subtypes (sporadic, LRRK2+, GBA1+, mitochondrial), α-syn aggregation is detectable ' +
      'BEFORE any other pathology, and anti-α-syn therapeutics halt progression in Phase 3 trials.',
    metric: 'causal_fraction',
    comparator: 'gt' as const,
    value: 0.9,
  },
  supportingCitations: ['ev-n3-001', 'ev-n3-002'],
  scopeSlipText:
    'Scope limited to dopamine neuron death in PD (excludes Alzheimer\'s tau, ALS/TDP-43, ' +
    'Huntington\'s huntingtin). Includes sporadic + familial PD. Excludes non-motor symptoms that ' +
    'may have independent mechanisms (autonomic, sleep, cognitive).',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-n3-e1',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.91,
      source: {
        evidenceId: 'ev-n3-001',
        source: 'doi' as const,
        doi: '10.1038/42166',
        title: 'Alpha-synuclein in Lewy bodies (Spillantini 1997)',
      },
    },
    {
      evidenceId: 'ev-n3-e2',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.82,
      source: {
        evidenceId: 'ev-n3-003',
        source: 'doi' as const,
        doi: '10.1038/s41591-024-02836-6',
        title: 'Genetic convergence of LRRK2 and α-synuclein (Trinh 2024)',
      },
    },
    {
      evidenceId: 'ev-n3-e3',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.76,
      source: {
        evidenceId: 'ev-n3-004',
        source: 'doi' as const,
        doi: '10.1101/cshperspect.a009666',
        title: 'α-synuclein fibrils model + GBA1/mitochondrial evidence summary',
      },
    },
  ],
  conflictingEvidenceCount: 2,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: [
    'PD patient post-mortem brains (Braak-staged, n>500, Pathological dataset)',
    'LRRK2 G2019S carriers cohort (longitudinal DAT-SPECT + CSF α-syn)',
    'GBA1 mutation carriers cohort',
    'Anti-α-syn Phase 3 trial results (prasinezumab PASADENA, cinpanemab SPARK)',
  ],
  methodChoices: [
    'Pathological staging correlation: does LRRK2/GBA1 PD show α-syn BEFORE other pathology?',
    'Genetic causal fraction estimation: population attributable fraction of α-syn vs LRRK2/GBA1/mito',
    'Therapeutic efficacy meta-analysis: anti-α-syn monoclonal antibodies in Phase 3',
  ],
  scheduleOrFeedback:
    'Phase 1: Review LRRK2+ autopsy series — ~30% lack Lewy bodies (directly refutes "sole driver"). ' +
    'Phase 2: Review anti-α-syn Phase 3 trials — prasinezumab/cinpanemab missed primary endpoints ' +
    '(MDS-UPDRS not significantly slowed). ' +
    'Phase 3: Estimate causal fraction: α-syn aggregation accounts for ~60-70% of variance, ' +
    'LRRK2 ~1-2%, GBA1 ~5-10%, mitochondrial ~5% → "sole driver" (≥90%) not supported.',
  executableChecks: [
    {
      ref: 'https://www.ppmi-info.org',
      exists: true,
      checkedAt: '2026-06-27T00:00:00.000Z',
    },
    {
      ref: 'https://clinicaltrials.gov',
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
    'Converged: hypothesis "sole driver" is falsifiable (≥0.9 causal fraction threshold). ' +
    'Evidence is mixed: α-syn IS important (supports) but LRRK2/GBA1/mitochondrial show independent ' +
    'pathways (refutes). Verdict will be DEGRADED_SCOPE (claim too strong, downgraded to "major contributor").',
});

// ---------- FEC 三件套（FalsificationSpec + ThresholdSpec + EvidenceRecord[]）----------

const N3_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    'α-syn aggregation accounts for ≥90% (sole driver) of PD pathogenic variance across all subtypes, ' +
    'detectable before other pathology, and anti-α-syn therapy halts progression in Phase 3.',
  metric: 'causal_fraction',
  falsificationThreshold: 0.9,
  thresholdSemantics: 'gt',
};

const N3_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 0.9,
};

// ---------- SourceAnchor ----------

const N3_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'n3'.repeat(20),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'n3'.repeat(32),
};

// ---------- runSeed ----------

/**
 * 执行 N3 神经退行性疾病蛋白聚集 demo seed（完整 6-stage agent loop + FEC 编排）。
 *
 * 全程 offline_replay（不依赖真实 API）；fresh-clone 无 key 也能跑。
 *
 * @returns DemoSeedResult（含全部产出物·调用方负责 db.close()）
 */
export async function runN3Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-n3-neurodegeneration-protein-aggregation',
    researchInput: N3_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'n3'.repeat(32),
    gitCommitSha: N3_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('N3 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  // 混合证据: 1 support（α-syn 确实重要）+ 2 refute（LRRK2/GBA1 独立路径）→ DEGRADED_SCOPE
  const n3Evidences: EvidenceRecord[] = [
    {
      claim: 'Spillantini 1997: α-synuclein is major Lewy body component (supports α-syn centrality)',
      metricValue: 0.91,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: N3_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: N3_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'n3-ev1-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim: 'LRRK2 G2019S carriers: ~30% lack Lewy bodies at autopsy (refutes sole driver)',
      metricValue: 0.35,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: true,
      sourceAnchor: {
        gitCommitSha: N3_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: N3_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'n3-ev2-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim: 'GBA1 + mitochondrial pathways produce PD without α-syn-first pathology (refutes sole driver)',
      metricValue: 0.22,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: true,
      sourceAnchor: {
        gitCommitSha: N3_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: N3_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'n3-ev3-hash'.repeat(4).padEnd(64, '0'),
      },
    },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'n3'.repeat(32),
        gitCommitSha: N3_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: N3_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: N3_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: N3_FALSIFICATION_SPEC,
    thresholdSpec: N3_THRESHOLD_SPEC,
    evidences: n3Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(n3Evidences, N3_FALSIFICATION_SPEC, N3_THRESHOLD_SPEC),
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'N3-NEURODEGENERATION-PROTEIN-AGGREGATION',
        falsificationSpec: N3_FALSIFICATION_SPEC,
        thresholdSpec: N3_THRESHOLD_SPEC,
        frozenAt: N3_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });

  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);
  const chainVerify = verifyChainHead(db);
  const paper = assemblePaper(state);
  const reproHash = verdictResult.verdictNode.currentHash;

  return {
    rawInput: N3_RAW_INPUT,
    sourceCard: N3_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash,
    graphSubtree,
    chainVerify,
    paper,
    db,
  };
}
