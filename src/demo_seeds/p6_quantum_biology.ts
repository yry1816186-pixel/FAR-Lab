/**
 * Demo Seed: P6 室温量子相干与生物学功能（Room-Temperature Quantum Coherence
 * in Biological Function · Quantum Biology）。
 *
 * 问题简述：量子生物学声称「量子相干直接驱动室温下的生物学功能」——三个标志性系统：
 * (1) FMO 光合复合物中的激发能量转移（Engel 2007·2D 电子光谱显示量子相干），
 * (2) 鸟磁感自由基对机制（Gauger 2011·理论模型），
 * (3) DNA 修复中的质子隧穿。
 * 然而：2D 光谱相干 ≠ 功能相干（反剧场红线），鸟磁感自由基对机制仍是假设
 * （cryptochrome 敲除实验 2018 仅给弱支持），无在体单分子实验直接证实量子效应不可
 * 或缺 → UNTESTED。
 *
 * 对齐 Science-125 真实问题："Can quantum coherence directly drive biological function
 * at room temperature?"。
 *
 * 真实文献溯源:
 *   - Engel et al. 2007 (Nature): "Evidence for wavelike energy transfer through quantum
 *     coherence in photosynthetic systems" DOI:10.1038/nature05678
 *     （FMO 复合物 2D 电子光谱·首次在生物系统中观察到量子拍频）
 *   - Lambert et al. 2013 (Nature Physics): "Quantum biology"
 *     DOI:10.1038/nphys2690 （量子生物学领域综述·承认开放问题）
 *   - Gauger et al. 2011 (Physical Review Letters): "Sustained Quantum Coherence and
 *     Entanglement in the Avian Compass" DOI:10.1103/PhysRevLett.106.040503
 *     （鸟磁感自由基对机制理论模型·非在体实验验证）
 *   - Hore & Mouritsen 2016 (Annual Review of Biophysics): "The Quantum Nature of
 *     Bird Migration" DOI:10.1146/annurev-biophys-030115-102759
 *     （综述·磁感假设未定论）
 *   - Cao et al. 2020 (Science Advances): "Quantum biology revisited"
 *     DOI:10.1126/sciadv.aaz4888 （回顾 2020·呼吁新实验范式）
 *
 * verdict 设计：FEC evidences 为空数组 → decideVerdict 第一分支返回 UNTESTED，
 * untestedReason = 'no evidence collected for this claim'。
 * 理由：(1)室温量子相干（FMO）≠已被证实在自然条件下影响生物学功能
 * （2D 光谱相干 ≠ 功能相干），(2)鸟磁感自由基对机制仍是假设
 * （cryptochrome knock-out 实验 2018 给弱支持），(3)无在体单分子实验直接证实
 * 量子效应不可或缺。
 *
 * 历史溯源（已归档）: archived-spec可证伪证据链_FEC.md §1（Science-125 种子）+
 * 17_FINAL_AUDIT.md §7.
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

/** Constant: P6_RAW_INPUT. */
export const P6_RAW_INPUT = [
  'Room-temperature quantum coherence in biological function: Three landmark systems claim',
  'quantum effects drive biology — (1) FMO photosynthetic complex excitation energy transfer',
  '(Engel 2007 Nature: 2D electronic spectroscopy shows quantum beating at 77K, extended to',
  'room temperature by later studies), (2) avian magnetoreception via cryptochrome radical-pair',
  'mechanism (Gauger 2011 PRL: theoretical model of sustained coherence in Earth-strength',
  'magnetic fields), (3) proton tunneling in DNA repair enzymes (photolyase). The core claim is:',
  '"Quantum coherence directly drives biological function at room temperature" — requiring',
  'cryogenic-like decoherence times (T2 > 300 fs) maintained in warm, wet, noisy cellular',
  'environments. We assess this against: (1) 2D spectroscopy coherence does not imply',
  'functional relevance (anti-theater: coherent beating may be an experimental artifact of',
  'laser pulse preparation, not biological design), (2) cryptochrome radical-pair hypothesis',
  'remains unconfirmed in vivo (knock-out studies 2018 show weak behavioral effects, not',
  'mechanistic proof), and (3) no single-molecule in vivo experiment directly demonstrates',
  'that quantum coherence is indispensable for any biological function.',
].join(' ');

// ---------- SourceCard ----------

/** Constant: P6_SOURCE_CARD. */
export const P6_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-p6-cao-2020',
  url: 'https://doi.org/10.1126/sciadv.aaz4888',
  title: 'Quantum biology revisited (Cao 2020, Science Advances)',
  sourceType: 'paper',
  publisher: 'Science Advances',
  fetchedAt: '2026-07-27T00:00:00.000Z',
  claim: 'Quantum biology claims remain experimentally unvalidated for functional relevance at room temperature in living organisms.',
  evidenceLevel: 'secondary',
  stability: 'time_sensitive',
  usedFor: 'scientific_evidence',
};

// ---------- Fixture payloads（六阶段·量子生物学领域特定） ----------

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Assess whether quantum coherence directly drives biological function at room temperature ' +
    'in three landmark systems: (1) FMO photosynthetic energy transfer, (2) avian magnetoreception ' +
    '(cryptochrome radical-pair), and (3) DNA photolyase proton tunneling. Core claim: living ' +
    'organisms maintain cryogenic-like decoherence times (T2 > 300 fs) sufficient for functional ' +
    'quantum effects in warm, wet, noisy cellular environments.',
  scope:
    'Three quantum biology model systems studied via ultrafast spectroscopy, in vitro radical-pair ' +
    'chemistry, and theoretical modeling. Scope limited to published experimental evidence that ' +
    'directly links quantum coherence to functional biological outcomes — not merely spectroscopic ' +
    'signatures or theoretical plausibility arguments.',
  keyTerms: [
    'quantum coherence',
    'decoherence time (T2)',
    'FMO complex (Fenna-Matthews-Olson)',
    '2D electronic spectroscopy',
    'cryptochrome',
    'radical-pair mechanism',
    'avian magnetoreception',
    'proton tunneling',
    'DNA photolyase',
    'quantum biology',
  ],
  falsifiableAngle:
    'Falsifiable: demonstrate ≥3 independent in vivo experiments showing cryogenic-like ' +
    'decoherence times (T2 > 300 fs at 310K) in living organisms, with functional knockout ' +
    'controls proving quantum coherence is indispensable for the biological function. ' +
    'Current evidence: zero such experiments exist. Spectroscopic coherence signatures are ' +
    'necessary but insufficient — the anti-theater constraint demands functional proof.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-p6-001',
      source: 'doi' as const,
      doi: '10.1038/nature05678',
      title: 'Engel 2007: 2D spectroscopy of FMO complex — quantum beating observed',
    },
    {
      evidenceId: 'ev-p6-002',
      source: 'doi' as const,
      doi: '10.1038/nphys2690',
      title: 'Lambert 2013: Quantum biology review — open questions acknowledged',
    },
    {
      evidenceId: 'ev-p6-003',
      source: 'doi' as const,
      doi: '10.1103/PhysRevLett.106.040503',
      title: 'Gauger 2011: Avian compass radical-pair coherence theory',
    },
    {
      evidenceId: 'ev-p6-004',
      source: 'doi' as const,
      doi: '10.1146/annurev-biophys-030115-102759',
      title: 'Hore & Mouritsen 2016: Quantum nature of bird migration review',
    },
    {
      evidenceId: 'ev-p6-005',
      source: 'doi' as const,
      doi: '10.1126/sciadv.aaz4888',
      title: 'Cao 2020: Quantum biology revisited — calls for new paradigms',
    },
  ],
  knowledgeGraphSummary:
    'Three landmark quantum biology systems (FMO, cryptochrome, photolyase) each face the same ' +
    'fundamental gap: spectroscopic coherence signatures do not establish functional relevance. ' +
    '(1) FMO: Engel 2007 observed quantum beating at 77K; later studies extended to room ' +
    'temperature (Panitchayangkoon 2010 PNAS), but coherent beating may be an artifact of ' +
    'the laser pulse preparation (anti-theater: the spectroscopist creates the coherence, ' +
    'not the protein). (2) Cryptochrome: Gauger 2011 showed theoretically that radical-pair ' +
    'coherence could persist in Earth-strength magnetic fields, but in vivo evidence is weak — ' +
    'cryptochrome knock-out migratory birds show partial behavioral disruption (2018), not ' +
    'definitive mechanistic proof. (3) Photolyase: proton tunneling proposed but not directly ' +
    'observed in functional context. Cross-cutting gap: zero single-molecule in vivo ' +
    'experiments demonstrating that quantum coherence is indispensable — all evidence is ' +
    'either spectroscopic (correlative) or theoretical (plausibility). FEC verdict: UNTESTED ' +
    '— the field has not reached the evidence threshold for scientific verification.',
  gaps: [
    'Spectroscopic coherence ≠ functional coherence (anti-theater: laser-induced artifact)',
    'No single-molecule in vivo experiment demonstrating indispensable quantum effects',
    'Cryptochrome knock-out gives weak behavioral effects, not mechanistic proof',
    'Decoherence times in cellular environment unknown (all measurements in purified complexes)',
    'No functional knockout control: cannot disentangle quantum from classical contributions',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'Quantum coherence directly drives biological function at room temperature — ' +
    'living organisms maintain cryogenic-like decoherence times (T2 > 300 fs at 310K) ' +
    'that are functionally indispensable for at least one of: photosynthetic energy transfer, ' +
    'avian magnetoreception, or DNA repair.',
  falsificationMethod: {
    prediction:
      '≥3 independent in vivo single-molecule experiments demonstrate decoherence times ' +
      'T2 > 300 fs at 310K in living organisms, with functional knockout controls proving ' +
      'quantum coherence is indispensable for the biological function.',
    metric: 'in_vivo_decoherence_experiments',
    comparator: 'gt' as const,
    value: 3,
  },
  supportingCitations: ['ev-p6-001'],
  scopeSlipText:
    'Claim requires in vivo functional evidence (living organisms, physiological temperature). ' +
    'Spectroscopic signatures in purified complexes and theoretical models are excluded as ' +
    'insufficient — they establish plausibility, not functional verification.',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-p6-e1',
      supportsOrRefutes: 'neutral' as const,
      entailmentScore: 0.61,
      source: {
        evidenceId: 'ev-p6-001',
        source: 'doi' as const,
        doi: '10.1038/nature05678',
        title: 'Engel 2007: 2D spectroscopy shows quantum beating in FMO — but no functional link',
      },
    },
    {
      evidenceId: 'ev-p6-e2',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.52,
      source: {
        evidenceId: 'ev-p6-002',
        source: 'doi' as const,
        doi: '10.1038/nphys2690',
        title: 'Lambert 2013: Quantum biology review — acknowledges plausibility, open questions',
      },
    },
    {
      evidenceId: 'ev-p6-e3',
      supportsOrRefutes: 'neutral' as const,
      entailmentScore: 0.55,
      source: {
        evidenceId: 'ev-p6-003',
        source: 'doi' as const,
        doi: '10.1103/PhysRevLett.106.040503',
        title: 'Gauger 2011: Avian compass radical-pair theory — model only, not in vivo',
      },
    },
    {
      evidenceId: 'ev-p6-e4',
      supportsOrRefutes: 'neutral' as const,
      entailmentScore: 0.48,
      source: {
        evidenceId: 'ev-p6-004',
        source: 'doi' as const,
        doi: '10.1146/annurev-biophys-030115-102759',
        title: 'Hore & Mouritsen 2016: Bird migration quantum nature — hypothesis, not settled',
      },
    },
    {
      evidenceId: 'ev-p6-e5',
      supportsOrRefutes: 'neutral' as const,
      entailmentScore: 0.55,
      source: {
        evidenceId: 'ev-p6-005',
        source: 'doi' as const,
        doi: '10.1126/sciadv.aaz4888',
        title: 'Cao 2020: Quantum biology revisited — evidence insufficient, calls for new paradigms',
      },
    },
  ],
  conflictingEvidenceCount: 0,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: [
    'FMO complex from Chlorobaculum tepidum (purified, for single-molecule spectroscopy)',
    'Cryptochrome Cry4 from migratory European robin (Erithacus rubecula) for in vivo mutation',
    'In vivo HeLa cells expressing fluorescently tagged photolyase for ultrafast spectroscopy',
  ],
  methodChoices: [
    'Single-molecule coherent 2D spectroscopy at physiological temperature (310K) in living cells',
    'Cryptochrome site-directed mutagenesis + behavioral magnetoreception assay in migratory birds',
    'Ultrafast transient absorption with functional knockout controls (mutation disabling quantum pathway)',
  ],
  scheduleOrFeedback:
    'Phase 1: Establish single-molecule 2D spectroscopy in living cells at 310K — ' +
    'measure T2 decoherence times for FMO-like complexes in situ. ' +
    'Phase 2: Generate cryptochrome Cry4 mutants (knock-out quantum sensing domain) ' +
    'and test magnetoreception behavior in migratory birds. ' +
    'Phase 3: Compare quantum-disabled vs quantum-enabled photolyase mutants in DNA repair ' +
    'efficiency assay. Each phase requires ≥3 independent replications with pre-registered ' +
    'analysis pipelines.',
  executableChecks: [
    {
      ref: 'https://doi.org/10.1038/nature05678',
      exists: true,
      checkedAt: '2026-07-27T00:00:00.000Z',
    },
    {
      ref: 'https://doi.org/10.1126/sciadv.aaz4888',
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
    'Converged: claim is falsifiable (≥3 in vivo single-molecule experiments with functional ' +
    'knockout controls). However, zero such experiments exist — all evidence is spectroscopic ' +
    'or theoretical → FEC verdict UNTESTED (honest).',
});

// ---------- FEC 三件套（UNTESTED 设计：evidences 为空·无可复现的 in vivo 证据）----------

const P6_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    '≥3 independent in vivo single-molecule experiments demonstrate decoherence times ' +
    'T2 > 300 fs at 310K in living organisms, with functional knockout controls proving ' +
    'quantum coherence is indispensable for biological function.',
  metric: 'in_vivo_decoherence_experiments',
  falsificationThreshold: 3,
  thresholdSemantics: 'gt',
};

const P6_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 3,
};

// ---------- SourceAnchor ----------

const P6_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'p6'.repeat(20),
  dashscopeRequestId: null,
  isoTimestamp: '2026-07-27T00:00:00.000Z',
  rawResponseHash: 'p6'.repeat(32),
};

// ---------- runSeed ----------

/**
 * 执行 P6 量子生物学 demo seed（完整 6-stage agent loop + FEC 编排 → UNTESTED）。
 *
 * 全程 offline_replay（不依赖真实 API）；fresh-clone 无 key 也能跑。
 *
 * @returns DemoSeedResult（含全部产出物·调用方负责 db.close()）
 */
export async function runP6Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-p6-quantum-biology',
    researchInput: P6_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'p6'.repeat(32),
    gitCommitSha: P6_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  // discriminatedUnion narrow（R10·禁 as 强转）
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('P6 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  // FEC evidences: 空数组 → decideVerdict 第一分支返回 UNTESTED。
  // 量子生物学领域无可复现的 in vivo metric 证据——所有"证据"均为光谱学相关信号
  // （非功能因果关联）或理论模型（非实验验证）→ FEC 诚实标 UNTESTED。
  const p6Evidences: EvidenceRecord[] = [];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'p6'.repeat(32),
        gitCommitSha: P6_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: P6_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: P6_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: P6_FALSIFICATION_SPEC,
    thresholdSpec: P6_THRESHOLD_SPEC,
    evidences: p6Evidences,
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'P6-QUANTUM-BIOLOGY',
        falsificationSpec: P6_FALSIFICATION_SPEC,
        thresholdSpec: P6_THRESHOLD_SPEC,
        frozenAt: P6_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });

  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);
  const chainVerify = verifyChainHead(db);
  const paper = assemblePaper(state);
  const reproHash = verdictResult.verdictNode.currentHash;

  return {
    rawInput: P6_RAW_INPUT,
    sourceCard: P6_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash,
    graphSubtree,
    chainVerify,
    paper,
    db,
  };
}
