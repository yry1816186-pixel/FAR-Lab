import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { ErrorBox } from '../components/common';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import {
  cancelRun, editHypothesis, forkHypothesis, getEvidence, getHypotheses,
  getQuestion, promoteHypothesis, rejectHypothesis, resumeRun,
} from '../api/endpoints';
import type {
  AchResearcherAdjusted, EvidenceRelation, HypothesisCandidate, ResearchQuestion, ResearchRun, RunEvent, ScientificClaim,
} from '../api/types';
import { runProgress } from '../api/types';
import { RELATION_POLARITY } from '../api/types';
import { runStatusKey } from '../tones';
import { ClaimInspector } from './ClaimInspector';
import { useRunTruth } from '../components/detail/ResearchStatePanel';
import { ScopeReview } from './ScopeReview';
import { runLabel, type StudyGroup } from '../studies';
import './lab.css';

/**
 * Study map — the PRIMARY run view (Research Experience Architecture A).
 * A study is one navigable reasoning map: question → evidence (counter-first)
 * → hypotheses → verdict, on a spine; NO tabs. Running studies show the live
 * narrative band (what/why/found/next/acts) driven by real events — never a
 * fake percentage. Scientific decisions are DIRECTLY operable in the
 * inspector: hypothesis promote/reject/fork/edit and claim↔hypothesis
 * linking ride the real op contracts and enter the causal revision chain.
 */

/**
 * Inspector target by ID, resolved against the LATEST science objects at
 * render time — ops mutate the researcher layer / hypothesis status and the
 * inspector must reflect the post-op state, not the pre-click snapshot.
 */
type Insp =
  | { kind: 'claim'; claimId: string }
  | { kind: 'hyp'; hypId: string; rank: number };

const LIVE_REFETCH_MS = 4_000;

export function StudyMap({
  run, events, studies, focusClaimId, onClaimFocused, onMutated,
}: {
  run: ResearchRun;
  events: RunEvent[];
  studies: StudyGroup[];
  /** Palette claim hit -> open that claim in the inspector once claims load. */
  focusClaimId?: string | null;
  onClaimFocused?: () => void;
  onMutated: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const truth = useRunTruth(run.id);
  const [question, setQuestion] = useState<ResearchQuestion | null>(null);
  const [claims, setClaims] = useState<ScientificClaim[]>([]);
  // First-fetch gates: "empty" is only honest AFTER the fetch settled (the
  // empty->band swap measured as the map's dominant layout shift, §21).
  const [scienceLoaded, setScienceLoaded] = useState(false);
  const [relations, setRelations] = useState<EvidenceRelation[]>([]);
  const [hyps, setHyps] = useState<HypothesisCandidate[]>([]);
  const [ranks, setRanks] = useState<Map<string, number>>(new Map());
  const [adjusted, setAdjusted] = useState<AchResearcherAdjusted | null>(null);
  const [insp, setInsp] = useState<Insp | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);

  const loadScience = useCallback((rid: string): void => {
    const c = new AbortController();
    void getQuestion(rid, c.signal).then(setQuestion).catch(() => setQuestion(null));
    void getEvidence(rid, c.signal)
      .then((e) => { setClaims(e.claims); setRelations(e.relations); setScienceLoaded(true); })
      .catch((e: unknown) => { setClaims([]); setRelations([]); setScienceLoaded(true); if (e instanceof ApiError) setLoadError(e); });
    void getHypotheses(rid, c.signal)
      .then((h) => {
        setHyps(h.hypotheses);
        setRanks(new Map(h.scorecards.map((s) => [s.hypothesisId, s.rank] as const)));
        setAdjusted(h.achResearcherAdjusted);
      })
      .catch(() => { setHyps([]); setRanks(new Map()); setAdjusted(null); });
  }, []);

  // Reload science objects on run switch AND on lifecycle transitions
  // (running -> completed/partial): the live band disappears exactly when the
  // final evidence/hypotheses land — without this the map keeps the last
  // (possibly empty) snapshot from mid-run.
  useEffect(() => { setInsp(null); setLoadError(null); loadScience(run.id); }, [run.id, run.status, loadScience]);

  // Palette claim-hit deep focus: once this run's claims arrive, open the
  // inspector on the targeted claim (consumed once).
  useEffect(() => {
    if (focusClaimId == null || claims.length === 0) return;
    const hit = claims.find((c) => c.id === focusClaimId);
    if (hit === undefined) return;
    setInsp({ kind: 'claim', claimId: hit.id });
    onClaimFocused?.();
  }, [focusClaimId, claims, onClaimFocused]);

  const running = run.status === 'running' || run.status === 'queued';
  // §8.2 pre-launch states: 'created' = fresh draft, 'paused' = parked after
  // the scope proposal. The scope-review surface owns what happens next.
  const draftable = run.status === 'created' || run.status === 'paused';
  // Live studies accumulate findings progressively — refresh the science
  // objects on a slow cadence while executing (events drive the narrative
  // band; this keeps the evidence/hypothesis bands from going stale).
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => loadScience(run.id), LIVE_REFETCH_MS);
    return () => window.clearInterval(timer);
  }, [running, run.id, loadScience]);

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
    // Researcher layer shapes the band (§15): pinned first. Excluded rows
    // KEEP their position, weakened in place — the judgement must stay
    // disclosed in its original context (never sunk out of reach).
    .sort((a, b) => {
      const pa = a.c.researcher?.pinned === true ? 0 : 1;
      const pb = b.c.researcher?.pinned === true ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (b.bal.counters - a.bal.counters) || (b.bal.supports + b.bal.counters - a.bal.supports - a.bal.counters) || (a.i - b.i);
    }), [claims, balances]);

  const activeHyps = useMemo(() => hyps
    .filter((h) => h.status === undefined || h.status === 'active')
    .sort((a, b) => (ranks.get(a.id) ?? 99) - (ranks.get(b.id) ?? 99)), [hyps, ranks]);

  const top = activeHyps[0];
  const counterClaims = claimOrder.filter((x) => x.bal.counters > 0);
  const settled = run.status === 'completed' || run.status === 'partial';

  const siblingStudies = useMemo(() => {
    const own = studies.find((g) => g.runs.some((r) => r.id === run.id));
    return { own, others: studies.filter((g) => g !== own) };
  }, [studies, run.id]);

  const lifecycle = async (act: 'cancel' | 'resume'): Promise<void> => {
    setLifecycleBusy(true);
    setCancelArmed(false);
    try {
      if (act === 'cancel') await cancelRun(run.id);
      else await resumeRun(run.id);
      onMutated();
    } finally {
      setLifecycleBusy(false);
    }
  };

  const elapsedMin = Math.max(0, Math.round((Date.now() - Date.parse(run.createdAt)) / 60_000));

  return (
    <div className="lab-root">
      <header className="lab-topline">
        <a className="lab-crumb" href="#/">{t('map.backHome')}</a>
        <span className="lab-title">{t('map.title')}</span>
        <span className={`lab-status lab-status--${run.status}`}>{t(runStatusKey(run.status))}</span>
        {truth !== null && truth.klass !== 'live' && truth.klass !== 'empty' && (
          <span className={`lab-status lab-truth--${truth.klass}`} title={t('map.truthHint', { n: truth.totalReceipts })}>
            {t('map.truthBadge')}
          </span>
        )}
        <span className="lab-spacer" />
        <label className="sr-only" htmlFor="map-study-select">{t('map.selectStudy')}</label>
        <select
          id="map-study-select"
          value={run.id}
          onChange={(e) => { const v = e.target.value; if (v.length > 0) window.location.hash = `#study/${v}`; }}
          className="lab-select"
        >
          {siblingStudies.own !== undefined && (
            <optgroup label={t('map.thisStudy')}>
              {siblingStudies.own.runs.slice(0, 12).map((r) => (
                <option key={r.id} value={r.id}>
                  {`${t(runStatusKey(r.status))} · ${runLabel(r).slice(0, 48)}${r.id === run.id ? t('map.currentMark') : ''}`}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={t('map.otherStudies')}>
            {siblingStudies.others.slice(0, 24).map((g) => (
              <option key={g.key} value={g.latest.id}>{runLabel(g.latest).slice(0, 60)}</option>
            ))}
          </optgroup>
        </select>
      </header>

      <main className="map-canvas">
        {loadError !== null && <ErrorBox error={loadError} onRetry={() => loadScience(run.id)} />}

        {running && (
          <LiveBand
            run={run}
            events={events}
            onCancel={() => { void lifecycle('cancel'); }}
            cancelArmed={cancelArmed}
            onArmCancel={() => setCancelArmed((v) => !v)}
            busy={lifecycleBusy}
            elapsedMin={elapsedMin}
          />
        )}
        {(run.status === 'partial' || run.status === 'cancelled') && (
          <PartialBand run={run} claims={claims.length} hyps={activeHyps.length} cancelled={run.status === 'cancelled'} onResume={() => { void lifecycle('resume'); }} busy={lifecycleBusy} />
        )}
        {run.status === 'failed' && (
          <div className="map-band map-band--failed" role="alert">
            <p className="mb-title">{t('map.failedTitle')}</p>
            <p className="mb-line">{run.lastError ?? t('map.failedNoReason')}</p>
            <p className="mb-line">{t('map.failedKeep')}</p>
          </div>
        )}

        <div className="map-spine" aria-hidden="true" />

        <section className="map-node">
          <p className="map-node-label">{t('map.questionLabel')}</p>
          <h1 className="map-question">{question?.text ?? run.questionText ?? t('map.questionLoading')}</h1>
          <div className="map-scope-row" style={{ marginTop: 10 }}>
            <span className="map-chip">{question?.scope.domain ?? run.domain ?? t('map.domainPending')}</span>
            {(question?.scope.phenomena ?? []).slice(0, 3).map((p) => <span key={p} className="map-chip">{p}</span>)}
            <span className="map-chip">{t('map.chipCounts', { claims: claims.length, hyps: activeHyps.length })}</span>
          </div>
        </section>

        {draftable && (
          <ScopeReview
            run={run}
            question={question}
            onQuestionChanged={() => { loadScience(run.id); onMutated(); }}
            onLaunched={onMutated}
          />
        )}

        {!draftable && (
          <>
        <section className="map-node">
          <p className="map-node-label">{t('map.evidenceLabel')}</p>
          {claims.length === 0 && !running
            ? scienceLoaded
              ? <p className="queue-empty">{t('map.evidenceEmpty')}</p>
              : <div className="map-band map-band--reserving" aria-hidden="true" />
            : (
              <div className="map-band">
                {claimOrder.slice(0, 7).map(({ c, bal }) => {
                  const excluded = c.researcher?.excluded === true;
                  const pinned = c.researcher?.pinned === true;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`map-claim-row${bal.counters > 0 && !excluded ? ' is-counter' : ''}${excluded ? ' is-excluded' : ''}${pinned ? ' is-pinned' : ''}`}
                      onClick={() => setInsp({ kind: 'claim', claimId: c.id })}
                    >
                      <span aria-hidden="true" style={{ fontSize: 13, color: excluded ? 'var(--v2-text-3)' : bal.counters > 0 ? 'var(--v2-refuted-on-tint)' : 'var(--v2-verified-on-tint)' }}>
                        {excluded ? '⊘' : pinned ? '◆' : bal.counters > 0 ? '✗' : bal.supports > 0 ? '✓' : '–'}
                      </span>
                      <span className="map-claim-text">{c.text}</span>
                      <span className="map-claim-meta">
                        {excluded && t('map.claimExcluded')}
                        {!excluded && pinned && t('map.claimPinned')}
                        {!excluded && bal.supports > 0 && `✓${bal.supports}`}
                        {!excluded && bal.counters > 0 && ` ✗${bal.counters}`}
                      </span>
                    </button>
                  );
                })}
                {claimOrder.length > 7 && <p className="queue-empty">{t('map.moreClaims', { n: claimOrder.length - 7 })}</p>}
              </div>
            )}
        </section>

        <section className="map-node">
          <p className="map-node-label">{t('map.hypsLabel')}</p>
          {adjusted !== null && (
            <div className="map-band map-band--adjusted" role="status">
              <p className="mb-title">{t('map.adjustedTitle', { n: adjusted.excludedClaimIds.length })}</p>
              <p className="mb-line">
                {adjusted.removalSensitivity.stable
                  ? t('map.adjustedStable')
                  : t('map.adjustedOrderChanged')}
              </p>
              <p className="mb-line">{t('map.adjustedDisclosed')}</p>
            </div>
          )}
          {hyps.length === 0 && !running
            ? scienceLoaded
              ? <p className="queue-empty">{t('map.hypsEmpty')}</p>
              : <div className="map-hyp-row map-band--reserving" aria-hidden="true" />
            : (
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
                      onClick={() => setInsp({ kind: 'hyp', hypId: h.id, rank: rank ?? 99 })}
                    >
                      <span className="map-hyp-rank">#{rank ?? '—'}{rank === 1 && t('map.topMark')}</span>
                      <span className="map-hyp-statement">{h.statement}</span>
                      <span className="map-hyp-stats"><span>✓ {sup}</span><span>✗ {ctr}</span></span>
                    </button>
                  );
                })}
              </div>
            )}
        </section>

        {settled && (
          <section className="map-node">
            <p className="map-node-label">{t('map.verdictLabel')}</p>
            {top !== undefined ? (
              <div className="map-verdict">
                <p className="v-statement">{top.statement}</p>
                <p className="v-line">{t('map.uncertainty', { text: (top.uncertainties ?? [])[0] ?? t('map.uncertaintyNone') })}</p>
                {counterClaims.length > 0
                  ? <p className="v-line">{t('map.openCounters', { n: counterClaims.length })}</p>
                  : <p className="v-line">{t('map.noCountersFound')}</p>}
                <p className="v-line">
                  {t('map.nextSteps')} · <a href={`#run/${run.id}/plan`}>{t('map.linkPlan')}</a> · <a href={`#run/${run.id}/hypotheses`}>{t('map.linkCompare')}</a> · <a href={`#run/${run.id}/revisions`}>{t('map.linkFeedback')}</a> · <a href={`#run/${run.id}/verify`}>{t('map.linkExport')}</a>
                </p>
              </div>
            ) : (
              <div className="map-verdict map-verdict--empty">
                <p className="v-line">{t('map.noActiveHyps')}</p>
                {run.status === 'partial' && (
                  <p className="v-line">
                    {t('map.partialExportPath')} · <a href={`#run/${run.id}/verify`}>{t('map.verifyPanel')}</a>
                  </p>
                )}
              </div>
            )}
          </section>
        )}
          </>
        )}
      </main>

      {insp !== null && (insp.kind === 'claim'
        ? (() => {
            // Resolve the claim id against the LATEST list: researcher-layer
            // ops change the object; the inspector must show post-op truth.
            const live = claims.find((c) => c.id === insp.claimId);
            if (live === undefined) return null; // vanished (deleted) — render nothing; next open resets
            return (
              <Inspector
                insp={insp}
                run={run}
                liveClaim={live}
                hyps={hyps}
                balances={balances}
                onClose={() => setInsp(null)}
                onMutated={() => { onMutated(); loadScience(run.id); }}
              />
            );
          })()
        : (() => {
            const live = hyps.find((h) => h.id === insp.hypId);
            if (live === undefined) return null; // vanished (rejected/forked away) — render nothing
            return (
              <Inspector
                insp={insp}
                run={run}
                liveHyp={live}
                hyps={hyps}
                balances={balances}
                onClose={() => setInsp(null)}
                onMutated={() => { onMutated(); loadScience(run.id); }}
              />
            );
          })())}
    </div>
  );
}

/** Live execution narrative — six questions answered from real state, no fake progress. */
function LiveBand({ run, events, onCancel, cancelArmed, onArmCancel, busy, elapsedMin }: {
  run: ResearchRun;
  events: RunEvent[];
  onCancel: () => void;
  cancelArmed: boolean;
  onArmCancel: () => void;
  busy: boolean;
  elapsedMin: number;
}): JSX.Element {
  const { t } = useI18n();
  // Latest 3 narrative-worthy events (receipts/checkpoints are machinery).
  const NARRATIVE: readonly RunEvent['type'][] = ['stage_started', 'stage_done', 'stage_failed', 'stage_skipped', 'run_resumed', 'revision_created', 'experiment_queued', 'experiment_completed', 'note'] as const;
  const lines = events
    .filter((e) => (NARRATIVE as readonly string[]).includes(e.type))
    .slice(-3)
    .reverse();

  const stageLabel = t(`stage.${run.currentStage}` as DictKey);
  return (
    <div className="map-band map-band--live" role="status" aria-live="polite">
      <p className="mb-title">
        {t('map.liveTitle', { stage: stageLabel })}
        {t('map.liveProgress', { done: runProgress(run).done, total: runProgress(run).total })}
        {t('map.liveElapsed', { min: elapsedMin })}
      </p>
      <p className="mb-line">{t('map.liveWhy', { stage: stageLabel })}</p>
      {lines.length > 0 && (
        <ul className="mb-events">
          {lines.map((e) => (
            <li key={e.seq}>
              <span className="mb-event-stage">{e.stage !== undefined ? t(`stage.${e.stage}` as DictKey) : t(`map.ev.${e.type}` as DictKey)}</span>
              <span className="mb-event-type">{t(`map.ev.${e.type}` as DictKey)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mb-acts">
        <span className="mb-acts-hint">{t('map.liveCanDo')}</span>
        {cancelArmed
          ? (
            <>
              <button type="button" className="mb-act mb-act--danger" disabled={busy} onClick={onCancel}>{t('map.cancelConfirm')}</button>
              <button type="button" className="mb-act" onClick={onArmCancel}>{t('map.cancelBack')}</button>
            </>
          )
          : <button type="button" className="mb-act" disabled={busy} onClick={onArmCancel}>{t('map.cancel')}</button>}
      </div>
    </div>
  );
}

/** Partial/cancelled run: what happened, what survived, and the resume entry —
 * failure is a main path, and a user-cancelled run must not dead-end either
 * (G3: the server resumes from the checkpoint; the map owns the affordance). */
function PartialBand({ run, claims, hyps, cancelled, onResume, busy }: {
  run: ResearchRun;
  claims: number;
  hyps: number;
  cancelled: boolean;
  onResume: () => void;
  busy: boolean;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="map-band map-band--partial" role="status">
      <p className="mb-title">{cancelled ? t('map.cancelledTitle') : t('map.partialTitle')}</p>
      <p className="mb-line">{cancelled
        ? t('map.cancelledReason')
        : t('map.partialReason', { reason: (run.lastError ?? t('map.partialNoReason')).slice(0, 140) })}</p>
      <p className="mb-line">{t('map.partialKept', { claims, hyps })}</p>
      <div className="mb-acts">
        <button type="button" className="mb-act mb-act--primary" disabled={busy} onClick={onResume}>{t('map.resume')}</button>
        <span className="mb-acts-hint">{t('map.resumeHint')}</span>
      </div>
    </div>
  );
}

/** Object inspector — where scientific decisions are made, not just viewed. */
function Inspector({ insp, run, liveClaim, liveHyp, hyps, balances, onClose, onMutated }: {
  insp: Insp;
  run: ResearchRun;
  /** Live (post-op) object for the inspected id; the parent guarantees presence. */
  liveClaim?: ScientificClaim;
  liveHyp?: HypothesisCandidate;
  hyps: HypothesisCandidate[];
  balances: Map<string, { supports: number; counters: number }>;
  onClose: () => void;
  onMutated: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [opError, setOpError] = useState<ApiError | null>(null);
  const [editing, setEditing] = useState(false);
  const [editStatement, setEditStatement] = useState('');
  const [editNote, setEditNote] = useState('');
  const errRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setEditing(false);
    setOpError(null);
  }, [insp]);

  const op = async (act: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setOpError(null);
    try {
      await act();
      onMutated();
    } catch (e) {
      setOpError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
      errRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="lab-inspector" role="dialog" aria-label={t('map.inspectorLabel')}>
      <button type="button" className="insp-close" onClick={onClose}>{t('map.inspClose')}</button>
      {opError !== null && <div ref={errRef} tabIndex={-1}><ErrorBox error={opError} onRetry={onClose} /></div>}

      {insp.kind === 'claim' ? (
        liveClaim !== undefined && (
          <ClaimInspector
            claim={liveClaim}
            run={run}
            hyps={hyps}
            balances={balances}
            busy={busy}
            op={op}
            onError={setOpError}
          />
        )
      ) : liveHyp === undefined ? null : (
        <>
          <h3>{t('map.inspHyp', { rank: insp.rank })}</h3>
          {editing ? (
            <div className="insp-edit">
              <label htmlFor="insp-edit-statement">{t('map.editStatement')}</label>
              <textarea
                id="insp-edit-statement"
                rows={5}
                value={editStatement}
                onChange={(e) => setEditStatement(e.target.value)}
              />
              <label htmlFor="insp-edit-note">{t('map.editNote')}</label>
              <textarea
                id="insp-edit-note"
                rows={2}
                placeholder={t('map.editNoteHint')}
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
              />
              <div className="insp-edit-acts">
                <button
                  type="button"
                  className="mb-act mb-act--primary"
                  disabled={busy || editNote.trim().length === 0 || editStatement.trim().length === 0}
                  onClick={() => {
                    void op(() => editHypothesis(run.id, liveHyp.id, {
                      statement: editStatement.trim(),
                      note: editNote.trim(),
                    }).then(() => setEditing(false)));
                  }}
                >
                  {t('map.editApply')}
                </button>
                <button type="button" className="mb-act" onClick={() => setEditing(false)}>{t('map.editCancel')}</button>
              </div>
              <p className="insp-edit-note">{t('map.editEntersChain')}</p>
            </div>
          ) : (
            <>
              <p className="insp-body">{liveHyp.statement}</p>
              <p className="insp-meta">
                {t('map.inspMechanism', { text: liveHyp.mechanism })}
                {liveHyp.falsification?.falsificationCondition !== undefined && t('map.inspFalsification', { text: liveHyp.falsification.falsificationCondition })}
                {(liveHyp.uncertainties ?? []).length > 0 && t('map.inspUncertainties', { text: (liveHyp.uncertainties ?? []).join('；') })}
              </p>
              <div className="insp-ops">
                <p className="insp-ops-title">{t('map.opsTitle')}</p>
                <div className="insp-ops-row">
                  <button type="button" className="mb-act" disabled={busy} onClick={() => { void op(() => promoteHypothesis(run.id, liveHyp.id)); }}>{t('map.opPromote')}</button>
                  <button type="button" className="mb-act" disabled={busy} onClick={() => { void op(() => rejectHypothesis(run.id, liveHyp.id)); }}>{t('map.opReject')}</button>
                  <button type="button" className="mb-act" disabled={busy} onClick={() => { void op(() => forkHypothesis(run.id, liveHyp.id)); }}>{t('map.opFork')}</button>
                  <button
                    type="button"
                    className="mb-act"
                    disabled={busy}
                    onClick={() => { setEditStatement(liveHyp.statement); setEditNote(''); setEditing(true); }}
                  >
                    {t('map.opEdit')}
                  </button>
                </div>
                <p className="insp-ops-hint">{t('map.opsHint')}</p>
              </div>
            </>
          )}
        </>
      )}
    </aside>
  );
}
