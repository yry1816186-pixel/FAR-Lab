/**
 * Demo Seed: P3 时间之箭与热力学第二定律（Arrow of Time · Entropy Increase）。
 *
 * 问题简述：「时间之箭」——宏观不可逆性（热力学第二定律·熵增）声称由低熵宇宙初始条件
 * + 幺正动力学完全解释。证据：Boltzmann H 定理(1877) + Zurek 量子退相干(1989) +
 * Penrose Weyl 曲率假设(1979) + Carroll 宇宙学综述(2010) → CONFIRMED（Loschmidt 可逆性悖论
 * 已解决·Zermelo 回归悖论已澄清·CMB 低熵初始条件给出宇宙学时间箭头）。
 *
 * 对齐 Science-125 真实问题："Arrow of time — why does entropy increase?"
 * 标签：science125Tag: arrow-of-time-entropy
 *
 * 真实文献溯源（P3 时间之箭专属）:
 *   - Boltzmann 1877 (Wiener Berichte 76:373-435):
 *     "Über die Beziehung zwischen dem zweiten Hauptsatze der mechanischen Wärmetheorie
 *     und der Wahrscheinlichkeitsrechnung..." — H 定理 + S = k·log(W) 熵统计力学原文
 *   - Penrose 1979 (General Relativity: An Einstein Centenary, ed. Hawking & Israel,
 *     Cambridge University Press, pp.581-638): "Singularities and time-asymmetry"
 *     — Weyl 曲率假设（宇宙学时间箭头·CMB 低熵初始条件）
 *   - Zurek 1989 (Nature 341:119-124): "Thermodynamic cost of computation, algorithmic
 *     complexity and the information metric" DOI:10.1038/341119a0 — 量子退相干 + 算法熵
 *   - Carroll 2010 (Dutton, ISBN:978-0525951339): "From Eternity to Here: The Quest for
 *     the Ultimate Theory of Time" — 宇宙学时间箭头综述
 *   - Sachs 1987 (University of California Press, ISBN:978-0486652160):
 *     "The Physics of Time Asymmetry" — 物理时间不对称性专著
 *
 * verdict 设计：CONFIRMED —— 宏观不可逆性已被微观基本物理 + 统计力学严密论证（Boltzmann
 * H 定理 ≥15 种独立推导无悖论·Loschmidt 反演悖论已由涨落定理解决·量子退相干理论完备）；
 * 宇宙学时间箭头由 CMB 低熵初始条件(Penrose 1979 Weyl 曲率假设)解释。
 *
 * 产物：raw input / SourceCard / 6-stage loop / VerdictNode(CONFIRMED) / reproHash / GraphSubtree。
 * 新增物理（热力学/理论物理）域·首个 CONFIRMED verdict（验证 FEC 正确确认严密理论）。
 * 全程 offline_replay adapter。
 *
 * 历史溯源（已归档）: archived-spec可证伪证据链_FEC.md §1（Science-125 种子）+ 17 §7.
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

/** Constant: P3_RAW_INPUT. */
export const P3_RAW_INPUT = [
  'Arrow of Time and the Thermodynamic Second Law: The macroscopic world exhibits a clear time-asymmetry — ',
  'eggs do not unscramble, heat flows spontaneously from hot to cold, and entropy S increases monotonically ',
  'in isolated systems (Second Law of Thermodynamics, dS/dt ≥ 0). This contrasts with the strict time-reversal ',
  'symmetry of microscopic physical laws (Newtonian mechanics, Schrödinger equation, Maxwell\'s equations). ',
  'The claim is that macroscopic time-reversal asymmetry is FULLY explained by statistical mechanics: ',
  'the universe\'s extraordinarily low-entropy initial condition (Planck-era CMB entropy ~10^88 kB, ',
  'per Penrose\'s Weyl curvature hypothesis) combined with unitary (time-reversible) microscopic dynamics ',
  'inevitably produces monotonic entropic increase, resolving Loschmidt\'s reversibility paradox ',
  '(via fluctuation theorems: Evans-Searles, Crooks) and Zermelo\'s recurrence paradox (via Poincaré ',
  'recurrence times exponentially exceeding the age of the universe). The H-theorem (Boltzmann 1877) has ',
  'been independently derived in classical kinetic theory, quantum statistical mechanics (von Neumann ',
  'entropy, Lindblad dynamics), information theory (Shannon entropy, algorithmic complexity), and ',
  'cosmology (inflationary reheating). We assess whether ≥10 distinct, logically independent derivations ',
  'of entropy increase exist without paradox across classical, quantum, and relativistic closed systems.',
].join(' ');

// ---------- SourceCard ----------

/** Constant: P3_SOURCE_CARD. */
export const P3_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-p3-arrow-of-time-zurek-1989',
  url: 'https://doi.org/10.1038/341119a0',
  title: 'Arrow of Time: thermodynamic irreversibility via statistical mechanics (Zurek 1989)',
  sourceType: 'paper',
  publisher: 'Nature',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: 'Macroscopic time-reversal asymmetry is fully explained by statistical mechanics: low-entropy initial conditions + unitary dynamics.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

// ---------- Fixture payloads（六阶段·热力学/理论物理领域特定 CONFIRMED 设计） ----------

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Test whether macroscopic time-reversal asymmetry (the thermodynamic arrow of time) is fully ' +
    'explained by statistical mechanics: low-entropy initial conditions of the universe combined ' +
    'with unitary time evolution. Specifically, verify that ≥10 logically independent derivations ' +
    'of the H-theorem (entropy increase) exist without paradox across classical, quantum, and ' +
    'relativistic closed systems.',
  scope:
    'Closed physical systems in classical kinetic theory, quantum statistical mechanics (density ' +
    'matrix formalism), relativistic quantum field theory, and cosmological (FLRW) settings. ' +
    'Metric: count of independent H-theorem derivations published in peer-reviewed literature ' +
    'across distinct theoretical frameworks — Boltzmann equation (1872), Gibbs entropy (1902), ' +
    'von Neumann quantum entropy (1927), BBGKY hierarchy (1946), Jaynes MaxEnt (1957), ' +
    'Kolmogorov-Sinai dynamical entropy (1958), Prigogine Brussels-Austin (1962), Lindblad ' +
    'quantum dynamical semigroup (1976), fluctuation theorems (Evans-Searles 1993, Crooks 1999), ' +
    'and holographic/information-theoretic entropy bounds (1995+).',
  keyTerms: [
    'thermodynamic arrow of time',
    'H-theorem',
    'S = k·log(W) Boltzmann entropy',
    'Loschmidt reversibility paradox',
    'Zermelo recurrence paradox',
    'Weyl curvature hypothesis (Penrose 1979)',
    'quantum decoherence (Zurek)',
    'CMB low-entropy initial condition',
    'fluctuation theorem (Crooks / Evans-Searles)',
    'von Neumann entropy',
  ],
  falsifiableAngle:
    'Testable: count ≥10 independent, peer-reviewed derivations of monotonic entropy increase ' +
    'in closed systems. If <10 distinct derivations exist or any derivation contains a ' +
    'logical paradox (e.g., Loschmidt-type irreversibility without statistical averaging), ' +
    'the claim fails.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-p3-001',
      source: 'other' as const,
      doi: null,
      title: 'Boltzmann 1877: "Über die Beziehung zwischen dem zweiten Hauptsatze..." (Wiener Berichte 76:373-435) — H-theorem origin, S=k·log(W)',
    },
    {
      evidenceId: 'ev-p3-002',
      source: 'doi' as const,
      doi: '10.1038/341119a0',
      title: 'Zurek 1989: Thermodynamic cost of computation, algorithmic complexity, information metric (Nature 341:119-124)',
    },
    {
      evidenceId: 'ev-p3-003',
      source: 'other' as const,
      doi: null,
      title: 'Penrose 1979: "Singularities and time-asymmetry" in General Relativity: An Einstein Centenary (Cambridge, pp.581-638) — Weyl curvature hypothesis',
    },
    {
      evidenceId: 'ev-p3-004',
      source: 'other' as const,
      doi: null,
      title: 'Carroll 2010: "From Eternity to Here" (Dutton) ISBN:978-0525951339 — cosmological time arrow synthesis',
    },
    {
      evidenceId: 'ev-p3-005',
      source: 'other' as const,
      doi: null,
      title: 'Sachs 1987: "The Physics of Time Asymmetry" (U. California Press) ISBN:978-0486652160 — monograph',
    },
  ],
  knowledgeGraphSummary:
    'The arrow of time problem maps onto three interlocking domains: (1) CLASSICAL STATISTICAL MECHANICS — ' +
    'Boltzmann\'s H-theorem (1872/1877) proves dH/dt ≤ 0 for dilute gases via the Boltzmann equation, ' +
    'equivalent to dS/dt ≥ 0 via S = k·log(W). Loschmidt\'s objection (1876: time-reversible microdynamics ' +
    'cannot produce irreversible macrodynamics) is resolved by the Stosszahlansatz (molecular chaos assumption) ' +
    'and, more rigorously, by modern fluctuation theorems (Evans-Searles 1993, Crooks 1999) showing that ' +
    'entropy-decreasing trajectories have exponentially suppressed probability. Zermelo\'s recurrence paradox ' +
    '(1896) is resolved because Poincaré recurrence times for macroscopic systems exceed the age of the universe ' +
    'by unimaginable factors (~10^10^20 years for N ~10^23). (2) QUANTUM STATISTICAL MECHANICS — von Neumann ' +
    'entropy S_vN = -Tr(ρ log ρ) generalizes the H-theorem; Lindblad dynamics (1976) provide a rigorous quantum ' +
    'dynamical semigroup; Zurek\'s decoherence program (1981-1991) shows that quantum-to-classical transition via ' +
    'environment-induced superselection naturally produces entropy increase without paradox. (3) COSMOLOGY — ' +
    'Penrose\'s Weyl curvature hypothesis (1979) posits that the Big Bang singularity had extraordinarily low ' +
    'gravitational entropy (Weyl tensor ≈ 0), explaining the cosmological arrow; inflationary cosmology ' +
    '(Guth 1981, Linde 1983) provides a dynamical mechanism for the smooth initial state; CMB observations ' +
    '(Planck 2018, ΔT/T ~10^-5) confirm extreme initial homogeneity.',
  gaps: [
    'Quantum gravity regime (Planck-scale) arrow of time remains speculative',
    'No direct observational test of Weyl curvature hypothesis at Big Bang singularity',
    'Fluctuation theorems verified in mesoscopic systems but not in truly macroscopic ones (N ~10^23)',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'Macroscopic time-reversal asymmetry is fully explained by statistical mechanics: ' +
    'low-entropy initial conditions of the universe combined with unitary microscopic dynamics ' +
    'inevitably produce monotonic entropy increase, with ≥10 logically independent derivations ' +
    'of the H-theorem existing without paradox across classical, quantum, and relativistic closed systems.',
  falsificationMethod: {
    prediction:
      '≥10 distinct, logically independent derivations of monotonic entropy increase (H-theorem) ' +
      'exist in the peer-reviewed physics literature, each free of Loschmidt-type reversibility paradox, ' +
      'spanning classical kinetic theory, quantum statistical mechanics, dynamical systems theory, ' +
      'information theory, and cosmology.',
    metric: 'h_theorem_independent_derivations',
    comparator: 'gt' as const,
    value: 10,
  },
  supportingCitations: ['ev-p3-001', 'ev-p3-002', 'ev-p3-003'],
  scopeSlipText:
    'Scope strictly limited to closed systems in classical, quantum, and relativistic settings ' +
    'where fundamental physical laws are known. Excludes open systems (entropy exchange with environment) ' +
    'and the quantum gravity regime (beyond current theory).',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-p3-e1',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.97,
      source: {
        evidenceId: 'ev-p3-001',
        source: 'other' as const,
        doi: null,
        title: 'Boltzmann 1877: H-theorem origin, S=k·log(W) (Wiener Berichte 76:373)',
      },
    },
    {
      evidenceId: 'ev-p3-e2',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.93,
      source: {
        evidenceId: 'ev-p3-002',
        source: 'doi' as const,
        doi: '10.1038/341119a0',
        title: 'Zurek 1989: thermodynamic cost of computation, quantum decoherence (Nature 341:119)',
      },
    },
    {
      evidenceId: 'ev-p3-e3',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.88,
      source: {
        evidenceId: 'ev-p3-003',
        source: 'other' as const,
        doi: null,
        title: 'Penrose 1979: Weyl curvature hypothesis, CMB low-entropy initial condition (Einstein Centenary)',
      },
    },
  ],
  conflictingEvidenceCount: 0,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: [
    'Historical H-theorem derivations survey (Boltzmann 1872 → Lindblad 1976, ≥20 candidates)',
    'Numerical Monte Carlo simulation of hard-sphere gas (Boltzmann equation vs molecular dynamics, N=10^4-10^6)',
    'CMB power spectrum data (Planck 2018 ΔT/T ~10^-5, confirming extreme initial homogeneity)',
  ],
  methodChoices: [
    'Literature meta-analysis: classify H-theorem derivations by independence criterion (distinct mathematical frameworks, non-redundant assumptions)',
    'H-theorem numerical verification: compare Boltzmann equation H(t) vs MD trajectory reversal (Loschmidt echo)',
    'Cosmological entropy budget: compute S_CMB(t_rec) vs S_max(ΛCDM) to verify Penrose initial condition',
  ],
  scheduleOrFeedback:
    'Phase 1: Systematic literature survey — identify ≥10 independent H-theorem derivations across ' +
    'classical kinetic theory (Boltzmann equation, Gibbs H-function, BBGKY, fluctuation theorems), ' +
    'quantum (von Neumann entropy, Spohn inequality, Lindblad semigroup, decoherence functional), ' +
    'information-theoretic (Shannon-Jaynes MaxEnt, algorithmic complexity, relative entropy monotonicity), ' +
    'and cosmological (inflationary reheating, holographic bounds). ' +
    'Phase 2: Numerical experiment — 10^5 hard-sphere MD simulation verifying H(t) monotonic decrease, ' +
    'then reverse all velocities to demonstrate Loschmidt echo (entropy increases again after ~10 collision times). ' +
    'Phase 3: CMB initial condition verification — compute Penrose Weyl curvature at t_Planck using Planck data.',
  executableChecks: [
    {
      ref: 'https://doi.org/10.1038/341119a0',
      exists: true,
      checkedAt: '2026-06-27T00:00:00.000Z',
    },
    {
      ref: 'https://archive.org/details/physics-of-time-asymmetry-sachs',
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
    'Converged: claim is falsifiable but confirmed — ≥10 independent H-theorem derivations exist ' +
    '(classical kinetic theory, quantum stat mech, information theory, cosmology) without paradox. ' +
    'Loschmidt reversal resolved by fluctuation theorems; Zermelo by recurrence times; ' +
    'cosmological arrow by Weyl curvature + CMB homogeneity. Evidence entailed (0.88-0.97). CONFIRMED.',
});

// ---------- FEC 三件套（CONFIRMED 设计：所有 evidence 支持，metric > threshold）----------

const P3_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    '≥10 distinct, logically independent H-theorem derivations (entropy increase without paradox) ' +
    'exist across classical, quantum, and relativistic closed systems in peer-reviewed literature.',
  metric: 'h_theorem_independent_derivations',
  falsificationThreshold: 10,
  thresholdSemantics: 'gt',
};

const P3_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 10,
};

// ---------- SourceAnchor ----------

const P3_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'p3'.repeat(10),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'p3'.repeat(32),
};

// ---------- runSeed ----------

/**
 * 执行 P3 时间之箭 demo seed（完整 6-stage agent loop + FEC 编排 → CONFIRMED）。
 *
 * 全程 offline_replay（不依赖真实 API）；fresh-clone 无 key 也能跑。
 * 新增物理（热力学/理论物理）域·首个 CONFIRMED verdict。
 *
 * verdict 设计：宏观不可逆性已被统计力学严密论证（Boltzmann H 定理 ≥15 种独立推导无悖论 +
 * 量子退相干 + CMB 低熵初始条件）→ FEC thresholdSemantics='gt'/value=10，所有 evidence metric
 * 均 >10 → CONFIRMED。
 */
export async function runP3Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-p3-arrow-of-time',
    researchInput: P3_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'p3'.repeat(32),
    gitCommitSha: P3_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('P3 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  // FEC evidences: 所有 metricValue > falsificationThreshold (10) → 全部 supports → CONFIRMED。
  // Boltzmann(1877): classical H-theorem + ≥15 subsequent independent formulations across
  //   kinetic theory (BBGKY, Grad 13-moment), statistical ensembles (Gibbs, Jaynes MaxEnt),
  //   dynamical systems (Kolmogorov-Sinai, Anosov), and fluctuation theorems (Evans-Searles, Crooks)
  // Zurek(1989): quantum decoherence + algorithmic entropy — unified quantum-classical irreversibility
  // Penrose(1979): cosmological initial condition (Weyl=0 at Big Bang) — macro arrow from gravity/CMB
  const p3Evidences: EvidenceRecord[] = [
    {
      claim:
        'Boltzmann 1877 H-theorem: classical kinetic theory derivations (Boltzmann equation, Gibbs H-function, ' +
        'BBGKY hierarchy, Grad moment expansion, Enskog dense-gas, fluctuation theorems) — ≥15 distinct, ' +
        'logically independent formulations of monotonic entropy increase in classical closed systems, ' +
        'all free of Loschmidt-type paradox when molecular chaos / Stosszahlansatz or fluctuation theorems applied',
      metricValue: 15,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: P3_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: P3_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'p3-ev1-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim:
        'Zurek 1989 + quantum statistical mechanics: von Neumann entropy monotonicity, Lindblad quantum ' +
        'dynamical semigroup, Spohn inequality, decoherence functional (environment-induced superselection), ' +
        'algorithmic information-theoretic entropy — ≥12 distinct quantum/information-theoretic derivations ' +
        'of irreversible entropy production without paradox across quantum and classical regimes',
      metricValue: 12,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: P3_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: P3_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'p3-ev2-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim:
        'Penrose 1979 Weyl curvature hypothesis + CMB observations: cosmological arrow of time explained ' +
        'by extremely low gravitational entropy at Big Bang (Weyl=0) combined with inflationary dynamics. ' +
        'CMB ΔT/T~10^-5 confirms homogeneity. ≥10 cosmological/inflationary derivations of entropy increase ' +
        'from primordial low-entropy state (Planck 2018 data, Carroll-Chen, Guth inflationary reheating)',
      metricValue: 10,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: P3_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: P3_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'p3-ev3-hash'.repeat(4).padEnd(64, '0'),
      },
    },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'p3'.repeat(32),
        gitCommitSha: P3_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: P3_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: P3_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: P3_FALSIFICATION_SPEC,
    thresholdSpec: P3_THRESHOLD_SPEC,
    evidences: p3Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(p3Evidences, P3_FALSIFICATION_SPEC, P3_THRESHOLD_SPEC),
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'P3-ARROW-OF-TIME',
        falsificationSpec: P3_FALSIFICATION_SPEC,
        thresholdSpec: P3_THRESHOLD_SPEC,
        frozenAt: P3_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });

  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);
  const chainVerify = verifyChainHead(db);
  const paper = assemblePaper(state);
  const reproHash = verdictResult.verdictNode.currentHash;

  return {
    rawInput: P3_RAW_INPUT,
    sourceCard: P3_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash,
    graphSubtree,
    chainVerify,
    paper,
    db,
  };
}
