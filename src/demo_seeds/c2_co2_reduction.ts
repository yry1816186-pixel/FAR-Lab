/**
 * Demo Seed: C2 CO2 电催化还原为高附加值化学品（CO2 Electrochemical Reduction on Cu Catalysts）。
 *
 * 问题简述：CO2 电催化还原（CO2RR）声称「Cu 基催化剂可工业化将 CO2 还原为乙烯，
 * FE > 80%、电流密度 > 1 A/cm²、稳定 > 10000h」。证据：Hori 1989 首次发现 Cu 上
 * CO2 → C2H4（FE ~30%）；Kuhl 2012 发现 51 种产物确认 C2+ 路径 → 机制基础强；
 * 但 De Luna 2019 技术经济分析要求 FE≥80%+j≥1 A/cm² 方可与化石乙烯成本匹敌；
 * Jouny 2018 综述显示当前最高 FE ~60%、电流密度 < 500 mA/cm²、寿命 < 200h →
 * DEGRADED_SCOPE（实验室可行，工业放大窄于 claim）。
 *
 * 对齐 Science-125 真实问题："How can we efficiently convert CO2 into fuels and chemicals?"。
 *
 * 真实文献溯源:
 *   - Hori et al. 1989 (Bull. Chem. Soc. Jpn): "Electrochemical reduction of CO2 to ethylene on Cu"
 *     DOI:10.1246/bcsj.62.2308 （Cu 电极上首次实现 CO2 → C2H4, FE ~30%）
 *   - Kuhl et al. 2012 (Energy Environ. Sci.): "New insights into electrochemical CO2 reduction on Cu"
 *     DOI:10.1039/c2ee21259c （51 种产物分布，确认 C2+ 还原路径）
 *   - De Luna et al. 2019 (Science): "What would it take for renewably powered electrosynthesis to
 *     displace petrochemical processes" DOI:10.1126/science.aav3506 （TEA: FE≥80% + j≥1A/cm² 工业门槛）
 *   - Jouny et al. 2018 (Joule): "Carbon dioxide electrolysis to fuels"
 *     DOI:10.1016/j.joule.2018.09.019 （CO2RR 综述：当前 FE~60%、寿命 < 200h）
 *
 * verdict 设计：2 support（Hori + Kuhl 证明 Cu 上 C2+ FE 可行）+ 2 refute（De Luna TEA 经济门槛
 *  未达 + Jouny 寿命远不足）→ DEGRADED_SCOPE（实验室可行，工业放大窄于 claim）。
 *
 * 历史溯源（已归档）: archived-spec可证伪证据链_FEC.md §17（Science-125 种子）+ 17 §7.
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

/** Constant: C2_RAW_INPUT. */
export const C2_RAW_INPUT = [
  'CO2 electroreduction on Cu catalysts: Copper is unique among transition metals in its ability to',
  'reduce CO2 to C2+ products (ethylene, ethanol, acetate) at appreciable Faradaic efficiency.',
  'The claim is that Cu-based electrocatalysts can INDUSTRIALLY reduce CO2 to ethylene at >80%',
  'Faradaic Efficiency, >1 A/cm² current density, stable >10,000 hours, thereby displacing',
  'fossil-derived ethylene production. We assess this against: (1) Hori et al. 1989 demonstrated',
  'CO2→C2H4 on Cu at ~30% FE in aqueous KHCO3, establishing the foundational pathway;',
  '(2) Kuhl et al. 2012 identified 51 distinct CO2RR products on Cu, confirming the C2+ mechanism',
  'and achieving max C2H4 FE ~38%; (3) De Luna et al. 2019 techno-economic analysis modeled that',
  'industrial viability requires FE ≥80% AND current density ≥1 A/cm² to match fossil ethylene cost;',
  'and (4) Jouny et al. 2018 reviewed CO2 electrolysis literature showing current best FE ~60% for',
  'ethylene at <500 mA/cm² with <200h stability, far below the industrial threshold.',
].join(' ');

/** Constant: C2_SOURCE_CARD. */
export const C2_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-c2-hori-1989',
  url: 'https://doi.org/10.1246/bcsj.62.2308',
  title: 'Electrochemical reduction of CO2 to ethylene on Cu electrodes (Hori 1989)',
  sourceType: 'paper',
  publisher: 'Bulletin of the Chemical Society of Japan',
  fetchedAt: '2026-07-27T00:00:00.000Z',
  claim: 'Cu electrodes uniquely reduce CO2 to C2H4 at ~30% Faradaic efficiency in aqueous KHCO3, establishing the foundational CO2RR-to-hydrocarbon pathway.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement: 'Test whether Cu-based electrocatalysts can industrially reduce CO2 to ethylene at >80% Faradaic efficiency, >1 A/cm² current density, stable >10,000 hours, achieving cost parity with fossil-derived ethylene ($≤1.0/kg).',
  scope: 'Gas-diffusion electrode (GDE) / flow electrolyzer with Cu-based catalyst. Metrics: Faradaic efficiency (FE_C2H4), current density (j), stability (hours to 50% FE degradation). Target: FE_C2H4≥80% AND j≥1 A/cm² AND stability>10000h. Electrolyte: 1M KOH/KHCO3, ambient pressure, CO2-saturated feed.',
  keyTerms: ['CO2 electroreduction (CO2RR)', 'Faradaic efficiency (FE)', 'overpotential', 'current density', 'gas-diffusion electrode (GDE)', 'Cu nanoparticle catalyst', 'C2+ products (ethylene/ethanol)', 'membrane electrode assembly (MEA)', 'techno-economic analysis (TEA)', 'carbonate crossover'],
  falsifiableAngle: 'Testable: Cu-GDE achieves FE_C2H4≥80% at j≥1 A/cm² for ≥1000h continuous operation in flow cell, reproduced by ≥3 independent labs, AND TEA confirms ethylene cost ≤$1.0/kg. Current: best FE_C2H4~60% at j<500 mA/cm², stability <200h.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    { evidenceId: 'ev-c2-001', source: 'doi' as const, doi: '10.1246/bcsj.62.2308', title: 'Hori 1989 — Cu electrodes reduce CO2 to C2H4' },
    { evidenceId: 'ev-c2-002', source: 'doi' as const, doi: '10.1039/c2ee21259c', title: 'Kuhl 2012 — 51 CO2RR products on Cu' },
    { evidenceId: 'ev-c2-003', source: 'doi' as const, doi: '10.1126/science.aav3506', title: 'De Luna 2019 — TEA for CO2 electrosynthesis' },
    { evidenceId: 'ev-c2-004', source: 'doi' as const, doi: '10.1016/j.joule.2018.09.019', title: 'Jouny 2018 — CO2 electrolysis to fuels review' },
  ],
  knowledgeGraphSummary:
    'Mechanistic evidence is MODERATE: (1) Hori 1989 first demonstrated Cu-catalyzed CO2→C2H4 at FE ~30% ' +
    'in aqueous KHCO3, establishing the foundational C-C coupling pathway; (2) Kuhl 2012 quantified 51 distinct ' +
    'CO2RR products on Cu across a wide potential range, confirming the complex C2+ reaction network and ' +
    'identifying ethylene and ethanol as major products at moderate overpotentials. ' +
    'HOWEVER, industrial translation is INSUFFICIENT: (3) De Luna 2019 TEA modeled that renewable-powered ' +
    'CO2 electrosynthesis would require FE ≥80% at j ≥1 A/cm² to compete with fossil ethylene (~$1.0/kg); ' +
    '(4) Jouny 2018 comprehensive review found the best reported CO2RR performance was FE_C2H4 ~60% at ' +
    'j <500 mA/cm², with stability limited to <200h due to carbonate precipitation, catalyst restructuring, ' +
    'and membrane degradation. The gap between lab benchmarks and industrial requirements is >2× in FE, ' +
    '>5× in current density, and >50× in stability. The "industrial-scale" claim is premature; ' +
    '"lab-scale C2+ production demonstrated" is supported.',
  gaps: ['FE_C2H4 < 80% at >500 mA/cm² in all published work', 'Stability < 200h for most Cu catalysts (carbonate/crossover degradation)', 'No published TEA demonstrating cost parity with fossil ethylene', 'CO2 supply chain purity and cost not validated at industrial scale', 'MEA stack durability unknown beyond single-cell demonstrations'],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim: 'Cu-based electrocatalysts can industrially reduce CO2 to ethylene at >80% Faradaic efficiency, >1 A/cm² current density, stable >10,000 hours.',
  falsificationMethod: { prediction: '≥3 independent labs reproduce FE_C2H4≥80% at j≥1 A/cm², stable ≥1000h continuous operation, AND TEA confirms ethylene cost ≤$1.0/kg.', metric: 'FE≥80% AND current density≥1 A/cm² AND stability>10000h', comparator: 'gt' as const, value: 0.8 },
  supportingCitations: ['ev-c2-001', 'ev-c2-002'],
  scopeSlipText: 'Scope: Cu-based GDE in flow electrolyzer, CO2-saturated 1M KOH/KHCO3 electrolyte, ambient pressure. Excludes high-pressure (>10 bar) reactors and non-Cu catalysts (Ag, Au, Sn, Bi).',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    { evidenceId: 'ev-c2-e1', supportsOrRefutes: 'supports' as const, entailmentScore: 0.70, source: { evidenceId: 'ev-c2-001', source: 'doi' as const, doi: '10.1246/bcsj.62.2308', title: 'Hori 1989 — Cu reduces CO2 to C2H4 (FE ~30%)' } },
    { evidenceId: 'ev-c2-e2', supportsOrRefutes: 'supports' as const, entailmentScore: 0.72, source: { evidenceId: 'ev-c2-002', source: 'doi' as const, doi: '10.1039/c2ee21259c', title: 'Kuhl 2012 — 51 products, C2+ route confirmed' } },
    { evidenceId: 'ev-c2-e3', supportsOrRefutes: 'refutes' as const, entailmentScore: 0.85, source: { evidenceId: 'ev-c2-003', source: 'doi' as const, doi: '10.1126/science.aav3506', title: 'De Luna 2019 — TEA: needs FE≥80% + j≥1A/cm²' } },
    { evidenceId: 'ev-c2-e4', supportsOrRefutes: 'refutes' as const, entailmentScore: 0.80, source: { evidenceId: 'ev-c2-004', source: 'doi' as const, doi: '10.1016/j.joule.2018.09.019', title: 'Jouny 2018 — review: FE~60%, stability<200h' } },
  ],
  conflictingEvidenceCount: 2,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: ['Hori 1989 Cu foil electrode data', 'Kuhl 2012 51-product distribution dataset', 'De Luna 2019 techno-economic model parameters'],
  methodChoices: ['Cu nanoparticle synthesis + GDE fabrication + flow cell CO2RR testing', 'Online GC/MS product quantification (gas + liquid phase)', 'Chronoamperometric stability testing at constant j = 500 mA/cm²'],
  scheduleOrFeedback: 'Phase 1: Synthesize Cu nanocubes/dendrites (size 20-100 nm), deposit on GDE (carbon paper + PTFE). Phase 2: Flow cell CO2RR with 1M KOH, optimize FE_C2H4 vs potential and flow rate. Phase 3: Pilot-scale MEA stack (100 cm²) + ≥1000h durability test. Current status: FE_C2H4 ≤60% at j ≤500 mA/cm², stability <200h. Conclusion: industrial-scope claim (>80% FE, >1 A/cm², >10000h) not supported → DEGRADED_SCOPE.',
  executableChecks: [{ ref: 'https://doi.org/10.1246/bcsj.62.2308', exists: true, checkedAt: '2026-07-27T00:00:00.000Z' }, { ref: 'https://doi.org/10.1039/c2ee21259c', exists: true, checkedAt: '2026-07-27T00:00:00.000Z' }],
});

const makeFeedbackPayloadConverge = () => ({ kind: 'feedback' as const, feedbackSignal: { continueIteration: false, iterationNumber: 1, maxIterations: 3, refinements: [] }, iterationSummary: 'Converged: lab Cu FE feasible (Hori + Kuhl), but industrial TEA (De Luna) + stability (Jouny) not yet achieved. DEGRADED_SCOPE.' });

const C2_FALSIFICATION_SPEC: FalsificationSpec = { prediction: '≥3 independent labs reproduce FE_C2H4≥80% at j≥1 A/cm², stable ≥1000h, AND TEA shows ethylene cost ≤$1.0/kg.', metric: 'FE≥80% AND current density≥1 A/cm² AND stability>10000h', falsificationThreshold: 0.8, thresholdSemantics: 'gt' };
const C2_THRESHOLD_SPEC: ThresholdSpec = { semantics: 'gt', value: 0.8 };
const C2_SOURCE_ANCHOR: SourceAnchor = { gitCommitSha: 'c2'.repeat(20), dashscopeRequestId: null, isoTimestamp: '2026-07-27T00:00:00.000Z', rawResponseHash: 'c2'.repeat(32) };

/**
 * run c2 seed.
 */
export async function runC2Seed(): Promise<DemoSeedResult> {
  const db = openDb();
  const fixtureContents: readonly string[] = [JSON.stringify(makeUnderstandingPayload()), JSON.stringify(makeIntegrationPayload()), JSON.stringify(makeHypothesisPayload()), JSON.stringify(makeEvidencePayload()), JSON.stringify(makePlanPayload()), JSON.stringify(makeFeedbackPayloadConverge())];
  const gateway = createSequentialGateway(fixtureContents);
  const state = await runAgentLoop({ runId: 'demo-c2-co2-reduction', researchInput: C2_RAW_INPUT, gateway, profile: 'offline_replay', finishReasonExtractor: extractFinishReasonForOfflineReplay, reproHashProvider: () => 'c2'.repeat(32), gitCommitSha: C2_SOURCE_ANCHOR.gitCommitSha, appendOptions: { providerProfile: 'offline_replay' }, evidenceLogDb: db, termination: DEFAULT_TERMINATION });
  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') { throw new Error('C2 seed: stage3 artifact is missing or not hypothesis'); }
  const hypothesisPayload = stage3.structured;
  const c2Evidences: EvidenceRecord[] = [
    { claim: 'Hori 1989: Cu electrodes reduce CO2 → C2H4 at FE ~30% in aqueous KHCO3 (foundational pathway)', metricValue: 0.30, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: true, sourceAnchor: { gitCommitSha: C2_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: C2_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'c2-ev1-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Kuhl 2012: 51 products on Cu, max C2H4 FE 38% at -1.05V vs RHE (C2+ route confirmed)', metricValue: 0.38, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: true, sourceAnchor: { gitCommitSha: C2_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: C2_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'c2-ev2-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'De Luna 2019 TEA: industrial viability requires FE≥80% AND j≥1A/cm²; current state far below (FE~40%, j~0.2A/cm²)', metricValue: 0.15, supportsClaim: false, refutesClaim: true, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: C2_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: C2_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'c2-ev3-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Jouny 2018 review: best CO2RR FE_C2H4 ~60% at <500 mA/cm², stability <200h (carbonate + crossover limits)', metricValue: 0.10, supportsClaim: false, refutesClaim: true, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: C2_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: C2_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'c2-ev4-hash'.repeat(4).padEnd(64, '0') } },
  ];
  const verdictResult = fecAppendClaim(db, { callRecord: { stageId: 'stage3_hypothesis', cred: { modelId: 'offline-replay-fixture', dashscopeRequestId: null, reproHash: 'c2'.repeat(32), gitCommitSha: C2_SOURCE_ANCHOR.gitCommitSha, isoTimestamp: C2_SOURCE_ANCHOR.isoTimestamp }, payloadKind: 'hypothesis', purposeTag: 'hypothesis' }, callAudit: { requestPayload: JSON.stringify({ hypothesis: hypothesisPayload.claim }), responsePayload: JSON.stringify(hypothesisPayload), finishReason: 'stop', usageTokensTotal: 256 }, appendOptions: { providerProfile: 'offline_replay' }, evidencePayload: { claim: hypothesisPayload.claim, hypothesisPayload }, sourceAnchor: C2_SOURCE_ANCHOR, claim: hypothesisPayload.claim, falsificationSpec: C2_FALSIFICATION_SPEC, thresholdSpec: C2_THRESHOLD_SPEC, evidences: c2Evidences, statistics: bridgeLegacyEvidencesToStatistics(c2Evidences, C2_FALSIFICATION_SPEC, C2_THRESHOLD_SPEC), parentVerdictId: null, nodeKind: 'hypothesis', fecV2: { contract: makeLegacyCompatFec({ claimId: 'C2-CO2-ELECTROREDUCTION', falsificationSpec: C2_FALSIFICATION_SPEC, thresholdSpec: C2_THRESHOLD_SPEC, frozenAt: C2_SOURCE_ANCHOR.isoTimestamp }) } });
  return { rawInput: C2_RAW_INPUT, sourceCard: C2_SOURCE_CARD, loopState: state, verdictNode: verdictResult.verdictNode, reproHash: verdictResult.verdictNode.currentHash, graphSubtree: getSubtree(db, verdictResult.verdictNode.verdictId), chainVerify: verifyChainHead(db), paper: assemblePaper(state), db };
}
