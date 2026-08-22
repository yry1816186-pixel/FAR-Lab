import { useCallback, useEffect, useState } from 'react';
import type { ResearchRun } from '../../api/types';
import { getExperiments, type ExperimentEvidence } from '../../api/endpoints';
import { Badge, IdText, TimeText } from '../common';

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
  const [data, setData] = useState<ExperimentEvidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((signal?: AbortSignal) => {
    getExperiments(run.id, signal)
      .then((d) => { setData(d); setError(null); })
      .catch((e: unknown) => { if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => setLoading(false));
  }, [run.id]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const runs = data?.experimentRuns ?? [];
  const sets = data?.resultSets ?? [];
  const reports = data?.statReports ?? [];

  return (
    <div className="tab-content">
      <p className="muted small">
        已执行实验的真实证据（数据集/训练/统计/判决）。队列操作走 CLI：<code>far experiment run|status|cancel</code>。
        <button type="button" className="btn btn--sm" onClick={() => { setLoading(true); load(); }} style={{ marginLeft: 8 }}>
          刷新
        </button>
      </p>
      {error !== null && <p className="callout callout--warn small">{error}</p>}
      {loading && <p className="muted small mono">loading…</p>}
      {!loading && runs.length === 0 && (
        <div className="empty" style={{ padding: 16 }}>
          <p className="muted">本 run 尚无已执行实验。</p>
          <p className="muted small">研究计划生成后，可通过 <code>far experiment run &lt;spec.json&gt;</code> 在真实数据集上执行假设检验（OpenML/本地数据 → 真实训练 → 预注册统计 → 机械判决 → 因果修订反馈）。</p>
        </div>
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
              <span className="muted small">executor={str(xr.executor)}；attempts={str(xr.attempts)}</span>
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
                    <tr><th>模型</th><th>指标</th><th>train/test</th><th>标签</th></tr>
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
                  <Badge tone={verdictTone(rep.verdict)}>{rep.verdict ?? '无判决'}</Badge>
                  <span className="mono small">{str(rep.comparisonId)} [{str(rep.metricKey)}]</span>
                  <span className="mono small">point={num(rep.pointEstimate)}</span>
                  {rep.ci !== undefined && (
                    <span className="mono small">CI{num(rep.ci.level, 3)}[{num(rep.ci.low)}, {num(rep.ci.high)}]</span>
                  )}
                  {rep.adjustedAlpha !== undefined && <span className="mono small">α_adj={num(rep.adjustedAlpha, 3)}</span>}
                  <span className="muted small">阈值来源={str(rep.thresholdProvenance)}</span>
                  {rep.secondary === true && <Badge tone="muted">secondary（描述性）</Badge>}
                  {rep.exploratory === true && <Badge tone="muted">exploratory</Badge>}
                  <span className="muted small">iteration={str(rep.analysisIteration)}</span>
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
