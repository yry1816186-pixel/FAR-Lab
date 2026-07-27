/**
 * Demo Seed: B2 诱导多能干细胞重编程（Yamanaka 4 因子·iPSC Reprogramming）。
 *
 * 问题简述：Yamanaka 4 因子（OCT4/SOX2/KLF4/c-MYC）能否将体细胞重编程为诱导多能干细胞（iPSC）？
 * 证据：≥1000 独立实验室复现 + 2012 诺贝尔奖 + 人类 iPSC 临床试验（2014 RIKEN 眼试验 + 2019 心脏补片）。
 * 多能性 marker（OCT4/NANOG/TRA-1-60）+ 三胚层分化 + 畸胎瘤形成实验一致证实 → CONFIRMED。
 *
 * 对齐 Science-125 真实问题："Can somatic cells be reprogrammed to pluripotent stem cells?"。
 *
 * 真实文献溯源:
 *   - Takahashi & Yamanaka 2006 (Cell): "Induction of pluripotent stem cells from mouse embryonic and adult fibroblast cultures by defined factors"
 *     DOI:10.1016/j.cell.2006.07.024 （首次发现·小鼠成纤维细胞→iPSC）
 *   - Takahashi et al. 2007 (Cell): "Induction of pluripotent stem cells from adult human fibroblasts by defined factors"
 *     DOI:10.1016/j.cell.2007.11.019 （人类成纤维细胞→hiPSC）
 *   - Yu et al. 2007 (Science): "Induced pluripotent stem cell lines derived from human somatic cells"
 *     DOI:10.1126/science.1151526 （独立验证·替代因子组合 OCT4/SOX2/NANOG/LIN28）
 *   - Okita et al. 2007 (Nature): "Generation of germline-competent induced pluripotent stem cells"
 *     DOI:10.1038/nature05934 （生殖系传递·完全发育潜能证明）
 *
 * verdict 设计：3 supports（Takahashi 2006 + Takahashi 2007 + Yu 2007），0 refute → CONFIRMED。
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

export const B2_RAW_INPUT = [
  'Yamanaka 4 factors — OCT4 (Pou5f1), SOX2, KLF4, and c-MYC — delivered via retroviral vectors reprogram',
  'mouse embryonic and adult fibroblasts to induced pluripotent stem cells (iPSCs). iPSCs express pluripotency',
  'markers (OCT4, NANOG, SSEA-1/TRA-1-60), form teratomas containing all three germ layers (ectoderm,',
  'mesoderm, endoderm), and contribute to chimeric embryos. The claim is that Yamanaka 4 factors reprogram',
  'somatic cells to pluripotent iPSCs achieving ≥95% OCT4+ colonies across ≥3 cell types. We assess this',
  'against: (1) original mouse iPSC generation (Takahashi & Yamanaka 2006), (2) human iPSC generation',
  '(Takahashi et al. 2007), (3) independent replication with alternative factors (Yu et al. 2007),',
  '(4) germline transmission proving full developmental potential (Okita et al. 2007), and (5) >1000',
  'independent lab replications + clinical trials (RIKEN 2014 eye trial, cardiac patch 2019).',
].join(' ');

export const B2_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-b2-takahashi-yamanaka-2006',
  url: 'https://doi.org/10.1016/j.cell.2006.07.024',
  title: 'Induction of pluripotent stem cells from mouse embryonic and adult fibroblast cultures by defined factors (Takahashi & Yamanaka 2006)',
  sourceType: 'paper',
  publisher: 'Cell',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: 'Four transcription factors (Oct4, Sox2, Klf4, c-Myc) reprogram mouse somatic cells to pluripotent stem cells that form teratomas and contribute to chimeras.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement: 'Test whether Yamanaka 4 factors (OCT4/SOX2/KLF4/c-MYC) can reprogram somatic cells (fibroblasts, blood cells) into induced pluripotent stem cells (iPSCs) with pluripotency markers OCT4/NANOG/TRA-1-60 in ≥95% of colonies across ≥3 cell types, validated by teratoma formation.',
  scope: 'Mouse and human somatic cells (fibroblasts, PBMCs, keratinocytes). Pluripotency assessment: OCT4 immunostaining, NANOG qPCR, TRA-1-60 flow cytometry, teratoma formation (three germ layers). Metric: ≥95% OCT4+ colony formation efficiency.',
  keyTerms: ['induced pluripotent stem cell (iPSC)', 'Yamanaka factors (OCT4/SOX2/KLF4/c-MYC)', 'pluripotency markers (OCT4/NANOG/TRA-1-60)', 'teratoma formation', 'three germ layer differentiation', 'reprogramming efficiency', 'retroviral transduction'],
  falsifiableAngle: 'Testable: reprogramming efficiency ≥95% OCT4+ colonies across ≥3 somatic cell types in ≥3 independent labs. Falsified if efficiency consistently <95% or colonies fail teratoma assay. Current: confirmed by >1000 labs, Nobel Prize 2012, clinical trials ongoing.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    { evidenceId: 'ev-b2-001', source: 'doi' as const, doi: '10.1016/j.cell.2006.07.024', title: 'Takahashi & Yamanaka 2006 mouse iPSC' },
    { evidenceId: 'ev-b2-002', source: 'doi' as const, doi: '10.1016/j.cell.2007.11.019', title: 'Takahashi et al. 2007 human iPSC' },
    { evidenceId: 'ev-b2-003', source: 'doi' as const, doi: '10.1126/science.1151526', title: 'Yu et al. 2007 independent human iPSC' },
    { evidenceId: 'ev-b2-004', source: 'doi' as const, doi: '10.1038/nature05934', title: 'Okita et al. 2007 germline-competent iPSC' },
  ],
  knowledgeGraphSummary:
    'Yamanaka 4 factors (Oct4/Sox2/Klf4/c-Myc) delivered via retroviral vectors reprogram mouse embryonic ' +
    'and adult fibroblasts to pluripotent stem cells (Takahashi & Yamanaka 2006). The iPSCs express ' +
    'pluripotency markers (Oct4, Nanog, SSEA-1), form teratomas containing all three germ layers, and ' +
    'contribute to chimeric embryos. Human iPSCs were generated from adult dermal fibroblasts using the ' +
    'same four factors (Takahashi et al. 2007), independently confirmed by lentiviral delivery of ' +
    'OCT4/SOX2/NANOG/LIN28 (Yu et al. 2007). Germline-competent iPSCs derived from adult mouse ' +
    'fibroblasts prove full developmental potential (Okita et al. 2007). REPRODUCIBILITY is EXCEPTIONAL: ' +
    '>1000 independent labs worldwide have replicated iPSC generation across dozens of cell types ' +
    '(fibroblasts, PBMCs, keratinocytes, hepatocytes). Clinical translation: RIKEN eye trial (2014) ' +
    'treated age-related macular degeneration with autologous iPSC-derived RPE cells; cardiac patch ' +
    'trial (2019) for heart failure. Nobel Prize in Physiology or Medicine 2012. CONFIRMED beyond ' +
    'reasonable scientific doubt.',
  gaps: ['Reprogramming efficiency varies by cell type (fibroblasts ~0.01-0.1%, PBMCs ~0.001%)', 'c-MYC oncogenic risk — integration-free methods (Sendai virus, episomal, mRNA) under development', 'Epigenetic memory of donor cell type can bias differentiation', 'Long-term safety of iPSC-derived therapies still under clinical investigation'],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim: 'Yamanaka 4 factors (OCT4/SOX2/KLF4/c-MYC) reprogram somatic cells to pluripotent iPSCs, achieving ≥95% OCT4+ colonies across ≥3 cell types when assessed by immunostaining and teratoma formation.',
  falsificationMethod: { prediction: '≥3 independent labs generate iPSCs from ≥3 cell types with ≥95% OCT4+ colonies and teratoma validation.', metric: 'reprogramming_efficiency', comparator: 'gt' as const, value: 0.95 },
  supportingCitations: ['ev-b2-001', 'ev-b2-002'],
  scopeSlipText: 'Scope: somatic cells (fibroblasts, blood cells) reprogrammed via retroviral/lentiviral delivery. Excludes integration-free methods (episomal, mRNA, protein) which may have different efficiency thresholds.',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    { evidenceId: 'ev-b2-e1', supportsOrRefutes: 'supports' as const, entailmentScore: 0.98, source: { evidenceId: 'ev-b2-001', source: 'doi' as const, doi: '10.1016/j.cell.2006.07.024', title: 'Takahashi & Yamanaka 2006 mouse iPSC' } },
    { evidenceId: 'ev-b2-e2', supportsOrRefutes: 'supports' as const, entailmentScore: 0.97, source: { evidenceId: 'ev-b2-002', source: 'doi' as const, doi: '10.1016/j.cell.2007.11.019', title: 'Takahashi et al. 2007 human iPSC' } },
    { evidenceId: 'ev-b2-e3', supportsOrRefutes: 'supports' as const, entailmentScore: 0.95, source: { evidenceId: 'ev-b2-003', source: 'doi' as const, doi: '10.1126/science.1151526', title: 'Yu et al. 2007 independent human iPSC' } },
  ],
  conflictingEvidenceCount: 0,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: ['Mouse embryonic fibroblasts (MEFs)', 'Adult human dermal fibroblasts (HDFs)', 'Human peripheral blood mononuclear cells (PBMCs)'],
  methodChoices: ['Retroviral transduction (pMXs-Oct4/Sox2/Klf4/c-Myc)', 'Immunostaining (OCT4/NANOG/TRA-1-60)', 'Teratoma formation + histological analysis (three germ layers)'],
  scheduleOrFeedback: 'Phase 1: Transduce somatic cells with Yamanaka 4 factors via retroviral vectors. Phase 2: Select ESC-like colonies at day 14-21, verify OCT4/NANOG/TRA-1-60 expression. Phase 3: Teratoma assay — inject iPSCs into immunodeficient mice, confirm ectoderm/mesoderm/endoderm differentiation. Phase 4: Germline transmission (chimera formation) for mouse iPSCs. Conclusion: confirmed in >1000 labs, Nobel Prize 2012. CONFIRMED.',
  executableChecks: [{ ref: 'https://doi.org/10.1016/j.cell.2006.07.024', exists: true, checkedAt: '2026-06-27T00:00:00.000Z' }],
});

const makeFeedbackPayloadConverge = () => ({ kind: 'feedback' as const, feedbackSignal: { continueIteration: false, iterationNumber: 1, maxIterations: 3, refinements: [] }, iterationSummary: 'Converged: Yamanaka 4 factors (OCT4/SOX2/KLF4/c-MYC) reprogramming confirmed by ≥1000 independent labs, Nobel Prize 2012, human iPSC clinical trials ongoing. CONFIRMED.' });

const B2_FALSIFICATION_SPEC: FalsificationSpec = { prediction: '≥3 independent labs generate iPSCs from ≥3 cell types with ≥95% OCT4+ colonies and teratoma validation.', metric: 'reprogramming_efficiency', falsificationThreshold: 0.95, thresholdSemantics: 'gt' };
const B2_THRESHOLD_SPEC: ThresholdSpec = { semantics: 'gt', value: 0.95 };
const B2_SOURCE_ANCHOR: SourceAnchor = { gitCommitSha: 'b2'.repeat(20), dashscopeRequestId: null, isoTimestamp: '2026-06-27T00:00:00.000Z', rawResponseHash: 'b2'.repeat(32) };

export async function runB2Seed(): Promise<DemoSeedResult> {
  const db = openDb();
  const fixtureContents: readonly string[] = [JSON.stringify(makeUnderstandingPayload()), JSON.stringify(makeIntegrationPayload()), JSON.stringify(makeHypothesisPayload()), JSON.stringify(makeEvidencePayload()), JSON.stringify(makePlanPayload()), JSON.stringify(makeFeedbackPayloadConverge())];
  const gateway = createSequentialGateway(fixtureContents);
  const state = await runAgentLoop({ runId: 'demo-b2-ipsc-reprogramming', researchInput: B2_RAW_INPUT, gateway, profile: 'offline_replay', finishReasonExtractor: extractFinishReasonForOfflineReplay, reproHashProvider: () => 'b2'.repeat(32), gitCommitSha: B2_SOURCE_ANCHOR.gitCommitSha, appendOptions: { providerProfile: 'offline_replay' }, evidenceLogDb: db, termination: DEFAULT_TERMINATION });
  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') { throw new Error('B2 seed: stage3 artifact is missing or not hypothesis'); }
  const hypothesisPayload = stage3.structured;
  const b2Evidences: EvidenceRecord[] = [
    { claim: 'Takahashi & Yamanaka 2006: Mouse fibroblasts reprogrammed to iPSCs by Oct4/Sox2/Klf4/c-Myc; OCT4+ colonies form teratomas with three germ layers.', metricValue: 0.98, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: B2_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: B2_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'b2-ev1-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Takahashi et al. 2007: Human dermal fibroblasts reprogrammed to iPSCs by same 4 factors; confirmed pluripotency markers and teratoma formation.', metricValue: 0.97, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: B2_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: B2_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'b2-ev2-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Yu et al. 2007: Independent human iPSC generation via OCT4/SOX2/NANOG/LIN28; cross-validates reprogramming principle across factor sets.', metricValue: 0.94, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: B2_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: B2_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'b2-ev3-hash'.repeat(4).padEnd(64, '0') } },
  ];
  const verdictResult = fecAppendClaim(db, { callRecord: { stageId: 'stage3_hypothesis', cred: { modelId: 'offline-replay-fixture', dashscopeRequestId: null, reproHash: 'b2'.repeat(32), gitCommitSha: B2_SOURCE_ANCHOR.gitCommitSha, isoTimestamp: B2_SOURCE_ANCHOR.isoTimestamp }, payloadKind: 'hypothesis', purposeTag: 'hypothesis' }, callAudit: { requestPayload: JSON.stringify({ hypothesis: hypothesisPayload.claim }), responsePayload: JSON.stringify(hypothesisPayload), finishReason: 'stop', usageTokensTotal: 256 }, appendOptions: { providerProfile: 'offline_replay' }, evidencePayload: { claim: hypothesisPayload.claim, hypothesisPayload }, sourceAnchor: B2_SOURCE_ANCHOR, claim: hypothesisPayload.claim, falsificationSpec: B2_FALSIFICATION_SPEC, thresholdSpec: B2_THRESHOLD_SPEC, evidences: b2Evidences, statistics: bridgeLegacyEvidencesToStatistics(b2Evidences, B2_FALSIFICATION_SPEC, B2_THRESHOLD_SPEC), parentVerdictId: null, nodeKind: 'hypothesis', fecV2: { contract: makeLegacyCompatFec({ claimId: 'B2-IPSC-YAMANAKA-REPROGRAMMING', falsificationSpec: B2_FALSIFICATION_SPEC, thresholdSpec: B2_THRESHOLD_SPEC, frozenAt: B2_SOURCE_ANCHOR.isoTimestamp }) } });
  return { rawInput: B2_RAW_INPUT, sourceCard: B2_SOURCE_CARD, loopState: state, verdictNode: verdictResult.verdictNode, reproHash: verdictResult.verdictNode.currentHash, graphSubtree: getSubtree(db, verdictResult.verdictNode.verdictId), chainVerify: verifyChainHead(db), paper: assemblePaper(state), db };
}
