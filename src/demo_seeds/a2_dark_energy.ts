/**
 * Demo Seed: A2 宇宙加速膨胀的本质——暗能量状态方程 w（Dark Energy Equation of State）。
 *
 * 问题简述：ΛCDM 假设暗能量是宇宙学常数（w=-1），但 H0 tension（Planck 67.4 vs SH0ES 74.0，
 * 5σ 差异）+ 弱透镜/BAO 对 w 的约束 w=-1.0±0.05，证据混合 → INCONCLUSIVE。
 *
 * 对齐 Science-125 真实问题："What is the nature of dark energy driving cosmic acceleration?"。
 *
 * 真实文献溯源:
 *   - Riess et al. 1998 (AJ): "Observational evidence from supernovae for an accelerating universe"
 *     DOI:10.1086/300499 （Ia 型超新星首次发现宇宙加速膨胀·2011 年诺贝尔奖基石）
 *   - Perlmutter et al. 1999 (ApJ): "Measurements of Ω and Λ from 42 high-redshift supernovae"
 *     DOI:10.1086/307221 （独立团队确认加速膨胀·宇宙学常数证据链）
 *   - Planck Collaboration 2020 (A&A): "Planck 2018 results. VI. Cosmological parameters"
 *     DOI:10.1051/0004-6361/201833910 （CMB 精确测量 w=-1.03±0.05·ΛCDM 强约束）
 *   - Riess et al. 2019 (ApJ): "Cepheid host distance to NGC 4258 (H0=74.03±1.42)"
 *     DOI:10.3847/1538-4357/ab24f5 （SH0ES 本地 H0 测量·5σ tension）
 *
 * verdict 设计：INCONCLUSIVE —— ΛCDM 的 w=-1 在 CMB+SN Ia 约束下成立，但 H0 tension（≥5σ）
 * 暗示可能的新物理学（演化暗能量 / 早期暗能量 / 修正引力），尚无决定性证据推翻或确认。
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
import type { EvidenceRecord, FalsificationSpec, ThresholdSpec } from '../../src/falsifiability/types.ts';
import type { SourceCard } from '../../src/schema/enums.ts';
import { openDb, createSequentialGateway } from './helpers.ts';
import type { DemoSeedResult } from './a4_planetary_orbit_decay.ts';

/** Constant: A2_RAW_INPUT. */
export const A2_RAW_INPUT = [
  'The accelerating expansion of the Universe was discovered in 1998 (Riess et al., Perlmutter et al.)',
  'via Type Ia supernovae, earning the 2011 Nobel Prize. The simplest explanation is a Cosmological',
  'Constant Λ with equation of state parameter w = -1 (ΛCDM). Planck 2018 CMB data gives',
  'w = -1.03 ± 0.05, consistent with ΛCDM. However, the Hubble constant tension — Planck (early',
  'Universe CMB) H0 = 67.4 ± 0.5 vs SH0ES (local Cepheid+SN) H0 = 74.03 ± 1.42 km/s/Mpc — now',
  'exceeds 5σ, suggesting either unknown systematics or new physics beyond ΛCDM (e.g., evolving',
  'dark energy w(a), early dark energy, modified gravity). The core scientific question: is dark',
  'energy a cosmological constant (w = -1 precisely) or a dynamical field with w ≠ -1?',
].join(' ');

/** Constant: A2_SOURCE_CARD. */
export const A2_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-a2-planck-2018',
  url: 'https://doi.org/10.1051/0004-6361/201833910',
  title: 'Planck 2018 results. VI. Cosmological parameters (Planck Collaboration 2020)',
  sourceType: 'paper',
  publisher: 'Astronomy & Astrophysics',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: 'CMB temperature and polarization power spectra constrain w = -1.03 ± 0.05, consistent with ΛCDM cosmological constant.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement: 'Determine whether dark energy is a cosmological constant (w = -1 precisely) or a dynamical field (w ≠ -1, possibly evolving with redshift), using CMB, BAO, SN Ia, and local H0 measurements.',
  scope: 'Flat ΛCDM baseline with w parameterized as constant or CPL w(a) = w0 + wa(1-a). Probes: CMB (Planck 2018), BAO (SDSS/eBOSS), SN Ia (Pantheon+), local H0 (SH0ES).',
  keyTerms: ['dark energy', 'equation of state w', 'cosmological constant Λ', 'Hubble tension', 'ΛCDM', 'CMB (Cosmic Microwave Background)', 'BAO (Baryon Acoustic Oscillations)', 'Type Ia supernovae', 'H0 tension', 'CPL parameterization w(a)'],
  falsifiableAngle: 'Testable: w = -1.000 ± 0.005 predicted by ΛCDM. If ≥3 independent probes measure w < -1.01 or w > -0.99 at ≥3σ, or H0 discrepancy >5σ between early and late Universe probes persists after systematics review, ΛCDM is falsified.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    { evidenceId: 'ev-a2-001', source: 'doi' as const, doi: '10.1086/300499', title: 'Riess 1998 SN Ia discovery of accelerating universe' },
    { evidenceId: 'ev-a2-002', source: 'doi' as const, doi: '10.1051/0004-6361/201833910', title: 'Planck 2018 cosmological parameters (w constraint)' },
    { evidenceId: 'ev-a2-003', source: 'doi' as const, doi: '10.3847/1538-4357/ab24f5', title: 'SH0ES H0=74.03±1.42 (5σ tension with Planck)' },
    { evidenceId: 'ev-a2-004', source: 'doi' as const, doi: '10.1086/307221', title: 'Perlmutter 1999 confirming SN Ia acceleration' },
  ],
  knowledgeGraphSummary:
    'ΛCDM with w=-1 fits CMB+BAO+SN data remarkably well (Planck 2018: w=-1.03±0.05). ' +
    'However, the H0 tension is severe: Planck (early Universe CMB) H0=67.4±0.5 vs SH0ES (local Cepheid+SN) ' +
    'H0=74.03±1.42 km/s/Mpc, a >5σ discrepancy that cannot be explained by known systematics alone. ' +
    'If real, this requires new physics: evolving dark energy (w₀≠-1, wₐ≠0), early dark energy, modified gravity, ' +
    'or extra relativistic species. Evidence is MIXED: (1) w constraints favor ΛCDM at high precision, ' +
    '(2) H0 tension disfavors simple ΛCDM, (3) no single extended model consistently resolves all tensions. ' +
    'Weak lensing S8 tension adds further stress on the ΛCDM framework.',
  gaps: ['H0 tension >5σ — no known systematic fully explains it', 'w constraints degenerate with H0 in CMB analysis', 'CPL parameterization may be insufficient for true w(z)', 'Weak lensing S8/σ8 tension adds independent stress on ΛCDM'],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim: 'ΛCDM with w=-1.0±0.05 fits all CMB+BAO+SN Ia data, and the H0 tension is attributable to unknown systematics, not new physics.',
  falsificationMethod: { prediction: 'w uncertainty ≤0.05 across ≥3 independent probes (CMB, BAO, SN Ia) AND H0 consistent within 3σ across early and late Universe probes.', metric: 'concordance_score', comparator: 'gt' as const, value: 0.85 },
  supportingCitations: ['ev-a2-002'],
  scopeSlipText: 'Scope: flat ΛCDM with constant w. Excludes CPL w(a) and modified gravity models unless required by data at >3σ. Probes limited to published datasets with quantified systematics budgets.',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    { evidenceId: 'ev-a2-e1', supportsOrRefutes: 'supports' as const, entailmentScore: 0.93, source: { evidenceId: 'ev-a2-002', source: 'doi' as const, doi: '10.1051/0004-6361/201833910', title: 'Planck 2018 CMB w=-1.03±0.05' } },
    { evidenceId: 'ev-a2-e2', supportsOrRefutes: 'refutes' as const, entailmentScore: 0.91, source: { evidenceId: 'ev-a2-003', source: 'doi' as const, doi: '10.3847/1538-4357/ab24f5', title: 'SH0ES H0 tension 5σ vs Planck' } },
    { evidenceId: 'ev-a2-e3', supportsOrRefutes: 'supports' as const, entailmentScore: 0.87, source: { evidenceId: 'ev-a2-001', source: 'doi' as const, doi: '10.1086/300499', title: 'Riess 1998 SN Ia accelerating universe' } },
    { evidenceId: 'ev-a2-e4', supportsOrRefutes: 'refutes' as const, entailmentScore: 0.82, source: { evidenceId: 'ev-a2-004', source: 'doi' as const, doi: '10.1086/307221', title: 'Perlmutter 1999 SN Ia + H0 discrepancy' } },
  ],
  conflictingEvidenceCount: 2,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: ['Planck 2018 CMB TTTEEE+lowE likelihood', 'SH0ES Cepheid+SN Ia distance ladder', 'SDSS/eBOSS BAO DR16', 'Pantheon+ SN Ia compilation'],
  methodChoices: ['MCMC parameter estimation (Cobaya/MontePython) for ΛCDM + wCDM + w0waCDM', 'H0 consistency test: early (Planck+BAO) vs late (SH0ES+SN) likelihood ratio', 'Bayesian model comparison (ΛCDM vs w0waCDM vs EDE)'],
  scheduleOrFeedback: 'Phase 1: Planck 2018 CMB → w=-1.03±0.05 (supports ΛCDM). Phase 2: SH0ES H0=74.03 → 5σ tension with Planck 67.4. Phase 3: BAO + SN Ia + weak lensing → mixed evidence, w consistent with -1 but H0 tension persistent. Conclusion: ΛCDM claim unconfirmed → INCONCLUSIVE.',
  executableChecks: [{ ref: 'https://pla.esac.esa.int', exists: true, checkedAt: '2026-06-27T00:00:00.000Z' }, { ref: 'https://github.com/PantheonPlusSH0ES', exists: true, checkedAt: '2026-06-27T00:00:00.000Z' }],
});

const makeFeedbackPayloadConverge = () => ({ kind: 'feedback' as const, feedbackSignal: { continueIteration: false, iterationNumber: 1, maxIterations: 3, refinements: [] }, iterationSummary: 'Converged: CMB+SN Ia support ΛCDM w=-1, but H0 tension (5σ) prevents confirmation. INCONCLUSIVE — further data (JWST, LSST, Euclid) needed.' });

const A2_FALSIFICATION_SPEC: FalsificationSpec = { prediction: 'w=-1.0±0.05 across ≥3 independent cosmological probes AND H0 consistent within 3σ between early and late Universe measurements.', metric: 'concordance_score', falsificationThreshold: 0.85, thresholdSemantics: 'gt' };
const A2_THRESHOLD_SPEC: ThresholdSpec = { semantics: 'gt', value: 0.85 };
const A2_SOURCE_ANCHOR: SourceAnchor = { gitCommitSha: 'a2'.repeat(20), dashscopeRequestId: null, isoTimestamp: '2026-06-27T00:00:00.000Z', rawResponseHash: 'a2'.repeat(32) };

/**
 * run a2 seed.
 */
export async function runA2Seed(): Promise<DemoSeedResult> {
  const db = openDb();
  const fixtureContents: readonly string[] = [JSON.stringify(makeUnderstandingPayload()), JSON.stringify(makeIntegrationPayload()), JSON.stringify(makeHypothesisPayload()), JSON.stringify(makeEvidencePayload()), JSON.stringify(makePlanPayload()), JSON.stringify(makeFeedbackPayloadConverge())];
  const gateway = createSequentialGateway(fixtureContents);
  const state = await runAgentLoop({ runId: 'demo-a2-dark-energy-eos', researchInput: A2_RAW_INPUT, gateway, profile: 'offline_replay', finishReasonExtractor: extractFinishReasonForOfflineReplay, reproHashProvider: () => 'a2'.repeat(32), gitCommitSha: A2_SOURCE_ANCHOR.gitCommitSha, appendOptions: { providerProfile: 'offline_replay' }, evidenceLogDb: db, termination: DEFAULT_TERMINATION });
  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') { throw new Error('A2 seed: stage3 artifact is missing or not hypothesis'); }
  const hypothesisPayload = stage3.structured;
  const a2Evidences: EvidenceRecord[] = [
    { claim: 'Planck 2018: CMB TTTEEE+lowE spectra constrain w=-1.03±0.05, consistent with ΛCDM cosmological constant at 1σ.', metricValue: 0.93, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: A2_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: A2_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'a2-ev1-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Riess/SH0ES 2019: H0=74.03±1.42 vs Planck H0=67.4±0.5 km/s/Mpc — 5σ tension, requiring either unknown systematics or new physics beyond ΛCDM.', metricValue: 0.28, supportsClaim: false, refutesClaim: true, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: A2_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: A2_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'a2-ev2-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Riess 1998 + Pantheon+ SN Ia compilation: w≈-1.0±0.08 from late-Universe distance ladder, supports ΛCDM at 1σ.', metricValue: 0.87, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: A2_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: A2_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'a2-ev3-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Combined H0 tension (early vs late Universe) exceeds 5σ; weak lensing S8 tension adds independent stress on ΛCDM framework.', metricValue: 0.40, supportsClaim: false, refutesClaim: true, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: A2_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: A2_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'a2-ev4-hash'.repeat(4).padEnd(64, '0') } },
  ];
  const verdictResult = fecAppendClaim(db, { callRecord: { stageId: 'stage3_hypothesis', cred: { modelId: 'offline-replay-fixture', dashscopeRequestId: null, reproHash: 'a2'.repeat(32), gitCommitSha: A2_SOURCE_ANCHOR.gitCommitSha, isoTimestamp: A2_SOURCE_ANCHOR.isoTimestamp }, payloadKind: 'hypothesis', purposeTag: 'hypothesis' }, callAudit: { requestPayload: JSON.stringify({ hypothesis: hypothesisPayload.claim }), responsePayload: JSON.stringify(hypothesisPayload), finishReason: 'stop', usageTokensTotal: 256 }, appendOptions: { providerProfile: 'offline_replay' }, evidencePayload: { claim: hypothesisPayload.claim, hypothesisPayload }, sourceAnchor: A2_SOURCE_ANCHOR, claim: hypothesisPayload.claim, falsificationSpec: A2_FALSIFICATION_SPEC, thresholdSpec: A2_THRESHOLD_SPEC, evidences: a2Evidences, statistics: bridgeLegacyEvidencesToStatistics(a2Evidences, A2_FALSIFICATION_SPEC, A2_THRESHOLD_SPEC), parentVerdictId: null, nodeKind: 'hypothesis', fecV2: { contract: makeLegacyCompatFec({ claimId: 'A2-DARK-ENERGY-EOS', falsificationSpec: A2_FALSIFICATION_SPEC, thresholdSpec: A2_THRESHOLD_SPEC, frozenAt: A2_SOURCE_ANCHOR.isoTimestamp }) } });
  return { rawInput: A2_RAW_INPUT, sourceCard: A2_SOURCE_CARD, loopState: state, verdictNode: verdictResult.verdictNode, reproHash: verdictResult.verdictNode.currentHash, graphSubtree: getSubtree(db, verdictResult.verdictNode.verdictId), chainVerify: verifyChainHead(db), paper: assemblePaper(state), db };
}
