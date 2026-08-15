/**
 * Demo Seed: E3 全球碳汇分布（陆地 vs 海洋，剩余碳预算）。
 *
 * 问题简述：全球碳收支（Global Carbon Budget）——化石燃料排放约 50% 被陆地
 * 生态系统（3.1±0.6 GtC/yr）和海洋（2.6±0.5 GtC/yr）吸收，大气中剩余约 47%。
 * 多独立方法（大气反演、海洋观测、森林清查、eddy-covariance FLUXNET）收敛确认
 * 碳汇存在且量级一致 → CONFIRMED。
 *
 * 对齐 Science-125 真实问题："What are the global carbon sink distributions (land vs ocean) and remaining carbon budget?"。
 *
 * 真实文献溯源:
 *   - Friedlingstein et al. 2022 (ESSD): "Global Carbon Budget 2022"
 *     DOI:10.5194/essd-14-4811-2022 （GCP 年度碳收支·2012-2021 十年均值）
 *   - Sabine et al. 2004 (Science): "The oceanic sink for anthropogenic CO2"
 *     DOI:10.1126/science.1097403 （海洋人为碳汇首次量化·118±19 PgC）
 *   - Pan et al. 2011 (Science): "A large and persistent carbon sink in the world's forests"
 *     DOI:10.1126/science.1201609 （全球森林碳汇·1990-2007 年均 2.4±0.4 PgC/yr）
 *   - Ballantyne et al. 2012 (Nature): "Increase in observed net carbon dioxide uptake by land and oceans during the past 50 years"
 *     DOI:10.1038/nature11299 （陆地+海洋碳汇长期增长趋势确认）
 *
 * verdict 设计：CONFIRMED。
 * 理由：GCP 年报（自 2006 起）+ 多独立方法（大气反演、海洋观测、森林清查）一致性确认
 * 陆地 3.1±0.6 + 海洋 2.6±0.5 GtC/yr（2012-2021），CONFIRMED。
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

/** Constant: E3_RAW_INPUT. */
export const E3_RAW_INPUT = [
  'Global Carbon Budget: Fossil fuel emissions (9.6±0.5 GtC/yr for 2012-2021) are partitioned into',
  'atmospheric CO2 growth (5.1±0.02 GtC/yr), land carbon sink (3.1±0.6 GtC/yr), and ocean carbon sink',
  '(2.6±0.5 GtC/yr), with a residual budget imbalance of -0.1 GtC/yr. The claim is that independent',
  'observational methods (atmospheric inversions, ocean pCO2 observations, forest inventories,',
  'eddy-covariance flux networks) converge to confirm land + ocean sinks ≈ 50% of fossil emissions.',
  'We assess this against: (1) Friedlingstein et al. 2022 GCP consensus, (2) Sabine et al. 2004 ocean',
  'sink independent confirmation, (3) Pan et al. 2011 global forest sink quantification, and',
  '(4) Ballantyne et al. 2012 long-term sink growth convergence across independent methods.',
].join(' ');

/** Constant: E3_SOURCE_CARD. */
export const E3_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-e3-friedlingstein-2022',
  url: 'https://doi.org/10.5194/essd-14-4811-2022',
  title: 'Global Carbon Budget 2022 (Friedlingstein et al. 2022)',
  sourceType: 'paper',
  publisher: 'Earth System Science Data (ESSD)',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: '2012-2021 decadal mean: fossil emissions 9.6±0.5, atmospheric growth 5.1±0.02, land sink 3.1±0.6, ocean sink 2.6±0.5 GtC/yr.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement: 'Quantify the global carbon budget partitioning: fossil fuel CO2 emissions → atmospheric growth + land sink + ocean sink. Test whether land + ocean sinks consistently absorb ≈50% of annual fossil emissions across independent methods.',
  scope: 'Global annual carbon budget (GtC/yr). Decadal means (2012-2021). Methods: atmospheric inversion (CO2 + O2/N2), ocean pCO2 observations (SOCAT), dynamic global vegetation models (DGVMs), forest inventories (FAO FRA), eddy-covariance (FLUXNET).',
  keyTerms: ['global carbon budget', 'land carbon sink', 'ocean carbon sink', 'atmospheric inversion', 'eddy-covariance', 'FLUXNET', 'SOCAT', 'DGVM', 'CO2 fertilization', 'GtC/yr (gigatonnes carbon per year)', 'airborne fraction', 'residual terrestrial sink'],
  falsifiableAngle: 'Falsifiable: if ≥3 independent methods give land+ocean sink total <40% or >60% of fossil emissions for 3+ consecutive decades, the "≈50% convergence" claim fails. Current: all methods agree within ±0.5 GtC/yr.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    { evidenceId: 'ev-e3-001', source: 'doi' as const, doi: '10.5194/essd-14-4811-2022', title: 'Friedlingstein 2022 Global Carbon Budget' },
    { evidenceId: 'ev-e3-002', source: 'doi' as const, doi: '10.1126/science.1097403', title: 'Sabine 2004 oceanic sink for anthropogenic CO2' },
    { evidenceId: 'ev-e3-003', source: 'doi' as const, doi: '10.1126/science.1201609', title: 'Pan 2011 persistent forest carbon sink' },
    { evidenceId: 'ev-e3-004', source: 'doi' as const, doi: '10.1038/nature11299', title: 'Ballantyne 2012 net CO2 uptake increase' },
  ],
  knowledgeGraphSummary:
    'GLOBAL CARBON BUDGET is a mature, multi-method research framework (GCP annual since 2006). ' +
    'CONVERGENCE EVIDENCE: (1) Atmospheric inversions constrain total sink from CO2 + O2/N2 measurements ' +
    '(NOAA/GML global network); (2) Ocean pCO2 observations (SOCAT, >30 million measurements) independently ' +
    'quantify ocean sink at 2.6±0.5 GtC/yr; (3) Forest inventories (Pan 2011, FAO FRA) confirm global forest ' +
    'sink 2.4±0.4 GtC/yr, augmented by CO2 fertilization in non-forest biomes to total land sink 3.1±0.6 GtC/yr; ' +
    '(4) DGVMs (10+ models) independently simulate land sink within ensemble spread; (5) FLUXNET eddy-covariance ' +
    'towers provide bottom-up validation at >900 sites worldwide. Ballantyne 2012 demonstrates that the ' +
    '50-year trend in net CO2 uptake from atmospheric constraints matches ocean + land sink growth ' +
    '(P < 0.001 for trend concordance). RESIDUAL BUDGET IMBALANCE is small (-0.1 GtC/yr), indicating closure.',
  gaps: ['Residual land sink (RLS) partitioning uncertainty: where exactly on land?', 'CO2 fertilization effect declining? (nutrient limitation, VPD increase)', 'Tropical forest sink saturation signals (Hubau 2020)', 'Northern permafrost thaw emissions not yet in budget (0.1-0.3 GtC/yr)', 'Ocean acidification may slow future ocean sink (decadal scale)'],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim: 'Global Carbon Budget consistently quantifies land (3.1±0.6 GtC/yr) + ocean (2.6±0.5 GtC/yr) carbon sinks ≈ 50% of fossil fuel emissions (9.6±0.5 GtC/yr), with ≥3 independent methods converging within ±0.5 GtC/yr (2012-2021 decadal mean).',
  falsificationMethod: { prediction: '≥3 independent observational methods (atmospheric inversion, ocean pCO2, forest inventory/FLUXNET) agree on land+ocean sink total within ±0.5 GtC/yr. Airborne fraction (atmospheric growth / emissions) is 0.47±0.02, consistent across three decades.', metric: 'method_convergence_delta', comparator: 'lt' as const, value: 0.5 },
  supportingCitations: ['ev-e3-001', 'ev-e3-002', 'ev-e3-003', 'ev-e3-004'],
  scopeSlipText: 'Scope: global annual mean carbon budget, decadal timescale (2012-2021). Excludes sub-annual variability (ENSO-driven anomalies) and regional budget closure (where uncertainties are larger).',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    { evidenceId: 'ev-e3-e1', supportsOrRefutes: 'supports' as const, entailmentScore: 0.96, source: { evidenceId: 'ev-e3-001', source: 'doi' as const, doi: '10.5194/essd-14-4811-2022', title: 'Friedlingstein 2022 GCP budget closure' } },
    { evidenceId: 'ev-e3-e2', supportsOrRefutes: 'supports' as const, entailmentScore: 0.89, source: { evidenceId: 'ev-e3-002', source: 'doi' as const, doi: '10.1126/science.1097403', title: 'Sabine 2004 ocean sink independent quantification' } },
    { evidenceId: 'ev-e3-e3', supportsOrRefutes: 'supports' as const, entailmentScore: 0.85, source: { evidenceId: 'ev-e3-003', source: 'doi' as const, doi: '10.1126/science.1201609', title: 'Pan 2011 global forest sink' } },
  ],
  conflictingEvidenceCount: 0,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: ['GCP 2022 (Friedlingstein ESSD)', 'SOCAT v2022 (ocean pCO2)', 'NOAA/GML Global Greenhouse Gas Reference Network', 'FLUXNET2015 Tier 1', 'FAO Forest Resources Assessment (FRA)'],
  methodChoices: ['Atmospheric inversion (CO2 + O2/N2 mass balance)', 'Ocean pCO2 climatology + MLR (Sabine method)', 'DGVM ensemble (10+ models, TRENDY)', 'Forest inventory extrapolation (Pan method)', 'Eddy-covariance upscaling (FLUXCOM)'],
  scheduleOrFeedback: 'Phase 1: Atmospheric inversion constrains total sink from CO2 growth rate + fossil emissions (residual method). Phase 2: Ocean sink quantified independently via pCO2 observations (SOCAT) — confirms 2.6±0.5 GtC/yr. Phase 3: Land sink derived as residual or independently via DGVMs, forest inventories (2.4±0.4 GtC/yr), and FLUXNET upscaling — all converge within ±0.5 GtC/yr. Conclusion: CONFIRMED.',
  executableChecks: [{ ref: 'https://www.globalcarbonproject.org/', exists: true, checkedAt: '2026-06-27T00:00:00.000Z' }, { ref: 'https://www.socat.info/', exists: true, checkedAt: '2026-06-27T00:00:00.000Z' }],
});

const makeFeedbackPayloadConverge = () => ({ kind: 'feedback' as const, feedbackSignal: { continueIteration: false, iterationNumber: 1, maxIterations: 3, refinements: [] }, iterationSummary: 'Converged: ≥3 independent methods confirm land+ocean sinks ≈50% of fossil emissions within ±0.5 GtC/yr. CONFIRMED.' });

const E3_FALSIFICATION_SPEC: FalsificationSpec = { prediction: '≥3 independent methods agree on land+ocean sink total within ±0.5 GtC/yr (2012-2021 decadal mean)', metric: 'method_convergence_delta', falsificationThreshold: 0.5, thresholdSemantics: 'lt' };
const E3_THRESHOLD_SPEC: ThresholdSpec = { semantics: 'lt', value: 0.5 };
const E3_SOURCE_ANCHOR: SourceAnchor = { gitCommitSha: 'e3'.repeat(20), dashscopeRequestId: null, isoTimestamp: '2026-06-27T00:00:00.000Z', rawResponseHash: 'e3'.repeat(32) };

/**
 * run e3 seed.
 */
export async function runE3Seed(): Promise<DemoSeedResult> {
  const db = openDb();
  const fixtureContents: readonly string[] = [JSON.stringify(makeUnderstandingPayload()), JSON.stringify(makeIntegrationPayload()), JSON.stringify(makeHypothesisPayload()), JSON.stringify(makeEvidencePayload()), JSON.stringify(makePlanPayload()), JSON.stringify(makeFeedbackPayloadConverge())];
  const gateway = createSequentialGateway(fixtureContents);
  const state = await runAgentLoop({ runId: 'demo-e3-global-carbon-sink', researchInput: E3_RAW_INPUT, gateway, profile: 'offline_replay', finishReasonExtractor: extractFinishReasonForOfflineReplay, reproHashProvider: () => 'e3'.repeat(32), gitCommitSha: E3_SOURCE_ANCHOR.gitCommitSha, appendOptions: { providerProfile: 'offline_replay' }, evidenceLogDb: db, termination: DEFAULT_TERMINATION });
  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') { throw new Error('E3 seed: stage3 artifact is missing or not hypothesis'); }
  const hypothesisPayload = stage3.structured;
  const e3Evidences: EvidenceRecord[] = [
    { claim: 'Friedlingstein 2022 GCP: land sink 3.1±0.6, ocean sink 2.6±0.5, airborne fraction 0.47±0.02 (2012-2021). Multiple independent method convergence within ±0.5 GtC/yr.', metricValue: 0.96, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: E3_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: E3_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'e3-ev1-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Sabine 2004: ocean anthropogenic CO2 inventory 118±19 PgC, independently confirming ocean sink magnitude consistent with GCP annual estimates.', metricValue: 0.89, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: E3_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: E3_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'e3-ev2-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Pan 2011: global forest carbon sink 2.4±0.4 PgC/yr (1990-2007), consistent with DGVM-based land sink partitioning within GCP budget.', metricValue: 0.85, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: E3_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: E3_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'e3-ev3-hash'.repeat(4).padEnd(64, '0') } },
  ];
  const verdictResult = fecAppendClaim(db, { callRecord: { stageId: 'stage3_hypothesis', cred: { modelId: 'offline-replay-fixture', dashscopeRequestId: null, reproHash: 'e3'.repeat(32), gitCommitSha: E3_SOURCE_ANCHOR.gitCommitSha, isoTimestamp: E3_SOURCE_ANCHOR.isoTimestamp }, payloadKind: 'hypothesis', purposeTag: 'hypothesis' }, callAudit: { requestPayload: JSON.stringify({ hypothesis: hypothesisPayload.claim }), responsePayload: JSON.stringify(hypothesisPayload), finishReason: 'stop', usageTokensTotal: 256 }, appendOptions: { providerProfile: 'offline_replay' }, evidencePayload: { claim: hypothesisPayload.claim, hypothesisPayload }, sourceAnchor: E3_SOURCE_ANCHOR, claim: hypothesisPayload.claim, falsificationSpec: E3_FALSIFICATION_SPEC, thresholdSpec: E3_THRESHOLD_SPEC, evidences: e3Evidences, statistics: bridgeLegacyEvidencesToStatistics(e3Evidences, E3_FALSIFICATION_SPEC, E3_THRESHOLD_SPEC), parentVerdictId: null, nodeKind: 'hypothesis', fecV2: { contract: makeLegacyCompatFec({ claimId: 'E3-GLOBAL-CARBON-SINK', falsificationSpec: E3_FALSIFICATION_SPEC, thresholdSpec: E3_THRESHOLD_SPEC, frozenAt: E3_SOURCE_ANCHOR.isoTimestamp }) } });
  return { rawInput: E3_RAW_INPUT, sourceCard: E3_SOURCE_CARD, loopState: state, verdictNode: verdictResult.verdictNode, reproHash: verdictResult.verdictNode.currentHash, graphSubtree: getSubtree(db, verdictResult.verdictNode.verdictId), chainVerify: verifyChainHead(db), paper: assemblePaper(state), db };
}
