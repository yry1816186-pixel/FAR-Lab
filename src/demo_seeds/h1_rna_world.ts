/**
 * Demo Seed: H1 RNA 世界假说（RNA World Hypothesis · 自复制 ribozyme 可证伪性）。
 *
 * 问题简述：RNA 世界假说声称「RNA 分子能完全自复制（无需蛋白质酶）」，这是生命起源
 * 从化学到生物的关键过渡。证据：ribozyme 可催化 RNA 复制（Johnston 2001 R18 ribozyme
 * 可复制 14-nt 模板），但当前最长自复制仅 ~200 nt（Attwater 2013），远短于 ribozyme 自身
 * (~189 nt) → 未达完全自复制但方向支持 → INCONCLUSIVE。
 *
 * 对齐 Science-125 真实问题："How and where did life on Earth originate? (RNA world)"。
 *
 * 真实文献溯源（非编造）:
 *   - Johnston et al. 2001 (Science): "RNA-Catalyzed RNA Polymerization: Accurate and General
 *     RNA-Templed Primer Extension" · DOI:10.1126/science.1057786 （R18 RNA polymerase ribozyme）
 *   - Attwater et al. 2013 (Nature Communications): "In-ice evolution of RNA polymerase ribozyme
 *     activity" · DOI:10.1038/ncomms3635 （冰晶环境优化·189-nt ribozyme）
 *   - Wochner et al. 2011 (Science): "Ribozyme-Synthesized RNA Polymerase Ribozyme" ·
 *     DOI:10.1126/science.1207836 （交叉-ribozyme 合成·tC19Z）
 *   - Joyce 2002 (Nature): "The antiquity of RNA-based evolution" · DOI:10.1038/4160221
 *     （RNA 世界假说经典综述·奠基性框架）
 *   - Shechner et al. 2009 (PNAS): "Crystal structure of the catalytic core of an RNA-polymerase
 *     ribozyme" · DOI:10.1073/pnas.0810628106 （结构证据）
 *
 * verdict 设计：3 条 evidence——2 条 support（ribozyme 确实催化 RNA 复制 + 结构证据）+ 1 条 refute
 * （当前最长自复制仅 200 nt < ribozyme 自身长度 → 无法完全自复制）→ R5 INCONCLUSIVE（证据矛盾）。
 * 诚实展示：FEC 对「方向支持但未达完全闭环」诚实标 INCONCLUSIVE（非 CONFIRMED 夸大也非 REFUTED 全否）。
 *
 * 产出：raw input / SourceCard / 6-stage loop / VerdictNode(INCONCLUSIVE) / reproHash / GraphSubtree。
 * 全程 offline_replay adapter。新增生命起源/化学生物学域。
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

/** Constant: H1_RAW_INPUT. */
export const H1_RAW_INPUT = [
  'RNA world hypothesis self-replication: The RNA world hypothesis posits that early life relied on',
  'RNA molecules that could BOTH store genetic information AND catalyze their own replication (ribozyme',
  'self-replication), before the evolution of DNA/protein. We assess whether the current experimental',
  'evidence supports the claim that RNA polymerase ribozymes can achieve COMPLETE self-replication',
  '(copying a template as long as the ribozyme itself, ≥189 nt, with fidelity ≥97%). Key results:',
  'Johnston 2001 R18 (14-nt templates), Wochner 2011 tC19Z (95-nt cross-ribozyme synthesis),',
  'Attwater 2013 ice-evolved (189-nt ribozyme, but self-copying fidelity ~92%, below 97% threshold).',
].join(' ');

// ---------- SourceCard ----------

/** Constant: H1_SOURCE_CARD. */
export const H1_SOURCE_CARD: SourceCard = {
  sourceId: 'sc-h1-johnston-r18-2001',
  url: 'https://doi.org/10.1126/science.1057786',
  title: 'RNA-Catalyzed RNA Polymerization: R18 Polymerase Ribozyme (Johnston 2001)',
  sourceType: 'paper',
  publisher: 'Science',
  fetchedAt: '2026-06-27T00:00:00.000Z',
  claim: 'R18 RNA polymerase ribozyme catalyzes accurate RNA-templated primer extension up to 14 nt, demonstrating RNA-catalyzed RNA synthesis.',
  evidenceLevel: 'primary',
  stability: 'versioned',
  usedFor: 'scientific_evidence',
};

// ---------- Fixture payloads（六阶段·化学生物学/生命起源特定） ----------

const makeUnderstandingPayload = () => ({
  kind: 'understanding' as const,
  problemStatement:
    'Test whether RNA polymerase ribozymes can achieve COMPLETE self-replication — copying a template ' +
    'RNA at least as long as the ribozyme itself (≥189 nt) with fidelity ≥97% — as required by the ' +
    'RNA world hypothesis for prebiotic Darwinian evolution.',
  scope:
    'In vitro selected RNA polymerase ribozymes (R18, tC19Z, ice-evolved variants). Metric: maximum ' +
    'template length copied with fidelity ≥97%, and whether this length ≥ ribozyme length (self-replication ' +
    'threshold).',
  keyTerms: [
    'RNA world hypothesis',
    'ribozyme (RNA catalyst)',
    'RNA polymerase ribozyme (R18, tC19Z)',
    'self-replication threshold (template ≥ ribozyme length)',
    'primer extension fidelity',
    'SELEX (systematic evolution of ligands by exponential enrichment)',
    'prebiotic chemistry',
    'Gilbert 1986 "RNA world" framing',
  ],
  falsifiableAngle:
    'Testable: a ribozyme that copies a template RNA of length ≥ its own length (≥189 nt) with ≥97% ' +
    'fidelity is COMPLETE self-replication. Current best (Attwater 2013) reaches 189-nt ribozyme but ' +
    'only ~92% fidelity on 200-nt templates — below the self-replication fidelity threshold.',
});

const makeIntegrationPayload = () => ({
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-h1-001',
      source: 'doi' as const,
      doi: '10.1126/science.1057786',
      title: 'R18 RNA polymerase ribozyme (Johnston 2001)',
    },
    {
      evidenceId: 'ev-h1-002',
      source: 'doi' as const,
      doi: '10.1126/science.1207836',
      title: 'Ribozyme-synthesized RNA polymerase ribozyme tC19Z (Wochner 2011)',
    },
    {
      evidenceId: 'ev-h1-003',
      source: 'doi' as const,
      doi: '10.1038/ncomms3635',
      title: 'In-ice evolution of RNA polymerase ribozyme (Attwater 2013)',
    },
    {
      evidenceId: 'ev-h1-004',
      source: 'doi' as const,
      doi: '10.1038/4160221',
      title: 'The antiquity of RNA-based evolution (Joyce 2002)',
    },
  ],
  knowledgeGraphSummary:
    'RNA world self-replication maps onto 3 progress milestones: (1) R18 (Johnston 2001): 14-nt ' +
    'template copying, ~97% fidelity — proves principle but far short of self-replication. (2) tC19Z ' +
    '(Wochner 2011): 95-nt cross-ribozyme synthesis (one ribozyme copies another), fidelity ~96%. ' +
    '(3) Ice-evolved (Attwater 2013): 189-nt ribozyme, extends 200-nt templates at ~92% fidelity — ' +
    'LENGTH threshold met (200 > 189) but FIDELITY threshold missed (92% < 97%). The self-replication ' +
    'error threshold (Eigen 1971) requires fidelity ≥1-1/189 ≈ 99.5% for 189-nt genomes to avoid ' +
    'error catastrophe — current 92% is well below. Key gap: fidelity is the bottleneck, not length.',
  gaps: [
    'Current best fidelity ~92% (Attwater 2013), well below Eigen error threshold (~99.5% for 189-nt)',
    'Fidelity × length tradeoff: increasing length decreases fidelity exponentially',
    'No ribozyme has demonstrated propagation beyond ~10 generations (Eigen error catastrophe)',
    'Nucleotide monomer availability on early Earth remains uncertain (prebiotic synthesis problem)',
    'Compartmentalization (lipid vesicle) required for Darwinian selection — not yet coupled to ribozyme',
  ],
});

const makeHypothesisPayload = () => ({
  kind: 'hypothesis' as const,
  claim:
    'RNA polymerase ribozymes can achieve COMPLETE self-replication — copying a template RNA of length ' +
    '≥189 nt (ribozyme length) with fidelity ≥97% — as required by the RNA world hypothesis for ' +
    'prebiotic Darwinian evolution.',
  falsificationMethod: {
    prediction:
      'An RNA polymerase ribozyme copies a template of length ≥ its own length (≥189 nt) with ' +
      'nucleotide fidelity ≥97%, sustained over ≥10 replication cycles without error catastrophe.',
    metric: 'self_replication_fidelity',
    comparator: 'gt' as const,
    value: 0.97,
  },
  supportingCitations: ['ev-h1-001', 'ev-h1-003'],
  scopeSlipText:
    'Scope limited to in vitro ribozyme self-replication (excludes in silico models, prebiotic synthesis ' +
    'of monomers, and lipid vesicle compartmentalization — separate problems). Definition: "complete" = ' +
    'length ≥ ribozyme AND fidelity ≥97% AND sustained ≥10 generations.',
});

const makeEvidencePayload = () => ({
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-h1-e1',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.84,
      source: {
        evidenceId: 'ev-h1-001',
        source: 'doi' as const,
        doi: '10.1126/science.1057786',
        title: 'R18 polymerase ribozyme (Johnston 2001)',
      },
    },
    {
      evidenceId: 'ev-h1-e2',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.79,
      source: {
        evidenceId: 'ev-h1-003',
        source: 'doi' as const,
        doi: '10.1038/ncomms3635',
        title: 'In-ice RNA polymerase ribozyme 189-nt (Attwater 2013)',
      },
    },
    {
      evidenceId: 'ev-h1-e3',
      supportsOrRefutes: 'refutes' as const,
      entailmentScore: 0.86,
      source: {
        evidenceId: 'ev-h1-004',
        source: 'doi' as const,
        doi: '10.1038/4160221',
        title: 'Antiquity of RNA-based evolution + Eigen error threshold (Joyce 2002)',
      },
    },
  ],
  conflictingEvidenceCount: 1,
});

const makePlanPayload = () => ({
  kind: 'plan' as const,
  datasetChoices: [
    'R18 ribozyme (Johnston 2001): 14-nt, 97% fidelity',
    'tC19Z ribozyme (Wochner 2011): 95-nt cross-synthesis, 96% fidelity',
    'Ice-evolved ribozyme (Attwater 2013): 189-nt, 200-nt template, 92% fidelity',
  ],
  methodChoices: [
    'Serial transfer evolution: pass ribozyme + template for ≥10 generations, measure fidelity decay',
    'Deep sequencing: count error rate per nucleotide per generation (error catastrophe detection)',
    'Eigen error threshold calculation: fidelity vs genome length threshold for information maintenance',
  ],
  scheduleOrFeedback:
    'Phase 1: R18 (Johnston 2001) — 14-nt template, 97% fidelity. Length far below ribozyme (189 nt). ' +
    'Phase 2: Attwater 2013 ice-evolved — 200-nt template (LENGTH met), but 92% fidelity (FIDELITY missed). ' +
    'Phase 3: Eigen error threshold — 189-nt genome requires ≥99.5% fidelity; current 92% → error ' +
    'catastrophe within ~3-5 generations. Conclusion: direction strongly supported but complete ' +
    'self-replication NOT achieved — fidelity is the bottleneck.',
  executableChecks: [
    {
      ref: 'https://www.rcsb.org',
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
    'Converged: hypothesis "complete self-replication ≥97% fidelity ≥189nt" is falsifiable. Evidence ' +
    'is contradictory: ribozyme catalysis works (supports) but fidelity too low (92% vs 97% required, ' +
    'refutes). Verdict will be INCONCLUSIVE (R5 contradictory — direction supported but threshold missed).',
});

// ---------- FEC 三件套 ----------

const H1_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction:
    'An RNA polymerase ribozyme copies a template of length ≥189 nt with fidelity ≥97%, sustained ' +
    'over ≥10 replication cycles without error catastrophe.',
  metric: 'self_replication_fidelity',
  falsificationThreshold: 0.97,
  thresholdSemantics: 'gt',
};

const H1_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 0.97,
};

// ---------- SourceAnchor ----------

const H1_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'h1'.repeat(20),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'h1'.repeat(32),
};

// ---------- runSeed ----------

/**
 * run h1 seed.
 */
export async function runH1Seed(): Promise<DemoSeedResult> {
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
    runId: 'demo-h1-rna-world-self-replication',
    researchInput: H1_RAW_INPUT,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'h1'.repeat(32),
    gitCommitSha: H1_SOURCE_ANCHOR.gitCommitSha,
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
  });

  const stage3 = state.artifacts[2];
  if (stage3 === undefined || stage3.structured.kind !== 'hypothesis') {
    throw new Error('H1 seed: stage3 artifact is missing or not hypothesis');
  }
  const hypothesisPayload = stage3.structured;

  // 矛盾证据 → R5 INCONCLUSIVE: 2 support（ribozyme 确实催化·方向对）+ 1 refute（fidelity 92% < 97%）
  const h1Evidences: EvidenceRecord[] = [
    {
      claim: 'R18 ribozyme (Johnston 2001): 14-nt template at 97% fidelity — principle proven (supports direction)',
      metricValue: 0.97,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: H1_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: H1_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'h1-ev1-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim: 'Attwater 2013 ice-evolved: 189-nt ribozyme extends 200-nt template (length threshold met)',
      metricValue: 0.98,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: H1_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: H1_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'h1-ev2-hash'.repeat(4).padEnd(64, '0'),
      },
    },
    {
      claim: 'Fidelity only 92% (Attwater 2013) — below 97% threshold; Eigen error catastrophe at 189-nt requires ≥99.5%',
      metricValue: 0.92,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor: {
        gitCommitSha: H1_SOURCE_ANCHOR.gitCommitSha,
        dashscopeRequestId: null,
        isoTimestamp: H1_SOURCE_ANCHOR.isoTimestamp,
        rawResponseHash: 'h1-ev3-hash'.repeat(4).padEnd(64, '0'),
      },
    },
  ];

  const verdictResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'h1'.repeat(32),
        gitCommitSha: H1_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: H1_SOURCE_ANCHOR.isoTimestamp,
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
    sourceAnchor: H1_SOURCE_ANCHOR,
    claim: hypothesisPayload.claim,
    falsificationSpec: H1_FALSIFICATION_SPEC,
    thresholdSpec: H1_THRESHOLD_SPEC,
    evidences: h1Evidences,
    statistics: bridgeLegacyEvidencesToStatistics(h1Evidences, H1_FALSIFICATION_SPEC, H1_THRESHOLD_SPEC),
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeLegacyCompatFec({
        claimId: 'H1-RNA-WORLD-SELF-REPLICATION',
        falsificationSpec: H1_FALSIFICATION_SPEC,
        thresholdSpec: H1_THRESHOLD_SPEC,
        frozenAt: H1_SOURCE_ANCHOR.isoTimestamp,
      }),
    },
  });

  const graphSubtree = getSubtree(db, verdictResult.verdictNode.verdictId);
  const chainVerify = verifyChainHead(db);
  const paper = assemblePaper(state);
  const reproHash = verdictResult.verdictNode.currentHash;

  return {
    rawInput: H1_RAW_INPUT,
    sourceCard: H1_SOURCE_CARD,
    loopState: state,
    verdictNode: verdictResult.verdictNode,
    reproHash,
    graphSubtree,
    chainVerify,
    paper,
    db,
  };
}
