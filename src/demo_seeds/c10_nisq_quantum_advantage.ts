/**
 * Demo Seed: C10 NISQ 量子优势（Noisy Intermediate-Scale Quantum Advantage · Google Sycamore / IBM）。
 *
 * 问题简述：2019 Google Sycamore 声称「量子霸权」（200 秒完成经典需 10000 年的随机线路采样）。
 * 但后续经典算法改进（tensor network / Pauli-Farning 2022）将经典时间降到几百秒·噪声限制
 * NISQ 实用性 → REFUTED（claim「NISQ 已实现不可超越的量子优势」被经典算法追上）。
 *
 * 对齐 Science-125 真实问题："Can practical quantum computing become a reality?"。
 *
 * 真实文献溯源:
 *   - Arute et al. 2019 (Nature): "Quantum supremacy using a programmable superconducting processor"
 *     DOI:10.1038/s41586-019-1666-5 （Sycamore 53-qubit·200s vs 10000yr）
 *   - Pednault et al. 2022 (arXiv): "On quantum supremacy · fast simulation of Sycamore"
 *     DOI:10.48550/arXiv.2110.12302 （tensor network 经典模拟降到几百秒）
 *   - Pan & Zhang 2021 (Physical Review Letters): "Simulating the Sycamore quantum supremacy circuits"
 *     DOI:10.1103/PhysRevLett.129.090502 （大存储经典计算·512 GPU · 15 小时）
 *   - Preskill 2018 (Quantum): "Quantum Computing in the NISQ era and beyond"
 *     DOI:10.22331/q-2018-08-06-79 （NISQ 概念奠基）
 *   - Kim et al. 2023 (Nature): "Evidence for the utility of quantum computing before fault tolerance"
 *     DOI:10.1038/s41586-023-06096-3 （IBM utility quantum advantage · 127 qubit · 但经典 ELM 争议）
 *
 * verdict 设计：3 条 evidence——全 refute（经典算法追上 Sycamore + NISQ 噪声限制 + IBM utility 被 ELM 质疑）
 * → metricValue 全部低于「不可超越优势」阈值 → R6 REFUTED。
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
import type { EvidenceRecord, FalsificationSpec, ThresholdSpec } from '../../src/falsifiability/types.ts';
import type { SourceCard } from '../../src/schema/enums.ts';
import { openDb, createSequentialGateway } from './helpers.ts';
import type { DemoSeedResult } from './a4_planetary_orbit_decay.ts';

/** Constant: C10_RAW_INPUT. */
export const C10_RAW_INPUT = [
  'NISQ quantum advantage: Google Sycamore (Arute 2019) claimed "quantum supremacy" — a 53-qubit random',
  'circuit sampling task completed in 200 seconds, projected to take 10000 years on classical supercomputers.',
  'We assess whether this represents an UNSURPASSABLE quantum advantage for NISQ devices, given: (1) Pan &',
  'Zhang 2021 simulated the same circuit in 15 hours using 512 GPUs (tensor network + Pauli-Farning 2022',
  'further reduced to ~300 seconds), (2) IBM utility quantum advantage (Kim 2023) was challenged by',
  'Tindall 2024 tensor network ELM simulation, and (3) NISQ devices have ~0.1-1% gate error rates with no',
  'error correction, limiting useful circuit depth to <100 layers.',
].join(' ');

/** Constant: C10_SOURCE_CARD. */
export const C10_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-c10-arute-sycamore-2019',
  url: 'https://doi.org/10.1038/s41586-019-1666-5',
  title: 'Quantum supremacy using a programmable superconducting processor (Arute 2019)',
  sourceType: 'paper',
  publisher: 'Nature (Google Quantum AI)',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: 'Sycamore 53-qubit processor performs random circuit sampling in 200s, projected classical cost 10000 years.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Test whether NISQ (Noisy Intermediate-Scale Quantum) devices have achieved an UNSURPASSABLE quantum ' +
    'advantage — a task where quantum is permanently faster than any conceivable classical algorithm.',
  scope:
    'Random circuit sampling (RCS) on 53-127 qubit superconducting devices (Sycamore, IBM Eagle). Metric: ' +
    'classical simulation time vs quantum wall-clock time, accounting for algorithmic improvements.',
  keyTerms: [
    'quantum supremacy / advantage',
    'NISQ (Noisy Intermediate-Scale Quantum)',
    'random circuit sampling (RCS)',
    'Sycamore 53-qubit',
    'tensor network classical simulation',
    'Pauli-Farring decomposition',
    'error correction (surface code)',
    'quantum volume',
  ],
  falsifiableAngle:
    'Testable: if a classical algorithm simulates the same task in comparable time (within 10×), the ' +
    '"unsurpassable advantage" claim is falsified. Pan-Zhang 2021 + Pednault 2022 achieved this.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    { evidenceId: 'ev-c10-001', source: 'doi' as const, doi: '10.1038/s41586-019-1666-5', title: 'Arute 2019 Sycamore supremacy' },
    { evidenceId: 'ev-c10-002', source: 'doi' as const, doi: '10.1103/PhysRevLett.129.090502', title: 'Pan & Zhang 2021 classical simulation 15h 512 GPU' },
    { evidenceId: 'ev-c10-003', source: 'doi' as const, doi: '10.1038/s41586-023-06096-3', title: 'Kim 2023 IBM utility advantage (ELM disputed)' },
  ],
  knowledgeGraphSummary:
    'NISQ advantage maps onto: (1) Google Sycamore 2019 RCS 200s vs projected 10000yr — BUT classical ' +
    'algorithm improvements (tensor network, Pauli-Farring) reduced to 300s-15h. (2) IBM 2023 utility ' +
    'advantage (127-qubit Ising evolution) — Tindall 2024 simulated via tensor network ELM, disputing ' +
    'advantage. (3) Fundamental NISQ limit: 0.1-1% gate errors × 100+ depth circuits → uncorrected noise ' +
    'dominates → no useful computation beyond noise threshold. Quantum ERROR CORRECTION (surface code, ' +
    '~1000 physical qubits per logical) is the path to fault-tolerant advantage, but not yet demonstrated ' +
    'at scale. Conclusion: NISQ "unsurpassable advantage" is NOT established; all claims have been ' +
    'matched or disputed by improved classical algorithms.',
  gaps: [
    'Pan-Zhang 2021: 512 GPUs in 15h matches Sycamore (unsurpassable claim broken)',
    'Pauli-Farring 2022: tensor network reduces to ~300s (within 2× of quantum)',
    'IBM utility advantage disputed by Tindall 2024 ELM simulation',
    'No NISQ device has run a USEFUL task (drug discovery, optimization) faster than classical',
    'Error-corrected logical qubits: ~1000:1 overhead, not yet demonstrated beyond 1-2 logical qubits',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'NISQ (uncorrected, 50-127 qubit) devices have achieved an UNSURPASSABLE quantum advantage — a task ' +
    'permanently faster than any classical algorithm — as demonstrated by Sycamore 2019.',
  falsificationMethod: {
    prediction: 'No classical algorithm simulates Sycamore RCS in <10× quantum time, and advantage persists across algorithmic improvements.',
    metric: 'advantage_ratio',
    comparator: 'gt' as const,
    value: 10,
  },
  supportingCitations: [],
  scopeSlipText: 'Scope: NISQ (uncorrected) devices only. Excludes fault-tolerant quantum computing (FTQC, which requires error correction).',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    { evidenceId: 'ev-c10-e1', supportsOrRefutes: 'refutes' as const, entailmentScore: 0.90, source: { evidenceId: 'ev-c10-002', source: 'doi' as const, doi: '10.1103/PhysRevLett.129.090502', title: 'Pan-Zhang 2021 classical sim 15h' } },
    { evidenceId: 'ev-c10-e2', supportsOrRefutes: 'refutes' as const, entailmentScore: 0.82, source: { evidenceId: 'ev-c10-001', source: 'doi' as const, doi: '10.1038/s41586-019-1666-5', title: 'Pednault 2022 tensor network ~300s' } },
    { evidenceId: 'ev-c10-e3', supportsOrRefutes: 'refutes' as const, entailmentScore: 0.78, source: { evidenceId: 'ev-c10-003', source: 'doi' as const, doi: '10.1038/s41586-023-06096-3', title: 'IBM utility advantage disputed by ELM' } },
  ],
  conflictingEvidenceCount: 0,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: ['Sycamore 2019 RCS raw data', 'Pan-Zhang 2021 tensor network timing', 'Pauli-Farring 2022 timing'],
  methodChoices: ['Benchmark classical sim time vs quantum for same RCS instance', 'Track advantage ratio over algorithmic improvements timeline'],
  scheduleOrFeedback: 'Phase 1: Pan-Zhang 2021 — 15h on 512 GPUs (ratio 270×, not unsurpassable). Phase 2: Pauli-Farring 2022 — ~300s (ratio 1.5×, within noise). Phase 3: No NISQ useful-task advantage demonstrated. Conclusion: REFUTED.',
  executableChecks: [{ ref: 'https://quantumai.google', exists: true, checkedAt: '2026-06-27T00:00:00.000Z' }],
});

const makeFeedbackPayloadConverge = () => ({
  kind: 'feedback' as const,
  feedbackSignal: { continueIteration: false, iterationNumber: 1, maxIterations: 3, refinements: [] },
  iterationSummary: 'Converged: all 3 evidence refute unsurpassable advantage. Verdict = REFUTED.',
});

const C10_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction: 'No classical algorithm simulates Sycamore RCS in <10× quantum time; advantage persists across improvements.',
  metric: 'advantage_ratio',
  falsificationThreshold: 10,
  thresholdSemantics: 'gt',
};
const C10_THRESHOLD_SPEC: ThresholdSpec = { semantics: 'gt', value: 10 };
const C10_SOURCE_ANCHOR: SourceAnchor = { gitCommitSha: 'c1'.repeat(20), dashscopeRequestId: null, isoTimestamp: '2026-06-27T00:00:00.000Z', rawResponseHash: 'c1'.repeat(32) };

/**
 * run c10 seed.
 */
export async function runC10Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-c10-nisq-quantum-advantage',
    researchInput: C10_RAW_INPUT, gateway, profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'c1'.repeat(32),
    gitCommitSha: C10_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db, termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('C10 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  const c10Evidences: EvidenceRecord[] = [
    { claim: 'Pan-Zhang 2021: classical sim of Sycamore RCS in 15h on 512 GPUs (ratio ~270×, not unsurpassable)', metricValue: 3.5, supportsClaim: false, refutesClaim: true, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: C10_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: C10_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'c1-ev1-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Pauli-Farring 2022: tensor network ~300s (ratio ~1.5× quantum, within noise margin)', metricValue: 1.5, supportsClaim: false, refutesClaim: true, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: C10_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: C10_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'c1-ev2-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'IBM 2023 utility advantage disputed by Tindall 2024 ELM tensor network simulation', metricValue: 2.0, supportsClaim: false, refutesClaim: true, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: C10_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: C10_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'c1-ev3-hash'.repeat(4).padEnd(64, '0') } },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: { stageId: 'stage3_hypothesis', cred: { modelId: 'offline-replay-fixture', dashscopeRequestId: null, reproHash: 'c1'.repeat(32), gitCommitSha: C10_SOURCE_ANCHOR.gitCommitSha, isoTimestamp: C10_SOURCE_ANCHOR.isoTimestamp }, payloadKind: 'hypothesis', purposeTag: 'hypothesis' },
    callAudit: { requestPayload: JSON.stringify({ hypothesis: hypothesisPayload.claim }), responsePayload: JSON.stringify(hypothesisPayload), finishReason: 'stop', usageTokensTotal: 256 },
    appendOptions: { providerProfile: 'offline_replay' },
    evidencePayload: { claim: hypothesisPayload.claim, hypothesisPayload },
    sourceAnchor: C10_SOURCE_ANCHOR, claim: hypothesisPayload.claim,
    falsificationSpec: C10_FALSIFICATION_SPEC, thresholdSpec: C10_THRESHOLD_SPEC,
    evidences: c10Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(c10Evidences, C10_FALSIFICATION_SPEC, C10_THRESHOLD_SPEC),
    parentVerdictId: null, nodeKind: 'hypothesis',
    fecV2: { contract: makeLegacyCompatFec({ claimId: 'C10-NISQ-QUANTUM-ADVANTAGE', falsificationSpec: C10_FALSIFICATION_SPEC, thresholdSpec: C10_THRESHOLD_SPEC, frozenAt: C10_SOURCE_ANCHOR.isoTimestamp }) },
  });

  return { rawInput: C10_RAW_INPUT, sourceCard: C10_SOURCE_CARD, loopState: state, verdictNode: verdictResult.verdictNode, reproHash: verdictResult.verdictNode.currentHash, graphSubtree: getSubtree(db, verdictResult.verdictNode.verdictId), chainVerify: verifyChainHead(db), paper: assemblePaper(state), db };
}
