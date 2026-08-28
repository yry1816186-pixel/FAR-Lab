import { z } from 'zod';
import { ClaimId, HypothesisId, RunId } from './ids.js';
import type { ScientificState } from './scientific-state.js';
import { templateMarkerZh } from './scientific-state.js';

/**
 * Product Spine M2 (final product reconstruction, 2026-08-28): the NEXT BEST
 * RESEARCH ACTION derivation. Deterministic rules over the ScientificState
 * projection + the run's iteration/plan state — the action is DERIVED from
 * what the science needs (protocol §IX: "Next Action 必须从 Scientific State
 * 推导"), never from "pipeline 的下一步是 Plan".
 *
 * Truth rules:
 *  - Ranking is qualitative (high/medium/low) with natural-language rationale —
 *    no fabricated information-gain numbers (protocol §IX).
 *  - An action is only marked actionable when a REAL product affordance exists
 *    for it (resume that genuinely reopens the loop, or a rerun); everything
 *    else is surfaced as researcher guidance.
 *  - researcherDecisionRequired marks the human-judgment nodes (cost, scope,
 *    exclusions), never plumbing.
 */

export const NextActionType = z.enum([
  'RERUN_WITH_LIVE_ROUTE',
  'DECLARE_INSUFFICIENT_EVIDENCE',
  'EXECUTE_PLANNED_EXPERIMENT',
  'REDESIGN_EXPERIMENT_FOR_LOCAL_EXECUTABILITY',
  'CONSUME_FEEDBACK_INTO_REVISION',
  'RESUME_EVIDENCE_DEBT',
  'COUNTER_EVIDENCE_SEARCH',
  'DISCRIMINATING_ANALYSIS',
  'ADD_DISCRIMINATING_DATA',
  'EXTEND_LITERATURE',
  'RESEARCHER_REVIEW_COUNTERS',
]);
export type NextActionType = z.infer<typeof NextActionType>;

export const Qualitative = z.enum(['high', 'medium', 'low']);

/**
 * English mirror of the four display fields. The zh fields stay the canonical
 * text (CLI + export consumers are zh-primary); `en` is composed at the SAME
 * site from the same structured inputs so the two can never drift apart. The
 * web workbench picks per its language with zh fallback (older projections
 * predating this field render zh only).
 */
const NextActionEn = z.object({
  objective: z.string().min(1),
  knowledgeGap: z.string().min(1),
  rationale: z.string().min(1),
  wouldChange: z.string().min(1),
});
export type NextActionEn = z.infer<typeof NextActionEn>;

export const NextResearchAction = z.object({
  /** Deterministic id: stable per run+rule+seq so UI keys and tests are stable. */
  id: z.string().min(1),
  runId: RunId,
  actionType: NextActionType,
  /** One-line objective (composed by the UI from actionType + targets; EN content quotes stay verbatim). */
  objective: z.string().min(1),
  /** The knowledge gap this action addresses. */
  knowledgeGap: z.string().min(1),
  /** Why THIS action now, derived from state. */
  rationale: z.string().min(1),
  /** What result would change the current view (from the leader's falsifier when available). */
  wouldChange: z.string().min(1),
  /** English mirror of the four display fields (see NextActionEn above). */
  en: NextActionEn.optional(),
  expectedDiscrimination: Qualitative,
  feasibility: Qualitative,
  costClass: Qualitative,
  researcherDecisionRequired: z.boolean(),
  targets: z.object({
    hypothesisIds: z.array(HypothesisId).default([]),
    claimIds: z.array(ClaimId).default([]),
  }),
  actionable: z.boolean(),
  actionHint: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('resume') }),
    z.object({ kind: z.literal('rerun-live') }),
    z.object({ kind: z.literal('guidance') }),
  ]),
});
export type NextResearchAction = z.infer<typeof NextResearchAction>;

/** What the iteration controller + plan executability check reduced to (adapted at the API layer). */
export interface ActionDerivationInput {
  runId: RunId;
  runStatus: string;
  state: ScientificState;
  leg: {
    kind: 'no_plan' | 'unexecuted' | 'unexecutable' | 'plan_revised_since_experiment' | 'current';
    executabilityPassed: boolean;
    /** Present only for the unexecutable verdict — the per-type breakdown. */
    unexecutableReason?: string;
  };
  unconsumedFeedbackCount: number;
  hasEvidenceDebt: boolean;
  /** Public dataset requirements the plan declared (for ADD_DISCRIMINATING_DATA). */
  planDatasets: Array<{ name: string; availability: string }>;
  /** Top ACH-diagnosticity claim ids (desc, top 3; [] when no ACH analysis exists). Feeds expected-discrimination grading. */
  achTopClaimIds: ClaimId[];
}

/**
 * Priority-ordered derivation; the FIRST action is the next best. Rules are
 * pure functions of the inputs — same state, same actions, same order.
 * The seq counter is call-local: deriveNextActions is pure and reentrant.
 */
export function deriveNextActions(input: ActionDerivationInput): NextResearchAction[] {
  const { runId, runStatus, state, leg, unconsumedFeedbackCount, hasEvidenceDebt, planDatasets, achTopClaimIds } = input;
  let seq = 0;
  const mk = (
    actionType: NextActionType,
    fields: Omit<NextResearchAction, 'id' | 'runId' | 'actionType' | 'targets' | 'researcherDecisionRequired' | 'actionable' | 'actionHint'> & {
      targets?: NextResearchAction['targets'];
      researcherDecisionRequired?: boolean;
      actionable?: boolean;
      actionHint?: NextResearchAction['actionHint'];
    },
  ): NextResearchAction => {
    seq += 1;
    return NextResearchAction.parse({
      id: `nra_${runId}_${seq}`,
      runId,
      actionType,
      researcherDecisionRequired: false,
      actionable: false,
      actionHint: { kind: 'guidance' },
      targets: { hypothesisIds: [], claimIds: [] },
      ...fields,
    });
  };
  const settled = runStatus === 'completed' || runStatus === 'partial';
  if (!settled) return [];
  // Partial-but-unconcluded (hypotheses stage never finished): the map's
  // partial band owns the resume affordance — no premature science actions.
  if (state.kind === 'forming') return [];

  const actions: NextResearchAction[] = [];
  const leaderId = state.leading?.hypothesisId ?? null;
  const leaderFalsifier = leaderId !== null
    ? state.falsifiers.find((f) => f.hypothesisId === leaderId)?.condition ?? null
    : null;
  /** The leader's falsifier text is model data (verbatim in both languages); otherwise the bilingual fallback. */
  const wouldChangeOf = (zhFallback: string, enFallback: string): { wouldChange: string; en: { wouldChange: string } } => ({
    wouldChange: leaderFalsifier ?? zhFallback,
    en: { wouldChange: leaderFalsifier ?? enFallback },
  });

  // -- Truth gates first: template content and insufficient states are CONCLUSIONS, not config problems --
  if (state.kind === 'template') {
    actions.push(mk('RERUN_WITH_LIVE_ROUTE', {
      objective: '用真实模型路线重新运行本研究，替换离线模板产物',
      knowledgeGap: '当前假设/范围由离线确定性模板生成，不含真实科学推理',
      rationale: `检测到模板标记：${state.templateEvidence.map(templateMarkerZh).join('；')}。模板内容不构成科学判断，重跑是唯一获得真实假设的路径`,
      wouldChange: wouldChangeOf('真实路线将生成基于所检索文献的可证伪假设，当前“证据不足”结论将被真实排序替换', 'A live route will generate falsifiable hypotheses grounded in the retrieved literature; the current "insufficient evidence" conclusion will be replaced by a real ranking').wouldChange,
      expectedDiscrimination: 'high', feasibility: 'high', costClass: 'medium',
      researcherDecisionRequired: true, // costs model calls — researcher approves
      actionable: true, actionHint: { kind: 'rerun-live' },
      en: {
        objective: 'Re-run this study on a real model route, replacing the offline template artifacts',
        knowledgeGap: 'Current hypotheses/scope came from the offline deterministic template — no real scientific reasoning',
        rationale: `Template markers detected: ${state.templateEvidence.join('; ')}. Template content carries no scientific judgment; re-running is the only path to real hypotheses`,
        wouldChange: wouldChangeOf('', 'A live route will generate falsifiable hypotheses grounded in the retrieved literature; the current "insufficient evidence" conclusion will be replaced by a real ranking').en.wouldChange,
      },
    }));
    actions.push(mk('DECLARE_INSUFFICIENT_EVIDENCE', {
      objective: '以「证据不足」作为本研究的当前正式结论',
      knowledgeGap: '无可用的科学假设',
      rationale: '科学上诚实的状态：模板产物不承载证据权重，任何“当前判断”都不成立',
      wouldChange: '不改变认识——它防止把模板当作结论',
      expectedDiscrimination: 'low', feasibility: 'high', costClass: 'low',
      en: {
        objective: 'Adopt "insufficient evidence" as the study\'s current formal conclusion',
        knowledgeGap: 'No usable scientific hypotheses',
        rationale: 'The scientifically honest state: template output carries no evidential weight, so no "current view" holds',
        wouldChange: 'Changes nothing — it prevents mistaking template output for a conclusion',
      },
    }));
    return actions;
  }

  // -- Loop-unblocking actions (resume genuinely reopens these legs) --
  if (unconsumedFeedbackCount > 0) {
    actions.push(mk('CONSUME_FEEDBACK_INTO_REVISION', {
      objective: `吸收 ${unconsumedFeedbackCount} 条未消费反馈，形成因果修订`,
      knowledgeGap: '新信息已进入研究但尚未改变任何假设/计划',
      rationale: '反馈信号会触发 feedback→revise→export 重开：修订将解释哪些主张/假设因它改变',
      wouldChange: wouldChangeOf('修订将按因果链更新受影响的假设与排序，并记录 before/after', 'The revision will update affected hypotheses and rankings along the causal chain, recording before/after').wouldChange,
      expectedDiscrimination: 'high', feasibility: 'high', costClass: 'low',
      actionable: true, actionHint: { kind: 'resume' },
      en: {
        objective: `Consume ${unconsumedFeedbackCount} unconsumed feedback signal(s) into a causal revision`,
        knowledgeGap: 'New information has entered the study but changed no hypothesis/plan yet',
        rationale: 'Feedback signals reopen feedback→revise→export: the revision will explain which claims/hypotheses changed because of it',
        wouldChange: wouldChangeOf('', 'The revision will update affected hypotheses and rankings along the causal chain, recording before/after').en.wouldChange,
      },
    }));
  }
  if ((leg.kind === 'unexecuted' || leg.kind === 'plan_revised_since_experiment') && leg.executabilityPassed) {
    actions.push(mk('EXECUTE_PLANNED_EXPERIMENT', {
      objective: '执行研究计划中已具备可执行条件的实验（本地确定性执行器）',
      knowledgeGap: '计划通过了确定性可执行性检查，但尚无完成的实验对其裁决',
      rationale: leg.kind === 'plan_revised_since_experiment'
        ? '计划在上一实验后被因果修订（重新冻结）——新注册值得一次新实验'
        : '计划可执行但从未执行——证伪闭环缺最后一环',
      wouldChange: wouldChangeOf('实验裁决（支持/削弱/证伪/不确定）将直接作用于领先假设的证伪条件', 'The experiment verdict (support/weaken/falsify/inconclusive) acts directly on the leading hypothesis\'s falsifier').wouldChange,
      expectedDiscrimination: 'high', feasibility: 'high', costClass: 'medium',
      targets: leaderId !== null ? { hypothesisIds: [leaderId], claimIds: [] } : undefined,
      actionable: true, actionHint: { kind: 'resume' },
      en: {
        objective: 'Execute the plan\'s experiment that already satisfies executability (local deterministic executor)',
        knowledgeGap: 'The plan passed the deterministic executability check, but no completed experiment has adjudicated it',
        rationale: leg.kind === 'plan_revised_since_experiment'
          ? 'The plan was causally revised after the last experiment (re-frozen) — the new registration deserves a fresh experiment'
          : 'The plan is executable but never executed — the falsification loop is missing its last link',
        wouldChange: wouldChangeOf('', 'The experiment verdict (support/weaken/falsify/inconclusive) acts directly on the leading hypothesis\'s falsifier').en.wouldChange,
      },
    }));
  }
  if (leg.kind === 'unexecutable') {
    // The deterministic executability verdict already ran and said NO for every
    // experiment type — re-presenting "execute" would loop the same verdict
    // (observed live 2026-08-28 gold run: wet-lab/ECO/private-cohort data not in
    // public datasets; new-RCT collection violates literature-pool constraints).
    // The honest next action is a RESEARCH JUDGMENT: redesign the experiment into
    // a locally executable form, or accept that this study concludes on
    // literature evidence alone.
    actions.push(mk('REDESIGN_EXPERIMENT_FOR_LOCAL_EXECUTABILITY', {
      objective: '把计划实验重新设计为本地可执行形式，或接受本研究以文献证据收束',
      knowledgeGap: `实验腿的确定性判定：${leg.unexecutableReason ?? '计划实验无法由本地执行器执行'}`,
      rationale: '执行器已按实验类型逐一判定不可用——重复派发只会得到同一判定；改变结论的唯二路径是改实验设计（如换成已发表效应的模拟/合并分析）或接受文献级收束',
      wouldChange: wouldChangeOf('可执行的重设计将恢复证伪闭环；接受收束则本研究以当前证据状态定稿', 'An executable redesign restores the falsification loop; accepting closure finalizes the study at its current evidence state').wouldChange,
      expectedDiscrimination: 'high', feasibility: 'medium', costClass: 'low',
      researcherDecisionRequired: true,
      targets: leaderId !== null ? { hypothesisIds: [leaderId], claimIds: [] } : undefined,
      actionable: false, actionHint: { kind: 'guidance' },
      en: {
        objective: 'Redesign the planned experiment into a locally executable form, or accept that this study concludes on literature evidence',
        knowledgeGap: `Deterministic verdict on the experiment leg: ${leg.unexecutableReason ?? 'the planned experiment cannot be executed by the local executor'}`,
        rationale: 'The executor already judged every experiment type unavailable — re-dispatching only repeats the verdict; the only two paths to a changed conclusion are redesign (e.g. simulation/meta-analysis of published effects) or accepting literature-level closure',
        wouldChange: wouldChangeOf('', 'An executable redesign restores the falsification loop; accepting closure finalizes the study at its current evidence state').en.wouldChange,
      },
    }));
  }
  if (hasEvidenceDebt) {
    actions.push(mk('RESUME_EVIDENCE_DEBT', {
      objective: '补验未核验的来源（反证检索/种子文献在完成后到达）',
      knowledgeGap: '语料中存在未核验来源，其主张未进入证据体',
      rationale: 'resume 会重开 verify_sources+build_evidence，把未核验来源补入证据基础',
      wouldChange: wouldChangeOf('新核验的主张可能新增支持或反证绑定', 'Newly verified claims may add supporting or counter bindings').wouldChange,
      expectedDiscrimination: 'medium', feasibility: 'high', costClass: 'low',
      actionable: true, actionHint: { kind: 'resume' },
      en: {
        objective: 'Verify the unverified sources (counter-search/seed literature that arrived after completion)',
        knowledgeGap: 'The corpus contains unverified sources whose claims are not yet part of the evidence body',
        rationale: 'Resume reopens verify_sources+build_evidence, folding the unverified sources into the evidence base',
        wouldChange: wouldChangeOf('', 'Newly verified claims may add supporting or counter bindings').en.wouldChange,
      },
    }));
  }

  if (state.kind === 'insufficient') {
    actions.push(mk('DECLARE_INSUFFICIENT_EVIDENCE', {
      objective: '以「证据不足」作为本研究的当前正式结论',
      knowledgeGap: `证据形状：${state.evidenceShape.claims} 条主张 / ${state.evidenceShape.verified} 条已核验 / ${state.evidenceShape.supportingRelations} 条支持关系`,
      rationale: '无活跃假设或无可绑定证据——继续调用的边际科学价值低于补齐证据基础',
      wouldChange: '不改变认识——它是当前的诚实结论',
      expectedDiscrimination: 'low', feasibility: 'high', costClass: 'low',
      en: {
        objective: 'Adopt "insufficient evidence" as the study\'s current formal conclusion',
        knowledgeGap: `Evidence shape: ${state.evidenceShape.claims} claims / ${state.evidenceShape.verified} verified / ${state.evidenceShape.supportingRelations} supporting relations`,
        rationale: 'No active hypotheses or no bindable evidence — the marginal scientific value of more calls is below that of repairing the evidence base',
        wouldChange: 'Changes nothing — it is the honest current conclusion',
      },
    }));
    actions.push(mk('EXTEND_LITERATURE', {
      objective: '扩展检索以建立可形成假设的证据基础',
      knowledgeGap: '当前证据体不足以支撑任何候选解释',
      rationale: '证据形状显示绑定稀疏；先补文献再生成假设，避免无据假设',
      wouldChange: wouldChangeOf('新的可绑定主张将使假设生成有据可依', 'New bindable claims will give hypothesis generation something to stand on').wouldChange,
      expectedDiscrimination: 'medium', feasibility: 'high', costClass: 'low',
      en: {
        objective: 'Extend retrieval to build an evidence base that hypotheses can form from',
        knowledgeGap: 'The current evidence body cannot support any candidate explanation',
        rationale: 'The evidence shape shows sparse binding; replenish literature before generating hypotheses — no evidence-free hypotheses',
        wouldChange: wouldChangeOf('', 'New bindable claims will give hypothesis generation something to stand on').en.wouldChange,
      },
    }));
    return actions;
  }

  // -- evidence_backed: discrimination-driven science actions --
  // Grading seam: when the ACH analysis ranked the strongest counter among its
  // top-diagnosticity claims, adjudicating it is graded high — the projection
  // never invents numbers, it only consumes the deterministic ACH ordering.
  const achRankOf = (claimId: ClaimId): number => achTopClaimIds.indexOf(claimId);
  const scienceActions: NextResearchAction[] = [];
  if (state.strongestCounter === null && state.counters.searchedAndFoundNone === null) {
    scienceActions.push(mk('COUNTER_EVIDENCE_SEARCH', {
      objective: '对当前领先解释执行结构性反证检索',
      knowledgeGap: '领先解释尚无任何反证绑定，且无已记录的反证检索——它未被对抗性检验过',
      rationale: '没有反证暴露的解释其稳健性未知；反证检索是区分“确实强”与“未受检验”的唯一手段',
      wouldChange: wouldChangeOf('若检索到高质量反证，领先解释的排序与置信将下调', 'If high-quality counter-evidence is found, the leading explanation\'s rank and confidence drop').wouldChange,
      expectedDiscrimination: 'high', feasibility: 'high', costClass: 'low',
      targets: leaderId !== null ? { hypothesisIds: [leaderId], claimIds: [] } : undefined,
      en: {
        objective: 'Run a structured counter-evidence search against the current leading explanation',
        knowledgeGap: 'The leading explanation has no counter binding and no recorded counter-search — it has never been adversarially tested',
        rationale: 'An explanation with no counter-evidence exposure has unknown robustness; a counter-search is the only way to tell "genuinely strong" from "untested"',
        wouldChange: wouldChangeOf('', 'If high-quality counter-evidence is found, the leading explanation\'s rank and confidence drop').en.wouldChange,
      },
    }));
  }
  const obs = state.discriminatingObservations[0] ?? null;
  if (obs !== null) {
    scienceActions.push(mk('DISCRIMINATING_ANALYSIS', {
      objective: '测量能区分前两名假设的判别性观察',
      knowledgeGap: '前两名假设的证伪条件指向不同观察量——现有证据无法区分它们',
      rationale: `判别观察：${obs.observable}。获得该观察的数据最可能改变当前排序`,
      wouldChange: `观察结果将落在两个假设的不同预期上（${obs.expects.filter((e) => e.length > 0).join(' / ')}），直接裁决其一`,
      expectedDiscrimination: 'high', feasibility: 'medium', costClass: 'medium',
      targets: { hypothesisIds: obs.betweenHypothesisIds, claimIds: [] },
      en: {
        objective: 'Measure the discriminating observation that separates the top two hypotheses',
        knowledgeGap: 'The top two hypotheses\' falsifiers point at different observables — current evidence cannot separate them',
        rationale: `Discriminating observation: ${obs.observable}. Obtaining data for it is the most likely way to change the current ranking`,
        wouldChange: `The observation will land on the two hypotheses' differing expectations (${obs.expects.filter((e) => e.length > 0).join(' / ')}), directly adjudicating one of them`,
      },
    }));
  }
  const publicDataset = planDatasets.find((d) => d.availability === 'public');
  if (publicDataset !== undefined && leaderId !== null) {
    scienceActions.push(mk('ADD_DISCRIMINATING_DATA', {
      objective: `引入公开数据集 ${publicDataset.name} 检验领先假设`,
      knowledgeGap: '假设可检验但缺少已到位的数据',
      rationale: '计划已声明公开可用数据——这是成本最低的真实检验路径',
      wouldChange: wouldChangeOf('数据结果将直接对照领先假设的证伪条件', 'The data results will be compared directly against the leading hypothesis\'s falsifier').wouldChange,
      expectedDiscrimination: 'medium', feasibility: 'medium', costClass: 'medium',
      targets: { hypothesisIds: [leaderId], claimIds: [] },
      en: {
        objective: `Bring in the public dataset ${publicDataset.name} to test the leading hypothesis`,
        knowledgeGap: 'The hypothesis is testable but the data is not yet in place',
        rationale: 'The plan already declared publicly available data — the lowest-cost path to a real test',
        wouldChange: wouldChangeOf('', 'The data results will be compared directly against the leading hypothesis\'s falsifier').en.wouldChange,
      },
    }));
  }
  if (state.strongestCounter !== null) {
    const rank = achRankOf(state.strongestCounter.claimId);
    scienceActions.push(mk('RESEARCHER_REVIEW_COUNTERS', {
      objective: '研究者裁决未消解的反证',
      knowledgeGap: '领先解释存在未消解的反证绑定',
      rationale: `最强反证（${state.strongestCounter.text.slice(0, 120)}…）需要研究者判断：适用范围、可比性或排除理由` +
        (rank >= 0 ? `；ACH 判别力排名第 ${rank + 1}——它本身就是区分竞争假设的关键证据` : ''),
      wouldChange: wouldChangeOf('反证的接受/排除将直接改变领先解释的排序依据', 'Accepting/excluding the counter directly changes the basis of the leading explanation\'s ranking').wouldChange,
      expectedDiscrimination: rank >= 0 ? 'high' : 'medium', feasibility: 'high', costClass: 'low',
      researcherDecisionRequired: true,
      targets: { hypothesisIds: [], claimIds: [state.strongestCounter.claimId] },
      en: {
        objective: 'Researcher adjudicates the unresolved counter-evidence',
        knowledgeGap: 'The leading explanation carries unresolved counter bindings',
        rationale: `The strongest counter (${state.strongestCounter.text.slice(0, 120)}…) needs a researcher judgment: scope of applicability, comparability, or grounds for exclusion` +
          (rank >= 0 ? `; ACH diagnosticity rank #${rank + 1} — it is itself key evidence for separating the competing hypotheses` : ''),
        wouldChange: wouldChangeOf('', 'Accepting/excluding the counter directly changes the basis of the leading explanation\'s ranking').en.wouldChange,
      },
    }));
  }
  // Information-gain ordering (P1.4, 2026-08-28): expected discrimination desc,
  // then cost asc — replaces the fixed append order so the FIRST science action
  // is the highest expected discrimination per unit cost, derived not asserted.
  const DISCRIM_RANK: Record<NextResearchAction['expectedDiscrimination'], number> = { high: 0, medium: 1, low: 2 };
  const COST_RANK: Record<NextResearchAction['costClass'], number> = { low: 0, medium: 1, high: 2 };
  scienceActions.sort((x, y) => {
    const d = DISCRIM_RANK[x.expectedDiscrimination] - DISCRIM_RANK[y.expectedDiscrimination];
    if (d !== 0) return d;
    const c = COST_RANK[x.costClass] - COST_RANK[y.costClass];
    if (c !== 0) return c;
    return x.id < y.id ? -1 : 1; // stable: creation order (deterministic ids)
  });
  actions.push(...scienceActions);
  return actions.slice(0, 4);
}
