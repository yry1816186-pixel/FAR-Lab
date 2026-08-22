import { useCallback } from 'react';
import { isNotFound } from '../../api/client';
import { getHypotheses } from '../../api/endpoints';
import type { HypothesisCandidate, HypothesisScorecard, HypothesisTournament, ResearchRun } from '../../api/types';
import { useResource } from '../../hooks/useResource';
import { useI18n } from '../../i18n/LanguageContext';
import { EmptyState, ErrorBox, Section, Skeleton } from '../common';
import { HypothesisCard } from './HypothesisCard';
import { ScorecardsTable } from './ScorecardsTable';
import { stageKey } from '../../i18n/keys';

export function HypothesesTab({ run }: { run: ResearchRun }): JSX.Element {
  const { t } = useI18n();
  const fetcher = useCallback((signal: AbortSignal) => getHypotheses(run.id, signal), [run.id]);
  const res = useResource(fetcher, [run.id], `${run.updatedAt}:${run.status}`);

  return (
    <div className="tab-content">
      {res.loading ? (
        <Skeleton lines={6} />
      ) : res.error !== null && isNotFound(res.error) ? (
        <EmptyState titleKey="hyp.empty" hint={t('hyp.emptyHint', { stage: t(stageKey(run.currentStage)) })} />
      ) : res.error !== null ? (
        <ErrorBox error={res.error} onRetry={res.retry} />
      ) : res.data === null ? null : (
        <>
          <Section title={t('scorecards.title')}>
            <ScorecardsTable scorecards={res.data.scorecards} />
          </Section>
          {res.data.tournament !== null && (
            <Section title={t('tournament.title')}>
              <TournamentView tournament={res.data.tournament} hypotheses={res.data.hypotheses} />
            </Section>
          )}
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
  tournament?: HypothesisTournament | null;
}

function TournamentView({ tournament, hypotheses }: { tournament: HypothesisTournament; hypotheses: HypothesisCandidate[] }): JSX.Element {
  const { t } = useI18n();
  const statementOf = (id: string): string => {
    const h = hypotheses.find((x) => x.id === id);
    if (!h) return id;
    return h.statement.length > 90 ? `${h.statement.slice(0, 90)}…` : h.statement;
  };
  if (tournament.standings.length === 0) {
    return <p className="muted small">{t('tournament.empty')}</p>;
  }
  return (
    <div>
      <table className="data-table">
        <caption className="sr-only">{t('tournament.title')}</caption>
        <thead>
          <tr>
            <th>{t('tournament.rank')}</th>
            <th>{t('hyp.statement')}</th>
            <th>{t('tournament.record')}</th>
            <th>{t('tournament.winRate')}</th>
            <th>{t('tournament.bt')}</th>
          </tr>
        </thead>
        <tbody>
          {tournament.standings.map((s) => (
            <tr key={s.hypothesisId}>
              <td className="mono">{s.rank}</td>
              <td>{statementOf(s.hypothesisId)}</td>
              <td className="mono">{s.wins}-{s.losses}-{s.ties}</td>
              <td className="mono">{(s.winRate * 100).toFixed(0)}%</td>
              <td className="mono">{s.btScore.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="hyp-details">
        <summary>{t('tournament.matches', { n: tournament.matches.length })}</summary>
        <ul>
          {tournament.matches.map((m, i) => (
            <li key={i}>
              <span className="mono">[{m.outcome === 'no_contest' ? t('tournament.noContest') : m.outcome}]</span>{' '}
              {statementOf(m.aId)} <strong>vs</strong> {statementOf(m.bId)}
              <span className="muted small">
                {' '}
                — {t('tournament.verdicts')}: {m.aFirstVerdict}/{m.bFirstVerdict}
              </span>
              <div className="muted small">{m.rationale}</div>
            </li>
          ))}
        </ul>
      </details>
      <p className="muted small">{tournament.uncertainty}</p>
    </div>
  );
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
