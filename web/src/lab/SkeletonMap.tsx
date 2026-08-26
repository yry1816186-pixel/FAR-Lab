import { useCallback, useEffect, useMemo, useState } from 'react';
import { getEvidence, getHypotheses, getQuestion, getRun, listRuns } from '../api/endpoints';
import type { EvidenceRelation, HypothesisCandidate, ResearchQuestion, ResearchRun, RunSummary, ScientificClaim } from '../api/types';
import { RELATION_POLARITY } from '../api/types';
import { runStatusTone } from '../tones';
import './lab.css';

/**
 * HX SKELETON A — Research Map spine (prototype, lab route #lab/map).
 *
 * STRUCTURE thesis: a study is ONE navigable reasoning map — question → scope →
 * evidence → hypotheses → verdict — connected by a spine; NO tabs; any object
 * opens in a right inspector instead of navigating away. Six-questions header
 * answers "what/status/why/new/uncertain/next" from real data.
 *
 * Prototype scope: read-only projection over the existing API (real runs);
 * zh copy inline (productionization moves copy into the i18n dict if this
 * skeleton wins). Loser of the A/B walkthrough gets deleted (mission §6.3).
 */

type Insp =
  | { kind: 'claim'; claim: ScientificClaim }
  | { kind: 'hyp'; hyp: HypothesisCandidate; rank: number };

export function SkeletonMap(): JSX.Element {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [question, setQuestion] = useState<ResearchQuestion | null>(null);
  const [claims, setClaims] = useState<ScientificClaim[]>([]);
  const [relations, setRelations] = useState<EvidenceRelation[]>([]);
  const [hyps, setHyps] = useState<HypothesisCandidate[]>([]);
  const [ranks, setRanks] = useState<Map<string, number>>(new Map());
  const [insp, setInsp] = useState<Insp | null>(null);

  useEffect(() => {
    const c = new AbortController();
    listRuns(c.signal).then((list) => {
      setRuns(list);
      const hash = window.location.hash.match(/#lab\/map\/(run_[a-z0-9]+)/);
      const target = hash !== null ? list.find((r) => r.id === hash[1]) : undefined;
      setRunId((target ?? list.find((r) => r.status === 'completed'))?.id ?? null);
    }).catch(() => { /* fail visible below via empty canvas */ });
    // Deep links (#lab/map/<runId>) switch studies without a remount.
    const onHash = (): void => {
      const m = window.location.hash.match(/#lab\/map\/(run_[a-z0-9]+)/);
      if (m !== null) setRunId(m[1]!);
    };
    window.addEventListener('hashchange', onHash);
    return () => { c.abort(); window.removeEventListener('hashchange', onHash); };
  }, []);

  const load = useCallback((rid: string): void => {
    setInsp(null);
    const c = new AbortController();
    void getRun(rid, c.signal).then(setRun).catch(() => setRun(null));
    void getQuestion(rid, c.signal).then(setQuestion).catch(() => setQuestion(null));
    void getEvidence(rid, c.signal).then((e) => { setClaims(e.claims); setRelations(e.relations); }).catch(() => { setClaims([]); setRelations([]); });
    void getHypotheses(rid, c.signal).then((h) => {
      setHyps(h.hypotheses);
      setRanks(new Map(h.scorecards.map((s) => [s.hypothesisId, s.rank] as const)));
    }).catch(() => { setHyps([]); setRanks(new Map()); });
  }, []);
  useEffect(() => { if (runId !== null) load(runId); }, [runId, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setInsp(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const balances = useMemo(() => {
    const m = new Map<string, { supports: number; counters: number }>();
    for (const r of relations) {
      if (r.claimId === undefined || r.targetHypothesisId === undefined) continue;
      const acc = m.get(r.claimId) ?? { supports: 0, counters: 0 };
      const pol = RELATION_POLARITY[r.relation];
      if (pol === 'supporting') acc.supports += 1;
      if (pol === 'counter') acc.counters += 1;
      m.set(r.claimId, acc);
    }
    return m;
  }, [relations]);

  const claimOrder = useMemo(() => claims
    .map((c, i) => ({ c, i, bal: balances.get(c.id) ?? { supports: 0, counters: 0 } }))
    .sort((a, b) => (b.bal.counters - a.bal.counters) || (b.bal.supports + b.bal.counters - a.bal.supports - a.bal.counters) || (a.i - b.i)), [claims, balances]);

  const activeHyps = useMemo(() => hyps
    .filter((h) => h.status === undefined || h.status === 'active')
    .sort((a, b) => (ranks.get(a.id) ?? 99) - (ranks.get(b.id) ?? 99)), [hyps, ranks]);

  const top = activeHyps[0];
  const counterClaims = claimOrder.filter((x) => x.bal.counters > 0);

  return (
    <div className="lab-root">
      <header className="lab-topline">
        <span className="lab-title">研究地图</span>
        <span className="lab-tag">骨架 A · 原型</span>
        <span className="lab-spacer" />
        <select
          aria-label="选择研究"
          value={runId ?? ''}
          onChange={(e) => { const v = e.target.value; if (v.length > 0) { window.location.hash = `#lab/map/${v}`; setRunId(v); } }}
          style={{ fontSize: 12.5, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--v2-border)', background: 'var(--v2-surface)', color: 'var(--v2-text-1)', maxWidth: 320 }}
        >
          {runs.filter((r) => r.status === 'completed' || r.status === 'partial').slice(0, 30).map((r) => (
            <option key={r.id} value={r.id}>{r.questionText?.slice(0, 60) ?? r.id}</option>
          ))}
        </select>
        <a href="#/">← 返回工作台</a>
      </header>

      {run === null ? (
        <div className="map-canvas"><p className="queue-empty">加载研究中…（无数据时请先在工作台完成一次研究）</p></div>
      ) : (
        <main className="map-canvas">
          <div className="map-spine" aria-hidden="true" />

          <section className="map-node">
            <p className="map-node-label">研究问题</p>
            <h1 className="map-question">{question?.text ?? run.questionText ?? '（问题文本加载中）'}</h1>
            <div className="map-scope-row" style={{ marginTop: 10 }}>
              <span className="map-chip">{question?.scope.domain ?? run.domain ?? '领域待定'}</span>
              {(question?.scope.phenomena ?? []).slice(0, 3).map((p) => <span key={p} className="map-chip">{p}</span>)}
              <span className="map-chip">{run.status === 'completed' ? '已完成' : run.status === 'partial' ? '部分完成' : run.status}</span>
              <span className="map-chip">{claims.length} 条主张 · {activeHyps.length} 个假设</span>
            </div>
          </section>

          <section className="map-node">
            <p className="map-node-label">证据（反证置顶 · 点击查看原文）</p>
            <div className="map-band">
              {claimOrder.slice(0, 7).map(({ c, bal }) => (
                <button
                  key={c.id}
                  type="button"
                  className={`map-claim-row${bal.counters > 0 ? ' is-counter' : ''}`}
                  onClick={() => setInsp({ kind: 'claim', claim: c })}
                >
                  <span aria-hidden="true" style={{ fontSize: 13, color: bal.counters > 0 ? 'var(--v2-refuted-on-tint)' : 'var(--v2-verified-on-tint)' }}>
                    {bal.counters > 0 ? '✗' : bal.supports > 0 ? '✓' : '–'}
                  </span>
                  <span className="map-claim-text">{c.text}</span>
                  <span className="map-claim-meta">{bal.supports > 0 && `✓${bal.supports}`}{bal.counters > 0 && ` ✗${bal.counters}`}</span>
                </button>
              ))}
              {claimOrder.length > 7 && <p className="queue-empty">+{claimOrder.length - 7} 条主张…</p>}
            </div>
          </section>

          <section className="map-node">
            <p className="map-node-label">候选假设（按排序 · 点击展开机制与证伪条件）</p>
            <div className="map-hyp-row">
              {activeHyps.slice(0, 6).map((h) => {
                const rank = ranks.get(h.id);
                const sup = h.supportingClaimIds?.length ?? 0;
                const ctr = h.counterClaimIds?.length ?? 0;
                return (
                  <button
                    key={h.id}
                    type="button"
                    className={`map-hyp-card${rank === 1 ? ' is-top' : ''}`}
                    onClick={() => setInsp({ kind: 'hyp', hyp: h, rank: rank ?? 99 })}
                  >
                    <span className="map-hyp-rank">#{rank ?? '—'}{rank === 1 && ' · 当前最强'}</span>
                    <span className="map-hyp-statement">{h.statement}</span>
                    <span className="map-hyp-stats"><span>✓ {sup}</span><span>✗ {ctr}</span></span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="map-node">
            <p className="map-node-label">当前判断</p>
            {top !== undefined ? (
              <div className="map-verdict">
                <p className="v-statement">{top.statement}</p>
                <p className="v-line">不确定性：{(top.uncertainties ?? [])[0] ?? '（未声明）'}</p>
                {counterClaims.length > 0
                  ? <p className="v-line">未解决的反对证据：{counterClaims.length} 条（置顶于上方证据区）</p>
                  : <p className="v-line">未发现反证绑定（检索含结构性反证查询，缺反证本身即结果）</p>}
                <p className="v-line">下一步：比较前两名假设 · 提交反馈修订 · <a href={`#run/${run.id}/verify`} style={{ color: 'var(--v2-info)' }}>导出可复现包</a></p>
              </div>
            ) : <p className="queue-empty">尚无活跃假设。</p>}
          </section>
        </main>
      )}

      {insp !== null && (
        <aside className="lab-inspector" role="dialog" aria-label="对象详情">
          <button type="button" className="insp-close" onClick={() => setInsp(null)}>Esc 关闭</button>
          {insp.kind === 'claim' ? (
            <>
              <h3>主张</h3>
              <p className="insp-body">{insp.claim.text}</p>
              {insp.claim.locators.slice(0, 2).map((loc, i) => (
                <blockquote key={i} className="insp-quote">“{loc.quote}”</blockquote>
              ))}
              <p className="insp-meta">
                绑定状态：{insp.claim.bindingStatus}{insp.claim.gradeCertainty !== undefined && ` · 确定性 ${insp.claim.gradeCertainty}`}
                {balances.get(insp.claim.id) !== undefined && ` · 影响 ${balances.get(insp.claim.id)!.supports} 支持 / ${balances.get(insp.claim.id)!.counters} 反对`}
              </p>
            </>
          ) : (
            <>
              <h3>假设 · 第 {insp.rank} 名</h3>
              <p className="insp-body">{insp.hyp.statement}</p>
              <p className="insp-meta">
                机制：{insp.hyp.mechanism}
                {insp.hyp.falsification?.falsificationCondition !== undefined && `\n证伪条件：${insp.hyp.falsification.falsificationCondition}`}
                {(insp.hyp.uncertainties ?? []).length > 0 && `\n不确定性：${(insp.hyp.uncertainties ?? []).join('；')}`}
              </p>
            </>
          )}
        </aside>
      )}
    </div>
  );
}

export const labMapRouteActive = (): boolean => /^#lab\/map/.test(window.location.hash);
export const labRouteActive = (): boolean => /^#lab\//.test(window.location.hash);
export { runStatusTone };
