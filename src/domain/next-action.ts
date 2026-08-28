import { z } from 'zod';
import { ClaimId, HypothesisId, RunId } from './ids.js';
import type { ScientificState } from './scientific-state.js';

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
    kind: 'no_plan' | 'unexecuted' | 'plan_revised_since_experiment' | 'current';
    executabilityPassed: boolean;
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
  const wouldChangeOf = (fallback: string): string => leaderFalsifier ?? fallback;

  // -- Truth gates first: template content and insufficient states are CONCLUSIONS, not config problems --
  if (state.kind === 'template') {
    actions.push(mk('RERUN_WITH_LIVE_ROUTE', {
      objective: '用真实模型路线重新运行本研究，替换离线模板产物',
      knowledgeGap: '当前假设/范围由离线确定性模板生成，不含真实科学推理',
      rationale: `检测到模板标记：${state.templateEvidence.join('；')}。模板内容不构成科学判断，重跑是唯一获得真实假设的路径`,
      wouldChange: wouldChangeOf('真实路线将生成基于所检索文献的可证伪假设，当前“证据不足”结论将被真实排序替换'),
      expectedDiscrimination: 'high', feasibility: 'high', costClass: 'medium',
      researcherDecisionRequired: true, // costs model calls — researcher approves
      actionable: true, actionHint: { kind: 'rerun-live' },
    }));
    actions.push(mk('DECLARE_INSUFFICIENT_EVIDENCE', {
      objective: '以「证据不足」作为本研究的当前正式结论',
      knowledgeGap: '无可用的科学假设',
      rationale: '科学上诚实的状态：模板产物不承载证据权重，任何“当前判断”都不成立',
      wouldChange: '不改变认识——它防止把模板当作结论',
      expectedDiscrimination: 'low', feasibility: 'high', costClass: 'low',
    }));
    return actions;
  }

  // -- Loop-unblocking actions (resume genuinely reopens these legs) --
  if (unconsumedFeedbackCount > 0) {
    actions.push(mk('CONSUME_FEEDBACK_INTO_REVISION', {
      objective: `吸收 ${unconsumedFeedbackCount} 条未消费反馈，形成因果修订`,
      knowledgeGap: '新信息已进入研究但尚未改变任何假设/计划',
      rationale: '反馈信号会触发 feedback→revise→export 重开：修订将解释哪些主张/假设因它改变',
      wouldChange: wouldChangeOf('修订将按因果链更新受影响的假设与排序，并记录 before/after'),
      expectedDiscrimination: 'high', feasibility: 'high', costClass: 'low',
      actionable: true, actionHint: { kind: 'resume' },
    }));
  }
  if ((leg.kind === 'unexecuted' || leg.kind === 'plan_revised_since_experiment') && leg.executabilityPassed) {
    actions.push(mk('EXECUTE_PLANNED_EXPERIMENT', {
      objective: '执行研究计划中已具备可执行条件的实验（本地确定性执行器）',
      knowledgeGap: '计划通过了确定性可执行性检查，但尚无完成的实验对其裁决',
      rationale: leg.kind === 'plan_revised_since_experiment'
        ? '计划在上一实验后被因果修订（重新冻结）——新注册值得一次新实验'
        : '计划可执行但从未执行——证伪闭环缺最后一环',
      wouldChange: wouldChangeOf('实验裁决（支持/削弱/证伪/不确定）将直接作用于领先假设的证伪条件'),
      expectedDiscrimination: 'high', feasibility: 'high', costClass: 'medium',
      targets: leaderId !== null ? { hypothesisIds: [leaderId], claimIds: [] } : undefined,
      actionable: true, actionHint: { kind: 'resume' },
    }));
  }
  if (hasEvidenceDebt) {
    actions.push(mk('RESUME_EVIDENCE_DEBT', {
      objective: '补验未核验的来源（反证检索/种子文献在完成后到达）',
      knowledgeGap: '语料中存在未核验来源，其主张未进入证据体',
      rationale: 'resume 会重开 verify_sources+build_evidence，把未核验来源补入证据基础',
      wouldChange: wouldChangeOf('新核验的主张可能新增支持或反证绑定'),
      expectedDiscrimination: 'medium', feasibility: 'high', costClass: 'low',
      actionable: true, actionHint: { kind: 'resume' },
    }));
  }

  if (state.kind === 'insufficient') {
    actions.push(mk('DECLARE_INSUFFICIENT_EVIDENCE', {
      objective: '以「证据不足」作为本研究的当前正式结论',
      knowledgeGap: `证据形状：${state.evidenceShape.claims} 条主张 / ${state.evidenceShape.verified} 条已核验 / ${state.evidenceShape.supportingRelations} 条支持关系`,
      rationale: '无活跃假设或无可绑定证据——继续调用的边际科学价值低于补齐证据基础',
      wouldChange: '不改变认识——它是当前的诚实结论',
      expectedDiscrimination: 'low', feasibility: 'high', costClass: 'low',
    }));
    actions.push(mk('EXTEND_LITERATURE', {
      objective: '扩展检索以建立可形成假设的证据基础',
      knowledgeGap: '当前证据体不足以支撑任何候选解释',
      rationale: '证据形状显示绑定稀疏；先补文献再生成假设，避免无据假设',
      wouldChange: wouldChangeOf('新的可绑定主张将使假设生成有据可依'),
      expectedDiscrimination: 'medium', feasibility: 'high', costClass: 'low',
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
      wouldChange: wouldChangeOf('若检索到高质量反证，领先解释的排序与置信将下调'),
      expectedDiscrimination: 'high', feasibility: 'high', costClass: 'low',
      targets: leaderId !== null ? { hypothesisIds: [leaderId], claimIds: [] } : undefined,
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
    }));
  }
  const publicDataset = planDatasets.find((d) => d.availability === 'public');
  if (publicDataset !== undefined && leaderId !== null) {
    scienceActions.push(mk('ADD_DISCRIMINATING_DATA', {
      objective: `引入公开数据集 ${publicDataset.name} 检验领先假设`,
      knowledgeGap: '假设可检验但缺少已到位的数据',
      rationale: '计划已声明公开可用数据——这是成本最低的真实检验路径',
      wouldChange: wouldChangeOf('数据结果将直接对照领先假设的证伪条件'),
      expectedDiscrimination: 'medium', feasibility: 'medium', costClass: 'medium',
      targets: { hypothesisIds: [leaderId], claimIds: [] },
    }));
  }
  if (state.strongestCounter !== null) {
    const rank = achRankOf(state.strongestCounter.claimId);
    scienceActions.push(mk('RESEARCHER_REVIEW_COUNTERS', {
      objective: '研究者裁决未消解的反证',
      knowledgeGap: '领先解释存在未消解的反证绑定',
      rationale: `最强反证（${state.strongestCounter.text.slice(0, 120)}…）需要研究者判断：适用范围、可比性或排除理由` +
        (rank >= 0 ? `；ACH 判别力排名第 ${rank + 1}——它本身就是区分竞争假设的关键证据` : ''),
      wouldChange: wouldChangeOf('反证的接受/排除将直接改变领先解释的排序依据'),
      expectedDiscrimination: rank >= 0 ? 'high' : 'medium', feasibility: 'high', costClass: 'low',
      researcherDecisionRequired: true,
      targets: { hypothesisIds: [], claimIds: [state.strongestCounter.claimId] },
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
