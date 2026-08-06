/**
 * Demo Seed: H3 生命同手性起源（左旋氨基酸 / 右旋糖·Homochirality Origin of Life）。
 *
 * 问题简述：地球生命使用 L-氨基酸和 D-糖（同手性），但非生物合成产生外消旋混合物。
 * 四种主要假说各自部分支持但无一被证实：(1) 弱相互作用（Vester-Ulbricht 模型 / β 衰变
 * 偏振电子优先分解 D-氨基酸），(2) 圆偏振光（BTRS / 星云 UV-CPL 不对称光解），
 * (3) 陨石带入手性种子（Murchison 陨石 L-异缬氨酸过量 1-15%），(4) Viedma 自催化
 * 结晶放大（Ostwald 熟化 + 研磨 → 手性对称破缺）。证据部分支持每种机制但无单一
 * 机制可独立复现 ≥3 次 ≥10% chiral excess → INCONCLUSIVE（多假说并存·无定论）。
 *
 * 对齐 Science-125 真实问题："How did biological homochirality arise?"。
 *
 * 真实文献溯源:
 *   - Pasteur 1848 (Annales de Chimie et de Physique): "Mémoire sur les relations qui peuvent exister
 *     entre la forme cristalline, la composition chimique et le sens de la polarisation rotatoire"
 *     （手性发现的原始文献·酒石酸盐晶体对映体手工分离）
 *   - Bonner 1991 (Origins of Life and Evolution of the Biosphere): "The origin and amplification of
 *     biomolecular chirality" DOI:10.1007/BF01808159（手性起源机制综述奠基）
 *   - Meierhenrich et al. 2005 (Angewandte Chemie Int. Ed.): "Cometary chiral molecules: Asymmetric
 *     photolysis of amino acids by circularly polarized light" DOI:10.1002/anie.200461359
 *     （模拟星际冰 UV-CPL 光解产生 L-氨基酸过量）
 *   - Glavin et al. 2012 (Meteoritics & Planetary Science): "Unusual nonracemic amino acids in the
 *     Murchison meteorite" DOI:10.1111/j.1945-5100.2012.01400.x（Murchison 陨石 L-异缬氨酸过量
 *     1-15%·非生物手性超额的直接证据）
 *   - Viedma 2005 (Physical Review Letters): "Chiral symmetry breaking during crystallization:
 *     Complete chiral purity induced by nonlinear autocatalysis and recycling"
 *     DOI:10.1103/PhysRevLett.94.065504（研磨 + Ostwald 熟化 → 完全手性纯化·放大机制）
 *
 * verdict 设计：INCONCLUSIVE — 2 supports（外消旋→手性过量机制存在性·多个独立实验证据）+
 * 2 refutes（机制之间互相竞争·无单一机制可独立复现 ≥3 次·Murchison 过量小且变异性大）→
 * 证据强度不足以判定单一 dominant mechanism。
 *
 * 历史溯源（已归档）: FAR_CHAIN_DEV_SPEC/41_可证伪证据链_FEC.md §1（Science-125 种子）。
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

/** Constant: H3_RAW_INPUT. */
export const H3_RAW_INPUT = [
  'Biological homochirality — the exclusive use of L-amino acids and D-sugars by terrestrial life —',
  'is a fundamental unsolved problem in origin-of-life chemistry. Abiotic synthesis produces racemic',
  'mixtures (equal L and D), yet life selected one handedness. Four competing mechanisms are proposed:',
  '(1) weak nuclear force — parity violation in 尾-decay produces spin-polarized electrons that',
  'preferentially degrade D-amino acids (Vester-Ulbricht hypothesis); (2) circularly polarized light',
  '(CPL) from star-forming regions — asymmetric photolysis of racemic amino acids in interstellar ices',
  '(Meierhenrich 2005); (3) meteoritic seeding — carbonaceous chondrites (e.g. Murchison) show',
  'L-enantiomeric excess (1-15%) for non-biological amino acids like isovaline (Glavin 2012);',
  '(4) autocatalytic crystallization — Viedma ripening (grinding + Ostwald ripening) can amplify a',
  'tiny initial chiral imbalance to near-complete enantiopurity. We assess the claim that a SINGLE',
  'dominant physical mechanism drives the origin of biological homochirality. Each mechanism has partial',
  'experimental support, but none has been independently replicated ≥3 times producing ≥10% chiral excess.',
  'The field remains at an impasse — multiple plausible hypotheses coexist without a decisive experiment.',
].join(' ');

/** Constant: H3_SOURCE_CARD. */
export const H3_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-h3-meierhenrich-2005',
  url: 'https://doi.org/10.1002/anie.200461359',
  title: 'Cometary chiral molecules: Asymmetric photolysis of amino acids by circularly polarized light (Meierhenrich 2005)',
  sourceType: 'paper',
  publisher: 'Angewandte Chemie International Edition',
  fetchedAt: '2025-07-27T00:00:00.000Z',
  claim: 'UV circularly polarized light induces enantiomeric excess in amino acids under simulated interstellar ice conditions.',
  evidenceLevel: 'primary',
  stability: 'stable',
  usedFor: 'scientific_evidence',
};

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement: 'Determine whether a single dominant physical mechanism drives the origin of biological homochirality (L-amino acids / D-sugars), as opposed to a combination of multiple independent or coupled mechanisms.',
  scope: 'Prebiotic chemistry: amino acids and sugars in aqueous and interstellar ice environments. Scope covers four candidate mechanisms — weak nuclear force (Vester-Ulbricht), circularly polarized light (BTRS), meteoritic seeding (Murchison), autocatalytic crystallization (Viedma). Metric: ≥3 independent lab experiments replicating ≥10% chiral excess using the same mechanism.',
  keyTerms: ['homochirality', 'L-amino acids', 'D-sugars', 'enantiomeric excess (ee)', 'Vester-Ulbricht hypothesis', 'circularly polarized light (CPL)', 'Murchison meteorite', 'isovaline', 'Viedma ripening', 'Ostwald ripening', 'chiral symmetry breaking', 'racemic mixture'],
  falsifiableAngle: 'Testable: claim that a single mechanism dominates is falsified if ≥2 independent mechanisms each produce ≥10% ee under plausible prebiotic conditions, OR if no single mechanism achieves ≥3 replications at ≥10% ee. Current: all 4 mechanisms have partial support, none cross the replication threshold.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    { evidenceId: 'ev-h3-001', source: 'other' as const, doi: null, title: 'Pasteur 1848 — Discovery of molecular chirality (tartrate crystal enantiomers)' },
    { evidenceId: 'ev-h3-002', source: 'doi' as const, doi: '10.1007/BF01808159', title: 'Bonner 1991 — Origin and amplification of biomolecular chirality (review)' },
    { evidenceId: 'ev-h3-003', source: 'doi' as const, doi: '10.1002/anie.200461359', title: 'Meierhenrich 2005 — Asymmetric photolysis of amino acids by CPL' },
    { evidenceId: 'ev-h3-004', source: 'doi' as const, doi: '10.1111/j.1945-5100.2012.01400.x', title: 'Glavin 2012 — Nonracemic amino acids in Murchison meteorite' },
    { evidenceId: 'ev-h3-005', source: 'doi' as const, doi: '10.1103/PhysRevLett.94.065504', title: 'Viedma 2005 — Chiral symmetry breaking during crystallization' },
  ],
  knowledgeGraphSummary:
    'Four independent mechanisms for the origin of biological homochirality have partial experimental support. ' +
    '(1) Weak interaction: parity-violating energy difference (PVED) between L- and D-amino acids is ~10⁻¹⁷ kT ' +
    'per molecule — theoretically insufficient for amplification without autocatalytic feedback (Bonner 1991). ' +
    '(2) CPL photolysis: Meierhenrich et al. (2005) demonstrated ee up to ~2.6% for leucine under UV-CPL in ' +
    'simulated interstellar ice; subsequent experiments improved to ~5% but not ≥10%. (3) Meteoritic seeding: ' +
    'Glavin et al. (2012) found L-isovaline excess of 1-15% in Murchison, but excess varies by amino acid ' +
    '(some are racemic) and across different meteorites. (4) Viedma ripening: complete chiral amplification ' +
    'from ~5% ee to >99% via grinding + Ostwald ripening, but requires an initial chiral bias — does not ' +
    'explain the origin of that initial bias. Key gap: no single mechanism has been independently replicated ' +
    'by ≥3 labs producing ≥10% ee under prebiotically plausible conditions.',
  gaps: [
    'No single mechanism independently replicated ≥3 times at ≥10% ee',
    'PVED (10⁻¹⁷ kT) is too small to drive amplification without unknown autocatalytic coupling',
    'Murchison ee varies by amino acid (1-15%) and meteorite — inconsistent seeding signal',
    'Viedma amplification requires initial bias; ultimate origin of first bias unexplained',
    'Mechanisms may be coupled (e.g., meteoritic seeding + Viedma amplification) — their interaction is untested',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim: 'A single dominant physical mechanism drives the origin of biological homochirality, with ≥3 independent lab experiments replicating chiral excess ≥10% using the same identified mechanism.',
  falsificationMethod: { prediction: '≥3 independent laboratories replicate ≥10% enantiomeric excess using a single identified physical mechanism under prebiotically plausible conditions.', metric: 'independent_replication_count', comparator: 'gt' as const, value: 2 },
  supportingCitations: ['ev-h3-003', 'ev-h3-005'],
  scopeSlipText: 'Scope: prebiotic homochirality origin in amino acids and sugars. Excludes biological amplification post-origin (e.g., enzymatic resolution in extant metabolism). Mechanisms must operate under plausible Hadean/early Archean conditions.',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    { evidenceId: 'ev-h3-e1', supportsOrRefutes: 'supports' as const, entailmentScore: 0.72, source: { evidenceId: 'ev-h3-003', source: 'doi' as const, doi: '10.1002/anie.200461359', title: 'Meierhenrich 2005 — CPL photolysis produces ee ~2.6%' } },
    { evidenceId: 'ev-h3-e2', supportsOrRefutes: 'supports' as const, entailmentScore: 0.68, source: { evidenceId: 'ev-h3-005', source: 'doi' as const, doi: '10.1103/PhysRevLett.94.065504', title: 'Viedma 2005 — crystallization amplifies chiral bias' } },
    { evidenceId: 'ev-h3-e3', supportsOrRefutes: 'refutes' as const, entailmentScore: 0.78, source: { evidenceId: 'ev-h3-004', source: 'doi' as const, doi: '10.1111/j.1945-5100.2012.01400.x', title: 'Glavin 2012 — Murchison ee inconsistent (1-15%), amino-acid-dependent' } },
    { evidenceId: 'ev-h3-e4', supportsOrRefutes: 'refutes' as const, entailmentScore: 0.81, source: { evidenceId: 'ev-h3-002', source: 'doi' as const, doi: '10.1007/BF01808159', title: 'Bonner 1991 — PVED too small; no single mechanism sufficient alone' } },
  ],
  conflictingEvidenceCount: 2,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: ['Murchison + other CM2 meteorite amino acid ee measurements', 'UV-CPL interstellar ice simulation experiments (Meierhenrich 2005 + replications)', 'Viedma ripening replicate experiments across ≥3 labs'],
  methodChoices: ['Systematic review of published enantiomeric excess measurements across all 4 mechanisms', 'Meta-analysis: per-mechanism replication rate and mean ee with 95% CI', 'Coupled-mechanism test: meteoritic seeding + Viedma amplification in single experimental pipeline'],
  scheduleOrFeedback: 'Phase 1: Survey literature — compile all published ee measurements for each of the 4 mechanisms. Phase 2: Assess replication — for each mechanism, count independent labs achieving ≥10% ee. Phase 3: If no single mechanism passes the ≥3-replication threshold, test coupled mechanisms (e.g., CPL bias → Viedma amplification). Current: no mechanism passes — INCONCLUSIVE.',
  executableChecks: [{ ref: 'https://doi.org/10.1002/anie.200461359', exists: true, checkedAt: '2025-07-27T00:00:00.000Z' }, { ref: 'https://doi.org/10.1103/PhysRevLett.94.065504', exists: true, checkedAt: '2025-07-27T00:00:00.000Z' }],
});

const makeFeedbackPayloadConverge = () => ({ kind: 'feedback' as const, feedbackSignal: { continueIteration: false, iterationNumber: 1, maxIterations: 3, refinements: [] }, iterationSummary: 'Converged: four mechanisms each partially supported but no single mechanism crosses the ≥3-replication × ≥10% ee threshold. Evidence balanced 2-2 supports vs refutes → INCONCLUSIVE.' });

const H3_FALSIFICATION_SPEC: FalsificationSpec = { prediction: '≥3 independent laboratories replicate ≥10% enantiomeric excess using a single identified physical mechanism under prebiotically plausible conditions.', metric: 'independent_replication_count', falsificationThreshold: 2, thresholdSemantics: 'gt' };
const H3_THRESHOLD_SPEC: ThresholdSpec = { semantics: 'gt', value: 2 };
const H3_SOURCE_ANCHOR: SourceAnchor = { gitCommitSha: 'h3'.repeat(20), dashscopeRequestId: null, isoTimestamp: '2025-07-27T00:00:00.000Z', rawResponseHash: 'h3'.repeat(32) };

/**
 * run h3 seed.
 */
export async function runH3Seed(): Promise<DemoSeedResult> {
  const db = openDb();
  const fixtureContents: readonly string[] = [JSON.stringify(makeUnderstandingPayload()), JSON.stringify(makeIntegrationPayload()), JSON.stringify(makeHypothesisPayload()), JSON.stringify(makeEvidencePayload()), JSON.stringify(makePlanPayload()), JSON.stringify(makeFeedbackPayloadConverge())];
  const gateway = createSequentialGateway(fixtureContents);
  const state = await runAgentLoop({ runId: 'demo-h3-homochirality', researchInput: H3_RAW_INPUT, gateway, profile: 'offline_replay', finishReasonExtractor: extractFinishReasonForOfflineReplay, reproHashProvider: () => 'h3'.repeat(32), gitCommitSha: H3_SOURCE_ANCHOR.gitCommitSha, appendOptions: { providerProfile: 'offline_replay' }, evidenceLogDb: db, termination: DEFAULT_TERMINATION });
  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') { throw new Error('H3 seed: stage3 artifact is missing or not hypothesis'); }
  const hypothesisPayload = stage3.structured;
  const h3Evidences: EvidenceRecord[] = [
    { claim: 'Meierhenrich 2005: UV-CPL photolysis produces L-amino acid ee ~2.6% in simulated interstellar ices — mechanism exists but below 10% threshold.', metricValue: 0.26, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: H3_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: H3_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'h3-ev1-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Viedma 2005: Ostwald ripening + grinding amplifies initial chiral bias (~5% ee) to >99% — amplification mechanism exists but requires pre-existing bias.', metricValue: 0.30, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: H3_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: H3_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'h3-ev2-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Glavin 2012: Murchison L-isovaline excess 1-15%, but excess varies by amino acid and across meteorites — inconsistent signal inconsistent with single dominant mechanism.', metricValue: 0.08, supportsClaim: false, refutesClaim: true, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: H3_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: H3_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'h3-ev3-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Bonner 1991: PVED (~10⁻¹⁷ kT) is theoretically insufficient for amplification — weak interaction alone cannot drive homochirality, evidence favors multi-mechanism coupling.', metricValue: 0.05, supportsClaim: false, refutesClaim: true, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: H3_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: H3_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'h3-ev4-hash'.repeat(4).padEnd(64, '0') } },
  ];
  const verdictResult = fecAppendClaim(db, { callRecord: { stageId: 'stage3_hypothesis', cred: { modelId: 'offline-replay-fixture', dashscopeRequestId: null, reproHash: 'h3'.repeat(32), gitCommitSha: H3_SOURCE_ANCHOR.gitCommitSha, isoTimestamp: H3_SOURCE_ANCHOR.isoTimestamp }, payloadKind: 'hypothesis', purposeTag: 'hypothesis' }, callAudit: { requestPayload: JSON.stringify({ hypothesis: hypothesisPayload.claim }), responsePayload: JSON.stringify(hypothesisPayload), finishReason: 'stop', usageTokensTotal: 256 }, appendOptions: { providerProfile: 'offline_replay' }, evidencePayload: { claim: hypothesisPayload.claim, hypothesisPayload }, sourceAnchor: H3_SOURCE_ANCHOR, claim: hypothesisPayload.claim, falsificationSpec: H3_FALSIFICATION_SPEC, thresholdSpec: H3_THRESHOLD_SPEC, evidences: h3Evidences, statistics: bridgeLegacyEvidencesToStatistics(h3Evidences, H3_FALSIFICATION_SPEC, H3_THRESHOLD_SPEC), parentVerdictId: null, nodeKind: 'hypothesis', fecV2: { contract: makeLegacyCompatFec({ claimId: 'H3-HOMOCHIRALITY', falsificationSpec: H3_FALSIFICATION_SPEC, thresholdSpec: H3_THRESHOLD_SPEC, frozenAt: H3_SOURCE_ANCHOR.isoTimestamp }) } });
  return { rawInput: H3_RAW_INPUT, sourceCard: H3_SOURCE_CARD, loopState: state, verdictNode: verdictResult.verdictNode, reproHash: verdictResult.verdictNode.currentHash, graphSubtree: getSubtree(db, verdictResult.verdictNode.verdictId), chainVerify: verifyChainHead(db), paper: assemblePaper(state), db };
}
