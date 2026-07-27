/**
 * Demo Seed: M3 端粒与衰老（Telomere Aging · Hayflick Limit + Telomerase）。
 *
 * 问题简述：端粒缩短假说声称「端粒缩短是哺乳动物衰老的**单一**首要驱动因素」
 * （telomere shortening is the SINGLE primary driver of mammalian aging），且端粒长度
 * 可解释 ≥70% 生命周期方差。证据：端粒酶敲除鼠早衰 + DC 先天角化不良（支持）；
 * 但小鼠 knock-out 端粒酶不一定加速衰老 + 百岁老人端粒长度变化不大 + 衰老是多因素
 * （DNA 损伤、蛋白稳态、线粒体、SASP）→ 端粒只是其中之一 → DEGRADED_SCOPE。
 *
 * 对齐 Science-125 真实问题："What controls the aging process? (Hayflick limit + telomere biology)"。
 *
 * 真实文献溯源:
 *   - Hayflick & Moorhead 1961 (Exp. Cell Res.): "The serial cultivation of human diploid cell strains"
 *     DOI:10.1016/0014-4827(61)90192-6 （Hayflick limit 原文·细胞有限分裂能力）
 *   - Greider & Blackburn 1985 (Cell): "Identification of a specific telomere terminal transferase
 *     activity in Tetrahymena extracts" DOI:10.1016/0092-8674(85)90119-0 （端粒酶发现·2009 诺奖）
 *   - Harley et al. 1990 (Nature): "Telomeres shorten during ageing of human fibroblasts"
 *     DOI:10.1038/345458a0 （端粒长度与细胞衰老关联·端粒钟假说）
 *   - Blackburn et al. 2015 (Science): "Human telomere biology: A companion and guide"
 *     DOI:10.1126/science.aac6506 （端粒生物学综述·强调多因素衰老·非单一机制）
 *
 * verdict 设计：2 supports（Greider 端粒酶机制 + Harley 端粒-衰老关联）+ 2 refutes（Blackburn
 * 综述强调多机制 + 百岁老人/端粒酶鼠反例）→ DEGRADED_SCOPE（端粒缩短是衰老**部分机制**，
 * 但非**单一首要驱动**）。
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

export const M3_RAW_INPUT = [
  'Telomere shortening as the single primary driver of mammalian aging: The Hayflick limit (1961)',
  'established that human diploid fibroblasts have a finite replicative capacity (~50 population doublings).',
  'Greider & Blackburn (1985) discovered telomerase, the enzyme that elongates telomeres, and Harley et al.',
  '(1990) showed telomere length shortens with each cell division and correlates with donor age. The claim',
  'is that telomere shortening is the SINGLE primary driver of mammalian aging, explaining ≥70% of lifespan',
  'variance across ≥10 mammalian species. We assess this against: (1) telomerase knockout mice show progeroid',
  'phenotypes in late generations (G3-G4 Terc-/-), but G1 Terc-/- mice have normal aging; (2) centenarians',
  'show telomere length distributions overlapping with younger cohorts; (3) aging involves DNA damage,',
  'proteostasis loss, mitochondrial dysfunction, and SASP — telomere is one factor among many.',
].join(' ');

export const M3_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-m3-blackburn-telomere-2015',
  url: 'https://doi.org/10.1126/science.aac6506',
  title: 'Human telomere biology: A companion and guide (Blackburn et al. 2015)',
  sourceType: 'paper',
  publisher: 'Science (American Association for the Advancement of Science)',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: 'Telomere biology is a central aging mechanism, but aging is multifactorial — telomeres are one contributing factor, not a single primary driver.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Test whether telomere shortening is the SINGLE primary driver of mammalian aging, ' +
    'explaining ≥70% of lifespan variance across ≥10 mammalian species, as claimed by the ' +
    'strong form of the telomere-centric aging hypothesis.',
  scope:
    'Mammalian species with published telomere length vs maximum lifespan data (≥10 species). ' +
    'Metric: Pearson r² between species-mean telomere length (or telomere shortening rate) and ' +
    'maximum lifespan, assessed via phylogenetic generalized least squares (PGLS).',
  keyTerms: [
    'Hayflick limit',
    'telomere shortening',
    'telomerase (TERT/TERC)',
    'Terc knockout mouse (G1-G4)',
    'dyskeratosis congenita (DC)',
    'senescence-associated secretory phenotype (SASP)',
    'DNA damage response (DDR)',
    'centenarian telomere paradox',
  ],
  falsifiableAngle:
    'Testable: Cross-species PGLS regression of telomere length vs lifespan yields r² ≥ 0.70, ' +
    'AND telomerase-knockout (Terc-/-) mice (G1) show accelerated aging across all organ systems, ' +
    'AND centenarians have significantly longer telomeres than age-matched non-centenarian controls. ' +
    'All three predictions fail in current data → "single primary driver" claim falsified; ' +
    '"one contributing mechanism" is the honest framing.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-m3-001',
      source: 'doi' as const,
      doi: '10.1016/0014-4827(61)90192-6',
      title: 'The serial cultivation of human diploid cell strains (Hayflick & Moorhead 1961)',
    },
    {
      evidenceId: 'ev-m3-002',
      source: 'doi' as const,
      doi: '10.1016/0092-8674(85)90119-0',
      title: 'Identification of a specific telomere terminal transferase activity (Greider & Blackburn 1985)',
    },
    {
      evidenceId: 'ev-m3-003',
      source: 'doi' as const,
      doi: '10.1038/345458a0',
      title: 'Telomeres shorten during ageing of human fibroblasts (Harley et al. 1990)',
    },
    {
      evidenceId: 'ev-m3-004',
      source: 'doi' as const,
      doi: '10.1126/science.aac6506',
      title: 'Human telomere biology: A companion and guide (Blackburn et al. 2015)',
    },
  ],
  knowledgeGraphSummary:
    'Telomere biology has strong mechanistic support as ONE aging mechanism: (1) Hayflick (1961) showed ' +
    'finite replicative capacity of human fibroblasts (~50 doublings); (2) Greider & Blackburn (1985) ' +
    'discovered telomerase — awarded 2009 Nobel Prize in Physiology/Medicine; (3) Harley (1990) linked ' +
    'telomere shortening to donor age in fibroblasts. HOWEVER: (a) Terc-/- mice in G1 (first generation) ' +
    'age normally despite shorter telomeres — progeroid phenotype only emerges in G3-G4 after telomeres ' +
    'are critically eroded; (b) centenarians show wide telomere length distributions overlapping with ' +
    'younger cohorts — no simple linear relationship; (c) aging is multifactorial: DNA damage accumulation, ' +
    'loss of proteostasis (chaperone decline), mitochondrial dysfunction (ROS/mtDNA mutations), and SASP ' +
    '(inflammatory senescence) all operate in parallel. Contemporary consensus (Blackburn 2015, ' +
    'López-Otín 2013/2023 Hallmarks of Aging) places telomere attrition as ONE of 12 hallmarks, not ' +
    'a single primary driver. The "telomere explains ≥70% lifespan variance" claim is too strong; ' +
    '"contributing factor explaining ~15-30%" is consistent with cross-species data.',
  gaps: [
    'Terc-/- G1 mice age normally despite shorter telomeres — telomere loss must be multi-generational',
    'Centenarians do not have uniformly long telomeres — telomere length variance overlaps with 60-year-olds',
    'Cross-species PGLS: telomere length vs lifespan r² ≈ 0.15-0.30, not 0.70',
    '12 hallmarks of aging (López-Otín 2013/2023) — telomere attrition is only 1 of 12',
    'Telomerase activation therapy (TA-65, cycloastragenol) shows <5% lifespan extension in mice',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'Telomere shortening is the SINGLE primary driver of mammalian aging, with telomere length ' +
    'explaining ≥70% of lifespan variance across ≥10 mammalian species (r² ≥ 0.70).',
  falsificationMethod: {
    prediction:
      'Cross-species PGLS regression: r² ≥ 0.70 between telomere length and maximum lifespan; ' +
      'Terc-/- G1 mice show accelerated multi-organ aging; centenarians have telomeres significantly ' +
      'longer than age-matched controls (+30% mean).',
    metric: 'telomere_variance_explained_r2',
    comparator: 'gt' as const,
    value: 0.7,
  },
  supportingCitations: ['ev-m3-002', 'ev-m3-003'],
  scopeSlipText:
    'Scope limited to mammalian species with published telomere length data (≥10 species, PGLS-controlled ' +
    'for body mass and phylogeny). Excludes birds (different telomere biology — higher telomerase), ' +
    'and species with alternative telomere maintenance (ALT pathway).',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-m3-e1',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.80,
      source: {
        evidenceId: 'ev-m3-002',
        source: 'doi' as const,
        doi: '10.1016/0092-8674(85)90119-0',
        title: 'Telomere terminal transferase discovery (Greider & Blackburn 1985)',
      },
    },
    {
      evidenceId: 'ev-m3-e2',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.76,
      source: {
        evidenceId: 'ev-m3-003',
        source: 'doi' as const,
        doi: '10.1038/345458a0',
        title: 'Telomeres shorten during ageing of human fibroblasts (Harley et al. 1990)',
      },
    },
    {
      evidenceId: 'ev-m3-e3',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.85,
      source: {
        evidenceId: 'ev-m3-004',
        source: 'doi' as const,
        doi: '10.1126/science.aac6506',
        title: 'Human telomere biology review — multifactorial aging (Blackburn et al. 2015)',
      },
    },
    {
      evidenceId: 'ev-m3-e4',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.78,
      source: {
        evidenceId: 'ev-m3-001',
        source: 'doi' as const,
        doi: '10.1016/0014-4827(61)90192-6',
        title: 'Hayflick limit + centenarian/telomerase mouse counterexamples',
      },
    },
  ],
  conflictingEvidenceCount: 2,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: [
    'Cross-species telomere length database (Tacutu et al. 2018 AnAge + Telomerase Database)',
    'Centenarian telomere length cohort studies (meta-analysis, n~50,000)',
    'Terc-/- mouse lifespan data (G1-G4 generations, Rudolph et al. 1999 Cell)',
  ],
  methodChoices: [
    'Phylogenetic generalized least squares (PGLS) regression: telomere length vs maximum lifespan',
    'Cohen d effect size: centenarian vs age-matched telomere length difference',
    'Telomerase activator (TA-65 / cycloastragenol) randomized murine lifespan trial',
  ],
  scheduleOrFeedback:
    'Phase 1: PGLS regression across ≥10 mammalian species — r² ≈ 0.15-0.30, far from ≥0.70 threshold. ' +
    'Phase 2: Centenarian meta-analysis — telomere length distributions overlap with 60-70 year olds ' +
    '(Cohen d < 0.3 in most studies). Phase 3: Terc-/- G1 mice lifespan normal; progeroid only in G3-G4 ' +
    'after multi-generational telomere erosion. Conclusion: telomere is one contributing mechanism (among ' +
    '12 hallmarks of aging), not a SINGLE primary driver → DEGRADED_SCOPE.',
  executableChecks: [
    {
      ref: 'https://genomics.senescence.info/species/',
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
    'Converged: hypothesis is falsifiable (r² ≥ 0.70 threshold + centenarian + Terc-/- G1 predictions). ' +
    'Evidence is mixed: Greider + Harley support telomere-aging link, but Blackburn review + centenarian/' +
    'Terc-/- mouse data refute the "single primary driver" claim. Verdict: DEGRADED_SCOPE (telomere is ' +
    'one contributing mechanism among many, not the sole primary driver of aging).',
});

const M3_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    'Cross-species PGLS: telomere length explains ≥70% lifespan variance (r² ≥ 0.70); ' +
    'Terc-/- G1 mice show accelerated multi-organ aging; centenarians have +30% longer telomeres ' +
    'than age-matched controls.',
  metric: 'telomere_variance_explained_r2',
  falsificationThreshold: 0.7,
  thresholdSemantics: 'gt',
};

const M3_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 0.7,
};

const M3_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'm3'.repeat(20),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'm3'.repeat(32),
};

export async function runM3Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-m3-telomere-aging',
    researchInput: M3_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'm3'.repeat(32),
    gitCommitSha: M3_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });
  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('M3 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;
  const m3Evidences: EvidenceRecord[] = [
    {
      claim:
        'Greider & Blackburn 1985: telomerase discovery — mechanistic basis for telomere maintenance, ' +
        'telomere shortening linked to replicative senescence (mechanism supported)',
      metricValue: 0.78,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: true,
      sourceAnchor: {
        gitCommitSha: M3_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: M3_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'm3-ev1-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim:
        'Harley et al. 1990: telomere length in human fibroblasts shortens with donor age — ' +
        'correlation between telomere length and donor age (aging link supported)',
      metricValue: 0.72,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: M3_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: M3_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'm3-ev2-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim:
        'Blackburn et al. 2015: aging is multifactorial — telomere attrition is 1 of 12 hallmarks, ' +
        'centenarians lack uniformly long telomeres, cross-species r² ≈ 0.15-0.30 (refutes single primary driver)',
      metricValue: 0.22,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: M3_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: M3_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'm3-ev3-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim:
        'Terc-/- G1 mice have normal lifespan and aging despite shorter telomeres; centenarian ' +
        'telomere lengths overlap with 60-year-old distribution — telomere not sole lifespan determinant',
      metricValue: 0.18,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: M3_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: M3_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'm3-ev4-hash'.repeat(4).padEnd(64, '0'),
      },
    },
  ];
  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'm3'.repeat(32),
        gitCommitSha: M3_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: M3_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: M3_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: M3_FALSIFICATION_SPEC,
    thresholdSpec: M3_THRESHOLD_SPEC,
    evidences: m3Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(m3Evidences, M3_FALSIFICATION_SPEC, M3_THRESHOLD_SPEC),
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'M3-TELOMERE-AGING-HAYFLICK',
        falsificationSpec: M3_FALSIFICATION_SPEC,
        thresholdSpec: M3_THRESHOLD_SPEC,
        frozenAt: M3_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });
  return {
    rawInput: M3_RAW_INPUT,
    sourceCard: M3_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash: verdictResult.verdictNode.currentHash,
    graphSubtree: getSubtree(db, verdictResult.verdictNode.verdictId),
    chainVerify: verifyChainHead(db),
    paper: assemblePaper(state),
    db,
  };
}
