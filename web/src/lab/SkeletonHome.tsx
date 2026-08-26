import { useEffect, useState } from 'react';
import { getHypotheses, listRuns } from '../api/endpoints';
import type { HypothesisCandidate, RunSummary } from '../api/types';
import { groupStudies } from '../components/RunsSidebar';
import './lab.css';

/**
 * HX SKELETON A — WORKSPACE LAYER (productionization slice 1).
 * The lab home: what needs my judgment (intervention queue, absorbed from the
 * deleted skeleton B) + the studies index (grouped by question, same grouping
 * authority as the workbench sidebar) + the entry to start new research.
 * Route #lab/home; #lab/map deep-links back here. Prototype zh copy inline.
 */
export function SkeletonHome(): JSX.Element {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [counterStudyIds, setCounterStudyIds] = useState<string[]>([]);

  useEffect(() => {
    const c = new AbortController();
    listRuns(c.signal).then(setRuns).catch(() => setRuns([]));
    return () => c.abort();
  }, []);

  // Judgment items: failed/partial runs + counter-evidence studies (top 3 completed probed).
  useEffect(() => {
    if (runs === null) return;
    const completed = runs.filter((r) => r.status === 'completed').slice(0, 3);
    const c = new AbortController();
    void Promise.all(completed.map(async (r) => {
      try {
        const h = await getHypotheses(r.id, c.signal);
        return (h.hypotheses.filter((x: HypothesisCandidate) => (x.counterClaimIds?.length ?? 0) > 0).length > 0) ? r.id : null;
      } catch { return null; }
    })).then((ids) => { setCounterStudyIds(ids.filter((x): x is string => x !== null)); });
    return () => c.abort();
  }, [runs]);

  const live = (runs ?? []).filter((r) => r.status === 'running' || r.status === 'queued');
  const attention = (runs ?? []).filter((r) => r.status === 'partial' || r.status === 'failed').slice(0, 4);
  const studies = groupStudies(runs ?? []).slice(0, 12);
  const byId = new Map((runs ?? []).map((r) => [r.id, r] as const));

  return (
    <div className="lab-root">
      <header className="lab-topline">
        <span className="lab-title">研究工作区</span>
        <span className="lab-tag">骨架 A · 工作区层</span>
        <span className="lab-spacer" />
        <a href="#/" style={{ fontSize: 12.5 }}>＋ 新研究（工作台提问）</a>
      </header>

      <main className="queue-canvas">
        <section className="queue-section">
          <h2 className="queue-section-title">需要你的判断</h2>
          <p className="queue-section-sub">失败待恢复 · 反证待审视——每一项都等一个决定</p>
          {live.length === 0 && attention.length === 0 && counterStudyIds.length === 0
            ? <p className="queue-empty">没有等待判断的事项。</p>
            : (
              <>
                {live.map((r) => (
                  <QueueRow key={r.id} sev="live" title={r.questionText?.slice(0, 70) ?? r.id}
                    why={`${r.currentStage} 阶段执行中${r.progress !== undefined ? ` · ${r.progress.done}/${r.progress.total}` : ''}`}
                    action="看地图" href={`#lab/map/${r.id}`} />
                ))}
                {attention.map((r) => (
                  <QueueRow key={r.id} sev="attention" title={r.questionText?.slice(0, 70) ?? r.id}
                    why={`${r.status === 'partial' ? '部分完成' : '失败'} · ${(r.lastError ?? '原因见研究页').slice(0, 90)}`}
                    action="处理" href={`#run/${r.id}`} />
                ))}
                {counterStudyIds.map((rid) => {
                  const r = byId.get(rid);
                  return (
                    <QueueRow key={`ctr-${rid}`} sev="attention"
                      title={r?.questionText?.slice(0, 70) ?? rid}
                      why="存在带反对证据的假设，尚未被否决或修订"
                      action="去审视" href={`#lab/map/${rid}`} />
                  );
                })}
              </>
            )}
        </section>

        <section className="queue-section">
          <h2 className="queue-section-title">研究索引</h2>
          <p className="queue-section-sub">同一问题的多次运行归并为一个研究 · 点击进入研究地图</p>
          {studies.length === 0
            ? <p className="queue-empty">尚无研究。点击右上「新研究」开始。</p>
            : studies.map((g) => (
              <a key={g.key} href={`#lab/map/${g.latest.id}`} className="queue-item sev-info" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="q-dot" aria-hidden="true" />
                <span className="q-main">
                  <span className="q-title">{g.question}</span>
                  <span className="q-why">{g.runs.length > 1 ? `${g.runs.length} 次运行 · ` : ''}{g.latest.status === 'completed' ? '已完成' : g.latest.status === 'partial' ? '部分完成' : g.latest.status}</span>
                </span>
                <span className="q-act">打开地图</span>
              </a>
            ))}
        </section>
      </main>
    </div>
  );
}

function QueueRow({ sev, title, why, action, href }: { sev: 'live' | 'attention'; title: string; why: string; action: string; href: string }): JSX.Element {
  return (
    <div className={`queue-item sev-${sev}`}>
      <span className="q-dot" aria-hidden="true" />
      <span className="q-main">
        <span className="q-title">{title}</span>
        <span className="q-why">{why}</span>
      </span>
      <a className="q-act" href={href}>{action}</a>
    </div>
  );
}
