import { useCallback } from 'react';
import { isNotFound } from '../../api/client';
import { getHypotheses } from '../../api/endpoints';
import type { HypothesisCandidate, HypothesisScorecard, ResearchRun } from '../../api/types';
import { useResource } from '../../hooks/useResource';
import { useI18n } from '../../i18n/LanguageContext';
import { EmptyState, ErrorBox, Section, Skeleton } from '../common';
import { HypothesisCard } from './HypothesisCard';
import { ScorecardsTable } from './ScorecardsTable';

export function HypothesesTab({ run }: { run: ResearchRun }): JSX.Element {
  const { t } = useI18n();
  const fetcher = useCallback((signal: AbortSignal) => getHypotheses(run.id, signal), [run.id]);
  const res = useResource(fetcher, [run.id], `${run.updatedAt}:${run.status}`);

  return (
    <div className="tab-content">
      {res.loading ? (
        <Skeleton lines={6} />
      ) : res.error !== null && isNotFound(res.error) ? (
        <EmptyState titleKey="hyp.empty" hint={t('hyp.emptyHint', { stage: t(`stage.${run.currentStage}` as never) })} />
      ) : res.error !== null ? (
        <ErrorBox error={res.error} onRetry={res.retry} />
      ) : res.data === null ? null : (
        <>
          <Section title={t('scorecards.title')}>
            <ScorecardsTable scorecards={res.data.scorecards} />
          </Section>
          <Section
            title={res.data.scorecards.length > 0 ? t('hyp.representatives', { n: representativesOf(res.data).length }) : t('tab.hypotheses')}
            count={res.data.scorecards.length === 0 ? <span className="muted small">{t('hyp.notRanked')}</span> : undefined}
          >
            <HypothesisList data={res.data} />
          </Section>
        </>
      )}
    </div>
  );
}

interface HypoData {
  hypotheses: HypothesisCandidate[];
  scorecards: HypothesisScorecard[];
}

function representativesOf(data: HypoData): HypothesisCandidate[] {
  const byId = new Map(data.hypotheses.map((h) => [h.id, h] as const));
  const reps = data.scorecards
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((s) => byId.get(s.hypothesisId))
    .filter((h): h is HypothesisCandidate => h !== undefined);
  if (reps.length > 0) return reps;
  return data.hypotheses; // no scorecards yet: all candidates, honestly labeled as unranked
}

function HypothesisList({ data }: { data: HypoData }): JSX.Element {
  const { t } = useI18n();
  const { hypotheses } = data;
  if (hypotheses.length === 0) {
    return <EmptyState titleKey="hyp.empty" />;
  }
  const reps = representativesOf(data);
  const repIds = new Set(reps.map((h) => h.id));
  const extras = hypotheses.filter((h) => !repIds.has(h.id));
  const clusterCounts = new Map<string, number>();
  for (const h of hypotheses) {
    const key = h.clusterKey ?? h.id;
    clusterCounts.set(key, (clusterCounts.get(key) ?? 0) + 1);
  }

  return (
    <div>
      {reps.map((h) => (
        <HypothesisCard
          key={h.id}
          hypothesis={h}
          clusterSize={clusterCounts.get(h.clusterKey ?? h.id) ?? 1}
          isRepresentative
        />
      ))}
      {extras.length > 0 && (
        <p className="muted small">{t('hyp.others', { n: extras.length })}</p>
      )}
    </div>
  );
}
