import { useEffect, useState } from 'react';

/**
 * AVO fusion G2/G3/G8 web projection — the "Living Research Workspace" data
 * plane: trajectory lineage graph, live supervisor signals, and the evaluator
 * family. Progressive disclosure by design: the component renders the
 * researcher-level summary (health + counts + next-action hints) and folds
 * raw node/edge tables into <details>; nothing is invented — every field
 * maps 1:1 onto GET /runs/:id/{lineage,supervision,evaluations}.
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

const COUNTER_EDGE_KINDS = new Set(['counter_evidence', 'caused_revision']);

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw Object.assign(new Error(`GET ${path} -> ${res.status}`), { status: res.status });
  return res.json() as Promise<T>;
}

/** One fetch per projection, abortable; failures surface per-section, never blank the page. */
export function useResearchState(runId: string | undefined): {
  lineage: LineageGraph | null; supervision: SupervisionView | null; evaluations: EvaluationsView | null;
  error: string | null; loading: boolean;
} {
  const [lineage, setLineage] = useState<LineageGraph | null>(null);
  const [supervision, setSupervision] = useState<SupervisionView | null>(null);
  const [evaluations, setEvaluations] = useState<EvaluationsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (runId === undefined || runId === '') return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [l, s, e] = await Promise.all([
          getJson<LineageGraph>(`/api/v1/runs/${encodeURIComponent(runId)}/lineage`),
          getJson<SupervisionView>(`/api/v1/runs/${encodeURIComponent(runId)}/supervision`),
          getJson<EvaluationsView>(`/api/v1/runs/${encodeURIComponent(runId)}/evaluations`),
        ]);
        setLineage(l); setSupervision(s); setEvaluations(e);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [runId]);

  return { lineage, supervision, evaluations, error, loading };
}

const SEVERITY_LABEL: Record<SupervisorSignal['severity'], string> = {
  high: '高', medium: '中', low: '低',
};

const EVAL_ID_LABEL: Record<string, string> = {
  evidence_balance: '证据平衡（反证在列）',
  falsifiability: '可证伪性',
  hypothesis_diversity: '假设多样性',
  provenance_completeness: '溯源完整性',
  uncertainty_transparency: '不确定性披露',
};

const STATUS_MARK: Record<EvaluationItem['status'], string> = { pass: '✓', warn: '!', fail: '✗' };

/**
 * Research state panel: supervisor health banner, evaluator family rows,
 * lineage summary with node-kind counts and revision chain. Raw graph tables
 * fold into details for audit-grade drill-down.
 */
export function ResearchStatePanel({ runId, runStatus }: { runId: string; runStatus?: string }): JSX.Element {
  const { lineage, supervision, evaluations, error, loading } = useResearchState(runId);

  if (loading && lineage === null && supervision === null) {
    return <div className="research-state" data-state="loading"><p>研究状态加载中…</p></div>;
  }
  if (error !== null) {
    return (
      <div className="research-state" data-state="error">
        <p>研究状态不可用：{error}</p>
        <p className="muted">后端未升级或该投影被禁用时会出现此提示——不会伪造数据。</p>
      </div>
    );
  }

  const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'partial']);
  const isTerminal = runStatus !== undefined && TERMINAL_STATUSES.has(runStatus);
  const highSignals = supervision?.signals.filter((s) => s.severity === 'high') ?? [];
  const counterEdges = lineage?.edges.filter((e) => COUNTER_EDGE_KINDS.has(e.kind)).length ?? 0;

  /** Deterministic zh projection from the signal's STRUCTURED evidence — the
   *  raw English rationale stays on hover (audit trail, never parsed). */
  const humanizeSec = (sec: number): string => {
    if (sec < 60) return `${sec} 秒`;
    if (sec < 3600) return `${Math.round(sec / 60)} 分钟`;
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
  };
  const signalText = (s: SupervisorSignal): string => {
    const ev = s.evidence as Record<string, unknown>;
    if (s.kind === 'stalled_horizon') {
      const ms = typeof ev.msSinceLastEvent === 'number' ? ev.msSinceLastEvent : null;
      const quiet = typeof ev.quietWindowMs === 'number' ? ev.quietWindowMs / 1000 : 0;
      return ms === null
        ? `研究没有任何已记录的活动（静默阈值 ${humanizeSec(quiet)}）`
        : `距最后一次活动已 ${humanizeSec(ms / 1000)}，超过静默阈值 ${humanizeSec(quiet)}`;
    }
    if (s.kind === 'repeated_failure') {
      const count = typeof ev.count === 'number' ? ev.count : 0;
      const sig = typeof ev.signature === 'string' ? ev.signature : '';
      return `同一失败签名（${sig}）已重复 ${count} 次——原样重试是循环，不是进展`;
    }
    if (s.kind === 'unproductive_cycle') {
      const iters = typeof ev.iterations === 'number' ? ev.iterations : 0;
      return `${iters} 轮迭代未产生实质变化——建议改变方向或加深挖掘后再投入`;
    }
    return s.recommendation.rationale;
  };
  const ACTION_LABEL: Record<string, string> = {
    resume_or_replan: '恢复执行或重新规划',
    change_strategy: '更换策略',
    branch_or_deepen: '分叉新方向或加深现有方向',
  };

  return (
    <section className="research-state" aria-label="研究状态（AVO 融合投影）">
      {/* --- supervisor health --- */}
      <div
        className={`rs-supervision ${highSignals.length > 0 && !isTerminal ? 'rs-alert' : 'rs-ok'}`}
        data-testid="supervision"
      >
        {supervision === null ? (
          <p>监督分析不可用。</p>
        ) : supervision.signals.length === 0 ? (
          <p><strong>轨迹健康</strong>：无监督信号（事件 {supervision.observation.eventCount} 条）。</p>
        ) : isTerminal ? (
          <>
            <p><strong>监督</strong>：研究已结束（{runStatus}）——运行期监督记录归档如下，停滞类信号对已结束的研究不再适用。</p>
            <details>
              <summary>归档的监督信号（{supervision.signals.length} 条）</summary>
              <ul>
                {supervision.signals.map((s) => (
                  <li key={s.kind} title={s.recommendation.rationale}>
                    [{SEVERITY_LABEL[s.severity]}] {s.kind === 'stalled_horizon' ? '探索停滞' : s.kind === 'repeated_failure' ? '重复失败' : '无产出循环'}
                    ：{signalText(s)}
                    <span className="muted"> 建议动作：{ACTION_LABEL[s.recommendation.action] ?? s.recommendation.action}</span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          <>
            <p><strong>监督信号 {supervision.signals.length} 条</strong>{highSignals.length > 0 ? `（其中高危 ${highSignals.length}）` : ''}</p>
            <ul>
              {supervision.signals.map((s) => (
                <li key={s.kind} title={s.recommendation.rationale}>
                  [{SEVERITY_LABEL[s.severity]}] {s.kind === 'stalled_horizon' ? '探索停滞' : s.kind === 'repeated_failure' ? '重复失败' : '无产出循环'}
                  ：{signalText(s)}
                  <span className="muted"> 建议动作：{ACTION_LABEL[s.recommendation.action] ?? s.recommendation.action}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* --- evaluator family (multi-dimensional; no invented single score) --- */}
      {evaluations !== null && (
        <div className="rs-evaluations" data-testid="evaluations">
          <h4>科学评价族</h4>
          <ul>
            {evaluations.evaluations.map((e) => (
              <li key={e.id} title={e.detail}>
                <span className={`rs-mark rs-${e.status}`}>{STATUS_MARK[e.status]}</span>
                {' '}{EVAL_ID_LABEL[e.id] ?? e.id}
                <span className="muted"> {e.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --- lineage summary --- */}
      {lineage !== null && (
        <div className="rs-lineage" data-testid="lineage">
          <h4>研究谱系</h4>
          <p>
            {lineage.nodes.length} 个节点 · {lineage.edges.length} 条边
            （其中反证/因果修订边 {counterEdges}）
          </p>
          <details>
            <summary>节点明细</summary>
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
