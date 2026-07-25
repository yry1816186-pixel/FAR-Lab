/**
 * Demo Seed: E8 海洋酸化与珊瑚钙化（Ocean Acidification · Coral Calcification Decline）。
 *
 * 问题简述：海洋酸化（pH 从 8.2 降至 8.1，对应 +50% H⁺）声称导致造礁珊瑚钙化率下降 ≥30%。
 * 证据：meta-analysis（Cornwall 2018 Nature · 200+ 研究）+ mesocosm + field 数据一致确认 → CONFIRMED。
 *
 * 对齐 Science-125 真实问题："What are the consequences of ocean acidification?"。
 *
 * 真实文献溯源:
 *   - Caldeira & Wickett 2003 (Nature): "Oceanography: Anthropogenic carbon and ocean pH"
 *     DOI:10.1038/425365a （奠基·海洋酸化概念）
 *   - Cornwall et al. 2018 (Nature): "Global declines in coral reef calcium carbonate production"
 *     DOI:10.1038/s41586-021-04155-z （全球钙化率下降 meta）
 *   - Chan & Connolly 2013 (Global Change Biology): "Ocean acidification, calcification"
 *     DOI:10.1111/gcb.12220 （珊瑚钙化率 meta-analysis）
 *   - Doney et al. 2009 (Annual Review Marine Science): "Ocean Acidification: The Other CO2 Problem"
 *     DOI:10.1146/annurev.marine.010908.163834
 *
 * verdict 设计：3 条 evidence——全 support（meta-analysis + mesocosm + field 一致确认）→ R7 CONFIRMED。
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
import type { EvidenceRecord, FalsificationSpec, ThresholdSpec } from '../../src/falsifiability/types.ts';
import type { SourceCard } from '../../src/schema/enums.ts';
import { openDb, createSequentialGateway } from './helpers.ts';
import type { DemoSeedResult } from './a4_planetary_orbit_decay.ts';

export const E8_RAW_INPUT = [
  'Ocean acidification coral calcification: Atmospheric CO2 rise has reduced surface ocean pH from 8.2 to',
  '8.1 (~30% increase in H+), projected to reach 7.7-7.8 by 2100 under RCP8.5. The claim is that this pH',
  'decline causes reef-building coral calcification rates to decrease by ≥30%. We assess this against:',
  '(1) Cornwall 2018/2021 meta-analysis of 200+ studies showing consistent decline, (2) mesocosm whole-reef',
  'acidification experiments confirming community-level effects, (3) field data from natural CO2 seeps',
  '(Papua New Guinea, Italy) showing reduced diversity and calcification at low pH, and (4) species-level',
  'variation (some tolerant species) which does not negate the overall trend.',
].join(' ');

export const E8_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-e8-cornwall-calcification-2021',
  url: 'https://doi.org/10.1038/s41586-021-04155-z',
  title: 'Global declines in coral reef calcium carbonate production under ocean acidification (Cornwall 2021)',
  sourceType: 'paper',
  publisher: 'Nature',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: 'Meta-analysis of 200+ studies confirms global coral reef calcium carbonate production decline under ocean acidification.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement: 'Test whether ocean acidification (pH 8.2→8.1, projected 7.7-7.8) causes reef-building coral calcification rate decline ≥30%, as claimed.',
  scope: 'Tropical reef-building corals (Acropora, Porites, Pocillopora). Metric: calcification rate (g CaCO3 m⁻² day⁻¹) at pH 7.7-8.2, meta-analyzed across 200+ studies.',
  keyTerms: ['ocean acidification', 'aragonite saturation (Ωar)', 'coral calcification', 'CO2 seeps (natural analog)', 'mesocosm', 'meta-analysis', 'RCP8.5 scenario'],
  falsifiableAngle: 'Testable: calcification rate at pH 7.7-7.8 is ≤70% of baseline (≥30% decline), consistent across lab/mesocosm/field/natural seep data.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    { evidenceId: 'ev-e8-001', source: 'doi' as const, doi: '10.1038/s41586-021-04155-z', title: 'Cornwall 2021 global calcification decline meta' },
    { evidenceId: 'ev-e8-002', source: 'doi' as const, doi: '10.1111/gcb.12220', title: 'Chan & Connolly 2013 calcification meta-analysis' },
    { evidenceId: 'ev-e8-003', source: 'doi' as const, doi: '10.1038/425365a', title: 'Caldeira & Wickett 2003 ocean pH (foundational)' },
  ],
  knowledgeGraphSummary:
    'Ocean acidification reduces aragonite saturation state (Ωar), directly limiting coral biomineralization. ' +
    'Meta-analysis (Chan-Connolly 2013, 111 studies; Cornwall 2021, 200+ studies) consistently shows calcification ' +
    'decline of 15-64% per unit pH decrease. Natural CO2 seep sites (PNG, Italy) show community shifts to ' +
    'non-calcifying algae at pH <7.9. Mesocosm (Bermuda, Heron Island) whole-reef experiments confirm. ' +
    'Species variation exists (some Porites tolerant) but community-weighted mean decline is robust.',
  gaps: ['Adaptation potential (transgenerational acclimation) uncertain', 'Nutrient interaction (eutrophication amplifies acidification)', 'Warming + acidification synergy (bleaching compounds calcification loss)'],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim: 'Ocean acidification (pH 8.2→7.7-7.8 by 2100 RCP8.5) causes reef-building coral calcification rate to decline ≥30% globally.',
  falsificationMethod: { prediction: 'Meta-analysis of ≥200 studies shows ≥30% calcification decline at pH 7.7-7.8, consistent across lab/mesocosm/field/seep.', metric: 'calcification_decline_fraction', comparator: 'gt' as const, value: 0.3 },
  supportingCitations: ['ev-e8-001', 'ev-e8-002', 'ev-e8-003'],
  scopeSlipText: 'Scope: tropical reef-building corals. Excludes deep-sea corals (cold-water, different Ω sensitivity). Metric: community-weighted mean.',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    { evidenceId: 'ev-e8-e1', supportsOrRefutes: 'supports' as const, entailmentScore: 0.90, source: { evidenceId: 'ev-e8-001', source: 'doi' as const, doi: '10.1038/s41586-021-04155-z', title: 'Cornwall 2021 global meta' } },
    { evidenceId: 'ev-e8-e2', supportsOrRefutes: 'supports' as const, entailmentScore: 0.86, source: { evidenceId: 'ev-e8-002', source: 'doi' as const, doi: '10.1111/gcb.12220', title: 'Chan-Connolly 2013 meta' } },
    { evidenceId: 'ev-e8-e3', supportsOrRefutes: 'supports' as const, entailmentScore: 0.82, source: { evidenceId: 'ev-e8-003', source: 'doi' as const, doi: '10.1038/425365a', title: 'Caldeira 2003 + seep field data' } },
  ],
  conflictingEvidenceCount: 0,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: ['Cornwall 2021 meta (200+ studies)', 'Chan-Connolly 2013 meta (111 studies)', 'PNG/Italy CO2 seep field surveys'],
  methodChoices: ['Random-effects meta-analysis calcification vs Ωar', 'Natural CO2 seep community comparison', 'Mesocosm whole-reef acidification'],
  scheduleOrFeedback: 'Phase 1: Cornwall 2021 — 200+ studies, community calcification decline 30-60% at projected pH. Phase 2: Chan-Connolly 2013 — 111 studies, per-unit-pH decline 15-64%. Phase 3: Natural seeps confirm. All converge → CONFIRMED.',
  executableChecks: [{ ref: 'https://www.gbrmpa.gov.au', exists: true, checkedAt: '2026-06-27T00:00:00.000Z' }],
});

const makeFeedbackPayloadConverge = () => ({ kind: 'feedback' as const, feedbackSignal: { continueIteration: false, iterationNumber: 1, maxIterations: 3, refinements: [] }, iterationSummary: 'Converged: all 3 evidence support ≥30% decline. CONFIRMED.' });

const E8_FALSIFICATION_SPEC: FalsificationSpec = { prediction: 'Meta ≥200 studies shows ≥30% calcification decline at pH 7.7-7.8, cross-method consistent.', metric: 'calcification_decline_fraction', falsificationThreshold: 0.3, thresholdSemantics: 'gt' };
const E8_THRESHOLD_SPEC: ThresholdSpec = { semantics: 'gt', value: 0.3 };
const E8_SOURCE_ANCHOR: SourceAnchor = { gitCommitSha: 'e8'.repeat(20), dashscopeRequestId: null, isoTimestamp: '2026-06-27T00:00:00.000Z', rawResponseHash: 'e8'.repeat(32) };

export async function runE8Seed(): Promise<DemoSeedResult> {
  const db = openDb();
  const fixtureContents: readonly string[] = [JSON.stringify(makeUnderstandingPayload()), JSON.stringify(makeIntegrationPayload()), JSON.stringify(makeHypothesisPayload()), JSON.stringify(makeEvidencePayload()), JSON.stringify(makePlanPayload()), JSON.stringify(makeFeedbackPayloadConverge())];
  const gateway = createSequentialGateway(fixtureContents);
  const state = await runAgentLoop({ runId: 'demo-e8-ocean-acidification-coral', researchInput: E8_RAW_INPUT, gateway, profile: 'offline_replay', finishReasonExtractor: extractFinishReasonForOfflineReplay, reproHashProvider: () => 'e8'.repeat(32), gitCommitSha: E8_SOURCE_ANCHOR.gitCommitSha, appendOptions: { providerProfile: 'offline_replay' }, evidenceLogDb: db, termination: DEFAULT_TERMINATION });
  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') { throw new Error('E8 seed: stage3 artifact is missing or not hypothesis'); }
  const hypothesisPayload = stage3.structured;
  const e8Evidences: EvidenceRecord[] = [
    { claim: 'Cornwall 2021 meta (200+ studies): community calcification decline 30-60% at projected pH 7.7-7.8', metricValue: 0.45, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: E8_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: E8_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'e8-ev1-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Chan-Connolly 2013 meta (111 studies): 15-64% calcification decline per unit pH', metricValue: 0.40, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: E8_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: E8_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'e8-ev2-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Natural CO2 seeps (PNG, Italy): community shift to non-calcifying algae at pH <7.9', metricValue: 0.50, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: E8_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: E8_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'e8-ev3-hash'.repeat(4).padEnd(64, '0') } },
  ];
  const verdictResult = fecAppendClaim(db, { callRecord: { stageId: 'stage3_hypothesis', cred: { modelId: 'offline-replay-fixture', dashscopeRequestId: null, reproHash: 'e8'.repeat(32), gitCommitSha: E8_SOURCE_ANCHOR.gitCommitSha, isoTimestamp: E8_SOURCE_ANCHOR.isoTimestamp }, payloadKind: 'hypothesis', purposeTag: 'hypothesis' }, callAudit: { requestPayload: JSON.stringify({ hypothesis: hypothesisPayload.claim }), responsePayload: JSON.stringify(hypothesisPayload), finishReason: 'stop', usageTokensTotal: 256 }, appendOptions: { providerProfile: 'offline_replay' }, evidencePayload: { claim: hypothesisPayload.claim, hypothesisPayload }, sourceAnchor: E8_SOURCE_ANCHOR, claim: hypothesisPayload.claim, falsificationSpec: E8_FALSIFICATION_SPEC, thresholdSpec: E8_THRESHOLD_SPEC, evidences: e8Evidences, statistics: bridgeLegacyEvidencesToStatistics(e8Evidences, E8_FALSIFICATION_SPEC, E8_THRESHOLD_SPEC), parentVerdictId: null, nodeKind: 'hypothesis', fecV2: { contract: makeLegacyCompatFec({ claimId: 'E8-OCEAN-ACIDIFICATION-CORAL', falsificationSpec: E8_FALSIFICATION_SPEC, thresholdSpec: E8_THRESHOLD_SPEC, frozenAt: E8_SOURCE_ANCHOR.isoTimestamp }) } });
  return { rawInput: E8_RAW_INPUT, sourceCard: E8_SOURCE_CARD, loopState: state, verdictNode: verdictResult.verdictNode, reproHash: verdictResult.verdictNode.currentHash, graphSubtree: getSubtree(db, verdictResult.verdictNode.verdictId), chainVerify: verifyChainHead(db), paper: assemblePaper(state), db };
}
