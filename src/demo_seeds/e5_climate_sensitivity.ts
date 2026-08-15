/**
 * Demo Seed: E5 平衡气候敏感度（Equilibrium Climate Sensitivity · ECS 低敏感假说证伪）。
 *
 * 问题简述：平衡气候敏感度（ECS）= CO2 翻倍后全球平均地表温度的平衡响应。有声称认为
 * ECS 处于「低敏感区」（1.5-2.0 K），暗示气候变化影响有限。但多证据线约束（Sherwood 2020）
 * 排除 ECS < 2.3 K（95% CI 下界）→ REFUTED（claim 被多源证据排除）。
 *
 * 对齐 Science-125 真实问题："How hot will the greenhouse world be? (climate sensitivity)"。
 *
 * 真实文献溯源（非编造）:
 *   - Sherwood et al. 2020 (Reviews of Geophysics): "An assessment of Earth's climate sensitivity
 *     using multiple lines of evidence" · DOI:10.1029/2019RG000678
 *     （多证据线综合：paleoclimate + process + instrumental → ECS 2.6-3.9 K very likely range）
 *   - IPCC AR6 WG1 2021 Ch.7: "Earth's energy budget, climate feedbacks, and climate sensitivity"
 *     （IPCC 官方采纳 Sherwood 2020 为 ECS 评估基础·AR5→AR6 ECS 下界从 1.5→2.5 K）
 *   - Ceppi & Gregory 2019 (Nature Geoscience): "Relationship of tropopause cloud radiative forcing
 *     to climate sensitivity" · DOI:10.1038/s41561-019-0310-1
 *   - Rohling et al. 2018 (Quaternary Science Reviews): "Comparing climate sensitivity, past and present"
 *     DOI:10.1016/j.quascirev.2017.12.001 （古气候约束：Last Glacial Maximum 排除低 ECS）
 *
 * verdict 设计：3 条 evidence——全 refute（paleoclimate 排除低 ECS + process models + instrumental
 * record 一致指向 2.6-4.5K）→ metricValue 全部 >= 2.5（超过 claim 的 1.5-2.0K）→ R6 REFUTED。
 * 诚实展示：FEC 驳斥「低敏感乐观声称」·展示多证据线约束的科学力量。
 *
 * 产出：raw input / SourceCard / 6-stage loop / VerdictNode(REFUTED) / reproHash / GraphSubtree。
 * 全程 offline_replay adapter。新增气候科学域（原 10 seed 无气候敏感度）。
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

/** Constant: E5_RAW_INPUT. */
export const E5_RAW_INPUT = [
  'Equilibrium Climate Sensitivity (ECS) low-sensitivity hypothesis: Some analyses claim ECS is in the',
  '"low sensitivity" range (1.5-2.0 K per CO2 doubling), implying modest climate change impacts. We',
  'assess whether this low-ECS claim survives scrutiny against multiple independent lines of evidence:',
  'paleoclimate constraints (Last Glacial Maximum, PETM), instrumental record (1850-2020 energy uptake),',
  'process-based GCM feedback analysis (cloud, water vapor, lapse rate, albedo), and emergent constraint',
  'ensembles. Sherwood et al. 2020 (Reviews of Geophysics, IPCC AR6 basis) concluded ECS is "very likely"',
  'in 2.6-3.9 K, excluding ECS < 2.3 K at 95% CI.',
].join(' ');

// ---------- SourceCard ----------

/** Constant: E5_SOURCE_CARD. */
export const E5_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-e5-sherwood-2020-ecs',
  url: 'https://doi.org/10.1029/2019RG000678',
  title: 'An assessment of Earth\'s climate sensitivity using multiple lines of evidence (Sherwood 2020)',
  sourceType: 'paper',
  publisher: 'Reviews of Geophysics (AGU · IPCC AR6 basis)',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: 'Multiple independent lines of evidence constrain ECS to 2.6-3.9 K (very likely), excluding ECS < 2.3 K.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

// ---------- Fixture payloads（六阶段·气候科学特定） ----------

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Test whether Equilibrium Climate Sensitivity (ECS) is in the "low sensitivity" range (1.5-2.0 K ' +
    'per CO2 doubling), as claimed by some energy-budget analyses citing historical warming.',
  scope:
    'Global mean surface air temperature response to CO2 doubling (2× pre-industrial). Metric: ECS ' +
    'in Kelvin/°C. Assessed via paleoclimate (LGM, PETM, last 800kyr), instrumental (1850-2020), ' +
    'process-based GCMs (CMIP5/6), and emergent constraints.',
  keyTerms: [
    'Equilibrium Climate Sensitivity (ECS)',
    'CO2 doubling (2×CO2)',
    'cloud feedback (shortwave/longwave)',
    'water vapor feedback',
    'lapse rate feedback',
    'Planck feedback (σT⁴ blackbody)',
    'Last Glacial Maximum (LGM) paleoclimate constraint',
    'emergent constraint (PINCIPS)',
    'IPCC AR6 WG1',
  ],
  falsifiableAngle:
    'Testable: ECS is bounded below by independent evidence lines. If paleoclimate (LGM 5K cooling with ' +
    'known forcings) + process models + instrumental all exclude ECS < 2.3 K, then the low-sensitivity ' +
    'claim (1.5-2.0 K) is falsified by multi-line convergence.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-e5-001',
      source: 'doi' as const,
      doi: '10.1029/2019RG000678',
      title: 'Assessment of ECS using multiple lines of evidence (Sherwood 2020)',
    },
    {
      evidenceId: 'ev-e5-002',
      source: 'doi' as const,
      doi: '10.1016/j.quascirev.2017.12.001',
      title: 'Comparing climate sensitivity, past and present (Rohling 2018)',
    },
    {
      evidenceId: 'ev-e5-003',
      source: 'doi' as const,
      doi: '10.1038/s41561-019-0310-1',
      title: 'Tropopause cloud radiative forcing and climate sensitivity (Ceppi & Gregory 2019)',
    },
  ],
  knowledgeGraphSummary:
    'ECS is constrained by 4 independent evidence lines: (1) PALEOCLIMATE: LGM (21kyr BP, -5K global, ' +
    'known CO2/ice/dust forcing) requires ECS ≥ 2.2K; PETM requires even higher. (2) PROCESS MODELS: ' +
    'CMIP5/6 GCMs converge on 3.0-3.5K (cloud feedback +0.5 W/m²/K, water vapor +1.8, lapse rate -0.8, ' +
    'albedo +0.3, Planck -3.2). (3) INSTRUMENTAL: 1850-2020 warming (1.1K) + ocean heat uptake + forcing ' +
    'estimate → "effective sensitivity" 2.5-4.0K (correcting for pattern effect). (4) EMERGENT CONSTRAINTS: ' +
    'observable proxies (cloud morphology, subtropical drying) statistically trained on model ensembles ' +
    '→ ECS 3.0-3.8K. ALL FOUR lines exclude ECS < 2.3K. The low-ECS claim (1.5-2.0K) arises ONLY from ' +
    'naive energy-budget methods that ignore (a) pattern effect (spatial warming pattern biases cloud ' +
    'feedback), (b) ocean heat uptake delay, and (c) aerosol forcing uncertainty.',
  gaps: [
    'Pattern effect: historical warming pattern differs from 2×CO2 pattern, biasing cloud feedback estimate',
    'Aerosol forcing uncertainty (historical cooling offset may be underestimated)',
    'Ocean heat uptake efficiency varies (delayed equilibration inflates low-ECS estimate)',
    'Cloud feedback remains largest uncertainty (Sherwood 2020 narrows but does not eliminate)',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'Equilibrium Climate Sensitivity (ECS) is in the low-sensitivity range (1.5-2.0 K per CO2 doubling), ' +
    'as inferred from simple historical energy-budget analyses of 1850-2020 warming.',
  falsificationMethod: {
    prediction:
      'Multiple independent evidence lines (paleoclimate, process, emergent, corrected instrumental) ' +
      'all yield ECS median ≤ 2.0 K with 95% CI upper bound < 2.3 K.',
    metric: 'ecs_kelvin',
    comparator: 'lt' as const,
    value: 2.3,
  },
  supportingCitations: [],
  scopeSlipText:
    'Scope: global mean ECS only (excludes regional sensitivity, Arctic amplification, tipping points). ' +
    'Definition: Charney sensitivity (fast feedbacks: water vapor, cloud, lapse rate, albedo, Planck) — ' +
    'excludes slow Earth system feedbacks (ice sheets, vegetation, methane hydrates = Earth System Sensitivity).',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-e5-e1',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.88,
      source: {
        evidenceId: 'ev-e5-001',
        source: 'doi' as const,
        doi: '10.1029/2019RG000678',
        title: 'Sherwood 2020 multi-line ECS assessment',
      },
    },
    {
      evidenceId: 'ev-e5-e2',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.82,
      source: {
        evidenceId: 'ev-e5-002',
        source: 'doi' as const,
        doi: '10.1016/j.quascirev.2017.12.001',
        title: 'Rohling 2018 paleoclimate ECS constraint',
      },
    },
    {
      evidenceId: 'ev-e5-e3',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.76,
      source: {
        evidenceId: 'ev-e5-003',
        source: 'doi' as const,
        doi: '10.1038/s41561-019-0310-1',
        title: 'Ceppi & Gregory 2019 cloud feedback',
      },
    },
  ],
  conflictingEvidenceCount: 0,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: [
    'Sherwood 2020 multi-line synthesis (paleo + process + instrumental + emergent)',
    'CMIP6 model ensemble (40+ GCMs ECS range)',
    'LGM paleoclimate reconstruction (PMIP4: -5K global, known forcing)',
  ],
  methodChoices: [
    'Bayesian multi-line synthesis (Sherwood 2020 method)',
    'Emergent constraint regression (observable proxy vs ECS across model ensemble)',
    'Pattern effect correction (historical vs 2×CO2 warming pattern differencing)',
  ],
  scheduleOrFeedback:
    'Phase 1: Sherwood 2020 — 4 evidence lines converge on 2.6-3.9K, 95% CI lower bound 2.3K. ' +
    'Phase 2: LGM paleoclimate — ECS ≥ 2.2K required to explain 5K cooling. ' +
    'Phase 3: Pattern effect correction — naive energy-budget low-ECS estimates rise to 2.8-3.5K ' +
    'when corrected. Conclusion: ECS 1.5-2.0K is excluded at >95% confidence by ALL independent lines.',
  executableChecks: [
    {
      ref: 'https://www.ipcc.ch/report/ar6/wg1/',
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
    'Converged: hypothesis "ECS 1.5-2.0K" is falsifiable via multi-line constraint. All 3 evidence ' +
    'lines refute (Sherwood 2020 + paleoclimate + process models all exclude ECS<2.3K). Verdict = REFUTED.',
});

// ---------- FEC 三件套 ----------

const E5_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    'Multiple independent evidence lines (paleo + process + emergent + corrected instrumental) all ' +
    'yield ECS ≤ 2.0K median with 95% CI upper bound < 2.3K.',
  metric: 'ecs_kelvin',
  falsificationThreshold: 2.3,
  thresholdSemantics: 'lt',
};

const E5_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'lt',
  value: 2.3,
};

// ---------- SourceAnchor ----------

const E5_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'e5'.repeat(20),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'e5'.repeat(32),
};

// ---------- runSeed ----------

/**
 * run e5 seed.
 */
export async function runE5Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-e5-climate-sensitivity-ecs',
    researchInput: E5_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'e5'.repeat(32),
    gitCommitSha: E5_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('E5 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  // 全 refute（3 条 evidence 的 ECS 估计都 ≥ 2.5K·超过 claim 的 2.3K 阈值）→ R6 REFUTED
  // claim threshold semantics='lt' value=2.3·metricValue >= 2.3 → 不满足 → refute
  const e5Evidences: EvidenceRecord[] = [
    {
      claim: 'Sherwood 2020 multi-line synthesis: ECS very likely 2.6-3.9K (median 3.1K), excludes <2.3K',
      metricValue: 3.1,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: E5_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: E5_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'e5-ev1-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim: 'LGM paleoclimate (Rohling 2018): ECS ≥ 2.2K required to explain 5K global cooling with known forcings',
      metricValue: 2.8,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: E5_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: E5_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'e5-ev2-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim: 'CMIP6 process models: median ECS 3.0K, 5-95% range 2.6-4.5K (Ceppi & Gregory cloud feedback)',
      metricValue: 3.0,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: E5_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: E5_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'e5-ev3-hash'.repeat(4).padEnd(64, '0'),
      },
    },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'e5'.repeat(32),
        gitCommitSha: E5_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: E5_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: E5_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: E5_FALSIFICATION_SPEC,
    thresholdSpec: E5_THRESHOLD_SPEC,
    evidences: e5Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(e5Evidences, E5_FALSIFICATION_SPEC, E5_THRESHOLD_SPEC),
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'E5-CLIMATE-SENSITIVITY-ECS',
        falsificationSpec: E5_FALSIFICATION_SPEC,
        thresholdSpec: E5_THRESHOLD_SPEC,
        frozenAt: E5_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });

  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);
  const chainVerify = verifyChainHead(db);
  const paper = assemblePaper(state);
  const reproHash = verdictResult.verdictNode.currentHash;

  return {
    rawInput: E5_RAW_INPUT,
    sourceCard: E5_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash,
    graphSubtree,
    chainVerify,
    paper,
    db,
  };
}
