import { useCallback } from 'react';
import { isNotFound } from '../../api/client';
import { getPlan } from '../../api/endpoints';
import type { ResearchPlan, ResearchRun } from '../../api/types';
import { useResource } from '../../hooks/useResource';
import { useI18n } from '../../i18n/LanguageContext';
import { Badge, EmptyState, ErrorBox, FieldList, Section, Skeleton } from '../common';
import { ResearchActions } from './ResearchActions';
import { stageKey, availabilityKey, stepKindKey } from '../../i18n/keys';
import type { DictKey } from '../../i18n/dict';

/** Human hint per POPPER policy (domain enum single_primary|alpha_spending|e_value_accumulation). */
function policyHint(policy: string): DictKey | null {
  if (policy === 'single_primary') return 'plan.policy.single_primary';
  if (policy === 'alpha_spending') return 'plan.policy.alpha_spending';
  if (policy === 'e_value_accumulation') return 'plan.policy.e_value_accumulation';
  return null;
}

export function PlanTab({
  run,
  onFeedback,
}: {
  run: ResearchRun;
  onFeedback: (target?: { kind: string; id: string; label?: string; content?: string }) => void;
}): JSX.Element {
  const { t } = useI18n();
  const fetcher = useCallback((signal: AbortSignal) => getPlan(run.id, signal), [run.id]);
  const res = useResource(fetcher, [run.id], `${run.updatedAt}:${run.status}`);

  return (
    <div className="tab-content">
      {res.loading ? (
        <Skeleton lines={6} />
      ) : res.error !== null && isNotFound(res.error) ? (
        <EmptyState titleKey="plan.none" hint={t('plan.noneHint', { stage: t(stageKey(run.currentStage)) })} />
      ) : res.error !== null ? (
        <ErrorBox error={res.error} onRetry={res.retry} />
      ) : res.data !== null ? (
        <PlanView
          plan={res.data}
          onChallenge={() => onFeedback({ kind: 'plan', id: res.data!.id, label: res.data!.objective })}
          aiActions={
            <ResearchActions
              runId={run.id}
              targetType="plan"
              targetId={res.data.id}
              targetLabel={res.data.objective.length > 60 ? `${res.data.objective.slice(0, 60)}…` : res.data.objective}
              onOpenClaim={() => {/* plans cite claims across tabs; navigation lands on evidence tab via URL */}}
              onToFeedback={(content) => onFeedback({ kind: 'plan', id: res.data!.id, label: res.data!.objective, content })}
            />
          }
        />
      ) : (
        <EmptyState titleKey="plan.none" hint={t('plan.noneHint', { stage: t(stageKey(run.currentStage)) })} />
      )}
    </div>
  );
}

function PlanView({ plan, onChallenge, aiActions }: { plan: ResearchPlan; onChallenge: () => void; aiActions?: React.ReactNode }): JSX.Element {
  const { t } = useI18n();
  const orNone = (items: string[] | undefined): JSX.Element | string =>
    items !== undefined && items.length > 0 ? items.join('；') : <span className="muted">{t('common.none')}</span>;

  const stepIds = new Set(plan.steps.map((s) => s.id));
  /** Render-layer defense: `task_` ids not present in steps are fabrication artifacts — flag, never render as valid. */
  const renderRef = (ref: string): JSX.Element | string =>
    ref.startsWith('task_') && !stepIds.has(ref)
      ? <span className="text-warn" title={ref}>{t('plan.invalidRef', { ref })}</span>
      : ref;

  const check = plan.executabilityCheck;

  return (
    <div>
      <Section
        title={t('plan.objective')}
        actions={
          <>
            <button type="button" className="btn btn--small" onClick={onChallenge} title={t('compare.challengePlanHint')}>
              {t('compare.challengePlan')}
            </button>
            {aiActions}
          </>
        }
      >
        <p className="plan-objective">{plan.objective}</p>
        <FieldList
          items={[
            { key: t('plan.hypotheses'), value: <span className="mono">{plan.hypothesisIds.join('；')}</span> },
            {
              key: t('plan.execCheck'),
              value: check === undefined ? <Badge tone="muted">{t('executability.unchecked')}</Badge> : check.passed ? <Badge tone="ok">{t('executability.passed')}</Badge> : <Badge tone="err" title={(check.missing ?? []).join('；')}>{t('executability.failed')}</Badge>,
            },
            { key: t('overview.createdAt'), value: <span className="mono">{plan.createdAt}</span> },
          ]}
        />
        {check !== undefined && !check.passed && (check.missing ?? []).length > 0 && (
          <p className="callout callout--err small">{t('executability.missing', { items: (check.missing ?? []).join('；') })}</p>
        )}
      </Section>

      <Section title={t('plan.variables')}>
        <FieldList
          items={[
            { key: t('plan.variables'), value: orNone(plan.variables) },
            { key: t('plan.controls'), value: orNone(plan.controls) },
            { key: t('plan.inclusion'), value: orNone(plan.inclusionCriteria) },
            { key: t('plan.exclusion'), value: orNone(plan.exclusionCriteria) },
            { key: t('plan.metrics'), value: orNone(plan.metrics) },
            { key: t('plan.statistics'), value: orNone(plan.statistics) },
          ]}
        />
      </Section>

      {(plan.dataRequirements ?? []).length > 0 && (
        <Section title={t('plan.dataReq')}>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">{t('plan.dataReq')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('plan.dataReq.name')}</th>
                  <th scope="col">{t('plan.dataReq.availability')}</th>
                  <th scope="col">{t('plan.dataReq.sourceHint')}</th>
                  <th scope="col">{t('plan.dataReq.variables')}</th>
                </tr>
              </thead>
              <tbody>
                {(plan.dataRequirements ?? []).map((d) => (
                  <tr key={d.name}>
                    <th scope="row">{d.name}</th>
                    <td>{t(availabilityKey(d.availability))}</td>
                    <td>{d.sourceHint ?? <span className="muted">—</span>}</td>
                    <td>{d.variables.join('、')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {(plan.toolRequirements ?? []).length > 0 && (
        <Section title={t('plan.toolReq')}>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">{t('plan.toolReq')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('plan.toolReq.name')}</th>
                  <th scope="col">{t('plan.toolReq.kind')}</th>
                  <th scope="col">{t('plan.toolReq.purpose')}</th>
                </tr>
              </thead>
              <tbody>
                {(plan.toolRequirements ?? []).map((tool) => (
                  <tr key={tool.name}>
                    <th scope="row">{tool.name}</th>
                    <td className="mono">{tool.kind}</td>
                    <td>{tool.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title={t('plan.steps')}>
        <ol className="plan-steps">
          {plan.steps.map((step, i) => (
            <li key={step.id} className="plan-step">
              <div className="plan-step-head">
                <strong>{i + 1}. {step.title}</strong>
                <Badge tone="muted">{t(stepKindKey(step.kind))}</Badge>
                {step.estimatedCost !== undefined && <span className="muted small">{t('plan.steps.cost')}: {step.estimatedCost}</span>}
              </div>
              <p className="plan-step-method">{step.method}</p>
              <FieldList
                items={[
                  { key: t('plan.steps.inputs'), value: <span className="mono">{(step.inputs ?? []).map(renderRef).join('、') || <span className="muted">{t('common.none')}</span>}</span> },
                  { key: t('plan.steps.outputs'), value: <span className="mono">{(step.outputs ?? []).join('、') || <span className="muted">{t('common.none')}</span>}</span> },
                  { key: t('plan.steps.failure'), value: orNone(step.failureConditions) },
                  { key: t('plan.steps.dependsOn'), value: <span className="mono">{(step.dependsOn ?? []).map(renderRef).join('、') || <span className="muted">{t('common.none')}</span>}</span> },
                ]}
              />
            </li>
          ))}
        </ol>
      </Section>

      <Section title={t('plan.decisionRules')}>
        <FieldList
          items={[
            { key: t('plan.decisionRules.success'), value: plan.decisionRules.successCriterion },
            { key: t('plan.decisionRules.weakening'), value: plan.decisionRules.weakeningCriterion },
            { key: t('plan.decisionRules.falsification'), value: plan.decisionRules.falsificationCriterion },
            { key: t('plan.decisionRules.stop'), value: plan.decisionRules.stopCriterion },
          ]}
        />
        {/* POPPER discipline (D-025, S2b): how this plan guards against multiple-hypothesis
            false positives — mandatory whenever a plan discriminates several hypotheses. */}
        {(plan.multipleTestingPolicy !== undefined || (check?.statisticalDesignNote ?? '').length > 0) && (
          <div className="callout callout--info small stat-discipline">
            <strong>{t('plan.statDiscipline')}</strong>
            {plan.multipleTestingPolicy !== undefined && (
              <div>
                {t('plan.multipleTestingPolicy')}：<span className="mono">{plan.multipleTestingPolicy}</span>
                {policyHint(plan.multipleTestingPolicy) !== null && <span className="muted"> — {t(policyHint(plan.multipleTestingPolicy)!)}</span>}
              </div>
            )}
            {plan.multipleTestingNote !== undefined && plan.multipleTestingNote.length > 0 && (
              <div className="muted">{plan.multipleTestingNote}</div>
            )}
            {check?.statisticalDesignNote !== undefined && check.statisticalDesignNote.length > 0 && (
              <div className="muted">
                <strong>{t('plan.statDesignNote')}</strong>：{check.statisticalDesignNote}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Progressive disclosure (craft-spec-v2 §3): supplementary methodological
          details collapse by default; the core flow above stays scannable. */}
      <details className="section section--collapsible">
        <summary className="section-head section-head--summary">
          <span className="section-title">{t('plan.metaSection')}</span>
        </summary>
        <div className="section-body">
          <FieldList
            items={[
              { key: t('plan.confounders'), value: orNone(plan.confounders) },
              { key: t('plan.altExplanations'), value: orNone(plan.alternativeExplanations) },
              {
                key: t('plan.resources'),
                value: (
                  <span className="mono">
                    {t('plan.resources.compute')}={plan.resources?.compute ?? t('common.unspecified')}；{' '}
                    {t('plan.resources.cost')}={plan.resources?.cost ?? t('common.unspecified')}；{' '}
                    {t('plan.resources.time')}={plan.resources?.time ?? t('common.unspecified')}
                  </span>
                ),
              },
              { key: t('plan.risks'), value: orNone(plan.risks) },
              { key: t('plan.ethics'), value: orNone(plan.ethics) },
              { key: t('plan.prerequisites'), value: orNone(plan.prerequisites) },
              ...(plan.expectedInformationGain !== undefined ? [{ key: t('plan.expectedGain'), value: plan.expectedInformationGain }] : []),
              { key: t('plan.altBranches'), value: orNone(plan.alternativeBranches) },
              { key: t('plan.reproducibility'), value: orNone(plan.reproducibilityRequirements) },
              { key: t('plan.citedClaims'), value: <span className="mono">{(plan.evidenceClaimIds ?? []).join('；') || <span className="muted">{t('common.none')}</span>}</span> },
            ]}
          />
        </div>
      </details>
    </div>
  );
}
