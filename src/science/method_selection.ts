// src/science/method_selection.ts
// 职责：SCI-METHOD-001 科学方法按问题特征调度（机器层）。
//
// 宪法条款：方法库至少覆盖 Multiple Working Hypotheses / Strong Inference /
// Bayesian Surprise / Expected Information Gain / Pre-registration /
// Negative Results / Triangulation / Fermi Estimation / Dimensional Analysis /
// Extreme-case Testing / sensitivity analysis。
//
// 机制：
//   METHOD_LIBRARY         11 方法清单（宪法枚举 SSOT）
//   ProblemFeatures        问题特征：数据类型/因果结构/可干预性（+确认性、
//                          效应量预期、多变量性——调度输入面）
//   适配性矩阵             方法 × 特征 → 'required'|'suitable'|'unsuitable'|
//                          'neutral'（规则显式声明在每方法的 rule 函数——
//                          矩阵即代码，不藏第二张表）
//   selectMethods          确定性调度：required 优先（按 id 序），suitable
//                          次之（按 id 序），unsuitable 排除并给出理由；
//                          零可用方法 → fail-closed
//   validateProblemFeatures 特征枚举外取值 → throw（坏输入不进矩阵）
//
// Cannot-prove：本机制证明「调度规则按声明特征确定性执行」，不证明
// (a) 映射本身的经验有效性（方法-问题适配是方法论工程判断——不是从
// 数据里学出来的）；(b) 被调度的方法被执行得好（调度给的是方法选择，
// 执行质量是各方法自身流程的职责）；(c) 特征刻画忠实反映问题本体
// （错误的问题特征必然调度出错误的方法集）。

// ---------------------------------------------------------------------------
// 问题特征
// ---------------------------------------------------------------------------

export type ProblemDataType = 'observational' | 'experimental' | 'simulation' | 'archival' | 'survey';
export type CausalStructure = 'descriptive' | 'correlational' | 'quasi-experimental' | 'experimental';
export type Intervenability = 'none' | 'partial' | 'full';

export interface ProblemFeatures {
  /** 数据类型。 */
  readonly dataType: ProblemDataType;
  /** 因果结构。 */
  readonly causalStructure: CausalStructure;
  /** 可干预性。 */
  readonly interventional: Intervenability;
  /** 是否确认性研究（假设检验——预注册强制）。 */
  readonly confirmatory: boolean;
  /** 预期效应量（Fermi 估计的适用面）。 */
  readonly expectedEffectSize: 'small' | 'medium' | 'large';
  /** 是否多变量（混杂面——敏感性分析强制）。 */
  readonly multivariate: boolean;
}

const DATA_TYPES: readonly ProblemDataType[] = ['observational', 'experimental', 'simulation', 'archival', 'survey'];
const CAUSAL_STRUCTURES: readonly CausalStructure[] = ['descriptive', 'correlational', 'quasi-experimental', 'experimental'];
const INTERVENABILITY: readonly Intervenability[] = ['none', 'partial', 'full'];

/** 特征校验：枚举外取值 fail-closed（坏输入不进适配矩阵）。 */
export function validateProblemFeatures(f: ProblemFeatures): void {
  if (!DATA_TYPES.includes(f.dataType)) throw new Error(`method_selection: unknown dataType "${f.dataType}" (expected one of ${DATA_TYPES.join('|')})`);
  if (!CAUSAL_STRUCTURES.includes(f.causalStructure)) throw new Error(`method_selection: unknown causalStructure "${f.causalStructure}" (expected one of ${CAUSAL_STRUCTURES.join('|')})`);
  if (!INTERVENABILITY.includes(f.interventional)) throw new Error(`method_selection: unknown interventional "${f.interventional}" (expected one of ${INTERVENABILITY.join('|')})`);
  if (!['small', 'medium', 'large'].includes(f.expectedEffectSize)) throw new Error(`method_selection: unknown expectedEffectSize "${f.expectedEffectSize}"`);
}

// ---------------------------------------------------------------------------
// 方法库（11 方法——宪法枚举）+ 适配规则
// ---------------------------------------------------------------------------

export const METHOD_IDS = [
  'multiple-working-hypotheses',
  'strong-inference',
  'bayesian-surprise',
  'expected-information-gain',
  'pre-registration',
  'negative-results',
  'triangulation',
  'fermi-estimation',
  'dimensional-analysis',
  'extreme-case-testing',
  'sensitivity-analysis',
] as const;
export type MethodId = (typeof METHOD_IDS)[number];

export type Suitability = 'required' | 'suitable' | 'unsuitable' | 'neutral';

export interface MethodRule {
  readonly methodId: MethodId;
  /** 方法一句话职责（报告用）。 */
  readonly purpose: string;
  /** 适配规则（确定性函数：特征 → 适配度 + 理由）。 */
  readonly evaluate: (f: ProblemFeatures) => { readonly suitability: Suitability; readonly rationale: string };
}

export const METHOD_LIBRARY: readonly MethodRule[] = [
  {
    methodId: 'multiple-working-hypotheses',
    purpose: 'hold competing hypotheses simultaneously to avoid confirmation bias',
    evaluate: (f) =>
      f.causalStructure === 'correlational' || f.multivariate
        ? { suitability: f.multivariate ? 'required' : 'suitable', rationale: 'multiple plausible mechanisms in play — single-hypothesis framing risks confirmation bias' }
        : { suitability: 'neutral', rationale: 'single dominant hypothesis space — method not load-bearing' },
  },
  {
    methodId: 'strong-inference',
    purpose: 'sequential hypothesis elimination by decisive experiments',
    evaluate: (f) =>
      f.interventional === 'full' && f.causalStructure === 'experimental'
        ? { suitability: 'suitable', rationale: 'full intervention + experimental structure supports decisive elimination cycles' }
        : { suitability: 'unsuitable', rationale: `intervenability=${f.interventional}, causal=${f.causalStructure} — decisive elimination experiments not available` },
  },
  {
    methodId: 'bayesian-surprise',
    purpose: 'quantify how much observations deviate from prior expectations',
    evaluate: (f) =>
      f.dataType === 'observational' || f.dataType === 'archival' || f.dataType === 'survey'
        ? { suitability: 'suitable', rationale: 'passive data streams favor surprise scoring against priors' }
        : { suitability: 'neutral', rationale: `${f.dataType} data — surprise quantification not primary` },
  },
  {
    methodId: 'expected-information-gain',
    purpose: 'rank candidate measurements by expected information yield',
    evaluate: (f) =>
      f.interventional !== 'none'
        ? { suitability: 'suitable', rationale: 'design-phase measurement choice available — EIG ranks probes' }
        : { suitability: 'neutral', rationale: 'no intervention budget to allocate — EIG not actionable' },
  },
  {
    methodId: 'pre-registration',
    purpose: 'freeze confirmatory analysis before data collection',
    evaluate: (f) =>
      f.confirmatory
        ? { suitability: 'required', rationale: 'confirmatory claim — preregistration is mandatory (EVAL-PREREG-001 machinery applies)' }
        : { suitability: 'neutral', rationale: 'exploratory work — preregistration optional' },
  },
  {
    methodId: 'negative-results',
    purpose: 'register null/refuting outcomes to prevent file-drawer distortion',
    evaluate: () => ({ suitability: 'suitable', rationale: 'negative-result registration applies to every study shape' }),
  },
  {
    methodId: 'triangulation',
    purpose: 'converge on claims via independent method families',
    evaluate: (f) =>
      f.causalStructure === 'correlational' || f.causalStructure === 'quasi-experimental'
        ? { suitability: f.causalStructure === 'correlational' ? 'required' : 'suitable', rationale: 'no full randomization — convergent evidence from independent methods is the strongest available warrant' }
        : { suitability: 'neutral', rationale: 'experimental control available — triangulation optional reinforcement' },
  },
  {
    methodId: 'fermi-estimation',
    purpose: 'order-of-magnitude sanity bounds before detailed analysis',
    evaluate: (f) =>
      f.expectedEffectSize === 'large'
        ? { suitability: 'suitable', rationale: 'large expected effects are Fermi-checkable at order-of-magnitude' }
        : { suitability: 'neutral', rationale: `expected ${f.expectedEffectSize} effects below reliable Fermi resolution` },
  },
  {
    methodId: 'dimensional-analysis',
    purpose: 'check unit homogeneity and derive scaling constraints',
    evaluate: (f) =>
      f.multivariate || f.dataType === 'simulation'
        ? { suitability: 'suitable', rationale: 'multi-quantity relations (or simulation scaling) benefit from dimension constraints' }
        : { suitability: 'neutral', rationale: 'few quantities — dimensional analysis adds little' },
  },
  {
    methodId: 'extreme-case-testing',
    purpose: 'probe behavior at boundary values of the claimed relation',
    evaluate: (f) =>
      f.interventional !== 'none'
        ? { suitability: 'suitable', rationale: 'boundary probes executable within intervention budget' }
        : { suitability: 'neutral', rationale: 'passive observation — extreme cases only as they occur' },
  },
  {
    methodId: 'sensitivity-analysis',
    purpose: 'quantify claim robustness to assumption perturbation',
    evaluate: (f) =>
      f.multivariate
        ? { suitability: 'required', rationale: 'multivariate claim — robustness to covariate/assumption perturbation is mandatory' }
        : { suitability: 'suitable', rationale: 'univariate claims still benefit from assumption probing' },
  },
];

// ---------------------------------------------------------------------------
// 调度决策（确定性）
// ---------------------------------------------------------------------------

export interface MethodDispatchEntry {
  readonly methodId: MethodId;
  readonly suitability: Suitability;
  readonly rationale: string;
}

export interface MethodDispatch {
  /** 推荐方法（required 在前按 id 序，suitable 在后按 id 序——确定性输出）。 */
  readonly recommended: readonly MethodDispatchEntry[];
  /** 排除的方法及理由（unsuitable/neutral 全列——报告透明面）。 */
  readonly excluded: readonly MethodDispatchEntry[];
}

/**
 * 方法调度：特征 → 方法集。required 优先；neutral 与 unsuitable 都不推荐
 * （neutral 是「不背书也不禁止」——留给调用方自决，不进推荐集）。
 */
export function selectMethods(features: ProblemFeatures): MethodDispatch {
  validateProblemFeatures(features);
  const entries = METHOD_LIBRARY.map((rule) => {
    const { suitability, rationale } = rule.evaluate(features);
    return { methodId: rule.methodId, suitability, rationale };
  });
  const recommended = entries
    .filter((e) => e.suitability === 'required' || e.suitability === 'suitable')
    .sort((a, b) => (a.suitability === b.suitability ? (a.methodId < b.methodId ? -1 : 1) : a.suitability === 'required' ? -1 : 1));
  const excluded = entries
    .filter((e) => e.suitability !== 'required' && e.suitability !== 'suitable')
    .sort((a, b) => (a.methodId < b.methodId ? -1 : 1));
  if (recommended.length === 0) {
    throw new Error(`method_selection: zero methods recommended for features ${JSON.stringify(features)} — fail-closed (every problem shape must carry at least negative-results registration)`);
  }
  return { recommended, excluded };
}

/** 适配矩阵渲染（方法 × 特征的审查视图——每格 = 该方法对此特征的适配度）。 */
export function suitabilityMatrix(features: readonly ProblemFeatures[]): readonly {
  readonly methodId: MethodId;
  readonly perProblem: readonly Suitability[];
}[] {
  for (const f of features) validateProblemFeatures(f);
  return METHOD_LIBRARY.map((rule) => ({
    methodId: rule.methodId,
    perProblem: features.map((f) => rule.evaluate(f).suitability),
  }));
}
