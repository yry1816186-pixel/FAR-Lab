import { useI18n } from '../../../i18n/LanguageContext';
import type { ResearchPlan } from '../../../api/types';
import { parseBudget } from '../../../viz/plan-viz';

/**
 * Budget summary (VIZ V2): one proportional-ink bar of the steps' parsed
 * dollar costs + the verbatim texts. Only a leading $-amount parses; every
 * other cost string renders as text below — no unit guessing, no invented
 * totals (a total is shown only when EVERY costed step parsed).
 */
const SEGMENT_INKS = ['rgba(45,120,189,0.55)', 'rgba(45,120,189,0.4)', 'rgba(45,120,189,0.3)', 'rgba(45,120,189,0.22)', 'rgba(45,120,189,0.16)'];

export function PlanBudget({ plan }: { plan: ResearchPlan }): JSX.Element | null {
  const { t } = useI18n();
  const budget = parseBudget(plan.steps);
  if (budget.segments.length === 0 && budget.unparsed.length === 0) return null;

  return (
    <div className="plan-budget">
      {budget.segments.length > 0 && (
        <>
          <div
            className="plan-budget-bar"
            role="img"
            aria-label={budget.segments
              .map((s) => `${s.stepIndex}. ${s.title}: $${s.usd.toLocaleString('en-US')}`)
              .join('；')}
          >
            {budget.segments.map((s, i) => (
              <span
                key={s.stepId}
                className="plan-budget-seg"
                style={{ width: `${(s.usd / budget.totalUsd) * 100}%`, background: SEGMENT_INKS[i % SEGMENT_INKS.length] }}
                title={`${s.stepIndex}. ${s.title} — $${s.usd.toLocaleString('en-US')}（${s.raw}）`}
              />
            ))}
          </div>
          <p className="muted small">
            {t('plan.budgetTotal', { total: budget.totalUsd.toLocaleString('en-US'), n: budget.segments.length })}
            {budget.unparsed.length > 0 && ` · ${t('plan.budgetUnparsedCount', { n: budget.unparsed.length })}`}
          </p>
        </>
      )}
      {budget.unparsed.map((s) => (
        <p key={s.stepId} className="muted small mono">
          {s.stepIndex}. {s.title} — {s.raw}
        </p>
      ))}
    </div>
  );
}
