import { useEffect, useState } from 'react';
import type { RunTruthProfile } from '../../api/types';
import { useI18n } from '../../i18n/LanguageContext';
import type { DictKey } from '../../i18n/dict';

/**
 * AVO fusion G2/G3/G8 web projection — the "Living Research Workspace" data
 * plane: trajectory lineage graph, live supervisor signals, and the evaluator
 * family. Progressive disclosure by design: the component renders the
 * researcher-level summary (health + counts + next-action hints) and folds
 * raw node/edge tables into <details>; nothing is invented — every field
 * maps 1:1 onto GET /runs/:id/{lineage,supervision,evaluations,calibration}.
 * Fully i18n'd (zh/en): supervisor signal projections derive from the signal's
 * STRUCTURED evidence; the raw English rationale stays on hover (audit trail).
 */

// ---- API types mirroring src/app/{lineage,supervisor,evaluators}.ts ----

export interface LineageNode { id: string; kind: string; runId: string; label: string; version?: number; status?: string; createdAt?: string }
export interface LineageEdge { kind: string; from: string; to: string }
export interface LineageGraph { rootRunId: string; nodes: LineageNode[]; edges: LineageEdge[] }

export interface SupervisorSignal { kind: string; severity: 'low' | 'medium' | 'high'; evidence: Record<string, unknown>; recommendation: { action: string; rationale: string } }
export interface SupervisionView {
  runId: string;
  observation: { windowEvents: number; eventCount: number; msSinceLastEvent: number | null; distinctFailureSignatures: number };
  signals: SupervisorSignal[];
}

export interface EvaluationItem { id: string; status: 'pass' | 'warn' | 'fail'; detail: string; metrics: Record<string, number> }
export interface EvaluationsView { runId: string; evaluations: EvaluationItem[] }

/** L4 ledger stratum (server calibrationReport: n<30 honestly says insufficient). */
export interface CalibrationStratum {
  kind: string;
  n: number;
  meanRps: number;
  meanBrier: number;
  meanSkillVsUniform: number;
  insufficientEvidence: boolean;
}
export interface CalibrationView {
  entries: Array<{ id: string; kind: string; settledAt?: string; voidReason?: string }>;
  report: { stratified: CalibrationStratum[]; settledTotal: number; openTotal: number };
}

const COUNTER_EDGE_KINDS = new Set(['counter_evidence', 'caused_revision']);

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw Object.assign(new Error(`GET ${path} -> ${res.status}`), { status: res.status });
  return res.json() as Promise<T>;
}

/**
 * Execution-truth projection (§5.5, GET /runs/:id/truth): the run-level receipt-derived
 * class (live / mixed / synthetic / recorded_replay / empty) shown in the run header.
 * Silent-fail by design: the badge simply stays absent when the projection is unavailable.
 */
export function useRunTruth(runId: string | undefined): RunTruthProfile | null {
  const [truth, setTruth] = useState<RunTruthProfile | null>(null);
  useEffect(() => {
    if (runId === undefined || runId === '') { setTruth(null); return; }
    const ctrl = new AbortController();
    void getJson<RunTruthProfile>(`/api/v1/runs/${encodeURIComponent(runId)}/truth`)
      .then((t) => { if (!ctrl.signal.aborted) setTruth(t); })
      .catch(() => { if (!ctrl.signal.aborted) setTruth(null); });
    return () => ctrl.abort();
  }, [runId]);
  return truth;
}

/** One fetch per projection, abortable; failures surface per-section, never blank the page. */
export function useResearchState(runId: string | undefined): {
  lineage: LineageGraph | null; supervision: SupervisionView | null; evaluations: EvaluationsView | null;
  calibration: CalibrationView | null;
  error: string | null; loading: boolean;
} {
  const [lineage, setLineage] = useState<LineageGraph | null>(null);
  const [supervision, setSupervision] = useState<SupervisionView | null>(null);
  const [evaluations, setEvaluations] = useState<EvaluationsView | null>(null);
  const [calibration, setCalibration] = useState<CalibrationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (runId === undefined || runId === '') return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [l, s, e, c] = await Promise.all([
          getJson<LineageGraph>(`/api/v1/runs/${encodeURIComponent(runId)}/lineage`),
          getJson<SupervisionView>(`/api/v1/runs/${encodeURIComponent(runId)}/supervision`),
          getJson<EvaluationsView>(`/api/v1/runs/${encodeURIComponent(runId)}/evaluations`),
          getJson<CalibrationView>(`/api/v1/runs/${encodeURIComponent(runId)}/calibration`),
        ]);
        setLineage(l); setSupervision(s); setEvaluations(e); setCalibration(c);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [runId]);

  return { lineage, supervision, evaluations, calibration, error, loading };
}

const severityKey = (s: SupervisorSignal['severity']): DictKey => `rsp.severity.${s}` as DictKey;
const evalKey = (id: string): DictKey => `rsp.eval.${id}` as DictKey;
const signalKindKey = (k: string): DictKey => `rsp.sig.${k}` as DictKey;
const actionKey = (a: string): DictKey => `rsp.action.${a}` as DictKey;

const STATUS_MARK: Record<EvaluationItem['status'], string> = { pass: '✓', warn: '!', fail: '✗' };

/**
 * Research state panel: supervisor health banner, evaluator family rows,
 * lineage summary with node-kind counts and revision chain. Raw graph tables
 * fold into details for audit-grade drill-down.
 */
export function ResearchStatePanel({ runId, runStatus }: { runId: string; runStatus?: string }): JSX.Element {
  const { t } = useI18n();
  const { lineage, supervision, evaluations, calibration, error, loading } = useResearchState(runId);

  if (loading && lineage === null && supervision === null) {
    return <div className="research-state" data-state="loading"><p>{t('rsp.loading')}</p></div>;
  }
  if (error !== null) {
    return (
      <div className="research-state" data-state="error">
        <p>{t('rsp.unavailable', { error })}</p>
        <p className="muted">{t('rsp.unavailableHint')}</p>
      </div>
    );
  }

  const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'partial']);
  const isTerminal = runStatus !== undefined && TERMINAL_STATUSES.has(runStatus);
  const highSignals = supervision?.signals.filter((s) => s.severity === 'high') ?? [];
  const counterEdges = lineage?.edges.filter((e) => COUNTER_EDGE_KINDS.has(e.kind)).length ?? 0;

  /** Localized humanization of a silence/quiet window in seconds. */
  const humanizeSec = (sec: number): string => {
    if (sec < 60) return t('rsp.dur.seconds', { n: Math.round(sec) });
    if (sec < 3600) return t('rsp.dur.minutes', { n: Math.round(sec / 60) });
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return m > 0 ? t('rsp.dur.hoursMinutes', { h, m }) : t('rsp.dur.hours', { h });
  };
  /** Deterministic projection from the signal's STRUCTURED evidence — the
   *  raw English rationale stays on hover (audit trail, never parsed). */
  const signalText = (s: SupervisorSignal): string => {
    const ev = s.evidence as Record<string, unknown>;
    if (s.kind === 'stalled_horizon') {
      const ms = typeof ev.msSinceLastEvent === 'number' ? ev.msSinceLastEvent : null;
      const quiet = typeof ev.quietWindowMs === 'number' ? ev.quietWindowMs / 1000 : 0;
      return ms === null
        ? t('rsp.sigStalled.never', { quiet: humanizeSec(quiet) })
        : t('rsp.sigStalled.quiet', { since: humanizeSec(ms / 1000), quiet: humanizeSec(quiet) });
    }
    if (s.kind === 'repeated_failure') {
      const count = typeof ev.count === 'number' ? ev.count : 0;
      const sig = typeof ev.signature === 'string' ? ev.signature : '';
      return t('rsp.sigRepeated', { n: count, sig });
    }
    if (s.kind === 'unproductive_cycle') {
      const iters = typeof ev.iterations === 'number' ? ev.iterations : 0;
      return t('rsp.sigUnproductive', { n: iters });
    }
    return s.recommendation.rationale;
  };
  const signalKindLabel = (k: string): string =>
    k === 'stalled_horizon' || k === 'repeated_failure' || k === 'unproductive_cycle' ? t(signalKindKey(k)) : k;
  const actionLabel = (a: string): string =>
    a === 'resume_or_replan' || a === 'change_strategy' || a === 'branch_or_deepen' ? t(actionKey(a)) : a;

  const signalList = (signals: SupervisorSignal[]): JSX.Element => (
    <ul>
      {signals.map((s) => (
        <li key={s.kind} title={s.recommendation.rationale}>
          [{t(severityKey(s.severity))}] {signalKindLabel(s.kind)}：{signalText(s)}
          <span className="muted"> {t('rsp.suggestedAction')}：{actionLabel(s.recommendation.action)}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="research-state" aria-label={t('rsp.aria')}>
      {/* --- supervisor health --- */}
      <div
        className={`rs-supervision ${highSignals.length > 0 && !isTerminal ? 'rs-alert' : 'rs-ok'}`}
        data-testid="supervision"
      >
        {supervision === null ? (
          <p>{t('rsp.supervisionUnavailable')}</p>
        ) : supervision.signals.length === 0 ? (
          <p><strong>{t('rsp.healthy')}</strong>{t('rsp.healthyDetail', { n: supervision.observation.eventCount })}</p>
        ) : isTerminal ? (
          <>
            <p><strong>{t('rsp.supervision')}</strong>{t('rsp.archivedIntro', { status: runStatus ?? '' })}</p>
            <details>
              <summary>{t('rsp.archivedSummary', { n: supervision.signals.length })}</summary>
              {signalList(supervision.signals)}
            </details>
          </>
        ) : (
          <>
            <p><strong>{t('rsp.signalsCount', { n: supervision.signals.length })}</strong>{highSignals.length > 0 ? t('rsp.highCount', { n: highSignals.length }) : ''}</p>
            {signalList(supervision.signals)}
          </>
        )}
      </div>

      {/* --- evaluator family (multi-dimensional; no invented single score) --- */}
      {evaluations !== null && (
        <div className="rs-evaluations" data-testid="evaluations">
          <h4>{t('rsp.evaluationsTitle')}</h4>
          <ul>
            {evaluations.evaluations.map((e) => (
              <li key={e.id} title={e.detail}>
                <span className={`rs-mark rs-${e.status}`}>{STATUS_MARK[e.status]}</span>
                {' '}{t(evalKey(e.id))}
                <span className="muted"> {e.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --- L4 self-calibration ledger (forward predictions, settled by experiment verdicts) --- */}
      {calibration !== null && calibration.entries.length > 0 && (
        <div className="rs-calibration" data-testid="calibration">
          <h4>{t('rsp.calibrationTitle')}</h4>
          <p>
            {t('rsp.calibrationLine', {
              total: calibration.entries.length,
              settled: calibration.report.settledTotal,
              open: calibration.report.openTotal,
            })}
            <span className="muted"> {t('rsp.calibrationHint')}</span>
          </p>
          {calibration.report.stratified.length > 0 && (
            <ul>
              {calibration.report.stratified.map((s) => (
                <li key={s.kind}>
                  [{s.kind}] n={s.n}
                  {s.insufficientEvidence
                    ? <span className="muted"> {t('rsp.calibrationInsufficient')}</span>
                    : <> {t('rsp.calibrationSkill', {
                        skill: `${s.meanSkillVsUniform >= 0 ? '+' : ''}${s.meanSkillVsUniform.toFixed(3)}`,
                        rps: s.meanRps.toFixed(3),
                      })}</>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* --- lineage summary --- */}
      {lineage !== null && (
        <div className="rs-lineage" data-testid="lineage">
          <h4>{t('rsp.lineageTitle')}</h4>
          <p>{t('rsp.lineageLine', { nodes: lineage.nodes.length, edges: lineage.edges.length, counter: counterEdges })}</p>
          <details>
            <summary>{t('rsp.lineageDetails')}</summary>
            <ul>
              {lineage.nodes.slice(0, 50).map((n) => (
                <li key={`${n.kind}:${n.id}`}>
                  [{n.kind}] {n.label}{n.version !== undefined ? ` v${n.version}` : ''}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}
