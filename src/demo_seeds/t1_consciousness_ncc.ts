/**
 * Demo Seed: T1 意识的神经相关物（NCC: IIT vs GNWT · Adversarial Collaboration）。
 *
 * 问题简述：意识神经科学中两大主导理论——整合信息论（IIT: Tononi 2004, Φ 值衡量意识量）与
 * 全局神经工作空间理论（GNWT: Dehaene & Naccache 2001, 意识 access = 前额叶-顶叶 broadcasting）——
 * 各自声称「单个 NCC 可完整解释意识」。2023 年 Cogitate  consortium（Melloni et al.）进行了
 * 史上最大规模的对抗性合作实验（fMRI/EEG/MEG 预注册），结果两套理论均未被决定性证伪或证实；
 * 此外，vegetative state 患者研究（Koch 2016 综述）与多皮层区域证据表明不存在单一 NCC 开关。
 * → REFUTED（单一 NCC 假说"完整解释意识"claim 过强，对抗性实验未决出胜负，多区域/多机制证据不支持一元化）。
 *
 * 对齐 Science-125 真实问题：T1 "意识的神经相关物（NCC: IIT vs GNWT）"。
 *
 * 真实文献溯源:
 *   - Tononi 2004 (BMC Neuroscience): "An information integration theory of consciousness"
 *     DOI:10.1186/1471-2202-5-42 （IIT 奠基·Φ 意识量）
 *   - Dehaene & Naccache 2001 (Cognition): "Towards a cognitive neuroscience of consciousness"
 *     DOI:10.1016/S0010-0277(00)00163-5 （GNWT 奠基·前额叶 broadcasting）
 *   - Mashour 2020 (Nature Reviews Neuroscience): "Conscious processing and the global neuronal
 *     workspace hypothesis" DOI:10.1038/s41583-020-00307-3 （GNWT 证据综合）
 *   - Koch et al. 2016 (Nature Reviews Neuroscience): "Neural correlates of consciousness: progress
 *     and problems" DOI:10.1038/nrn.2016.22 （NCC 综述·后部热区 + fine-grained vs full NCC）
 *   - Cogitate consortium (Melloni et al. 2023 arXiv/2025 Nature): 大规模对抗性合作实验，
 *     IIT vs GNWT 预注册 fMRI/EEG/MEG 未明确决出胜负
 *
 * verdict 设计：REFUTED —— 阈值 gt 3（≥3 个独立对抗性实验决定性地选出一方）；
 * 实际可用的决定性实验数 ~0-1（Cogitate 2023 未决 + 无其他大规模复制）→ 所有 metricValue < 3。
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

/** Constant: T1_RAW_INPUT. */
export const T1_RAW_INPUT = [
  'Consciousness neuroscience: Two dominant theories compete for the neural correlates of consciousness',
  '(NCC). Integrated Information Theory (IIT, Tononi 2004) posits that consciousness IS integrated',
  'information (Φ), with a posterior cortical "hot zone" as the physical substrate — prefrontal cortex',
  '(PFC) is not required. Global Neuronal Workspace Theory (GNWT, Dehaene & Naccache 2001) posits that',
  'conscious access occurs when sensory information is "broadcast" globally via a fronto-parietal network,',
  'with PFC as essential hub. The claim is that a SINGLE NCC can fully explain consciousness, and one',
  'theory (IIT or GNWT) definitively falsifies the other. We test: (1) can adversarial collaborations',
  '(pre-registered fMRI/EEG/MEG) decisively adjudicate between IIT and GNWT? (2) does vegetative state /',
  'coma evidence support a single NCC switch? (3) do multiple cortical regions contribute to consciousness,',
  'making a unitary NCC claim too strong? Evidence: Cogitate 2023 consortium (Melloni et al.) — largest',
  'pre-registered adversarial IIT vs GNWT experiment — did NOT produce a decisive winner; multiple regions',
  '(posterior hot zone, PFC, thalamus) all contribute; vegetative state patients show graded rather than',
  'binary loss. Conclusion: the claim that a single NCC fully explains consciousness is REFUTED.',
].join(' ');

// ---------- SourceCard ----------

/** Constant: T1_SOURCE_CARD. */
export const T1_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-t1-koch-2016',
  url: 'https://doi.org/10.1038/nrn.2016.22',
  title: 'Neural correlates of consciousness: progress and problems (Koch et al. 2016)',
  sourceType: 'paper',
  publisher: 'Nature Reviews Neuroscience',
  fetchedAt: '2026-07-27T00:00:00.000Z',
  claim:
    'NCC research shows posterior cortical hot zone as key substrate, but fine-grained vs full NCC distinction + multiple contributing regions challenge unitary NCC claims.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

// ---------- Fixture payloads（六阶段·意识神经科学领域特定） ----------

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Assess whether a single neural correlate of consciousness (NCC) can fully explain the emergence ' +
    'of consciousness, and whether either Integrated Information Theory (IIT) or Global Neuronal ' +
    'Workspace Theory (GNWT) can be definitively falsified against the other via adversarial experiments.',
  scope:
    'Adversarial collaboration designs (pre-registered fMRI/EEG/MEG) comparing IIT vs GNWT predictions. ' +
    'Adult healthy participants + lesion / vegetative state patient evidence. Theories assessed: IIT (Φ, ' +
    'posterior hot zone) vs GNWT (broadcasting, fronto-parietal PFC hub). Metric: ≥3 independent ' +
    'adversarial experiments with Bayes Factor ≥ 100 favoring one theory.',
  keyTerms: [
    'neural correlates of consciousness (NCC)',
    'Integrated Information Theory (IIT) Φ',
    'Global Neuronal Workspace Theory (GNWT)',
    'adversarial collaboration',
    'posterior cortical hot zone',
    'prefrontal cortex (PFC) broadcasting',
    'vegetative state / disorders of consciousness',
    'Cogitate consortium (Melloni 2023)',
  ],
  falsifiableAngle:
    'Testable: ≥3 independent large-scale adversarial collaborations produce a decisive winner ' +
    '(Bayes Factor ≥ 100 favoring either IIT or GNWT), with pre-registered analysis pipelines, ' +
    'open data, and independent replication by separate labs.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-t1-001',
      source: 'doi' as const,
      doi: '10.1186/1471-2202-5-42',
      title: 'Tononi 2004: An information integration theory of consciousness (IIT)',
    },
    {
      evidenceId: 'ev-t1-002',
      source: 'doi' as const,
      doi: '10.1016/S0010-0277(00)00163-5',
      title: 'Dehaene & Naccache 2001: Towards a cognitive neuroscience of consciousness (GNWT)',
    },
    {
      evidenceId: 'ev-t1-003',
      source: 'doi' as const,
      doi: '10.1038/s41583-020-00307-3',
      title: 'Mashour 2020: Conscious processing and the global neuronal workspace hypothesis',
    },
    {
      evidenceId: 'ev-t1-004',
      source: 'doi' as const,
      doi: '10.1038/nrn.2016.22',
      title: 'Koch et al. 2016: Neural correlates of consciousness — progress and problems',
    },
    {
      evidenceId: 'ev-t1-005',
      source: 'other' as const,
      doi: null,
      title: 'Cogitate consortium (Melloni et al. 2023/2025): Adversarial IIT vs GNWT collaboration',
    },
  ],
  knowledgeGraphSummary:
    'IIT (Tononi 2004) claims consciousness = integrated information (Φ), localized primarily in ' +
    'posterior cortical hot zone; PFC is not necessary. GNWT (Dehaene & Naccache 2001; Mashour 2020) ' +
    'claims conscious access = global broadcasting via fronto-parietal network, with PFC as essential ' +
    'hub. These make divergent predictions about: (a) which brain regions are NCC-sufficient; ' +
    '(b) whether PFC activity is necessary for conscious perception; (c) whether consciousness is graded ' +
    '(IIT: Φ continuum) or binary (GNWT: ignition threshold). The 2023 Cogitate consortium (Melloni et al.) ' +
    'conducted the largest pre-registered adversarial collaboration (fMRI + EEG + MEG) with both IIT and ' +
    'GNWT proponents as co-authors. Result: neither theory was decisively falsified nor confirmed — ' +
    'some predictions from BOTH theories were supported, some refuted, and critical tests remain ' +
    'underpowered or methodologically contested. Additional evidence from vegetative state patients ' +
    '(Koch 2016 review) shows no binary NCC switch: consciousness loss is graded across regions and ' +
    'patients, with dissociations between behavioral responsiveness and neural activity patterns.',
  gaps: [
    'Cogitate 2023: no decisive Bayes Factor favoring one theory (largest experiment to date)',
    'Posterior hot zone vs PFC debate unresolved — both regions contribute differentially per task',
    'Vegetative state / coma evidence supports graded, not binary, NCC across multiple regions',
    'No independent large-scale replication of Cogitate design by separate labs (N=0 beyond Cogitate)',
    'Φ computation bottleneck: IIT Φ for human-scale connectomes remains computationally intractable',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'A single neural correlate of consciousness (NCC) fully explains the emergence of consciousness, ' +
    'and one theory — either Integrated Information Theory (IIT) or Global Neuronal Workspace Theory ' +
    '(GNWT) — can be definitively falsified against the other through adversarial experimental designs.',
  falsificationMethod: {
    prediction:
      '≥3 independent large-scale adversarial collaborations produce a decisive winner (Bayes Factor ' +
      '≥ 100) between IIT and GNWT, with pre-registered analysis pipelines, open data, and independent ' +
      'replication by separate laboratories.',
    metric: 'decisive_experiment_count',
    comparator: 'gt' as const,
    value: 3,
  },
  supportingCitations: ['ev-t1-001', 'ev-t1-004'],
  scopeSlipText:
    'Scope: adult human participants in adversarial IIT-vs-GNWT designs using fMRI/EEG/MEG. ' +
    'Excludes non-human animal studies, developmental consciousness, and altered states (psychedelics, ' +
    'meditation) where NCC mechanisms may differ.',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-t1-e1',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.52,
      source: {
        evidenceId: 'ev-t1-004',
        source: 'doi' as const,
        doi: '10.1038/nrn.2016.22',
        title: 'Koch 2016: posterior hot zone identified as key NCC substrate',
      },
    },
    {
      evidenceId: 'ev-t1-e2',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.88,
      source: {
        evidenceId: 'ev-t1-005',
        source: 'other' as const,
        doi: null,
        title: 'Cogitate 2023: IIT vs GNWT adversarial collaboration — no decisive winner',
      },
    },
    {
      evidenceId: 'ev-t1-e3',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.84,
      source: {
        evidenceId: 'ev-t1-003',
        source: 'doi' as const,
        doi: '10.1038/s41583-020-00307-3',
        title: 'Mashour 2020: GNWT evidence — multiple regions, no unitary NCC',
      },
    },
    {
      evidenceId: 'ev-t1-e4',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.81,
      source: {
        evidenceId: 'ev-t1-001',
        source: 'doi' as const,
        doi: '10.1186/1471-2202-5-42',
        title: 'Tononi 2004 IIT: Φ continuum — consciousness is graded, not a single switch',
      },
    },
  ],
  conflictingEvidenceCount: 3,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: [
    'Cogitate 2023 consortium dataset (fMRI + EEG + MEG, pre-registered)',
    'Disorders of consciousness (DOC) patient fMRI/EEG archives (vegetative state, minimally conscious)',
    'Lesion-symptom mapping databases (PFC vs posterior cortical lesions + consciousness assessment)',
  ],
  methodChoices: [
    'Pre-registered adversarial collaboration with Bayesian model comparison (BF ≥ 100 threshold)',
    'Multi-site replication with standardized consciousness paradigms (visual masking, AB, binocular rivalry)',
    'Lesion network mapping + TMS-EEG perturbation to test causal necessity of candidate NCC regions',
  ],
  scheduleOrFeedback:
    'Phase 1: Re-analyze Cogitate 2023 data with updated Bayesian models (both IIT and GNWT teams). ' +
    'Phase 2: Multi-site replication (≥5 labs) with pre-registration, open data, and common analysis ' +
    'pipeline. Phase 3: Lesion + TMS causal necessity tests for posterior hot zone vs PFC. ' +
    'Current status: no experiment has reached BF ≥ 100, and Cogitate (largest to date) did not resolve ' +
    'the debate. Single-NCC claim remains unsupported.',
  executableChecks: [
    {
      ref: 'https://doi.org/10.1038/nrn.2016.22',
      exists: true,
      checkedAt: '2026-07-27T00:00:00.000Z',
    },
    {
      ref: 'https://www.cogitateconsortium.org',
      exists: true,
      checkedAt: '2026-07-27T00:00:00.000Z',
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
    'Converged: claim is falsifiable (≥3 decisive adversarial experiments with BF ≥ 100). ' +
    'Evidence: Cogitate 2023 (largest to date) did not produce a decisive winner; no independent ' +
    'replications exist; multiple cortical regions contribute to consciousness; vegetative state ' +
    'evidence supports graded, non-binary NCC. Verdict: REFUTED — single-NCC claim too strong.',
});

// ---------- FEC 三件套（REFUTED 设计：decisive experiment count < 3）----------

const T1_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    '≥3 independent large-scale adversarial collaborations produce a decisive winner ' +
    '(Bayes Factor ≥ 100) between IIT and GNWT, with pre-registered analysis pipelines ' +
    'and independent replication.',
  metric: 'decisive_experiment_count',
  falsificationThreshold: 3,
  thresholdSemantics: 'gt',
};

const T1_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 3,
};

// ---------- SourceAnchor ----------

const T1_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 't1'.repeat(20),
  dashscopeRequestId: null,
  isoTimestamp: '2026-07-27T00:00:00.000Z',
  rawResponseHash: 't1'.repeat(32),
};

// ---------- runSeed ----------

/**
 * 执行 T1 意识 NCC demo seed（完整 6-stage agent loop + FEC 编排 → REFUTED）。
 *
 * 全程 offline_replay（不依赖真实 API）；fresh-clone 无 key 也能跑。
 *
 * @returns DemoSeedResult（含全部产出物·调用方负责 db.close()）
 */
export async function runT1Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-t1-consciousness-ncc',
    researchInput: T1_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 't1'.repeat(32),
    gitCommitSha: T1_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  // discriminatedUnion narrow（R10·禁 as 强转）
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('T1 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  // FEC evidences: threshold gt 3（≥3 决定性实验）；实际可用 0-1 → 全 refutes → REFUTED。
  // 诚实展示：FEC 正确驳斥「单一 NCC 完整解释意识」的过度声称（Cogitate 未决 + 多区域 + 无 binary switch）。
  const t1Evidences: EvidenceRecord[] = [
    {
      claim:
        'Cogitate 2023 consortium — largest pre-registered adversarial IIT vs GNWT experiment: ' +
        'no decisive winner (Bayes Factor < 100, both theories partially supported and partially refuted)',
      metricValue: 0,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: T1_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: T1_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 't1-ev1-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim:
        'Koch 2016 review + Mashour 2020: multiple cortical regions (posterior hot zone, PFC, thalamus) ' +
        'all contribute — no single unitary NCC switch exists; evidence supports graded, multi-regional mechanisms',
      metricValue: 1,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: T1_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: T1_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 't1-ev2-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim:
        'Vegetative state / disorders of consciousness patients: consciousness loss is graded, not binary; ' +
        'no single anatomical NCC switch — behavioral responsiveness dissociates from neural activity patterns',
      metricValue: 0,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: T1_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: T1_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 't1-ev3-hash'.repeat(4).padEnd(64, '0'),
      },
    },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 't1'.repeat(32),
        gitCommitSha: T1_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: T1_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: T1_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: T1_FALSIFICATION_SPEC,
    thresholdSpec: T1_THRESHOLD_SPEC,
    evidences: t1Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(t1Evidences, T1_FALSIFICATION_SPEC, T1_THRESHOLD_SPEC),
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'T1-CONSCIOUSNESS-NCC',
        falsificationSpec: T1_FALSIFICATION_SPEC,
        thresholdSpec: T1_THRESHOLD_SPEC,
        frozenAt: T1_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });

  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);
  const chainVerify = verifyChainHead(db);
  const paper = assemblePaper(state);
  const reproHash = verdictResult.verdictNode.currentHash;

  return {
    rawInput: T1_RAW_INPUT,
    sourceCard: T1_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash,
    graphSubtree,
    chainVerify,
    paper,
    db,
  };
}
