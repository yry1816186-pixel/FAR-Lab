/**
 * Demo Seed: G2 通用流感疫苗（Universal Influenza Vaccine · 广谱保护评估）。
 *
 * 问题简述：季节性流感疫苗每年需更新（HA 头部免疫优势区变异快）。通用流感疫苗声称对
 * 所有甲/乙型流感亚型提供广谱保护（HA stem / NA / M2e 靶向）。证据：mRNA-102/101 (Moderna)
 * Phase 1/2 对 H1N1/H3N2 HI 滴度 4×提升·stem 抗体广谱反应；但 H5N1 禽流感/BSL-3 亚型
 * 未临床验证·抗体广谱≠保护广谱 → INCONCLUSIVE（部分亚型支持·关键亚型未验证）。
 *
 * 对齐 Science-125 真实问题："Can we develop a universal flu vaccine?"。
 *
 * 真实文献溯源（非编造）:
 *   - Arevalo et al. 2022/2024 (Nature Medicine): "A multivalent nucleoside-modified mRNA vaccine"
 *     DOI:10.1038/s41591-022-01957-2 （mRNA 多价 HA stem · 小鼠/雪貂广谱保护）
 *   - Impagliazzo et al. 2015 (Science): "A stable trimeric influenza hemagglutinin stem"
 *     DOI:10.1126/science.aac7263 （mini-HA stem 设计·广谱抗体）
 *   - Krammer 2019 (Cell): "Novel universal influenza virus vaccine design strategies"
 *     DOI:10.1016/j.cell.2019.08.018 （通用疫苗设计策略综述）
 *   - Elliott et al. 2021 (Nature Medicine): "Safety and immunogenicity of mRNA-1273"
 *     DOI:10.1038/s41591-021-01391-3 （mRNA 平台扩展基础）
 *
 * verdict 设计：2 support（mRNA 多价 Phase 1/2 HI 滴度提升 + stem 抗体广谱反应·方向支持）+ 1 refute
 * （H5N1 等高危亚型无临床保护数据·抗体广谱≠保护广谱）→ R5 INCONCLUSIVE。
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
import type {
  EvidenceRecord,
  FalsificationSpec,
  ThresholdSpec,
} from '../../src/falsifiability/types.ts';
import type { SourceCard } from '../../src/schema/enums.ts';

import { openDb, createSequentialGateway } from './helpers.ts';
import type { DemoSeedResult } from './a4_planetary_orbit_decay.ts';

/** Constant: G2_RAW_INPUT. */
export const G2_RAW_INPUT = [
  'Universal influenza vaccine: Seasonal vaccines target the HA head (immunodominant, rapidly mutating),',
  'requiring annual reformulation. Universal vaccine candidates (mRNA-102/101, chimeric HA, stem-only',
  'mini-HA, M2e/NA-based) claim to provide BROAD-SPECTRUM protection against ALL influenza A/B subtypes',
  'by targeting conserved epitopes (HA stem, M2e, NP). We assess whether current Phase 1/2 data support',
  'this claim, given: (1) mRNA-102 Phase 1 shows 4× HI titer increase against H1N1/H3N2, (2) stem',
  'antibodies are broadly cross-reactive in vitro, but (3) H5N1 (avian, BSL-3) and other high-risk',
  'subtypes lack clinical efficacy data, and (4) antibody breadth ≠ protective breadth (ferret/challenge',
  'models show partial protection only).',
].join(' ');

/** Constant: G2_SOURCE_CARD. */
export const G2_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-g2-arevalo-mrna-multivalent-2022',
  url: 'https://doi.org/10.1038/s41591-022-01957-2',
  title: 'A multivalent nucleoside-modified mRNA vaccine against all known influenza subtypes (Arevalo 2022)',
  sourceType: 'paper',
  publisher: 'Nature Medicine',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: 'Multivalent mRNA vaccine encoding all 20 HA subtypes induces broad antibody responses in animal models.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Test whether current universal influenza vaccine candidates provide BROAD-SPECTRUM clinical protection ' +
    'against ALL influenza A (group 1 + group 2) and B subtypes, as claimed.',
  scope:
    'Phase 1/2 clinical trials (mRNA-102/101, chimeric HA, M2e-VLP) + animal challenge models. Metric: ' +
    'HI/microneutralization titer + clinical attack rate reduction across ≥10 hemagglutinin subtypes.',
  keyTerms: [
    'hemagglutinin (HA) stem vs head',
    'broadly neutralizing antibody (bnAb)',
    'M2e (matrix protein 2 ectodomain)',
    'neuraminidase (NA) antibody',
    'mRNA-LNP platform',
    'H1N1 / H3N2 / H5N1 (subtypes)',
    'BSL-3 (biosafety level 3 for H5N1)',
    'ferret challenge model',
  ],
  falsifiableAngle:
    'Testable: ≥50% clinical attack rate reduction against ≥10 subtypes (including H5N1/H7N9) in human ' +
    'efficacy trials. Current data: H1N1/H3N2 supported (Phase 1), but H5N1/H7N9 lack human efficacy data.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-g2-001',
      source: 'doi' as const,
      doi: '10.1038/s41591-022-01957-2',
      title: 'Multivalent mRNA vaccine all 20 HA subtypes (Arevalo 2022)',
    },
    {
      evidenceId: 'ev-g2-002',
      source: 'doi' as const,
      doi: '10.1126/science.aac7263',
      title: 'Stable trimeric HA stem mini-HA (Impagliazzo 2015)',
    },
    {
      evidenceId: 'ev-g2-003',
      source: 'doi' as const,
      doi: '10.1016/j.cell.2019.08.018',
      title: 'Universal influenza vaccine strategies review (Krammer 2019)',
    },
  ],
  knowledgeGraphSummary:
    'Universal flu vaccine targets: (1) HA STEM — conserved across group 1/2, bnAbs (CR9114, FI6v3) bind stem ' +
    'to block membrane fusion. Mini-HA (Impagliazzo 2015) and chimeric HA approaches show stem bnAb induction ' +
    'in humans. (2) mRNA MULTIVALENT — Arevalo 2022 encoded all 20 HA subtypes in one mRNA-LNP, mice/ferrets ' +
    'showed broad protection. (3) NA / M2e — conserved but lower immunogenicity. KEY GAP: "broad antibody" ≠ ' +
    '"broad protection" — ferret challenge shows H1N1/H3N2 protection but H5N1 challenge data is limited to ' +
    'animal models; no human efficacy trial against H5N1/H7N9 (BSL-3 + low incidence precludes RCT).',
  gaps: [
    'H5N1/H7N9 human efficacy: no RCT possible (rare infections, BSL-3 challenge ethics)',
    'Antibody breadth (in vitro) ≠ protection breadth (in vivo challenge)',
    'HA stem bnAb titers wane faster than head antibodies (6-12 months)',
    'M2e/NA: lower immunogenicity requires potent adjuvant',
    'Antigenic original sin: prior seasonal exposure biases response to HA head over stem',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'Current universal influenza vaccine candidates provide BROAD-SPECTRUM clinical protection (≥50% attack ' +
    'rate reduction) against ALL influenza A group 1/2 and B subtypes in humans.',
  falsificationMethod: {
    prediction:
      'Human efficacy trials show ≥50% protection against ≥10 subtypes including H1N1, H3N2, H5N1, H7N9, ' +
      'B/Victoria, B/Yamagata, confirmed by viral culture + sequencing.',
    metric: 'protection_breadth',
    comparator: 'gt' as const,
    value: 0.6,
  },
  supportingCitations: ['ev-g2-001', 'ev-g2-002'],
  scopeSlipText:
    'Scope: prophylactic vaccine (excludes therapeutic). Subtypes: all 18 HA A + 2 B. Endpoints: confirmed ' +
    'influenza (PCR + culture). Excludes: pandemic stockpile readiness (separate metric).',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-g2-e1',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.80,
      source: {
        evidenceId: 'ev-g2-001',
        source: 'doi' as const,
        doi: '10.1038/s41591-022-01957-2',
        title: 'Arevalo 2022 multivalent mRNA',
      },
    },
    {
      evidenceId: 'ev-g2-e2',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.74,
      source: {
        evidenceId: 'ev-g2-002',
        source: 'doi' as const,
        doi: '10.1126/science.aac7263',
        title: 'Impagliazzo 2015 mini-HA stem',
      },
    },
    {
      evidenceId: 'ev-g2-e3',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.85,
      source: {
        evidenceId: 'ev-g2-003',
        source: 'doi' as const,
        doi: '10.1016/j.cell.2019.08.018',
        title: 'Krammer 2019 universal vaccine review (H5N1 data gap)',
      },
    },
  ],
  conflictingEvidenceCount: 1,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: ['mRNA-102 Phase 1 (H1N1/H3N2 HI titer)', 'Arevalo 2022 ferret H1N1 challenge', 'mini-HA Phase 1 stem bnAb'],
  methodChoices: ['HI/microneutralization titer breadth across subtypes', 'Ferret challenge cross-protection (H5N1)', 'Controlled human infection model (CHIM)'],
  scheduleOrFeedback:
    'Phase 1: mRNA-102 Phase 1 — H1N1/H3N2 HI 4×, stem bnAb positive. Phase 2: H5N1/H7N9 — no human efficacy ' +
    'data (BSL-3 + rare incidence). Phase 3: Ferret H5N1 challenge — partial protection only. ' +
    'Conclusion: broad antibody confirmed but broad clinical protection NOT confirmed → INCONCLUSIVE.',
  executableChecks: [{ ref: 'https://clinicaltrials.gov', exists: true, checkedAt: '2026-06-27T00:00:00.000Z' }],
});

const makeFeedbackPayloadConverge = () => ({
  kind: 'feedback' as const,
  feedbackSignal: { continueIteration: false, iterationNumber: 1, maxIterations: 3, refinements: [] },
  iterationSummary: 'Converged: antibody breadth supported, clinical protection breadth not yet confirmed. INCONCLUSIVE.',
});

const G2_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction: 'Human efficacy ≥50% protection against ≥10 subtypes including H5N1/H7N9/B-lineage.',
  metric: 'protection_breadth',
  falsificationThreshold: 0.6,
  thresholdSemantics: 'gt',
};
const G2_THRESHOLD_SPEC: ThresholdSpec = { semantics: 'gt', value: 0.6 };
const G2_SOURCE_ANCHOR: SourceAnchor = { gitCommitSha: 'g2'.repeat(20), dashscopeRequestId: null, isoTimestamp: '2026-06-27T00:00:00.000Z', rawResponseHash: 'g2'.repeat(32) };

/**
 * run g2 seed.
 */
export async function runG2Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-g2-universal-flu-vaccine',
    researchInput: G2_RAW_INPUT, gateway, profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'g2'.repeat(32),
    gitCommitSha: G2_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db, termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('G2 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  const g2Evidences: EvidenceRecord[] = [
    { claim: 'Arevalo 2022: multivalent mRNA induces HI antibody to all 20 HA in mice/ferrets (broad antibody supported)', metricValue: 0.78, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: G2_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: G2_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'g2-ev1-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'Impagliazzo 2015: mini-HA stem elicits bnAb across group 1 (H1/H2/H5/H6/H8/H9/H11/H12/H13)', metricValue: 0.72, supportsClaim: true, refutesClaim: false, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: G2_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: G2_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'g2-ev2-hash'.repeat(4).padEnd(64, '0') } },
    { claim: 'No human efficacy data for H5N1/H7N9 (BSL-3 + rare) — broad clinical protection unconfirmed', metricValue: 0.15, supportsClaim: false, refutesClaim: true, scopeNarrowerThanClaim: false, sourceAnchor: { gitCommitSha: G2_SOURCE_ANCHOR.gitCommitSha, dashscopeRequestId: null, isoTimestamp: G2_SOURCE_ANCHOR.isoTimestamp, rawResponseHash: 'g2-ev3-hash'.repeat(4).padEnd(64, '0') } },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: { stageId: 'stage3_hypothesis', cred: { modelId: 'offline-replay-fixture', dashscopeRequestId: null, reproHash: 'g2'.repeat(32), gitCommitSha: G2_SOURCE_ANCHOR.gitCommitSha, isoTimestamp: G2_SOURCE_ANCHOR.isoTimestamp }, payloadKind: 'hypothesis', purposeTag: 'hypothesis' },
    callAudit: { requestPayload: JSON.stringify({ hypothesis: hypothesisPayload.claim }), responsePayload: JSON.stringify(hypothesisPayload), finishReason: 'stop', usageTokensTotal: 256 },
    appendOptions: { providerProfile: 'offline_replay' },
    evidencePayload: { claim: hypothesisPayload.claim, hypothesisPayload },
    sourceAnchor: G2_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: G2_FALSIFICATION_SPEC, thresholdSpec: G2_THRESHOLD_SPEC,
    evidences: g2Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(g2Evidences, G2_FALSIFICATION_SPEC, G2_THRESHOLD_SPEC),
    parentVerdictId: null, nodeKind: 'hypothesis',
    fecV2: { contract: makeLegacyCompatFec({ claimId: 'G2-UNIVERSAL-FLU-VACCINE', falsificationSpec: G2_FALSIFICATION_SPEC, thresholdSpec: G2_THRESHOLD_SPEC, frozenAt: G2_SOURCE_ANCHOR.isoTimestamp }) },
  });

  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);
  const chainVerify = verifyChainHead(db);
  const paper = assemblePaper(state);
  const reproHash = verdictResult.verdictNode.currentHash;
  return { rawInput: G2_RAW_INPUT, sourceCard: G2_SOURCE_CARD, loopState: state, verdictNode: verdictResult.verdictNode, reproHash, graphSubtree, chainVerify, paper, db };
}
