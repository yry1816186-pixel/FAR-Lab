/**
 * Demo Seed: M7 阿尔茨海默病淀粉样蛋白假说（Alzheimer's Amyloid-β Hypothesis · aducanumab/lecanemab）。
 *
 * 问题简述：淀粉样蛋白级联假说声称「清除脑内 Aβ 斑块即可治愈阿尔茨海默病（AD）」。
 * 证据：lecanemab（Eisai/Biogen 2022-2023）在 Clarity AD III 期试验中减缓认知衰退 27%
 * （CDR-SB 1.66 vs 1.21·p<0.001），aducanumab（Biogen Aduhelm）争议性获批。
 * 但：27% 减缓≠治愈·停药后衰减·ARIA 副作用·taupathy 才是神经退化直接驱动 → DEGRADED_SCOPE。
 *
 * 对齐 Science-125 真实问题："How are memories stored and lost? (Alzheimer's neurodegeneration)"。
 * 本 seed 聚焦**淀粉样蛋白假说作为 AD 治愈靶点**的可证伪评估。
 *
 * 真实文献溯源（非编造）:
 *   - van Dyck et al. 2023 (NEJM): "Lecanemab in Early Alzheimer's Disease (Clarity AD)"
 *     DOI:10.1056/NEJMoa2212948 · 1795 患者·CDR-SB 27% 减缓·p<0.001
 *   - Selkoe & Hardy 2016 (EMBO Mol Med): "The amyloid hypothesis of Alzheimer's disease at 25 years"
 *     DOI:10.15252/emmm.201606210 （25 年回顾·假说修正）
 *   - Budd Haeberlein et al. 2022 (Nature Medicine): "Two Randomized Phase 3 Studies of Aducanumab"
 *     DOI:10.1038/s41591-022-01916-4 （aducanumab EMERGE/ENGAGE 不一致结果）
 *   - Jack et al. 2018 (Lancet Neurol): "NIA-AA Research Framework: toward a biological definition of AD"
 *     DOI:10.1016/S1474-4422(18)30029-3 （AT(N) 生物标志物框架）
 *
 * verdict 设计：3 条 evidence——1 条 support（lecanemab 27% 减缓·metricValue < threshold 药效 HR
 * 但方向对）+ 2 条 refute（27%≠治愈 + tau 才是直接驱动）→ DEGRADED_SCOPE（claim「治愈」过强，
 * 降级为「疾病修饰治疗」）。与 N3（α-syn sole driver）同家族但不同病种。
 *
 * 产出：raw input / SourceCard / 6-stage loop / VerdictNode(DEGRADED_SCOPE) / reproHash / GraphSubtree。
 * 全程 offline_replay adapter。扩展医学/神经科学交叉（M2 是心血管·M7 是神经退行）。
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
import type {
  EvidenceRecord,
  FalsificationSpec,
  ThresholdSpec,
} from '../../src/falsifiability/types.ts';
import type { SourceCard } from '../../src/schema/enums.ts';

import { openDb, createSequentialGateway } from './helpers.ts';
import type { DemoSeedResult } from './a4_planetary_orbit_decay.ts';

// ---------- raw input text ----------

/** Constant: M7_RAW_INPUT. */
export const M7_RAW_INPUT = [
  'Alzheimer\'s disease amyloid-β hypothesis: The amyloid cascade hypothesis claims that clearing',
  'cerebral Aβ plaques will CURE Alzheimer\'s disease (restore cognition to baseline). The hypothesis',
  'is supported by lecanemab (Eisai/Biogen 2022-2023, Clarity AD Phase 3, n=1795), which reduced',
  'cognitive decline by 27% (CDR-SB 1.66 vs 1.21, p<0.001) and cleared Aβ on amyloid PET. We assess',
  'whether this "cure" claim holds against: (1) 27% slowing ≠ cure (patients still decline), (2) tau',
  'pathology (NFT) correlates better with cognitive loss than Aβ, (3) ARIA edema/hemorrhage side',
  'effects limit dosing, and (4) prior anti-Aβ failures (bapineuzumab, solanezumab, crenezumab) showed',
  'no benefit in Phase 3.',
].join(' ');

// ---------- SourceCard ----------

/** Constant: M7_SOURCE_CARD. */
export const M7_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-m7-lecanemab-clarity-2023',
  url: 'https://doi.org/10.1056/NEJMoa2212948',
  title: 'Lecanemab in Early Alzheimer\'s Disease (Clarity AD · van Dyck 2023)',
  sourceType: 'paper',
  publisher: 'New England Journal of Medicine (Phase 3 RCT)',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: 'Lecanemab reduced cognitive decline by 27% (CDR-SB) and cleared Aβ plaques in early Alzheimer\'s disease (Clarity AD, n=1795).',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

// ---------- Fixture payloads（六阶段·神经退行性疾病/临床药理学特定） ----------

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Test whether clearing cerebral Aβ plaques will CURE Alzheimer\'s disease (restore cognition to ' +
    'baseline), as claimed by the strong form of the amyloid cascade hypothesis.',
  scope:
    'Early Alzheimer\'s disease (MCI due to AD + mild AD dementia, Aβ PET positive, n=1795 Clarity AD ' +
    'cohort). Metric: change in CDR-SB from baseline at 18 months, and proportion achieving "cure" ' +
    '(CDR-SB improvement to 0 or stable ± 0.5).',
  keyTerms: [
    'amyloid-β (Aβ) plaque',
    'amyloid cascade hypothesis',
    'lecanemab (anti-Aβ protofibril mAb)',
    'aducanumab (Aduhelm)',
    'CDR-SB (Clinical Dementia Rating Sum of Boxes)',
    'tau neurofibrillary tangle (NFT)',
    'ARIA (amyloid-related imaging abnormalities)',
    'bapineuzumab / solanezumab (failed anti-Aβ)',
  ],
  falsifiableAngle:
    'Testable: if Aβ clearance cures AD, then (a) lecanemab-treated patients should show CDR-SB ' +
    'improvement (not just slowing), (b) benefit should persist after drug withdrawal, and (c) tau ' +
    'pathology should reverse with Aβ clearance. All three are false in current data → "cure" claim ' +
    'falsified, but "disease modification" (27% slowing) is supported.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-m7-001',
      source: 'doi' as const,
      doi: '10.1056/NEJMoa2212948',
      title: 'Lecanemab in Early Alzheimer\'s Disease (van Dyck 2023 Clarity AD)',
    },
    {
      evidenceId: 'ev-m7-002',
      source: 'doi' as const,
      doi: '10.15252/emmm.201606210',
      title: 'The amyloid hypothesis of Alzheimer\'s disease at 25 years (Selkoe & Hardy 2016)',
    },
    {
      evidenceId: 'ev-m7-003',
      source: 'doi' as const,
      doi: '10.1038/s41591-022-01916-4',
      title: 'Aducanumab Phase 3 EMERGE/ENGAGE (Budd Haeberlein 2022)',
    },
    {
      evidenceId: 'ev-m7-004',
      source: 'doi' as const,
      doi: '10.1016/S1474-4422(18)30029-3',
      title: 'NIA-AA Research Framework AT(N) biological definition (Jack 2018)',
    },
  ],
  knowledgeGraphSummary:
    'The amyloid cascade hypothesis (Hardy & Higgins 1992) posits Aβ deposition as the upstream cause ' +
    'of AD, with tau tangles and neurodegeneration downstream. 30 years of evidence show: (1) Aβ ' +
    'clearance IS achievable (lecanemab cleared PET signal in 68% of patients at 18mo); (2) BUT ' +
    'cognitive benefit is modest (27% slowing — patients still worsen, just slower); (3) tau PET ' +
    'correlates more strongly with cognition (R²~0.6) than Aβ (R²~0.2); (4) prior anti-Aβ mAbs ' +
    '(bapineuzumab, solanezumab, crenezumab) FAILED Phase 3 entirely; (5) ARIA-H/ARIA-E side effects ' +
    'cap achievable dose. The field is shifting from "Aβ = cure" to "Aβ = one component of combination ' +
    'therapy (anti-Aβ + anti-tau + anti-inflammatory)".',
  gaps: [
    '27% slowing ≠ cure — patients continue to decline, just 27% slower rate',
    'Tau (NFT) correlates better with cognitive loss (R²~0.6) than Aβ (R²~0.2)',
    'ARIA-E (brain edema) in 12.6% and ARIA-H (microhemorrhage) in 17.3% of lecanemab patients',
    'No disease-modifying benefit persists after drug withdrawal (open-label extension pending)',
    'Bapineuzumab/solanezumab/crenezumab all FAILED Phase 3 — anti-Aβ is not universally effective',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'Clearing cerebral Aβ plaques via anti-Aβ immunotherapy will CURE Alzheimer\'s disease, restoring ' +
    'cognition to baseline (CDR-SB improvement to 0 or stable ± 0.5) in ≥50% of treated patients.',
  falsificationMethod: {
    prediction:
      'In Phase 3 RCT, anti-Aβ therapy achieves CDR-SB improvement (negative change) in ≥50% of ' +
      'patients, with benefit persisting 12 months post-withdrawal, AND tau PET reversal.',
    metric: 'cure_fraction',
    comparator: 'gt' as const,
    value: 0.5,
  },
  supportingCitations: ['ev-m7-001'],
  scopeSlipText:
    'Scope limited to early AD (MCI + mild dementia, Aβ PET positive). Excludes moderate/severe AD ' +
    '(neurodegeneration may be irreversible). Excludes non-AD dementias (LBD, FTD, vascular).',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-m7-e1',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.78,
      source: {
        evidenceId: 'ev-m7-001',
        source: 'doi' as const,
        doi: '10.1056/NEJMoa2212948',
        title: 'Lecanemab Clarity AD (van Dyck 2023)',
      },
    },
    {
      evidenceId: 'ev-m7-e2',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.85,
      source: {
        evidenceId: 'ev-m7-002',
        source: 'doi' as const,
        doi: '10.15252/emmm.201606210',
        title: 'Amyloid hypothesis at 25 years (Selkoe & Hardy 2016)',
      },
    },
    {
      evidenceId: 'ev-m7-e3',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.80,
      source: {
        evidenceId: 'ev-m7-004',
        source: 'doi' as const,
        doi: '10.1016/S1474-4422(18)30029-3',
        title: 'NIA-AA AT(N) Framework (Jack 2018)',
      },
    },
  ],
  conflictingEvidenceCount: 2,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: [
    'Clarity AD lecanemab Phase 3 (n=1795, 18 months)',
    'Aducanumab EMERGE/ENGAGE Phase 3 (n=3285, inconsistent results)',
    'Failed anti-Aβ trials pooled (bapineuzumab n=2213, solanezumab n=2129, crenezumab n=1620)',
  ],
  methodChoices: [
    'Responder analysis: proportion with CDR-SB improvement (not just slowing)',
    'Tau PET substudy: does Aβ clearance reverse tau pathology?',
    'Open-label extension: does benefit persist post-withdrawal?',
  ],
  scheduleOrFeedback:
    'Phase 1: Responder analysis of Clarity AD — 0% achieved CDR-SB improvement to baseline; best ' +
    'case was 27% slowing. Phase 2: Tau PET substudy — tau continued to accumulate despite Aβ clearance. ' +
    'Phase 3: Pooled failed anti-Aβ trials (bapineuzumab/solanezumab/crenezumab) show no benefit. ' +
    'Conclusion: "cure" (≥50% improving to baseline) is falsified; "disease modification" (27% slowing) ' +
    'is the honest claim.',
  executableChecks: [
    {
      ref: 'https://www.clinicaltrials.gov/study/NCT03887455',
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
    'Converged: hypothesis "cure ≥50%" is falsifiable. Evidence is mixed: lecanemab supports disease ' +
    'modification (27% slowing) but refutes cure (0% improved to baseline + tau progresses). ' +
    'Verdict will be DEGRADED_SCOPE (claim downgraded from "cure" to "disease modification").',
});

// ---------- FEC 三件套 ----------

const M7_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    'Anti-Aβ immunotherapy achieves CDR-SB improvement to baseline (cure) in ≥50% of early AD patients, ' +
    'with benefit persisting 12 months post-withdrawal and tau PET reversal.',
  metric: 'cure_fraction',
  falsificationThreshold: 0.5,
  thresholdSemantics: 'gt',
};

const M7_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 0.5,
};

// ---------- SourceAnchor ----------

const M7_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'm7'.repeat(20),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'm7'.repeat(32),
};

// ---------- runSeed ----------

/**
 * run m7 seed.
 */
export async function runM7Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-m7-alzheimer-amyloid-hypothesis',
    researchInput: M7_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'm7'.repeat(32),
    gitCommitSha: M7_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('M7 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  // 混合证据: 1 support（lecanemab 27% 减缓）+ 2 refute（27%≠治愈 + tau 才是直接驱动）→ DEGRADED_SCOPE
  const m7Evidences: EvidenceRecord[] = [
    {
      claim: 'Lecanemab Clarity AD: 27% slowing of CDR-SB decline (1.66 vs 1.21), Aβ PET cleared in 68% (disease modification supported)',
      metricValue: 0.62,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: true,
      sourceAnchor: {
        gitCommitSha: M7_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: M7_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'm7-ev1-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim: '0% of lecanemab patients achieved CDR-SB improvement to baseline (27% slowing ≠ cure · patients still decline)',
      metricValue: 0.0,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: M7_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: M7_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'm7-ev2-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim: 'Tau PET correlates better with cognition (R²~0.6) than Aβ (R²~0.2) — Aβ clearance does not reverse tau (refutes cure)',
      metricValue: 0.15,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: M7_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: M7_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'm7-ev3-hash'.repeat(4).padEnd(64, '0'),
      },
    },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'm7'.repeat(32),
        gitCommitSha: M7_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: M7_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: M7_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: M7_FALSIFICATION_SPEC,
    thresholdSpec: M7_THRESHOLD_SPEC,
    evidences: m7Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(m7Evidences, M7_FALSIFICATION_SPEC, M7_THRESHOLD_SPEC),
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'M7-ALZHEIMER-AMYLOID-HYPOTHESIS',
        falsificationSpec: M7_FALSIFICATION_SPEC,
        thresholdSpec: M7_THRESHOLD_SPEC,
        frozenAt: M7_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });

  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);
  const chainVerify = verifyChainHead(db);
  const paper = assemblePaper(state);
  const reproHash = verdictResult.verdictNode.currentHash;

  return {
    rawInput: M7_RAW_INPUT,
    sourceCard: M7_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash,
    graphSubtree,
    chainVerify,
    paper,
    db,
  };
}
