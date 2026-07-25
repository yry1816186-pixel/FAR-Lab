/**
 * Demo Seed: B5 肠道微生物-脑轴与抑郁症（Microbiome-Gut-Brain Axis · FMT for Depression）。
 *
 * 问题简述：肠道微生物-脑轴声称「粪菌移植（FMT）可治愈抑郁症」。证据：机制研究（迷走神经/
 * SCFA/5-HT）+ 动物模型强支持；但人类临床试验结果矛盾（部分阳性 + 部分阴性）+ 安慰剂效应大 →
 * DEGRADED_SCOPE（机制支持但临床证据不足以声称「治愈」·降级为「辅助治疗候选」）。
 *
 * 对齐 Science-125 真实问题："How does the microbiome affect brain and behavior?"。
 *
 * 真实文献溯源:
 *   - Valles-Colomer et al. 2019 (Nature Microbiology): "The neuroactive potential of the human gut microbiota"
 *     DOI:10.1038/s41564-018-0337-x （抑郁症患者肠道菌群 GABA/5-HT 通路差异）
 *   - Cryan et al. 2019 (Nature Reviews Neuroscience): "The microbiome-gut-brain axis"
 *     DOI:10.1038/s41583-018-0051-z （机制综述奠基）
 *   - Zheng et al. 2016 (Molecular Psychiatry): "Gut microbiome remodeling induces depressive-like behaviors"
 *     DOI:10.1038/mp.2016.44 （FMT 移植抑郁表型到无菌鼠）
 *   - Chudzik et al. 2021 (Nutrients): "The role of microbiota-gut-brain axis in depression"
 *     DOI:10.3390/nu13040798 （临床试验综述·矛盾结果）
 *
 * verdict 设计：1 support（机制 + 动物模型强）+ 2 refute（人类 RCT 矛盾 + FMT 治愈率 <20%）→ DEGRADED_SCOPE。
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

export const B5_RAW_INPUT = [
  'Microbiome-gut-brain axis in depression: The gut microbiome influences brain function via vagus nerve,',
  'short-chain fatty acids (SCFA), tryptophan/serotonin metabolism, and immune signaling. Fecal microbiota',
  'transplantation (FMT) from depressed patients to germ-free mice transfers depressive-like behaviors',
  '(Zheng 2016). The claim is that FMT can CURE depression in humans. We assess this against: (1) strong',
  'mechanistic + animal evidence, but (2) human RCTs showing mixed results (some positive, some null),',
  '(3) large placebo response (~30-40% in depression trials), and (4) FMT standardization challenges',
  '(donor variability, engraftment rates).',
].join(' ');

export const B5_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-b5-valles-colomer-2019',
  url: 'https://doi.org/10.1038/s41564-018-0337-x',
  title: 'The neuroactive potential of the human gut microbiota in depression (Valles-Colomer 2019)',
  sourceType: 'paper',
  publisher: 'Nature Microbiology',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: 'Depression patients show altered gut microbiota with reduced neuroactive potential (GABA/serotonin pathways).',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement: 'Test whether fecal microbiota transplantation (FMT) can CURE major depressive disorder (MDD) in humans, achieving remission (HAM-D ≤7) in ≥50% of treatment-resistant patients.',
  scope: 'Adults with MDD (DSM-5), treatment-resistant (failed ≥2 antidepressants). Metric: HAM-D response rate + remission rate at 8 weeks post-FMT vs placebo.',
  keyTerms: ['microbiome-gut-brain axis', 'fecal microbiota transplantation (FMT)', 'vagus nerve signaling', 'short-chain fatty acids (SCFA)', 'tryptophan/serotonin metabolism', 'germ-free mouse (GF)', 'HAM-D (Hamilton Depression Rating)', 'placebo response'],
  falsifiableAngle: 'Testable: RCT with ≥50% FMT remission vs ≤25% placebo remission (NNT ≤4), replicated in ≥3 independent trials. Current: mixed results, no consistent ≥50%.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    { evidenceId: 'ev-b5-001', source: 'doi' as const, doi: '10.1038/s41564-018-0337-x', title: 'Valles-Colomer 2019 neuroactive microbiota' },
    { evidenceId: 'ev-b5-002', source: 'doi' as const, doi: '10.1038/mp.2016.44', title: 'Zheng 2016 FMT transfers depressive phenotype' },
    { evidenceId: 'ev-b5-003', source: 'doi' as const, doi: '10.3390/nu13040798', title: 'Chudzik 2021 clinical trial review (mixed)' },
  ],
  knowledgeGraphSummary:
    'Mechanistic evidence is STRONG: (1) GF mice receiving FMT from depressed patients develop depressive behaviors ' +
    '(Zheng 2016); (2) microbiota produce neurotransmitters (GABA, 5-HT, dopamine) + SCFA (butyrate, epigenetic ' +
    'HDAC inhibitor); (3) vagus nerve mediates gut-brain signaling (subdiaphragmatic vagotomy blocks effects). ' +
    'HOWEVER, clinical translation is WEAK: RCTs (Chudzik 2021 review) show 25-40% FMT response vs 20-35% placebo ' +
    '(non-significant in most trials), high placebo response in depression (~30-40%), donor variability, and ' +
    'engraftment rates 30-70%. The "cure" claim is too strong; "adjunctive therapy candidate" is supported.',
  gaps: ['RCT mixed results — no trial shows ≥50% remission', 'Placebo response ~35% in depression RCTs', 'Donor variability (super-donor phenomenon)', 'Engraftment rates variable (30-70%)', 'Long-term durability unknown (relapse at 6mo)'],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim: 'FMT can CURE major depressive disorder (MDD), achieving remission (HAM-D ≤7) in ≥50% of treatment-resistant patients.',
  falsificationMethod: { prediction: '≥3 independent RCTs show FMT remission ≥50% vs placebo ≤25%, replicated.', metric: 'remission_rate', comparator: 'gt' as const, value: 0.5 },
  supportingCitations: ['ev-b5-002'],
  scopeSlipText: 'Scope: treatment-resistant MDD (DSM-5, failed ≥2 antidepressants). Excludes mild/moderate depression (different population).',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    { evidenceId: 'ev-b5-e1', supportsOrRefutes: 'supports' as const, entailmentScore: 0.82, source: { evidenceId: 'ev-b5-002', source: 'doi' as const, doi: '10.1038/mp.2016.44', title: 'Zheng 2016 FMT phenotype transfer' } },
    { evidenceId: 'ev-b5-e2', supportsOrRefutes: 'refutes' as const, entailmentScore: 0.80, source: { evidenceId: 'ev-b5-003', source: 'doi' as const, doi: '10.3390/nu13040798', title: 'Chudzik 2021 mixed RCT review' } },
    { evidenceId: 'ev-b5-e3', supportsOrRefutes: 'refutes' as const, entailmentScore: 0.75, source: { evidenceId: 'ev-b5-001', source: 'doi' as const, doi: '10.1038/s41564-018-0337-x', title: 'Valles-Colomer 2019 + placebo response' } },
  ],
  conflictingEvidenceCount: 2,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: ['Zheng 2016 GF mouse FMT', 'Chudzik 2021 RCT review (12 trials)', 'Valles-Colomer 2019 human cohort'],
  methodChoices: ['Meta-analysis of FMT RCT remission rates', 'Placebo-adjusted effect size (Cohen d)', 'Donor-stratified response analysis'],
  scheduleOrFeedback: 'Phase 1: Mechanism strong (Zheng 2016). Phase 2: RCT mixed — no trial ≥50% remission. Phase 3: Placebo ~35% inflates apparent response. Conclusion: cure claim too strong → DEGRADED_SCOPE.',
  executableChecks: [{ ref: 'https://clinicaltrials.gov', exists: true, checkedAt: '2026-06-27T00:00:00.000Z' }],
});

const makeFeedbackPayloadConverge = () => ({ kind: 'feedback' as const, feedbackSignal: { continueIteration: false, iterationNumber: 1, maxIterations: 3, refinements: [] }, iterationSummary: 'Converged: mechanism supports, clinical RCTs mixed/insufficient for cure. DEGRADED_SCOPE.' });

const B5_FALSIFICATION_SPEC: FalsificationSpec = { prediction: '≥3 independent RCTs show FMT MDD remission ≥50% vs placebo ≤25%.', metric: 'remission_rate', falsificationThreshold: 0.5, thresholdSemantics: 'gt' };
const B5_THRESHOLD_SPEC: ThresholdSpec = { semantics: 'gt', value: 0.5 };
const B5_SOURCE_ANCHOR: SourceAnchor = { gitCommitSha: 'b5'.repeat(20), dashscopeRequestId: null, isoTimestamp: '2026-06-27T00:00:00.000Z', rawResponseHash: 'b5'.repeat(32) };

export async function runB5Seed(): Promise<DemoSeedResult> {
  const db = openDb();
  const fixtureContents: readonly string[] = [JSON.stringify(makeUnderstandingPayload()), JSON.stringify(makeIntegrationPayload()), JSON.stringify(makeHypothesisPayload()), JSON.stringify(makeEvidencePayload()), JSON.stringify(makePlanPayload()), JSON.stringify(makeFeedbackPayloadConverge())];
  const gateway = createSequentialGateway(fixtureContents);
  const state = await runAgentLoop({ runId: 'demo-b5-microbiome-depression', researchInput: B5_RAW_INPUT, gateway, profile: 'offline_replay', finishReasonExtractor: extractFinishReasonForOfflineReplay, reproHashProvider: () => 'b5'.repeat(32), gitCommitSha: B5_SOURCE_ANCHOR.gitCommitSha, appendOptions: { providerProfile: 'offline_replay' }, evidenceLogDb: db, termination: DEFAULT_TERMINATION });
  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') { throw new Error('B5 seed: stage3 artifact is missing or not hypothesis'); }
  const hypothesisPayload = stage3.structured;
  const b5Evidences: EvidenceRecord[] = [
    { claim: 'Zheng 2016: FMT from MDD patients transfers depressive behavior to GF mice (mechanism supported)', metricValue: 0.75, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: true, sourceAnchor: { gitCommitSha: B5_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: B5_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'b5-ev1-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Chudzik 2021: 12 RCTs — FMT remission 25-40% vs placebo 20-35% (non-significant in most)', metricValue: 0.32, supportsClaim: false, refutesClaim: true, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: B5_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: B5_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'b5-ev2-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Placebo response ~35% in depression RCTs + donor variability → cure claim unsupported', metricValue: 0.28, supportsClaim: false, refutesClaim: true, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: B5_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: B5_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'b5-ev3-hash'.repeat(4).padEnd(64, '0') } },
  ];
  const verdictResult = fecAppendClaim(db, { callRecord: { stageId: 'stage3_hypothesis', cred: { modelId: 'offline-replay-fixture', dashscopeRequestId: null, reproHash: 'b5'.repeat(32), gitCommitSha: B5_SOURCE_ANCHOR.gitCommitSha, isoTimestamp: B5_SOURCE_ANCHOR.isoTimestamp }, payloadKind: 'hypothesis', purposeTag: 'hypothesis' }, callAudit: { requestPayload: JSON.stringify({ hypothesis: hypothesisPayload.claim }), responsePayload: JSON.stringify(hypothesisPayload), finishReason: 'stop', usageTokensTotal: 256 }, appendOptions: { providerProfile: 'offline_replay' }, evidencePayload: { claim: hypothesisPayload.claim, hypothesisPayload }, sourceAnchor: B5_SOURCE_ANCHOR, claim: hypothesisPayload.claim, falsificationSpec: B5_FALSIFICATION_SPEC, thresholdSpec: B5_THRESHOLD_SPEC, evidences: b5Evidences, statistics: bridgeLegacyEvidencesToStatistics(b5Evidences, B5_FALSIFICATION_SPEC, B5_THRESHOLD_SPEC), parentVerdictId: null, nodeKind: 'hypothesis', fecV2: { contract: makeLegacyCompatFec({ claimId: 'B5-MICROBIOME-DEPRESSION', falsificationSpec: B5_FALSIFICATION_SPEC, thresholdSpec: B5_THRESHOLD_SPEC, frozenAt: B5_SOURCE_ANCHOR.isoTimestamp }) } });
  return { rawInput: B5_RAW_INPUT, sourceCard: B5_SOURCE_CARD, loopState: state, verdictNode: verdictResult.verdictNode, reproHash: verdictResult.verdictNode.currentHash, graphSubtree: getSubtree(db, verdictResult.verdictNode.verdictId), chainVerify: verifyChainHead(db), paper: assemblePaper(state), db };
}
