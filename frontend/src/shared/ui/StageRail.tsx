import { RESEARCH_STAGE_IDS } from '@/entities/run.ts';
import { useT, type MessageKey } from '@/shared/i18n/index.tsx';
import { cx } from './cx.ts';

const STAGE_LABEL_KEY: Readonly<Record<(typeof RESEARCH_STAGE_IDS)[number], MessageKey>> = {
  researchability_gate: 'stage.researchability_gate',
  grounding: 'stage.grounding',
  hypothesis_generation: 'stage.hypothesis_generation',
  citation_binding: 'stage.citation_binding',
  falsifiability_gate: 'stage.falsifiability_gate',
  critique: 'stage.critique',
  scoring: 'stage.scoring',
  plan: 'stage.plan',
};

/**
 * Pipeline stage rail: the 8 checkpoint stages in execution order, each
 * marked done / current / pending with text + shape + tone (triple channel).
 * No fake percentages: a stage is either durably completed or not.
 */
export function StageRail({
  completedStages,
  failed,
  className,
}: {
  readonly completedStages: readonly string[];
  readonly failed?: boolean;
  readonly className?: string;
}) {
  const t = useT();
  const done = new Set(completedStages);
  const firstPending = RESEARCH_STAGE_IDS.find((id) => !done.has(id));

  return (
    <ol className={cx('space-y-0', className)} aria-label={t('stage.progress', { done: completedStages.length, total: RESEARCH_STAGE_IDS.length })}>
      {RESEARCH_STAGE_IDS.map((stageId, i) => {
        const isDone = done.has(stageId);
        const isCurrent = !isDone && stageId === firstPending && failed !== true;
        return (
          <li key={stageId} className="relative flex items-start gap-3 pb-4 last:pb-0">
            {i < RESEARCH_STAGE_IDS.length - 1 ? (
              <span aria-hidden="true" className={cx('absolute left-[7px] top-5 h-full w-px', isDone ? 'bg-ok/50' : 'bg-border')} />
            ) : null}
            <span
              aria-hidden="true"
              className={cx(
                'mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
                isDone && 'border-ok bg-ok',
                isCurrent && 'border-accent',
                !isDone && !isCurrent && 'border-borderStrong bg-surface',
              )}
            >
              {isDone ? (
                <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                  <path d="m1.5 4 2 2 3-3.5" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinecap="round" />
                </svg>
              ) : null}
              {isCurrent ? <span className="h-1.5 w-1.5 rounded-full bg-accent" /> : null}
            </span>
            <div className="min-w-0">
              <span className={cx('text-sm', isDone ? 'text-ink' : isCurrent ? 'font-medium text-ink' : 'text-ink3')}>
                {t(STAGE_LABEL_KEY[stageId])}
              </span>
              <span className="ml-2 font-mono text-xs text-ink3">{stageId}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
