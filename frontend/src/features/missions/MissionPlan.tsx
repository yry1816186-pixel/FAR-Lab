import { useState, type FormEvent } from 'react';

import type { FeedbackRequest, ResearchPlanDto, ResearchRunDto, RevisionDto } from '@/entities/dtos.ts';
import { useResearchFeedback } from '@/shared/api/endpoints.ts';
import { formatDateTime } from '@/shared/format.ts';
import { useI18n, useT } from '@/shared/i18n/index.tsx';
import { Button } from '@/shared/ui/Button.tsx';
import { HashValue } from '@/shared/ui/HashValue.tsx';
import { EmptyBlock, ErrorBlock, Section } from '@/shared/ui/StateBlock.tsx';
import { RunGate } from './RunGate.tsx';

function ListField({ label, items }: { readonly label: string; readonly items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="py-2">
      <p className="label-micro mb-1">{label}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-ink2">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function TextField({ label, text }: { readonly label: string; readonly text: string }) {
  if (text.trim().length === 0) return null;
  return (
    <div className="py-2">
      <p className="label-micro mb-1">{label}</p>
      <p className="text-sm text-ink2">{text}</p>
    </div>
  );
}

function PlanBody({ plan }: { readonly plan: ResearchPlanDto }) {
  const t = useT();
  return (
    <div className="grid gap-x-8 lg:grid-cols-2">
      <div className="divide-y divide-border">
        <ListField label={t('mission.plan.objectives')} items={plan.objectives} />
        <div className="py-2">
          <p className="label-micro mb-1">{t('mission.plan.primary')}</p>
          <HashValue value={plan.primaryHypothesisId} />
        </div>
        {plan.alternativeHypothesisIds.length > 0 ? (
          <div className="py-2">
            <p className="label-micro mb-1">{t('mission.plan.alternatives')}</p>
            <div className="space-y-1">
              {plan.alternativeHypothesisIds.map((id) => (
                <HashValue key={id} value={id} className="block" />
              ))}
            </div>
          </div>
        ) : null}
        <ListField label={t('mission.plan.preregistered')} items={plan.preregisteredPredictions} />
        <ListField label={t('mission.plan.dataRequirements')} items={plan.dataRequirements} />
        <ListField label={t('mission.plan.inclusion')} items={plan.inclusionExclusionCriteria} />
        <ListField label={t('mission.plan.variables')} items={plan.variables} />
        <TextField label={t('mission.plan.design')} text={plan.design} />
        <ListField label={t('mission.plan.analysisDag')} items={plan.analysisDag} />
        <ListField label={t('mission.plan.tools')} items={plan.tools} />
      </div>
      <div className="divide-y divide-border">
        <ListField label={t('mission.plan.stats')} items={plan.statisticalMethods} />
        <TextField label={t('mission.plan.sampleSize')} text={plan.sampleSizeRationale} />
        <TextField label={t('mission.plan.multiplicity')} text={plan.multiplicityHandling} />
        <TextField label={t('mission.plan.missingOutlier')} text={plan.missingOutlierStrategy} />
        <ListField label={t('mission.plan.stopping')} items={plan.stoppingConditions} />
        <ListField label={t('mission.plan.checkpoints')} items={plan.checkpoints} />
        <TextField label={t('mission.plan.budget')} text={plan.budget} />
        <ListField label={t('mission.plan.risks')} items={plan.risks} />
        <ListField label={t('mission.plan.reproducibility')} items={plan.reproducibility} />
        <ListField label={t('mission.plan.nextRound')} items={plan.nextRoundDecisionRules} />
        <ListField label={t('mission.plan.humanApproval')} items={plan.humanApprovalRequired} />
      </div>
    </div>
  );
}

function RevisionCard({ revision }: { readonly revision: RevisionDto }) {
  const t = useT();
  const { locale } = useI18n();
  return (
    <article className="rounded border border-border px-4 py-3" aria-label={t('mission.plan.revisionN', { n: revision.number })}>
      <header className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{t('mission.plan.revisionN', { n: revision.number })}</span>
        <HashValue value={revision.id} />
        <time className="ml-auto font-mono text-xs text-ink3" dateTime={revision.createdAt}>
          {formatDateTime(revision.createdAt, locale)}
        </time>
      </header>
      <blockquote className="mt-2 border-l-2 border-borderStrong pl-3 text-sm text-ink2">
        {revision.feedback.text}
        <footer className="mt-1 text-xs text-ink3">
          {revision.feedback.actor} · {revision.feedback.source}
        </footer>
      </blockquote>
      {revision.planChanges.length > 0 ? (
        <div className="mt-2">
          <p className="label-micro mb-1">{t('mission.plan.planChanges')}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink2">
            {revision.planChanges.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {revision.unresolvedConflicts.length > 0 ? (
        <div className="mt-2">
          <p className="label-micro mb-1">{t('mission.plan.unresolved')}</p>
          <ul className="space-y-1 text-sm text-warn">
            {revision.unresolvedConflicts.map((conflict) => (
              <li key={conflict}>{conflict}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function FeedbackForm({ runId, disabled }: { readonly runId: string; readonly disabled: boolean }) {
  const t = useT();
  const feedback = useResearchFeedback(runId);
  const [text, setText] = useState('');
  const [actor, setActor] = useState('reviewer');
  const [source, setSource] = useState<FeedbackRequest['source']>('human');

  const onSubmit = (evt: FormEvent<HTMLFormElement>): void => {
    evt.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0 || feedback.isPending) return;
    feedback.mutate({ source, actor: actor.trim() || 'reviewer', text: trimmed }, { onSuccess: () => setText('') });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-label={t('mission.plan.feedback.title')}>
      <div>
        <label htmlFor="feedback-text" className="label-micro mb-1 block">
          {t('mission.plan.feedback.text')}
        </label>
        <textarea
          id="feedback-text"
          value={text}
          onChange={(evt) => setText(evt.target.value)}
          rows={3}
          maxLength={4000}
          required
          disabled={disabled}
          className="w-full rounded border border-borderStrong bg-surface px-3 py-2 text-sm text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor="feedback-actor" className="label-micro mb-1 block">
            {t('mission.plan.feedback.actor')}
          </label>
          <input
            id="feedback-actor"
            value={actor}
            onChange={(evt) => setActor(evt.target.value)}
            maxLength={64}
            disabled={disabled}
            className="rounded border border-borderStrong bg-surface px-3 py-2 text-sm text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
          />
        </div>
        <div>
          <label htmlFor="feedback-source" className="label-micro mb-1 block">
            {t('mission.plan.feedback.source')}
          </label>
          <select
            id="feedback-source"
            value={source}
            onChange={(evt) => setSource(evt.target.value as FeedbackRequest['source'])}
            disabled={disabled}
            className="rounded border border-borderStrong bg-surface px-3 py-2 text-sm text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
          >
            <option value="human">human</option>
            <option value="literature">literature</option>
            <option value="tool">tool</option>
            <option value="analysis">analysis</option>
          </select>
        </div>
      </div>
      {disabled ? <p className="text-xs text-ink3">{t('mission.plan.feedback.needsCompleted')}</p> : null}
      {feedback.isError ? <ErrorBlock error={feedback.error} testId="feedback-error" /> : null}
      {feedback.isSuccess ? (
        <p role="status" className="text-sm text-ok" data-testid="feedback-success">
          {t('mission.plan.feedback.done', { id: feedback.data.revision.id.slice(0, 12) })}
        </p>
      ) : null}
      <Button type="submit" disabled={disabled || text.trim().length === 0 || feedback.isPending}>
        {feedback.isPending ? t('mission.plan.feedback.submitting') : t('mission.plan.feedback.submit')}
      </Button>
    </form>
  );
}

/** Plan view: the structured plan, immutable revisions, and the feedback form. */
export function MissionPlan({
  runId,
  run,
  runPending,
  runNotCompleted,
}: {
  readonly runId: string;
  readonly run: ResearchRunDto | null;
  readonly runPending: boolean;
  readonly runNotCompleted: boolean;
}) {
  const t = useT();
  return (
    <RunGate run={run} runPending={runPending} runNotCompleted={runNotCompleted}>
      {(frozen) => (
        <div data-testid="mission-plan">
          <Section title={t('mission.plan.title')}>
            <PlanBody plan={frozen.plan} />
          </Section>

          <Section title={`${t('mission.plan.revisions')} (${String(frozen.revisions.length)})`}>
            {frozen.revisions.length === 0 ? (
              <EmptyBlock title={t('mission.plan.noRevisions')} />
            ) : (
              <div className="space-y-4">
                {frozen.revisions.map((revision) => (
                  <RevisionCard key={revision.id} revision={revision} />
                ))}
              </div>
            )}
          </Section>

          <Section title={t('mission.plan.feedback.title')}>
            <FeedbackForm runId={runId} disabled={runNotCompleted} />
          </Section>
        </div>
      )}
    </RunGate>
  );
}
