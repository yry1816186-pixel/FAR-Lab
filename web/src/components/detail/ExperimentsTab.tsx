import { useCallback, useMemo } from 'react';
import type { ResearchRun } from '../../api/types';
import { getExperiments } from '../../api/endpoints';
import { useResource } from '../../hooks/useResource';
import { useI18n } from '../../i18n/LanguageContext';
import { Badge, EmptyState, ErrorBox, IdText, TimeText } from '../common';
import { ForestPlot } from './viz/ForestPlot';
import { metricShares, tallyVerdicts } from '../../viz/experiment-viz';

/**
 * Executed-experiment evidence (EEL, D-081). READ-ONLY truth: experiment_run/result_set/
 * stat_report projections from far.db. Queue operations live in the CLI (`far experiment
 * …`); nothing here fakes progress — a queued/failed run renders as exactly that.
 *
 * VIZ V3: metric cells carry comparison-relative bars (share of the same
 * metric's max across the compared cells — never across different metrics),
 * stat reports gain a CI forest plot, and a verdict tally heads the section
 * when any report exists.
 */
interface CellLike { modelName?: string; metrics?: Record<string, number>; tags?: string[]; fingerprint?: string; nTrain?: number; nTest?: number }
interface ReportLike {
  id?: string; comparisonId?: string; metricKey?: string; hypothesisId?: string; hypothesisVersion?: number;
  pointEstimate?: number; ci?: { level?: number; low?: number; high?: number };
  verdict?: string; secondary?: boolean; exploratory?: boolean; adjustedAlpha?: number;
  thresholdProvenance?: string; analysisIteration?: number; experimentRunId?: string;
  verdictDerivation?: string;
  /** BP-5: power implied by the declared MDE at the achieved nTest (disclosed convention). */
  impliedPower?: number;
}

const num = (v: unknown, digits = 4): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—');
const str = (v: unknown): string => (typeof v === 'string' ? v : '—');

/** Verdict tally (VIZ V3): counts of supports/falsifies/inconclusive + the POPPER
 *  discipline split (exploratory/secondary never count as verdicts). */
function VerdictTallyStrip({ reports }: { reports: ReportLike[] }): JSX.Element {
  const { t } = useI18n();
  const tally = useMemo(() => tallyVerdicts(reports), [reports]);
  const parts: { tone: BadgeTone; label: string; n: number }[] = [
    { tone: 'ok', label: t('exp.tallySupports'), n: tally.supports },
    { tone: 'err', label: t('exp.tallyFalsifies'), n: tally.falsifies },
    { tone: 'muted' as const, label: t('exp.tallyInconclusive'), n: tally.inconclusive },    ...(tally.unjudged > 0 ? [{ tone: 'muted' as const, label: t('exp.tallyUnjudged'), n: tally.unjudged }] : []),
  ];
  return (
    <p className="exp-tally small" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className="muted">{t('exp.tallyTitle')}：</span>
      {parts.map((p) => (
        <span key={p.label} className={`compare-count ${p.tone === 'ok' ? 'compare-count--support' : p.tone === 'err' ? 'compare-count--counter' : 'compare-count--unknown'}`}>
          {p.label} {p.n}
        </span>
      ))}
      {tally.exploratory > 0 && <span className="muted">{t('exp.tallyExploratory', { n: tally.exploratory })}</span>}
      {tally.secondary > 0 && <span className="muted">{t('exp.tallySecondary', { n: tally.secondary })}</span>}
    </p>
  );
}

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
    <>
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
      {reports.length > 0 && <VerdictTallyStrip reports={reports as ReportLike[]} />}
      {/* AOSSA data plane (product visibility): acquired/derived datasets + numerical-PDE specs */}
      {(data?.datasetRecords?.length ?? 0) > 0 && (
        <section className="exp-dataplane">
          <p className="muted small">{t('exp.dataplaneTitle')}</p>
          <table className="table table--compact">
            <thead><tr><th>{t('exp.dpName')}</th><th>{t('exp.dpFormat')}</th><th>{t('exp.dpRows')}</th><th>{t('exp.dpLineage')}</th><th>contentRef</th></tr></thead>
            <tbody>
            {data!.datasetRecords.map((d) => (
              <tr key={str(d.id)}>
                <td>{str(d.name)}</td>
                <td>{str(d.format)}</td>
                <td>{typeof d.nRows === 'number' ? d.nRows : '—'}</td>
                <td>{Array.isArray(d.lineage) ? d.lineage.map((l) => str((l as Record<string, unknown>).kind)).join(' → ') : '—'}</td>
                <td><code>{str(d.contentRef).slice(0, 19)}…</code></td>
              </tr>
            ))}
            </tbody>
          </table>
        </section>
      )}
      {(data?.femSpecs?.length ?? 0) > 0 && (
        <section className="exp-dataplane">
          <p className="muted small">{t('exp.femTitle')}</p>
          {data!.femSpecs.map((f) => (
            <p key={str(f.id)} className="small">
              <Badge tone="muted">{str((f as Record<string, unknown>).mode)}</Badge>{' '}
              <code>{str((f as Record<string, unknown>).manufacturedSolution)}</code>
              {' — '}{str((f as Record<string, unknown>).question)}
            </p>
          ))}
        </section>
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
              const shares = metricShares(cells.map((c, i) => ({ key: c.fingerprint ?? String(i), modelName: c.modelName, metrics: c.metrics })));
              return (
                <table key={str(rs.id)} className="table table--compact">
                  <thead>
                    <tr><th>{t('exp.colModel')}</th><th>{t('exp.colMetrics')}</th><th>train/test</th><th>{t('exp.colTags')}</th></tr>
                  </thead>
                  <tbody>
                    {cells.map((c, i) => {
                      const cellKey = c.fingerprint ?? String(i);
                      return (
                        <tr key={cellKey}>
                          <td className="mono">{str(c.modelName)}</td>
                          <td className="mono">
                            {Object.entries(c.metrics ?? {}).length === 0
                              ? '—'
                              : Object.entries(c.metrics ?? {}).map(([k, v]) => {
                                  const share = shares?.get(k)?.get(cellKey);
                                  return (
                                    <span key={k} className="exp-metric">
                                      <span>{k}={num(v)}</span>
                                      {share !== undefined && (
                                        <span className="rank-bar exp-metric-bar" aria-hidden="true" title={t('exp.metricRelNote', { k })}>
                                          <span className="rank-fill" style={{ width: `${Math.round(share * 100)}%` }} />
                                        </span>
                                      )}
                                    </span>
                                  );
                                })}
                          </td>
                          <td className="mono">{c.nTrain ?? '—'}/{c.nTest ?? '—'}</td>
                          <td className="mono small">{(c.tags ?? []).join(', ') || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })}
            {xReports.length > 0 && <ForestPlot reports={xReports} />}
            {xReports.map((rep) => (
              <div key={str(rep.id)} className="card__body" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <Badge tone={verdictTone(rep.verdict)}>{rep.verdict ?? t('exp.noVerdict')}</Badge>
                  <span className="mono small">{str(rep.comparisonId)} [{str(rep.metricKey)}]</span>
                  {rep.hypothesisId !== undefined && (
                    <span className="muted small mono">{t('exp.boundHyp', { id: str(rep.hypothesisId) })}</span>
                  )}
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
                {rep.impliedPower !== undefined && (
                  <p className="small" style={{ marginTop: 4 }}>
                    <Badge tone={rep.impliedPower < 0.5 ? 'warn' : 'muted'}>
                      {t('exp.impliedPower', { p: (rep.impliedPower * 100).toFixed(1) })}
                    </Badge>
                    {rep.impliedPower < 0.5 ? ` ${t('exp.underPowered')}` : ''}
                  </p>
                )}
                {rep.verdictDerivation !== undefined && (
                  <p className="mono small muted" style={{ marginTop: 4 }}>{str(rep.verdictDerivation)}</p>
                )}
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}
