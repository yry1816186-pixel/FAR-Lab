import { useCallback } from 'react';
import type { ResearchRun } from '../../api/types';
import { getExperiments } from '../../api/endpoints';
import { useResource } from '../../hooks/useResource';
import { useI18n } from '../../i18n/LanguageContext';
import { Badge, EmptyState, ErrorBox, IdText, TimeText } from '../common';

/**
 * Executed-experiment evidence (EEL, D-081). READ-ONLY truth: experiment_run/result_set/
 * stat_report projections from far.db. Queue operations live in the CLI (`far experiment
 * …`); nothing here fakes progress — a queued/failed run renders as exactly that.
 */
interface CellLike { modelName?: string; metrics?: Record<string, number>; tags?: string[]; fingerprint?: string; nTrain?: number; nTest?: number }
interface ReportLike {
  id?: string; comparisonId?: string; metricKey?: string; hypothesisId?: string; hypothesisVersion?: number;
  pointEstimate?: number; ci?: { level?: number; low?: number; high?: number };
  verdict?: string; secondary?: boolean; exploratory?: boolean; adjustedAlpha?: number;
  thresholdProvenance?: string; analysisIteration?: number; experimentRunId?: string;
  verdictDerivation?: string;
}

const num = (v: unknown, digits = 4): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—');
const str = (v: unknown): string => (typeof v === 'string' ? v : '—');

type BadgeTone = 'ok' | 'warn' | 'err' | 'info' | 'muted';
const verdictTone = (v: unknown): BadgeTone =>
  v === 'supports' ? 'ok' : v === 'falsifies' ? 'err' : 'muted';
export function ExperimentsTab({ run }: { run: ResearchRun }): JSX.Element {
  const { t } = useI18n();
  const fetcher = useCallback((signal: AbortSignal) => getExperiments(run.id, signal), [run.id]);
  const res = useResource(fetcher, [run.id], `${run.updatedAt}:${run.status}`);

  const data = res.data;
  const runs = data?.experimentRuns ?? [];
  const sets = data?.resultSets ?? [];
  const reports = data?.statReports ?? [];

  return (
    <div className="tab-content">
      <p className="muted small">
        {t('exp.intro')} <code>far experiment run|status|cancel</code>。
        <button type="button" className="btn btn--sm" onClick={res.retry} style={{ marginLeft: 8 }}>
          {t('exp.refresh')}
        </button>
      </p>
      {res.error !== null && <ErrorBox error={res.error} onRetry={res.retry} />}
      {res.loading && <p className="muted small mono">loading…</p>}
      {!res.loading && runs.length === 0 && (
        <EmptyState
          titleKey="exp.emptyTitle"
          hint={t('exp.emptyHint')}
        />
      )}
      {runs.map((xr) => {
        const xid = str(xr.id);
        const status = str(xr.status);
        const xSets = sets.filter((s) => s.experimentRunId === xid);
        const xReports = reports.filter((r) => (r as ReportLike).experimentRunId === xid) as ReportLike[];
        return (
          <section key={xid} className="card" style={{ marginBottom: 12 }}>
            <header className="card__head" style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Badge tone={status === 'completed' ? 'ok' : status === 'failed' ? 'err' : 'muted'}>{status}</Badge>
              <IdText value={xid} />
              <span className="muted small">
                {t('exp.executor', {
                  executor: str(xr.executor) === 'local' ? t('exp.executorLocal') : str(xr.executor) === 'remote' ? t('exp.executorRemote') : str(xr.executor),
                  attempts: str(xr.attempts),
                })}
              </span>
              <TimeText iso={str(xr.createdAt)} />
            </header>
            {xr.error !== undefined && xr.error !== null && (
              <p className="callout callout--warn small mono">{str(xr.error)}</p>
            )}
            {xSets.map((rs) => {
              const cells = Array.isArray(rs.cells) ? (rs.cells as CellLike[]) : [];
              return (
                <table key={str(rs.id)} className="table table--compact">
                  <thead>
                    <tr><th>{t('exp.colModel')}</th><th>{t('exp.colMetrics')}</th><th>train/test</th><th>{t('exp.colTags')}</th></tr>
                  </thead>
                  <tbody>
                    {cells.map((c, i) => (
                      <tr key={c.fingerprint ?? i}>
                        <td className="mono">{str(c.modelName)}</td>
                        <td className="mono">
                          {Object.entries(c.metrics ?? {}).map(([k, v]) => `${k}=${num(v)}`).join('，') || '—'}
                        </td>
                        <td className="mono">{c.nTrain ?? '—'}/{c.nTest ?? '—'}</td>
                        <td className="mono small">{(c.tags ?? []).join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })}
            {xReports.map((rep) => (
              <div key={str(rep.id)} className="card__body" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <Badge tone={verdictTone(rep.verdict)}>{rep.verdict ?? t('exp.noVerdict')}</Badge>
                  <span className="mono small">{str(rep.comparisonId)} [{str(rep.metricKey)}]</span>
                  <span className="mono small">point={num(rep.pointEstimate)}</span>
                  {rep.ci !== undefined && (
                    <span className="mono small">CI{num(rep.ci.level, 3)}[{num(rep.ci.low)}, {num(rep.ci.high)}]</span>
                  )}
                  {rep.adjustedAlpha !== undefined && <span className="mono small">α_adj={num(rep.adjustedAlpha, 3)}</span>}
                  <span className="muted small">{t('exp.thresholdProv', { source: str(rep.thresholdProvenance) })}</span>
                  {rep.secondary === true && <Badge tone="muted">{t('exp.secondary')}</Badge>}
                  {rep.exploratory === true && <Badge tone="muted">{t('exp.exploratory')}</Badge>}
                  <span className="muted small">{t('exp.iteration', { n: str(rep.analysisIteration) })}</span>
                </div>
                {rep.verdictDerivation !== undefined && (
                  <p className="mono small muted" style={{ marginTop: 4 }}>{str(rep.verdictDerivation)}</p>
                )}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
