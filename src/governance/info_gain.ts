/**
 * info_gain — GOV-INFOGAIN-001 调查优先级按期望信息增益排序。
 *
 * 决策论模型（显式、可审计）：
 *   - 每个调查项声明一个离散结果集 outcomes[{label, priorProbability,
 *     decisionPayoff}]：结果概率（先验）+ 该结果下每个候选决策的收益；
 *   - 无信息基线 valueWithoutInfo = max_d Σ_o p(o)·payoff(o, d)
 *     （必须在「不知道结果」时现在就选一个决策，取期望收益最高者）；
 *   - 有信息期望 valueWithInfo = Σ_o p(o)·max_d payoff(o, d)
 *     （观察到结果后再选——完美信息期望价值 EVPI 形态）；
 *   - expectedInfoGain = valueWithInfo − valueWithoutInfo（≥0，Jensen 不等式；
 *     负值只可能来自浮点误差 → 钳到 0 并标记 approximated）；
 *   - 决策价值加权：constitution 原文「Expected Decision Value / Cost」——
 *     priority = expectedInfoGain × decisionWeight / cost。
 *
 * 宪法字段强制（fail-closed）：每项必须有 reducesUnknown（减少哪个 Unknown）、
 * affectedDecision（可能改变哪个决策）、cost > 0、worstRisk（最坏风险）；
 * 先验和必须为 1（±1e-9 容差）——畸形项整体拒绝，不静默降权。
 *
 * 确定性：纯函数、无 IO、无时钟、无随机；排序 tie-break 按 id 字典序，
 * 同输入恒同输出。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - 先验概率与收益是登记者的主观估计——本模块证明的是「在这些估计之下
 *     的决策论排序一致」，不证明估计本身正确（那是事后复盘的职责）；
 *   - EVPI 假设调查结果无噪声且即刻可得（完美信息上界）——真实调查可能
 *     只部分消解不确定性，真实信息增益 ≤ 本评分；
 *   - 评分不证明调查会被执行或结果会被如实登记。
 */

/** 决策标识（字符串——由调用方的决策台账定义语义）。 */
export type DecisionId = string;

/** 单个可能结果：label + 先验概率 + 该结果下各候选决策的收益。 */
export interface InvestigationOutcome {
  readonly label: string;
  /** 先验概率（0,1]；同一调查项的所有 outcomes 之和必须为 1。 */
  readonly priorProbability: number;
  /** 该结果发生时，每个候选决策的收益（任意有界数值刻度，调用方定义单位）。 */
  readonly decisionPayoff: Readonly<Record<DecisionId, number>>;
}

/** 调查项（宪法 GOV-INFOGAIN-001 四要素 + 决策论模型载荷）。 */
export interface InvestigationItem {
  readonly id: string;
  /** 最可能减少哪个重要 Unknown（unknown_registry 的 UNK-* id 或描述）。 */
  readonly reducesUnknown: string;
  /** 可能改变哪个决策（决策台账 id）。 */
  readonly affectedDecisions: readonly DecisionId[];
  /** 成本（任意正数刻度：人时/预算单位——与收益同单位制由调用方保证）。 */
  readonly cost: number;
  /** 最坏风险（若调查本身可能造成损害——宪法要求显式声明）。 */
  readonly worstRisk: string;
  /** 决策价值加权 [0,1]：该决策的重要性（宪法「决策价值加权」）。 */
  readonly decisionWeight: number;
  readonly outcomes: readonly InvestigationOutcome[];
}

export interface ScoredInvestigation {
  readonly id: string;
  /** 无信息基线：现在就选（不知道结果）的最优期望收益。 */
  readonly valueWithoutInfo: number;
  /** 完美信息期望：观察到结果后再选的期望收益。 */
  readonly valueWithInfo: number;
  /** 期望信息增益（钳 0 浮点防御）。 */
  readonly expectedInfoGain: number;
  /** priority = expectedInfoGain × decisionWeight / cost。 */
  readonly priority: number;
  /** 浮点防御触发标记（expectedInfoGain 原值为微负被钳 0）。 */
  readonly approximated: boolean;
}

export type InfoGainResult =
  | { readonly ok: true; readonly ranked: readonly ScoredInvestigation[] }
  | { readonly ok: false; readonly problems: readonly string[] };

const PRIOR_SUM_TOLERANCE = 1e-9;

/** 宪法四要素 + 决策论模型的结构校验（fail-closed：畸形 → 拒绝整个输入）。 */
export function validateInvestigationItems(items: readonly InvestigationItem[]): readonly string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const item of items) {
    if (item.id.trim().length === 0) problems.push(`${item.id || '<empty-id>'}: id must be non-empty`);
    if (ids.has(item.id)) problems.push(`${item.id}: duplicate id`);
    ids.add(item.id);
    if (item.reducesUnknown.trim().length === 0) problems.push(`${item.id}: reducesUnknown must be non-empty`);
    if (item.affectedDecisions.length === 0) problems.push(`${item.id}: affectedDecisions must be non-empty`);
    if (!(item.cost > 0)) problems.push(`${item.id}: cost must be > 0`);
    if (item.worstRisk.trim().length === 0) problems.push(`${item.id}: worstRisk must be non-empty`);
    if (!(item.decisionWeight >= 0 && item.decisionWeight <= 1)) {
      problems.push(`${item.id}: decisionWeight must be within [0,1]`);
    }
    if (item.outcomes.length === 0) {
      problems.push(`${item.id}: outcomes must be non-empty`);
      continue;
    }
    const priorSum = item.outcomes.reduce((s, o) => s + o.priorProbability, 0);
    if (Math.abs(priorSum - 1) > PRIOR_SUM_TOLERANCE) {
      problems.push(`${item.id}: outcome priors must sum to 1 (got ${priorSum})`);
    }
    for (const o of item.outcomes) {
      if (o.label.trim().length === 0) problems.push(`${item.id}: outcome label must be non-empty`);
      if (!(o.priorProbability > 0)) problems.push(`${item.id}.${o.label}: priorProbability must be > 0`);
      if (Object.keys(o.decisionPayoff).length === 0) {
        problems.push(`${item.id}.${o.label}: decisionPayoff must be non-empty`);
      }
    }
    // 所有结果必须覆盖同一决策集（跨结果可比——否则 max_d 无定义）。
    const firstKeys = Object.keys(item.outcomes[0]!.decisionPayoff).sort().join('|');
    for (const o of item.outcomes.slice(1)) {
      const keys = Object.keys(o.decisionPayoff).sort().join('|');
      if (keys !== firstKeys) {
        problems.push(`${item.id}: outcome "${o.label}" decision set differs from "${item.outcomes[0]!.label}"`);
      }
    }
  }
  return problems;
}

/** 单项评分（纯）：EVPI 形态的两项差 + 决策价值加权 + 成本除。 */
export function scoreInvestigation(item: InvestigationItem): ScoredInvestigation {
  const decisions = Object.keys(item.outcomes[0]!.decisionPayoff);
  // valueWithoutInfo = max_d Σ_o p(o)·payoff(o,d)
  const expectedPerDecision = decisions.map((d) =>
    item.outcomes.reduce((s, o) => s + o.priorProbability * (o.decisionPayoff[d] ?? 0), 0),
  );
  const valueWithoutInfo = Math.max(...expectedPerDecision);
  // valueWithInfo = Σ_o p(o)·max_d payoff(o,d)
  const valueWithInfo = item.outcomes.reduce((s, o) => s + o.priorProbability * Math.max(...decisions.map((d) => o.decisionPayoff[d] ?? 0)), 0);
  const rawGain = valueWithInfo - valueWithoutInfo;
  const approximated = rawGain < 0;
  const expectedInfoGain = Math.max(0, rawGain);
  return {
    id: item.id,
    valueWithoutInfo,
    valueWithInfo,
    expectedInfoGain,
    priority: (expectedInfoGain * item.decisionWeight) / item.cost,
    approximated,
  };
}

/**
 * 排序入口（宪法 acceptance：prioritization record）。排序键 priority 降序，
 * tie-break id 字典序升序（确定性）。畸形输入 → { ok:false, problems } 整体拒绝。
 */
export function rankInvestigations(items: readonly InvestigationItem[]): InfoGainResult {
  const problems = validateInvestigationItems(items);
  if (problems.length > 0) return { ok: false, problems };
  const ranked = items
    .map((i) => scoreInvestigation(i))
    .sort((a, b) => (a.priority > b.priority ? -1 : a.priority < b.priority ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { ok: true, ranked };
}
