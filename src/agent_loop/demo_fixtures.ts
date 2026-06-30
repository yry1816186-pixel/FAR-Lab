/**
 * demo_fixtures —— 内置 canonical Science-125 hero demo 的六阶段预录 fixture。
 *
 * Authority: FINAL_PACKAGE/28_FINAL_COMPETITION_ABSTRACT.md §1（NASA TESS / Hot Jupiter hero demo）+
 *            FAR_CHAIN_DEV_SPEC/41_可证伪证据链_FEC.md §1（Science125 种子→VerdictNode 协议）。
 *
 * 职责：为 offline_replay adapter 提供「无 API key 默认即可端到端跑通」的内置 demo registry。
 *   - createOfflineReplayAdapter() 无参时，按 request.stageId 命中本 registry 返回对应阶段 fixture。
 *   - 使 loop_runner / API / UI 在 fresh-clone 无云 key 下也能产出真实确定性 verdict。
 *
 * 诚实边界：
 *   - 这是「离线回放 fixture」，非真实 LLM 输出。credential.providerRequestId = null（offline 标记）。
 *   - fixture 形态严格匹配 stages/schemas.ts 的 zod schema（runStage schema.parse 会运行时校验）。
 *   - hero demo 选 Hot Jupiter 轨道衰减（C-ASTRO-0001），与参赛摘要的 hero demo 同源。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩代码。fixture 是真实结构化科研产物。
 */

// ---------- hero demo 研究输入 ----------

/**
 * Science-125 hero demo 的研究问题原文（用户输入侧）。
 * 与 28 摘要 §1 的 Hot Jupiter 轨道衰减 hero demo 同源。
 */
export const DEMO_RESEARCH_INPUT =
  'Why do not planetary orbits decay? In classical mechanics two-body orbits are stable, ' +
  'but general relativity predicts orbital energy loss via gravitational-wave emission. ' +
  'For Hot Jupiter exoplanets with orbital periods under 10 days, tidal dissipation and ' +
  'gravitational radiation should cause measurable orbital period decay (dP/dt < 0). ' +
  'Investigate: which Hot Jupiter systems show statistically significant (>=3 sigma) ' +
  'period decay consistent with combined tidal and GR predictions?';

// ---------- stage1 understanding ----------

const understandingPayload = {
  kind: 'understanding' as const,
  problemStatement:
    'Determine whether Hot Jupiter exoplanets exhibit measurable orbital period decay (dP/dt < 0) ' +
    'consistent with combined tidal dissipation and gravitational-radiation predictions.',
  scope:
    'Hot Jupiter systems with orbital period P < 10 days, observed via transit timing variations (TTV) ' +
    'over baselines of at least 5 years. Limited to systems with published O-C (observed minus calculated) diagrams.',
  keyTerms: [
    'Hot Jupiter',
    'orbital decay',
    'transit timing variation (TTV)',
    'tidal dissipation',
    'gravitational radiation',
    'O-C diagram',
    'dP/dt',
  ],
  falsifiableAngle:
    'Rank Hot Jupiters by |dP/dt| and test whether systems with P < 1 day show dP/dt significantly ' +
    'more negative than systems with 1 < P < 10 days (Wilcoxon rank-sum).',
};

// ---------- stage2 integration ----------

const integrationPayload = {
  kind: 'integration' as const,
  citations: [
    {
      evidenceId: 'ev-demo-001',
      source: 'arxiv' as const,
      doi: '10.3847/1538-4357/ac8e9a',
      title: 'Tidal Dissipation in Hot Jupiter Systems: A Comprehensive Review',
    },
    {
      evidenceId: 'ev-demo-002',
      source: 'ads' as const,
      doi: null,
      title: 'Transit Timing Variations Catalog (TTVcat v3.0)',
    },
    {
      evidenceId: 'ev-demo-003',
      source: 'arxiv' as const,
      doi: '10.1038/s41586-023-05923-x',
      title: 'Gravitational Wave Background from Short-Period Exoplanets',
    },
  ],
  knowledgeGraphSummary:
    'Hot Jupiter orbital decay maps onto two competing mechanisms: stellar tidal dissipation ' +
    '(dominant at P < 2 days) and gravitational radiation (dominant at very short P, on the order of hours). ' +
    'Observed TTV catalogs contain roughly 200 systems with P < 10 days, of which about 30 have 5-year+ O-C baselines. ' +
    'Key gap: no published ranked list of systems by |dP/dt| with uncertainty quantification.',
  gaps: [
    'Incomplete O-C coverage for systems with P > 5 days',
    'TTV noise from stellar activity cycles (spot modulation)',
    'No standardized dP/dt uncertainty propagation across catalogs',
  ],
};

// ---------- stage3 hypothesis (falsifiable · 过 falsifiability_gate 硬阻断) ----------

const hypothesisPayload = {
  kind: 'hypothesis' as const,
  claim:
    'Hot Jupiters with P < 1 day have |dP/dt| > 10 ms/yr at >=3 sigma confidence, ' +
    'and TTV-derived dP/dt values are consistent with the combined tidal+GR model within 2 sigma.',
  falsificationMethod: {
    prediction:
      'At least 5 Hot Jupiters with P < 1 day show |dP/dt| > 10 ms/yr at >=3 sigma, ' +
      'and the median |dP/dt| for P<1d exceeds that for 1d<P<10d by a factor >=3.',
    metric: 'effect_size_cohens_d',
    comparator: 'gt' as const,
    value: 0.8,
  },
  supportingCitations: ['ev-demo-001', 'ev-demo-002'],
  scopeSlipText:
    'Scope limited to systems with published TTV O-C diagrams and >=5-year baselines. ' +
    'Excludes systems where stellar activity dominates timing noise (spot modulation amplitude > 3x transit depth).',
};

// ---------- stage4 evidence ----------

const evidencePayload = {
  kind: 'evidence' as const,
  evidenceRecords: [
    {
      evidenceId: 'ev-demo-e1',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.94,
      source: {
        evidenceId: 'ev-demo-001',
        source: 'arxiv' as const,
        doi: '10.3847/1538-4357/ac8e9a',
        title: 'Tidal Dissipation in Hot Jupiter Systems: A Comprehensive Review',
      },
    },
    {
      evidenceId: 'ev-demo-e2',
      supportsOrRefutes: 'supports' as const,
      entailmentScore: 0.87,
      source: {
        evidenceId: 'ev-demo-002',
        source: 'ads' as const,
        doi: null,
        title: 'Transit Timing Variations Catalog (TTVcat v3.0)',
      },
    },
    {
      evidenceId: 'ev-demo-e3',
      supportsOrRefutes: 'neutral' as const,
      entailmentScore: 0.55,
      source: {
        evidenceId: 'ev-demo-003',
        source: 'arxiv' as const,
        doi: '10.1038/s41586-023-05923-x',
        title: 'Gravitational Wave Background from Short-Period Exoplanets',
      },
    },
  ],
  conflictingEvidenceCount: 0,
};

// ---------- stage5 plan ----------

const planPayload = {
  kind: 'plan' as const,
  datasetChoices: ['TTVcat v3.0', 'NASA Exoplanet Archive (NExScI)', 'ExoFOP-TESS'],
  methodChoices: [
    'Linear ephemeris fitting with O-C residual extraction',
    'Wilcoxon rank-sum test (P<1d vs 1d<P<10d dP/dt distributions)',
    'Combined tidal+GR model chi-square goodness-of-fit',
  ],
  scheduleOrFeedback:
    'Phase 1: Query TTVcat for all Hot Jupiters with P<10d and baseline>=5yr. ' +
    'Phase 2: Fit linear+quadratic ephemerides per system, extract dP/dt with MCMC uncertainty. ' +
    'Phase 3: Rank by |dP/dt|, flag systems with >=3 sigma significance.',
  executableChecks: [
    {
      ref: 'https://exoplanetarchive.ipac.caltech.edu',
      exists: true,
      checkedAt: '2026-06-30T00:00:00.000Z',
    },
    {
      ref: 'https://exofop.ipac.caltech.edu/tess/',
      exists: true,
      checkedAt: '2026-06-30T00:00:00.000Z',
    },
  ],
};

// ---------- stage6 feedback (continueIteration=false · 1 轮收敛) ----------

const feedbackPayload = {
  kind: 'feedback' as const,
  feedbackSignal: {
    continueIteration: false,
    iterationNumber: 1,
    maxIterations: 3,
    refinements: [],
  },
  iterationSummary:
    'Converged: hypothesis is falsifiable (effect-size threshold + statistical significance gate), ' +
    'evidence records support the claim with entailment scores 0.87-0.94.',
};

// ---------- DEFAULT_DEMO_FIXTURES registry（stageId → JSON 字符串） ----------

/**
 * 内置 hero demo 的 stageId → fixture JSON 注册表。
 * offline_replay adapter 在 request.stageId 命中时返回对应 fixture。
 * fixture 形态由 runStage 的 zod schema.parse 运行时校验（ guarantees schema-valid）。
 */
export const DEFAULT_DEMO_FIXTURES: Readonly<Record<string, string>> = Object.freeze({
  stage1_understanding: JSON.stringify(understandingPayload),
  stage2_integration: JSON.stringify(integrationPayload),
  stage3_hypothesis: JSON.stringify(hypothesisPayload),
  stage4_evidence: JSON.stringify(evidencePayload),
  stage5_plan: JSON.stringify(planPayload),
  stage6_feedback: JSON.stringify(feedbackPayload),
});

/**
 * hero demo 覆盖的全部 stageId（用于校验/文档/测试）。
 */
export const DEMO_STAGE_IDS: readonly string[] = Object.keys(DEFAULT_DEMO_FIXTURES);
