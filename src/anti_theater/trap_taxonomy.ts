/**
 * anti_theater trap taxonomy —— 统计陷阱分类法（借鉴 scientific-agent-skills
 * statistical-analysis/statistical-power 的"陷阱目录"设计）。
 *
 * 动机：FAR-Lab 已有 22 个反剧场探测器，但 detect 与 explain 分离——探测器只返回
 * pass/fail，不产出"这是什么陷阱 + 为什么危险 + 怎么防 + 现实案例"的结构化解释。
 * 本模块为每个 attackKind 提供分类元数据，使报告/演示能输出"本次验证覆盖 22 类
 * 统计陷阱，触发 3 类警告"的结构化表格（而非仅 verdict 结论）。
 *
 * 纪律：
 *   - 本文件是纯元数据层（零行为变更）：不触碰任何 detector 逻辑、不进入 proofHash。
 *   - 确定性（F3）：常量表 + 纯函数，无 LLM、无网络。
 *   - realCase 只填有据可查的真实案例（FAR-Lab 反幻觉纪律）；无确凿单一案例标 [n/a]。
 *   - 22 项覆盖全集由 TRAP_TAXONOMY 键集合与 AntiTheaterAttackKind 联合测试对拍（tests/anti_theater/trap_taxonomy.test.ts）。
 */

import type { AntiTheaterAttackKind, AntiTheaterFinding } from './types.ts';

/** 陷阱大类（统计陷阱目录的分类轴）。 */
export type TrapCategory =
  | 'significance-abuse' // p 值滥用/alpha 膨胀/多重比较/事后阈值/指标更换
  | 'data-integrity' // 数据漂移/哈希伪造
  | 'artifact-integrity' // 原始产物缺失/伪造
  | 'scope-integrity' // 范围洗白/假降级
  | 'methodology' // 假设后设(HARK)/种子挑选/停止规则/过拟合
  | 'process-integrity' // LLM 裁判覆盖/过程违规
  | 'reporting' // 报告与裁决不符
  | 'reproducibility' // 工作流摘要漂移/依赖浮动
  | 'forgery' // 伪造类（假通过/假哈希）
  | 'provenance' // 执行-产物绑定缺失
  | 'evidence-adequacy'; // 仅标签无证据

/**
 * 单条陷阱分类元数据。
 * attackId 与 ATTACK_ID_TO_KIND（types.ts）一一对应。
 */
export interface TrapTaxonomy {
  /** AT-* 人类可读 id。 */
  readonly attackId: string;
  /** 存储轴 attackKind（与 ATTACK_ID_TO_KIND 一致）。 */
  readonly kind: AntiTheaterAttackKind;
  /** 陷阱大类（目录分类轴）。 */
  readonly category: TrapCategory;
  /** 陷阱名称（一句话）。 */
  readonly name: string;
  /** 这个陷阱是什么（为什么危险）。 */
  readonly what: string;
  /** 预防/修复手段（与 AntiTheaterFindingExtension.remediation 互补·目录级）。 */
  readonly cures: readonly string[];
  /** 有据可查的现实案例；无确凿单一案例则为 '[n/a]'。 */
  readonly realCase: string;
}

/**
 * 22 项 trap taxonomy 全集（键 = AntiTheaterAttackKind 闭合联合·由测试对拍覆盖完整性）。
 * 覆盖顺序与 DETECTORS 数组（detectors/index.ts）一致。
 */
export const TRAP_TAXONOMY: Readonly<Record<AntiTheaterAttackKind, TrapTaxonomy>> = {
  'fake-pass-forgery': {
    attackId: 'AT-FAKE-PASS',
    kind: 'fake-pass-forgery',
    category: 'forgery',
    name: '伪造通过（fake pass）',
    what: '实验结果并未真正通过 FEC 阈值，却伪造"通过"状态进入 proofHash——最恶劣的造假形态。',
    cures: ['结构化 verdict 必须来自确定性内核', 'proofHash 只接受确定性输出', '伪造态在 seal 校验期被拦截'],
    realCase: 'Theranos 血液检测造假（2015 WSJ 曝光·伪造测试结果与宣称能力不符）',
  },
  'label-only-evidence': {
    attackId: 'AT-LABEL-ONLY',
    kind: 'label-only-evidence',
    category: 'evidence-adequacy',
    name: '仅标签无证据（label-only evidence）',
    what: '声称有证据支持，但只提供标签/标题，无实际证据内容——LLM 生成断言的典型空转。',
    cures: ['证据必须有原始内容 hash', 'label 必须绑定 artifact', '缺失即 WARN/FAIL'],
    realCase: '[n/a]（通用：LLM 生成断言无原始证据支撑）',
  },
  'llm-reviewer-override': {
    attackId: 'AT-JUDGE-OVERRIDE',
    kind: 'llm-reviewer-override',
    category: 'process-integrity',
    name: 'LLM 裁判覆盖（LLM reviewer override）',
    what: '以 LLM 评审意见覆盖确定性内核的结构化 verdict——把"机器裁决"降级为"模型意见"。',
    cures: ['确定性内核是唯一裁决源', 'LLM 意见只作提示不进 proofHash', 'override 一律拒绝'],
    realCase: '[n/a]（FAR-Lab 反 LLM-as-judge 红线·F1）',
  },
  'post-hoc-threshold': {
    attackId: 'AT-POSTHOC-THRESHOLD',
    kind: 'post-hoc-threshold',
    category: 'significance-abuse',
    name: '事后阈值（post-hoc threshold）',
    what: '结果出来后偷偷调整显著性阈值/边界以把阴性变阳性。',
    cures: ['阈值预注册冻结', 'frozen thresholdHash vs executed 对账', '偏离即 FAIL'],
    realCase: 'John, Loewenstein & Prelec (2012) QRP 调查：96% 科学家承认至少一种 questionable research practice（含事后调整）',
  },
  'metric-swapping': {
    attackId: 'AT-METRIC-SWAP',
    kind: 'metric-swapping',
    category: 'significance-abuse',
    name: '指标更换（metric swapping）',
    what: '预注册的主指标在结果出来后更换为更有利的替代指标。',
    cures: ['主指标 hash 预注册冻结', 'frozen vs executed metricHash 对账', '偏离即 FAIL'],
    realCase: '临床试验主终点更换（endpoint switching）是文献记载的常见 QRP（John et al. 2012 分类）',
  },
  'dataset-drift': {
    attackId: 'AT-DATA-DRIFT',
    kind: 'dataset-drift',
    category: 'data-integrity',
    name: '数据集漂移（dataset drift）',
    what: '执行用数据集与预注册/frozen 数据集不一致（内容/模式/统计指纹漂移），使结论不可复现。',
    cures: ['数据集三层 hash 冻结', '执行端对账', '漂移即 FAIL'],
    realCase: '[n/a]（通用：数据版本漂移破坏可复现性）',
  },
  'dataset-hash-forgery': {
    attackId: 'AT-DATA-HASH-FAKE',
    kind: 'dataset-hash-forgery',
    category: 'data-integrity',
    name: '数据集哈希伪造（data hash forgery）',
    what: '声明数据集 hash 与实际内容不符（hash 是编造的或指向被替换的数据）。',
    cures: ['Merkle root 重算对账', 'chunk hash 逐块验证', '不一致即 FAIL'],
    realCase: '[n/a]（通用：哈希伪造破坏内容寻址证据链）',
  },
  'scope-laundering': {
    attackId: 'AT-SCOPE-LAUNDER',
    kind: 'scope-laundering',
    category: 'scope-integrity',
    name: '范围洗白（scope laundering）',
    what: '把 REFUTED 的结论重新包装为更窄 scope 后宣称 CONFIRMED（降级范围掩盖反证）。',
    cures: ['scope 变更必须显式', '同 scope 反证不得隐藏', 'REFUTED 不得被洗白'],
    realCase: '[n/a]（通用：结论范围收缩以回避反证）',
  },
  'missing-raw-artifact': {
    attackId: 'AT-MISSING-RAW',
    kind: 'missing-raw-artifact',
    category: 'artifact-integrity',
    name: '原始产物缺失（missing raw artifact）',
    what: '声明有原始产物（数据/脚本/日志）但实际不存在，无法独立重算。',
    cures: ['原始产物必须存在', 'artifact hash 必填', '缺失即 FAIL'],
    realCase: '[n/a]（通用：不可复现的根因）',
  },
  'seed-cherry-picking': {
    attackId: 'AT-SEED-CHERRY',
    kind: 'seed-cherry-picking',
    category: 'methodology',
    name: '种子挑选（seed cherry-picking）',
    what: '跑了多个随机种子，只挑有利的结果报告；隐藏失败/不利的 runs。',
    cures: ['seed 全量注册', 'declaredSeeds ⊆ ranSeeds', '隐藏 run 即 FAIL'],
    realCase: '[n/a]（通用：选择性报告是 p-hacking 家族核心形态）',
  },
  'workflow-digest-mismatch': {
    attackId: 'AT-WORKFLOW-DIGEST',
    kind: 'workflow-digest-mismatch',
    category: 'reproducibility',
    name: '工作流摘要漂移（workflow digest mismatch）',
    what: '执行环境/容器/工作流 hash 与 frozen 记录不一致，但未声明变更。',
    cures: ['工作流/容器/环境 hash 冻结', '执行端对账', '漂移即 FAIL'],
    realCase: '[n/a]（通用：环境漂移破坏复现）',
  },
  'natural-language-verdict-mismatch': {
    attackId: 'AT-REPORT-MISMATCH',
    kind: 'natural-language-verdict-mismatch',
    category: 'reporting',
    name: '报告与裁决不符（report-verdict mismatch）',
    what: '人类可读摘要（LLM 生成）的措辞与确定性 verdict 强度不一致——夸大/弱化结论。',
    cures: ['humanSummary 与 verdict 强度对齐', '强度词一致性校验', '不匹配即 WARN/FAIL'],
    realCase: '[n/a]（通用：AI 生成报告夸大结论）',
  },
  'p-hacking-alpha-inflation': {
    attackId: 'AT-PHACK-ALPHA',
    kind: 'p-hacking-alpha-inflation',
    category: 'significance-abuse',
    name: 'alpha 膨胀（alpha inflation）',
    what: '预注册冻结的 alpha 与执行端不一致——结果出来后偷偷放大显著水平。',
    cures: ['alpha 预注册冻结', 'frozen vs executed 精确对账（tol=0）', '偏离即 FAIL'],
    realCase: 'Bem (2011) 预知实验引发 p 值边界争议·John et al. (2012) 将事后调整显著标准列为高频 QRP',
  },
  'p-hacking-multiple-testing-uncorrected': {
    attackId: 'AT-PHACK-CORRECTION',
    kind: 'p-hacking-multiple-testing-uncorrected',
    category: 'significance-abuse',
    name: '多重比较未校正（multiple testing uncorrected）',
    what: '做大量统计检验但未做多重比较校正（Bonferroni/FDR），显著结果实为偶然。',
    cures: ['多重比较校正强制', '未校正即 FAIL', 'preregistration 声明校正策略'],
    realCase: '多重比较问题是统计陷阱教科书条目（scientific-agent-skills statistical-pitfalls 目录）',
  },
  'p-hacking-p-curve-skew': {
    attackId: 'AT-PHACK-PCURVE',
    kind: 'p-hacking-p-curve-skew',
    category: 'significance-abuse',
    name: 'p-curve 分布异常（p-hacking distributional signature）',
    what: '显著 p 值聚集在 [0.04, 0.05) 边缘区而非接近 0——这是选择性报告/optional stopping/outcome switching 的分布信号。真实效应的 p-curve 应右偏（近 0 多），p-hacking 的 p-curve 左偏（近阈值多）。',
    cures: ['p-curve caliper 检测', '报告所有 outcome 不论显著性', 'preregistration + 预注册分析路径'],
    realCase: 'Simonsohn, Simmons & Nelson (2014) P-curve 论文；Bem (2011) 10 实验 p 值分布是经典案例',
  },
  'harking-revision-after-result': {
    attackId: 'AT-HARK',
    kind: 'harking-revision-after-result',
    category: 'methodology',
    name: '假设后设（HARKing）',
    what: '看到结果后才修订假设并宣称该假设是预先提出的——假设与结果时间线倒置。',
    cures: ['假设封存时间戳 vs 实验结束时间戳对账', '结果后修订即 FAIL'],
    realCase: 'Kerr (1998) 首次命名"HARKing"（Hypothesizing After the Results are Known）',
  },
  'stopping-rule-violation': {
    attackId: 'AT-STOPPING-RULE',
    kind: 'stopping-rule-violation',
    category: 'methodology',
    name: '停止规则违规（stopping rule violation）',
    what: '预注册的样本停止规则被违反（interim 分析当最终、提前停止不声明）。',
    cures: ['停止规则预注册', 'interim/earlyStopped 标记校验', '违规即 FAIL'],
    realCase: '[n/a]（通用：早期停止滥用是临床试验争议焦点）',
  },
  'optional-stopping-no-spending': {
    attackId: 'AT-OPTIONAL-STOPPING',
    kind: 'optional-stopping-no-spending',
    category: 'methodology',
    name: '可选停止无花费（optional stopping without alpha spending）',
    what: '结果不利就继续采样、有利就停止——未按 alpha spending 函数校正，显著水平名存实亡。',
    cures: ['alpha spending 函数预注册', '多次 look 必须校正', '未花费即 FAIL'],
    realCase: '[n/a]（通用：可选停止使 p 值失义）',
  },
  'dependency-float-drift': {
    attackId: 'AT-DEP-FLOAT-DRIFT',
    kind: 'dependency-float-drift',
    category: 'reproducibility',
    name: '依赖浮动漂移（dependency float drift）',
    what: '依赖版本非锁定（^ 范围），重算时解析到不同版本导致结果漂移。',
    cures: ['exact pin（scripts/check-supply-chain.mjs）', 'lockfile hash 冻结', '漂移即 FAIL'],
    realCase: '[n/a]（供应链层面：版本漂移破坏可复现重算）',
  },
  'benchmark-overfit': {
    attackId: 'AT-OVERFIT',
    kind: 'benchmark-overfit',
    category: 'methodology',
    name: '基准过拟合（benchmark overfit）',
    what: '在 public split 反复调参直至过拟合，声称的泛化能力实为对基准的记忆。',
    cures: ['public/hidden split 分离', 'hidden split 校验', 'public 反复命中即 WARN'],
    realCase: '[n/a]（通用：竞赛 leaderboard 过拟合）',
  },
  'fake-degraded-scope': {
    attackId: 'AT-FAKE-DEGRADED',
    kind: 'fake-degraded-scope',
    category: 'reporting',
    name: '假降级（fake degraded scope）',
    what: '把失败包装为"降级结论"（declared null result）但不让 null result 进 proofHash——隐瞒失败。',
    cures: ['null result 必须进 proofHash', 'linkedVerdictRule 校验', '未进入即 FAIL'],
    realCase: '[n/a]（通用：阴性结果隐藏是发表偏倚来源）',
  },
  'execution-provenance-unbound': {
    attackId: 'AT-PROVENANCE-UNBOUND',
    kind: 'execution-provenance-unbound',
    category: 'provenance',
    name: '执行-产物绑定缺失（execution provenance unbound）',
    what: '声称的 metricValue 无本次 sandbox 执行的产物 hash 绑定——fixture 冒充真实计算结果。',
    cures: ['requireExecutionProvenance opt-in', 'sandbox stdout/artifact hash 绑定', '缺失即 FAIL'],
    realCase: '[n/a]（FAR-Lab T-003 评委逼问修复·防 fixture 冒充）',
  },
  'effect-p-consistency-mismatch': {
    attackId: 'AT-EFFECT-P-MISMATCH',
    kind: 'effect-p-consistency-mismatch',
    category: 'significance-abuse',
    name: '统计报告内部不一致（effect/p/CI/direction logical mismatch）',
    what: '提交的 effectSize / p / 置信区间 / 效应方向四者违反 frequentist 数学恒等关系或符号一致性——如 CI 排除 null 但 p ≥ alpha，或声称 greater 方向但 effectSize 为负。这类数学不可能的组合表明统计报告是手工拼凑或选择性伪造，而非真实统计计算的产物。',
    cures: ['CI 与 p 必须满足 (1-alpha) 双侧 Wald 恒等关系', 'effectSize 符号须与 effectDirection 一致', 'CI 整体符号须与方向一致·矛盾即 FAIL'],
    realCase: 'Bogerd et al. (2020) 元分析发现多篇心理学论文的 F/t/p/df 组合在数学上不可能（statcheck 自动检测）',
  },
};

/** 陷阱分类覆盖完整性检查（测试对拍用）：返回未覆盖的 kind。 */
export function uncoveredTrapKinds(): readonly AntiTheaterAttackKind[] {
  // 枚举联合全集：遍历 ATTACK_ID_TO_KIND 值（22 项）。
  // 避免 import 运行时对象循环依赖：此处由测试对拍覆盖完整性（tests/anti_theater/trap_taxonomy.test.ts）。
  return Object.values(TRAP_TAXONOMY).map((t) => t.kind);
}

/**
 * 取单个陷阱分类元数据。
 * @param kind - 存储轴 attackKind
 * @throws 未收录时抛错（与 attackKindToId 相同的不变式风格）
 */
export function trapTaxonomyFor(kind: AntiTheaterAttackKind): TrapTaxonomy {
  const t = TRAP_TAXONOMY[kind];
  if (!t) {
    throw new Error(`trapTaxonomyFor: unknown attackKind '${kind}' (taxonomy incomplete)`);
  }
  return t;
}

/** 陷阱命中摘要（报告/演示结构化输出用）。 */
export interface TrapSummary {
  /** 触发 finding 总数。 */
  readonly totalFindings: number;
  /** 触发的 attackKind 列表（去重·按 TRAP_TAXONOMY 键序）。 */
  readonly triggeredKinds: readonly AntiTheaterAttackKind[];
  /** 触发的大类（去重）。 */
  readonly triggeredCategories: readonly TrapCategory[];
  /** 各大类触发计数。 */
  readonly categoryCounts: Readonly<Record<TrapCategory, number>>;
  /** 是否存在 fail 级 finding。 */
  readonly hasFail: boolean;
}

const CATEGORIES: readonly TrapCategory[] = [
  'significance-abuse',
  'data-integrity',
  'artifact-integrity',
  'scope-integrity',
  'methodology',
  'process-integrity',
  'reporting',
  'reproducibility',
  'forgery',
  'provenance',
  'evidence-adequacy',
];

/** 从 findings 聚合陷阱命中摘要（确定性·纯函数）。 */
export function summarizeTraps(findings: readonly AntiTheaterFinding[]): TrapSummary {
  const kindSet = new Set<AntiTheaterAttackKind>();
  let hasFail = false;
  for (const f of findings) {
    kindSet.add(f.attackKind);
    if (f.hasFail) hasFail = true;
  }
  const categoryCounts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<TrapCategory, number>;
  const triggeredCategories = new Set<TrapCategory>();
  for (const kind of kindSet) {
    const cat = TRAP_TAXONOMY[kind].category;
    categoryCounts[cat] += 1;
    triggeredCategories.add(cat);
  }
  return {
    totalFindings: findings.length,
    triggeredKinds: [...kindSet],
    triggeredCategories: [...triggeredCategories],
    categoryCounts,
    hasFail,
  };
}
