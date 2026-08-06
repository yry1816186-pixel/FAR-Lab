// tests/fixtures/anti_theater/golden_vectors.ts
// 反剧场 golden vector 夹具：clean base envelope + 21 攻击向量构建器 + spec 表。
//
// Authority: FAR_LAB_MASTER_PLAN/APPENDIX_E_ANTI_THEATER.md §5（AttackCase + §5.2 17 P0 golden vectors 表）+
//            §6（7 CI gates·5 测试 gate 消费本夹具）+ 06_ROADMAP_AND_DOD.md §5.3（W3 DOD：攻击可重复 /
//            reasonCode / 不用 LLM-as-judge / 误报率=0）。
//
// 设计裁决（GV-D1·夹具形态选择 TS 向量夹具而非 JSON+deep-set）：
//   - 多数 mutation 需「删除字段」（gv-label-only / gv-missing-raw / gv-fake-pass / gv-seed-cherry
//     清空数组、gv-data-hash-fake 添加 chunkHashes），JSON+deep-set 无法表达删除语义且类型不安全。
//   - 故采用类型安全 TS 向量夹具：makeCleanBaseInput() 产通过全部 21 detector 的干净 base，
//     每个向量经 cloneMutable 深拷贝后做最小字段 mutation。frozen hash（thresholdHash /
//     primaryMetricHash / seedPolicyHash）由 base 从 BASE_FEC 精确计算，保证 base 误报率=0；
//     向量只改 FEC 执行端字段（frozen 端不动）→ hash 自然失配 → detector 命中。
//
// 设计裁决（GV-D2·base 通过条件 = 过全部 21 detector）：
//   base 须同时满足每个 detector 的「无发现」条件（误报率=0 基准，见 false_green_rate.test.ts
//   的 base liveness 断言）。逐条约束记录于 makeCleanBaseInput 注释，便于审计。
//
// 设计裁决（GV-D3·expectedForcedVerdict 来源）：
//   每个向量的 expectedForcedVerdict 由 src/anti_theater/constraint.ts（支持度降级模型 D17 + D16）
//   确定，与 APPENDIX_E §5.2 设计表逐字对齐（如 gv-fake-degraded-01 → REFUTED via
//   REFUTATION_HIDDEN_BY_SCOPE；gv-data-drift-* → DEGRADED_SCOPE）。本夹具是设计清单的运行时落地，
//   命中数由 CI 实测回填（不手填，§5.2 数量纪律）。
//
// 模型中立（F3/C1）：无 qwen/dashscope/openai 字面量。零容忍合规：无 any / @ts-ignore / 双重断言 /
//   空 catch / 桩。cloneMutable 的单层 as 依据见注释。

import type { AntiTheaterLintInput, EvidenceBinding } from '../../../src/anti_theater/types.ts';
import type { FecContractV2 } from '../../../src/fec/fec_contract.ts';
import type { VerdictKernelOutput } from '../../../src/falsifiability/verdict_kernel_v2.ts';
import { hashCanonicalJson } from '../../../src/evidence_log/hasher.ts';

// ===== 递归 Mutable（剥离 readonly 供本夹具局部构造·GV-D1）=====

/**
 * 递归把 readonly 修饰符剥为 mutable（仅类型层·运行时无变化）。
 * 用于 cloneMutable 后的局部 mutation 构造（铁律 #10 不可变操作的反例豁免：夹具构造期允许局部 mutable）。
 *
 * 设计（单 object 分支·**故意不用数组分支**）：
 *   - TS 的 mapped type `{ -readonly [K in keyof T]: ... }` 对**数组**和**元组**有内置形态保留——
 *     readonly string[] → string[]（数组·mutable）、readonly [number,number] → [number,number]
 *     （元组·保留长度）。`-readonly` 只剥 readonly 修饰符，不改元素/长度形态。
 *   - 若加 `T extends readonly (infer U)[] ? Mutable<U>[]` 数组分支，会把**固定长度元组**
 *     `readonly [number, number]` 退化成可变长度数组 `number[]`（裸参数 T 对 union 分配求值 +
 *     数组分支吞元组长度），导致 VerdictKernelOutput.statisticalReport.primaryConfidenceInterval
 *     （`readonly [number, number] | null`）经 cloneMutable 后变 `number[] | null`，赋值回
 *     AntiTheaterLintInput 报 TS2322。故省略数组分支，让 object 分支统一处理数组/元组。
 */
type Mutable<T> = T extends object
  ? { -readonly [K in keyof T]: Mutable<T[K]> }
  : T;

/**
 * structuredClone 深拷贝；as Mutable<T> 仅剥离 readonly 供夹具局部构造（铁律：单层 as 须配依据——
 * structuredClone 产出结构相同的值，Mutable 仅在类型层放宽 readonly，不改变运行时形状）。
 */
function cloneMutable<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>;
}

// ===== BASE_FEC（干净 FEC·过全部 detector 的执行端基准）=====

const BASE_FEC: FecContractV2 = {
  fecId: 'FEC-ASTRO-GV-0001',
  contractVersion: 'FEC/2.0',
  claimId: 'CLM-ASTRO-0001',
  measurableImplication:
    'If the transit model is correct, BLS periodogram power at the preregistered period exceeds 0.8.',
  scope: {
    population: 'TIC-268105898',
    timeWindow: '2024-01-01T00:00:00Z/2024-03-01T00:00:00Z',
    domainConstraint: 'space-based optical photometry',
  },
  // AT-FAKE-PASS 通过条件：requiredEvidence.evidenceId 须被某 measurement.requirementId resolve。
  requiredEvidence: [
    {
      evidenceId: 'EV-PRIMARY-RESULT',
      kind: 'measurement',
      critical: true,
      description: 'Primary BLS peak power measurement against preregistered threshold.',
      verificationCheckId: 'VC-PRIMARY-POWER',
    },
  ],
  // AT-DEP/score 通过条件：datasetRequirements 含 'negative'/'control'（hasNegativeControl=true·score 桶 6 不扣）。
  datasetRequirements: [
    {
      name: 'negative-control-baseline-dataset',
      contentHashAlgorithm: 'sha256',
      allowSynthetic: false,
      schemaFingerprintRequired: true,
    },
  ],
  workflowRequirements: [
    {
      name: 'bls-periodogram-workflow',
      engine: 'script',
      requireContainerDigest: true,
      requireCommandHash: true,
      expectedNetworkPolicy: 'off',
      requireFixedSeed: true,
    },
  ],
  metric: {
    metricKey: 'bls_power',
    description: 'Box Least Squares periodogram peak power',
    unit: 'dimensionless',
    computationRef: 'far-lab.numpy-bls.box-only',
    isDeterministic: true,
  },
  threshold: {
    value: 0.8,
    unit: 'dimensionless',
    thresholdSemantics: 'gt',
    preregistered: true,
  },
  direction: 'greater',
  statisticalPlan: {
    primaryMetric: 'bls_power',
    nullHypothesis: 'bls_power <= 0.8',
    alternativeHypothesis: 'bls_power > 0.8',
    alpha: 0.0125,
    effectDirection: 'greater',
    confidenceIntervalMethod: 'bootstrap-percentile',
    // AT-PHACK-CORRECTION 通过条件：base 无 multipleTestingPlan → familySize 默认 1，1>1=false → 不触发。
    multipleTestingCorrection: 'none',
    missingDataPolicy: 'listwise-deletion',
    outlierPolicy: 'keep-all-preregistered',
    // AT-STOPPING-RULE/AT-OPTIONAL-STOPPING 通过条件：含 'group_sequential' + spending 关键词
    // （classify=group_sequential + spendingFunction=obrien-fleming 非空 → 两 detector 均不触发）。
    stoppingRule: "group_sequential (O'Brien-Fleming spending) single primary look",
  },
  powerPlan: {
    targetPower: 0.8,
    minimumDetectableEffect: 0.1,
    sampleSize: 1000,
    powerMethod: 'monte-carlo-simulation',
    alphaAssumed: 0.0125,
  },
  seedPolicy: {
    fixed: true,
    seedValue: 42,
    allowCherryPick: false,
    justification: 'deterministic bootstrap resampling',
  },
  deviationPolicy: {
    criticalCategories: ['alpha_rewrite', 'metric_swap', 'stopping_violation'],
    nonCriticalHandling: 'tolerate',
    requireExplicitLog: true,
  },
  freeze: {
    fecHash: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    actor: { actorKind: 'deterministic_freezer', actorId: 'freezer-ci-001' },
    timestamp: '2024-01-01T00:00:00Z',
    environmentPolicy: 'locked-no-network',
    deviationPolicyHash: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    frozenBy: 'deterministic_freezer',
  },
  // AT-JUDGE-OVERRIDE 通过条件：integrityFlags 不含 'llm'/'judge'（base 空）。
  integrityFlags: [],
};

// ===== frozen hash（base 从 BASE_FEC 精确计算 → base hash 自洽 → 误报率=0）=====

const BASE_THRESHOLD_HASH = hashCanonicalJson({
  threshold: BASE_FEC.threshold,
  direction: BASE_FEC.direction,
  thresholdSemantics: BASE_FEC.threshold.thresholdSemantics,
});
const BASE_METRIC_HASH = hashCanonicalJson({ metric: BASE_FEC.metric });
const BASE_SEED_POLICY_HASH = hashCanonicalJson({ seedPolicy: BASE_FEC.seedPolicy });

// 64-hex 占位（valid hex·Merkle/hash 比对不触发格式校验，contentHash 非 Merkle 叶故不校验 hex）。
const HASH_CONTENT = 'a1'.repeat(32); // dataset contentHash (frozen base 值)
const HASH_SCHEMA = 'b2'.repeat(32); // dataset schemaHash
const HASH_STATS = 'c3'.repeat(32); // dataset statsFingerprint（非空 → base AT-DATA-DRIFT stats 子路径须匹配）
const HASH_WF = 'd4'.repeat(32); // workflow workflowHash
const HASH_CONTAINER = 'e5'.repeat(32); // workflow containerDigest
const HASH_ENV = 'f6'.repeat(32); // workflow environmentHash

// ===== BASE_INPUT（干净 AntiTheaterLintInput·过全部 21 detector·GV-D2）=====

const BASE_BINDINGS: readonly EvidenceBinding[] = [
  // AT-DATA-DRIFT/AT-DATA-HASH-FAKE 通过条件：contentHash/schemaHash/statsFingerprint === freeze 记录；
  // chunkHashes undefined → AT-DATA-HASH-FAKE 跳过（R6 MVP 不臆造）。
  {
    kind: 'dataset',
    datasetId: 'DS-NEG-CONTROL',
    contentHash: HASH_CONTENT,
    schemaHash: HASH_SCHEMA,
    statsFingerprint: HASH_STATS,
  },
  // AT-WORKFLOW-DIGEST 通过条件：workflowHash/containerDigest/environmentHash === freeze 记录。
  {
    kind: 'workflow',
    workflowId: 'WF-BLS',
    workflowHash: HASH_WF,
    containerDigest: HASH_CONTAINER,
    environmentHash: HASH_ENV,
  },
];

const BASE_INPUT: AntiTheaterLintInput = {
  fec: BASE_FEC,
  bindings: BASE_BINDINGS,
  executionTrace: {
    // AT-LABEL-ONLY 通过条件：≥1 primary 且 rawArtifactHashes 非空。
    // AT-MISSING-RAW 通过条件：所有 measurement rawArtifactHashes 非空。
    // AT-OVERFIT 通过条件：含 'hidden' split（'hidden' ∈ splits → 非 public-only）。
    // AT-FAKE-PASS 通过条件：primary.requirementId resolve requiredEvidence[0].evidenceId。
    measurements: [
      {
        requirementId: 'EV-PRIMARY-RESULT',
        role: 'primary',
        rawArtifactHashes: ['sha256:primary-raw-artifact-001'],
        runId: 'run-001',
        splitName: 'hidden',
        metricKey: 'bls_power',
        metricValue: 0.87,
      },
      {
        role: 'control',
        rawArtifactHashes: ['sha256:control-raw-artifact-001'],
        runId: 'run-002',
        splitName: 'hidden',
        metricKey: 'bls_power',
        metricValue: 0.12,
      },
    ],
    // AT-HARK 通过条件：hypothesisSealedAt <= max(endedAt)。
    // AT-STOPPING-RULE 通过条件：无 interim look（isInterim 全 false → interimLooks=0）。
    runs: [
      { runId: 'run-001', endedAt: '2024-06-01T00:00:00Z', isInterim: false, earlyStopped: false, seed: 1 },
      { runId: 'run-002', endedAt: '2024-06-02T00:00:00Z', isInterim: false, earlyStopped: false, seed: 7 },
      { runId: 'run-003', endedAt: '2024-06-03T00:00:00Z', isInterim: false, earlyStopped: false, seed: 99 },
    ],
  },
  verdict: {
    verdict: 'CONFIRMED',
    reasonCodes: ['R7_PRIMARY_TEST_CONFIRMS'],
    ruleTrace: [{ ruleId: 'R7_PRIMARY_TEST_CONFIRMS', triggered: true }],
    decisiveRuleId: 'R7_PRIMARY_TEST_CONFIRMS',
    // AT-SCOPE-LAUNDER 通过条件：coverage='full'。
    // AT-FAKE-DEGRADED 通过条件：verdict!=='DEGRADED_SCOPE'（base=CONFIRMED）。
    scopeReport: {
      isDegraded: false,
      coverage: 'full',
      impactedScopeEdges: [],
      scopeSlipText: null,
      hasSameScopeRefutation: false,
    },
    statisticalReport: {
      refutes: false,
      supports: true,
      conflicting: false,
      underpowered: false,
      effectiveDirection: 'supports',
      primaryAdjustedPValue: 0.005,
      primaryEffectSize: 0.15,
      // as const 依据：VerdictKernelOutput.statisticalReport.primaryConfidenceInterval 类型为
      // readonly [number, number] | null（二元组）；数组字面量 [0.06, 0.24] 在 satisfies 上下文下
      // 被 TS 推断为 number[] 而非元组，须 const 断言成 readonly [0.06, 0.24]（元组子类型·兼容）。
      primaryConfidenceInterval: [0.06, 0.24] as const,
      hasWarnAssumption: false,
      formMismatch: false,
    },
    evidenceSufficiency: { status: 'sufficient', powerStatus: 'adequate' },
    untestedReason: null,
    integrityFlags: [],
    boundedSupport: true,
  } satisfies VerdictKernelOutput,
  envelopeDraft: {
    envelopeId: 'ENV-GV-0001',
    // AT-REPORT-MISMATCH 通过条件：humanSummary 不含任何强度词/overclaim 词（中性文案）。
    humanSummary: 'Result summary: see structured verdict and proof artifacts for the bounded-support conclusion.',
    nullResults: [],
  },
  preregistrationRecord: {
    // AT-POSTHOC-THRESHOLD/AT-METRIC-SWAP/AT-SEED-CHERRY(SEED_POLICY_MISMATCH) 通过条件：hash === base 计算。
    thresholdHash: BASE_THRESHOLD_HASH,
    primaryMetricHash: BASE_METRIC_HASH,
    // AT-PHACK-ALPHA 通过条件：prereg alpha === fec alpha（精确）。
    alpha: BASE_FEC.statisticalPlan.alpha,
    seedPolicyHash: BASE_SEED_POLICY_HASH,
    // AT-HARK 通过条件：hypothesisSealedAt 早于 max(runs.endedAt)=2024-06-03。
    hypothesisSealedAt: '2024-01-01T00:00:00Z',
    // AT-DEP-FLOAT-DRIFT 通过条件：toleranceFrozen=true。
    toleranceFrozen: true,
    // AT-DATA-DRIFT frozen 端：与 dataset binding 逐字段匹配。
    datasetFreezeRecords: [
      {
        datasetId: 'DS-NEG-CONTROL',
        contentHash: HASH_CONTENT,
        schemaHash: HASH_SCHEMA,
        statsFingerprint: HASH_STATS,
      },
    ],
    // AT-WORKFLOW-DIGEST frozen 端：与 workflow binding 逐字段匹配。
    workflowFreezeRecords: [
      {
        workflowId: 'WF-BLS',
        workflowHash: HASH_WF,
        containerDigest: HASH_CONTAINER,
        environmentHash: HASH_ENV,
      },
    ],
    // AT-SEED-CHERRY(HIDDEN_FAILED_RUN) 通过条件：declaredSeeds ⊆ runRegistry.runs[*].seed。
    declaredSeeds: [1, 7, 99],
  },
  runRegistry: {
    runs: [
      { runId: 'run-001', seed: 1 },
      { runId: 'run-002', seed: 7 },
      { runId: 'run-003', seed: 99 },
    ],
    // AT-FAKE-DEGRADED(NULL_RESULT_LAUNDERED) 通过条件：declaredNullResults 空（base 无 null result）。
    declaredNullResults: [],
  },
};

/** 干净 base envelope（过全部 21 detector·误报率=0 基准·每次返回同一只读 const，向量须 cloneMutable 后再 mutate）。 */
export function makeCleanBaseInput(): AntiTheaterLintInput {
  return BASE_INPUT;
}

// ===== 20 golden vector 构建器（每个 clone base → 最小 mutation → 返回被攻击 input）=====
// 约定：每个构建器首行 `const input = cloneMutable(makeCleanBaseInput());` 后做最小字段 mutation。
// frozen 端（prereg hash/alpha/declaredSeeds）保持 base 不变，只改执行端（FEC/bindings/runs/verdict）→ 自然失配。

/** gv-fake-pass-01：清空 primary measurement 的 requirementId → requiredEvidence 无法 resolve → 伪造 PASS。 */
function gvFakePass01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  const primary = input.executionTrace.measurements[0];
  // measurements[0] 即 primary（base 顺序保证·noUncheckedIndexedAccess 防御性判空）。
  if (primary !== undefined) {
    delete primary.requirementId;
  }
  return input;
}

/** gv-label-only-01：清空 primary measurement 的 rawArtifactHashes → primary 退化为标签（co-fire AT-MISSING-RAW）。 */
function gvLabelOnly01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  const primary = input.executionTrace.measurements[0];
  if (primary !== undefined) {
    primary.rawArtifactHashes = [];
  }
  return input;
}

/** gv-judge-override-01：verdict.integrityFlags 注入 'llm_produced_summary' → LLM 进裁决路径。 */
function gvJudgeOverride01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  input.verdict.integrityFlags = ['llm_produced_summary'];
  return input;
}

/** gv-posthoc-threshold-01：FEC threshold.value 0.8→0.95 → frozen thresholdHash 失配。 */
function gvPosthocThreshold01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  input.fec.threshold = { ...input.fec.threshold, value: 0.95 };
  return input;
}

/** gv-metric-swap-01：FEC metric bls_power→lomb_scargle → frozen primaryMetricHash 失配。 */
function gvMetricSwap01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  input.fec.metric = {
    ...input.fec.metric,
    metricKey: 'lomb_scargle_power',
    description: 'Lomb-Scargle periodogram peak power (swapped post-hoc)',
  };
  return input;
}

/** gv-data-drift-01：dataset binding contentHash 漂移 → DATASET_HASH_MISMATCH。 */
function gvDataDrift01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  const ds = input.bindings[0];
  // bindings[0] 即 dataset（base 顺序保证）。
  if (ds !== undefined && ds.kind === 'dataset') {
    ds.contentHash = '99'.repeat(32);
  }
  return input;
}

/** gv-data-drift-02：dataset binding schemaHash 漂移（schema column rename）→ DATASET_SCHEMA_MISMATCH。 */
function gvDataDrift02(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  const ds = input.bindings[0];
  if (ds !== undefined && ds.kind === 'dataset') {
    ds.schemaHash = '88'.repeat(32);
  }
  return input;
}

/** gv-scope-launder-01：scopeReport.coverage full→partial（hasSameScopeRefutation=false）→ SCOPE_LAUNDERED。 */
function gvScopeLaunder01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  input.verdict.scopeReport = { ...input.verdict.scopeReport, coverage: 'partial' };
  return input;
}

/** gv-missing-raw-01：清空 control measurement（run-002）的 rawArtifactHashes → RAW_ARTIFACT_MISSING（仅 control，primary 仍全）。 */
function gvMissingRaw01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  const control = input.executionTrace.measurements[1];
  if (control !== undefined) {
    control.rawArtifactHashes = [];
  }
  return input;
}

/** gv-seed-cherry-01：runRegistry 移除 seed=7,99 的 run → declaredSeeds 缺失 → HIDDEN_FAILED_RUN。 */
function gvSeedCherry01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  // 仅保留 seed=1 的 run（隐去 7,99 的不利 run）。
  input.runRegistry.runs = input.runRegistry.runs.filter((r) => r.seed === 1);
  return input;
}

/** gv-workflow-digest-01：workflow binding containerDigest 漂移 → CONTAINER_DIGEST_MISMATCH（BLOCK）。 */
function gvWorkflowDigest01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  const wf = input.bindings[1];
  // bindings[1] 即 workflow（base 顺序保证）。
  if (wf !== undefined && wf.kind === 'workflow') {
    wf.containerDigest = '77'.repeat(32);
  }
  return input;
}

/** gv-report-mismatch-01：verdict=UNTESTED 但 humanSummary 写 'confirms' → REPORT_VERDICT_MISMATCH（structured wins）。 */
function gvReportMismatch01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  input.verdict = { ...input.verdict, verdict: 'UNTESTED' };
  input.envelopeDraft = {
    ...input.envelopeDraft,
    humanSummary: 'This experiment confirms the hypothesis with strong evidence.',
  };
  return input;
}

/** gv-phack-alpha-01：FEC alpha 0.0125→0.05（prereg alpha 不变）→ ALPHA_INFLATION_DEVIATION。 */
function gvPhackAlpha01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  input.fec.statisticalPlan = { ...input.fec.statisticalPlan, alpha: 0.05 };
  return input;
}

/** gv-phack-correction-01：添加 multipleTestingPlan{familySize:3} + correction 仍 'none' → MULTIPLE_TESTING_UNCORRECTED。 */
function gvPhackCorrection01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  input.fec.multipleTestingPlan = {
    correction: 'bonferroni',
    familySize: 3,
    adjustedAlpha: 0.0125 / 3,
    preregistered: false, // 声明未预注册校正 → 与 correction='none' 共同触发
  };
  // statisticalPlan.multipleTestingCorrection 保持 base 'none'（attack：3 endpoints 却不校正）。
  return input;
}

/** gv-phack-pcurve-01：primaryAdjustedPValue=0.045 + familySize=5 → P_CURVE_CALIPER_SUSPICIOUS (WARN)。 */
function gvPhackPcurve01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  // Set primaryAdjustedPValue in the p-hacking danger zone [0.04, 0.05)
  input.verdict = {
    ...input.verdict,
    statisticalReport: {
      ...input.verdict.statisticalReport,
      primaryAdjustedPValue: 0.045,
    },
  };
  // Set familySize >= 3 so the detector's minimum threshold is met
  input.fec.multipleTestingPlan = {
    correction: 'bonferroni',
    familySize: 5,
    adjustedAlpha: 0.01,
    preregistered: true,
  };
  return input;
}

/** gv-hark-01：hypothesisSealedAt 改晚于 max(runs.endedAt) → HARKING_REVISION_AFTER_RESULT。 */
function gvHark01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  input.preregistrationRecord.hypothesisSealedAt = '2024-12-01T00:00:00Z';
  return input;
}

/** gv-stopping-rule-01：stoppingRule='fixed_n' + 3 runs 改 isInterim=true → fixed_n 不允许多次 interim look。 */
function gvStoppingRule01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  input.fec.statisticalPlan = {
    ...input.fec.statisticalPlan,
    stoppingRule: 'fixed_n single terminal analysis',
  };
  for (const run of input.executionTrace.runs) {
    run.isInterim = true;
  }
  return input;
}

/** gv-fake-degraded-01：verdict=DEGRADED_SCOPE + 同 scope 反证存在 → REFUTATION_HIDDEN_BY_SCOPE（强制 REFUTED）。 */
function gvFakeDegraded01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  input.verdict = {
    ...input.verdict,
    verdict: 'DEGRADED_SCOPE',
    scopeReport: {
      ...input.verdict.scopeReport,
      coverage: 'full', // coverage='full' → AT-SCOPE-LAUNDER 不触发，仅 AT-FAKE-DEGRADED 触发
      hasSameScopeRefutation: true,
    },
  };
  return input;
}

/** gv-data-hash-fake-01：dataset binding 添加 chunkHashes（Merkle root ≠ contentHash）→ DATASET_HASH_FORGERY（BLOCK）。 */
function gvDataHashFake01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  const ds = input.bindings[0];
  if (ds !== undefined && ds.kind === 'dataset') {
    // 两枚合法 64-hex 叶（computeMerkleRoot 不抛错）；其 Merkle root ≠ 冻结 contentHash（HASH_CONTENT）→ 伪造。
    ds.chunkHashes = [
      '11'.repeat(32),
      '22'.repeat(32),
    ];
  }
  return input;
}

/** gv-optional-stopping-01：stoppingRule='group_sequential' 但无 spending 关键词 → OPTIONAL_STOPPING_NO_SPENDING。 */
function gvOptionalStopping01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  input.fec.statisticalPlan = {
    ...input.fec.statisticalPlan,
    stoppingRule: 'group_sequential boundary design without named spending',
  };
  return input;
}

/** gv-dep-drift-01：prereg.toleranceFrozen=true→false → NUMERIC_TOLERANCE_UNFROZEN（FAIL·非 BLOCK）。 */
function gvDepDrift01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  input.preregistrationRecord = { ...input.preregistrationRecord, toleranceFrozen: false };
  return input;
}

/**
 * gv-provenance-unbound-01（T-003·2026-07-24 评委逼问第 1 轮 F-2-005 修复）。
 *
 * 攻击语义：研究者 FEC 显式 opt-in `requireExecutionProvenance=true`（声明 metricValue 必须绑定 sandbox
 * 执行 hash），但提交的 primary measurement 不携带 executionProvenanceHash → metricValue 可能是手工
 * 注入的 fixture 冒充真实计算结果（rawArtifactHashes 仅证明产物存在，不证明产物是本次执行产出的）。
 *
 * base primary measurement 本就不设 executionProvenanceHash（V1 缺省不强制），故本向量仅需 opt-in
 * `requireExecutionProvenance=true` 即可触发 AT-PROVENANCE-UNBOUND detector。这构成本攻击的「最小单点
 * mutation」：clean base（不 opt-in → detector 恒空）↔ attack（opt-in 但 primary 未绑定）→ 命中。
 *
 * 与 gv-label-only-01 / gv-missing--01 同语义家族（证据可信度失败 → forced UNTESTED），
 * 期望 forcedVerdict='UNTESTED' / blockSeal=false（已由 constraint.ts SEVERITY_TO_FORCED 映射 + 临时探针实测回填）。
 */
function gvProvenanceUnbound01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  // 研究者声明「primary metricValue 必须绑定 sandbox 执行 hash」（V2 计划·真实研究路径强制）。
  input.fec.requireExecutionProvenance = true;
  // base primary measurement 无 executionProvenanceHash → AT-PROVENANCE-UNBOUND 命中（metricValue 可能是 fixture）。
  return input;
}

// ===== GoldenVectorSpec 表（corpus/false_green_rate 等 gate 消费）=====

/** 强制 verdict 类型（undefined = anti-theater 不约束 verdict，如 AT-REPORT-MISMATCH structured wins）。 */
export type ExpectedForcedVerdict = 'REFUTED' | 'DEGRADED_SCOPE' | 'UNTESTED' | 'INCONCLUSIVE' | undefined;

/** 单个 golden vector 规格（corpus test 逐条断言 attackId/reasonCode/forcedVerdict/blockSeal）。 */
export interface GoldenVectorSpec {
  /** 向量 id（与 APPENDIX_E §5.2 命名一致）。 */
  readonly id: string;
  /** APPENDIX_E §2 attackId（AT-* 前缀）。 */
  readonly attackId: string;
  /** 期望命中的 reasonCode（进入 verdictConstraint.reasonCodes 并集）。 */
  readonly reasonCode: string;
  /** 构建被攻击 input（clone base → mutation）。 */
  readonly build: () => AntiTheaterLintInput;
  /** 期望 forcedVerdict（支持度降级·D17/D16·undefined=不约束）。 */
  readonly expectedForcedVerdict: ExpectedForcedVerdict;
  /** 期望 blockSeal（BLOCK 类 attack=true）。 */
  readonly expectedBlockSeal: boolean;
}

/**
 * GOLDEN_VECTORS：22 向量 = 17 P0（APPENDIX_E §5.2）+ 3 补充（gv-data-hash-fake-01 /
 * gv-optional-stopping-01 / gv-dep-drift-01）+ 1 T-003 修复（gv-provenance-unbound-01）。
 *
 * §5.2 的 17 P0 向量覆盖 16 个 attackId（AT-DATA-DRIFT 由 gv-data-drift-01/02 双向量覆盖），
 * 缺 AT-DATA-HASH-FAKE / AT-OPTIONAL-STOPPING / AT-DEP-FLOAT-DRIFT 3 个 attackId → 补 3 向量。
 * T-003 修复（2026-07-24）新增第 21 个 attackId AT-PROVENANCE-UNBOUND → 补 gv-provenance-unbound-01。
 * 连同 GV_OVERFIT_01（AT-OVERFIT·ROADMAP 受限）共 ALL_GOLDEN_VECTORS 22 向量，覆盖全部 22 attackId。
 */
export const GOLDEN_VECTORS: readonly GoldenVectorSpec[] = [
  // —— §5.2 17 P0 golden vectors ——
  { id: 'gv-fake-pass-01', attackId: 'AT-FAKE-PASS', reasonCode: 'REQUIRED_EVIDENCE_MISSING', build: gvFakePass01, expectedForcedVerdict: 'UNTESTED', expectedBlockSeal: true },
  { id: 'gv-label-only-01', attackId: 'AT-LABEL-ONLY', reasonCode: 'LABEL_ONLY_EVIDENCE', build: gvLabelOnly01, expectedForcedVerdict: 'UNTESTED', expectedBlockSeal: false },
  { id: 'gv-judge-override-01', attackId: 'AT-JUDGE-OVERRIDE', reasonCode: 'LLM_AS_FINAL_JUDGE', build: gvJudgeOverride01, expectedForcedVerdict: 'UNTESTED', expectedBlockSeal: true },
  { id: 'gv-posthoc-threshold-01', attackId: 'AT-POSTHOC-THRESHOLD', reasonCode: 'POSTHOC_THRESHOLD_DEVIATION', build: gvPosthocThreshold01, expectedForcedVerdict: 'UNTESTED', expectedBlockSeal: false },
  { id: 'gv-metric-swap-01', attackId: 'AT-METRIC-SWAP', reasonCode: 'PRIMARY_METRIC_SWAPPED', build: gvMetricSwap01, expectedForcedVerdict: 'UNTESTED', expectedBlockSeal: false },
  { id: 'gv-data-drift-01', attackId: 'AT-DATA-DRIFT', reasonCode: 'DATASET_HASH_MISMATCH', build: gvDataDrift01, expectedForcedVerdict: 'DEGRADED_SCOPE', expectedBlockSeal: false },
  { id: 'gv-data-drift-02', attackId: 'AT-DATA-DRIFT', reasonCode: 'DATASET_SCHEMA_MISMATCH', build: gvDataDrift02, expectedForcedVerdict: 'DEGRADED_SCOPE', expectedBlockSeal: false },
  { id: 'gv-scope-launder-01', attackId: 'AT-SCOPE-LAUNDER', reasonCode: 'SCOPE_LAUNDERED', build: gvScopeLaunder01, expectedForcedVerdict: 'DEGRADED_SCOPE', expectedBlockSeal: false },
  { id: 'gv-missing-raw-01', attackId: 'AT-MISSING-RAW', reasonCode: 'RAW_ARTIFACT_MISSING', build: gvMissingRaw01, expectedForcedVerdict: 'UNTESTED', expectedBlockSeal: false },
  { id: 'gv-seed-cherry-01', attackId: 'AT-SEED-CHERRY', reasonCode: 'HIDDEN_FAILED_RUN', build: gvSeedCherry01, expectedForcedVerdict: 'INCONCLUSIVE', expectedBlockSeal: false },
  { id: 'gv-workflow-digest-01', attackId: 'AT-WORKFLOW-DIGEST', reasonCode: 'CONTAINER_DIGEST_MISMATCH', build: gvWorkflowDigest01, expectedForcedVerdict: 'UNTESTED', expectedBlockSeal: true },
  { id: 'gv-report-mismatch-01', attackId: 'AT-REPORT-MISMATCH', reasonCode: 'REPORT_VERDICT_MISMATCH', build: gvReportMismatch01, expectedForcedVerdict: undefined, expectedBlockSeal: false },
  { id: 'gv-phack-alpha-01', attackId: 'AT-PHACK-ALPHA', reasonCode: 'ALPHA_INFLATION_DEVIATION', build: gvPhackAlpha01, expectedForcedVerdict: 'UNTESTED', expectedBlockSeal: false },
  { id: 'gv-phack-correction-01', attackId: 'AT-PHACK-CORRECTION', reasonCode: 'MULTIPLE_TESTING_UNCORRECTED', build: gvPhackCorrection01, expectedForcedVerdict: 'INCONCLUSIVE', expectedBlockSeal: false },
  { id: 'gv-hark-01', attackId: 'AT-HARK', reasonCode: 'HARKING_REVISION_AFTER_RESULT', build: gvHark01, expectedForcedVerdict: 'UNTESTED', expectedBlockSeal: false },
  { id: 'gv-stopping-rule-01', attackId: 'AT-STOPPING-RULE', reasonCode: 'STOPPING_RULE_VIOLATION', build: gvStoppingRule01, expectedForcedVerdict: 'UNTESTED', expectedBlockSeal: false },
  { id: 'gv-fake-degraded-01', attackId: 'AT-FAKE-DEGRADED', reasonCode: 'REFUTATION_HIDDEN_BY_SCOPE', build: gvFakeDegraded01, expectedForcedVerdict: 'REFUTED', expectedBlockSeal: false },
  // —— 4 补充向量（补齐 attackId 全覆盖：§5.2 17 P0 覆盖 16 attackId·AT-DATA-DRIFT 双向量 + T-003 1 个）——
  { id: 'gv-data-hash-fake-01', attackId: 'AT-DATA-HASH-FAKE', reasonCode: 'DATASET_HASH_FORGERY', build: gvDataHashFake01, expectedForcedVerdict: 'UNTESTED', expectedBlockSeal: true },
  { id: 'gv-optional-stopping-01', attackId: 'AT-OPTIONAL-STOPPING', reasonCode: 'OPTIONAL_STOPPING_NO_SPENDING', build: gvOptionalStopping01, expectedForcedVerdict: 'INCONCLUSIVE', expectedBlockSeal: false },
  { id: 'gv-dep-drift-01', attackId: 'AT-DEP-FLOAT-DRIFT', reasonCode: 'NUMERIC_TOLERANCE_UNFROZEN', build: gvDepDrift01, expectedForcedVerdict: undefined, expectedBlockSeal: false },
  // —— gv-provenance-unbound-01（T-003 修复·2026-07-24·补齐第 21 个 attackId）——
  { id: 'gv-provenance-unbound-01', attackId: 'AT-PROVENANCE-UNBOUND', reasonCode: 'EVIDENCE_PROVENANCE_UNBOUND', build: gvProvenanceUnbound01, expectedForcedVerdict: 'UNTESTED', expectedBlockSeal: false },
  // —— gv-phack-pcurve-01（2026-08-06·补齐第 22 个 attackId·p-curve distributional detection）——
  { id: 'gv-phack-pcurve-01', attackId: 'AT-PHACK-PCURVE', reasonCode: 'P_CURVE_CALIPER_SUSPICIOUS', build: gvPhackPcurve01, expectedForcedVerdict: 'INCONCLUSIVE', expectedBlockSeal: false },
  // —— gv-overfit-01：AT-OVERFIT（ROADMAP·D8 受限实现：public-only WARN → DEGRADED_SCOPE）——
  // 注：build 内联（需改 measurement splitName 集合），见下方 GV_OVERFIT_01_BUILD。
];

/** gv-overfit-01：measurements 全改 splitName='public'（移除 hidden）→ public-only → PUBLIC_ONLY_OVERFIT（WARN）。 */
function gvOverfit01(): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  for (const m of input.executionTrace.measurements) {
    m.splitName = 'public';
  }
  return input;
}

// gv-overfit-01 单独追加（WARN 类·非 BLOCK·forced DEGRADED_SCOPE·§9 ROADMAP 受限）。
export const GV_OVERFIT_01: GoldenVectorSpec = {
  id: 'gv-overfit-01',
  attackId: 'AT-OVERFIT',
  reasonCode: 'PUBLIC_ONLY_OVERFIT',
  build: gvOverfit01,
  expectedForcedVerdict: 'DEGRADED_SCOPE',
  expectedBlockSeal: false,
};

/** 全量 golden vectors（GOLDEN_VECTORS 22 + GV_OVERFIT_01 = 23 向量·覆盖全部 22 attackId）。 */
export const ALL_GOLDEN_VECTORS: readonly GoldenVectorSpec[] = [...GOLDEN_VECTORS, GV_OVERFIT_01];

/**
 * 按 id 取单个 golden vector（gate 4/5 精确定位用·避免 `find` 返回 undefined 的类型窄化问题）。
 * @throws {Error} id 不存在于 ALL_GOLDEN_VECTORS。
 */
export function getGoldenVector(id: string): GoldenVectorSpec {
  for (const gv of ALL_GOLDEN_VECTORS) {
    if (gv.id === id) {
      return gv;
    }
  }
  throw new Error(`getGoldenVector: unknown golden vector id '${id}'`);
}
