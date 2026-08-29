import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ApiError } from '../api/client';
import { ErrorBox } from '../components/common';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import {
  cancelRun, deleteRun, dispatchAction, editHypothesis, forkHypothesis, getEvidence, getHypotheses,
  getQuestion, getScience, getSources, promoteHypothesis, rejectHypothesis, resumeRun,
} from '../api/endpoints';
import { DISPATCHABLE_ACTIONS, type DispatchableAction } from '../api/endpoints';
import type {
  AchResearcherAdjusted, EvidenceRelation, HypothesisCandidate, HypothesisScorecard, ResearchQuestion, ResearchRun, RunEvent, ScienceBundle, ScientificClaim, SourceDocument,
} from '../api/types';
import { runProgress } from '../api/types';
import { RELATION_POLARITY } from '../api/types';
import { runStatusKey } from '../tones';
import { EvidenceGraph } from '../components/detail/EvidenceGraph';
import { ClaimInspector } from './ClaimInspector';
import { zhFirst, markerZh, dimensionLabel, decodeEntities } from './bilingual';
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

/** Word-boundary ellipsis — a study title cut mid-word ("…increas") reads as broken, not shortened. */
const ellipsize = (text: string, max: number): string => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

/** Audit strings embed "(archived full object: sha256:…)"; the hash belongs in a tooltip, not the visible line. */
const stripArchiveHash = (s: string): string => s.replace(/\s*\(archived full object: sha256:[0-9a-f]+…?\)/g, '');

/**
 * Stored revision labels are id-based ("hyp_p10bkqa…@v1") — audit-canonical but
 * engineering-object leakage when shown verbatim. Render the OBJECT KIND with
 * the version marker; the raw label stays reachable on hover (title).
 */
const versionLabelDisplay = (label: string, t: ReturnType<typeof useI18n>['t']): string => {
  if (!/[a-z]{3}_[a-z0-9]{8,}/.test(label)) return label;
  return label
    .split(/;\s*/)
    .map((part) => {
      const m = part.match(/^([a-z]+)_[a-z0-9]+@(.*)$/);
      if (m === null) return part;
      const kindKey = m[1] === 'hyp' ? 'hypothesis' : m[1] === 'pln' ? 'plan' : m[1] === 'clm' ? 'claim' : m[1] === 'exp' ? 'experiment' : 'other';
      return `${t(`map.obj.${kindKey}` as DictKey)}@${m[2]}`;
    })
    .join('; ');
};

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
  const { t, lang } = useI18n();
  const truth = useRunTruth(run.id);
  const [question, setQuestion] = useState<ResearchQuestion | null>(null);
  const [claims, setClaims] = useState<ScientificClaim[]>([]);
  // First-fetch gates: "empty" is only honest AFTER the fetch settled (the
  // empty->band swap measured as the map's dominant layout shift, §21).
  const [scienceLoaded, setScienceLoaded] = useState(false);
  const [relations, setRelations] = useState<EvidenceRelation[]>([]);
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [hyps, setHyps] = useState<HypothesisCandidate[]>([]);
  const [ranks, setRanks] = useState<Map<string, number>>(new Map());
  /** #1's scorecard — the basis line is composed at RENDER time from the
   *  structured dimensions (current language, researcher language); the
   *  audit-grade formula (overallRationale) rides the tooltip. Formulas on
   *  the card itself read as debugging, not judgment. */
  const [leaderCard, setLeaderCard] = useState<HypothesisScorecard | null>(null);
  const [adjusted, setAdjusted] = useState<AchResearcherAdjusted | null>(null);
  const [science, setScience] = useState<ScienceBundle | null>(null);
  const [insp, setInsp] = useState<Insp | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  // Spine projection 404 = the serving process predates the /science API
  // (e.g. a long-lived 3196 instance). Fail visibly: without this the state
  // band silently vanishes and the user cannot know why.
  const [spineUnavailable, setSpineUnavailable] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadScience = useCallback((rid: string): void => {
    const c = new AbortController();
    void getQuestion(rid, c.signal).then(setQuestion).catch(() => setQuestion(null));
    void getSources(rid, c.signal).then(setSources).catch(() => setSources([]));
    void getEvidence(rid, c.signal)
      .then((e) => { setClaims(e.claims); setRelations(e.relations); setScienceLoaded(true); })
      .catch((e: unknown) => { setClaims([]); setRelations([]); setScienceLoaded(true); if (e instanceof ApiError) setLoadError(e); });
    void getHypotheses(rid, c.signal)
      .then((h) => {
        setHyps(h.hypotheses);
        setRanks(new Map(h.scorecards.map((s) => [s.hypothesisId, s.rank] as const)));
        setLeaderCard(h.scorecards.find((s) => s.rank === 1) ?? null);
        setAdjusted(h.achResearcherAdjusted);
      })
      .catch(() => { setHyps([]); setRanks(new Map()); setAdjusted(null); setLeaderCard(null); });
    // Spine projection: state/next-actions/deltas. Failure is non-fatal (the
    // map still renders its bands) but leaves science null — never fake state.
    // A 404 is specifically the old-server case: surfaced as its own notice.
    void getScience(rid, c.signal)
      .then(setScience)
      .catch((e: unknown) => {
        setScience(null);
        setSpineUnavailable(e instanceof ApiError && e.status === 404);
      });
  }, []);

  // Reload science objects on run switch AND on lifecycle transitions
  // (running -> completed/partial): the live band disappears exactly when the
  // final evidence/hypotheses land — without this the map keeps the last
  // (possibly empty) snapshot from mid-run.
  useEffect(() => { setInsp(null); setLoadError(null); setSpineUnavailable(false); loadScience(run.id); }, [run.id, run.status, loadScience]);

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

  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s] as const)), [sources]);

  const claimOrder = useMemo(() => claims
    .map((c, i) => ({ c, i, bal: balances.get(c.id) ?? { supports: 0, counters: 0 } }))
    // Researcher layer shapes the band (§15): pinned first. Excluded rows
    // KEEP their position, weakened in place — the judgement must stay
    // disclosed in its original context (never sunk out of reach).
    // Tie-break on id, NOT array index: the server re-appends a claim object
    // when the researcher layer rewrites it (exclude/pin/annotate), so index
    // order reshuffles after every op — an excluded claim could jump to the
    // tail and fall out of the 7-row window (live-reproduced 2026-08-29).
    .sort((a, b) => {
      const pa = a.c.researcher?.pinned === true ? 0 : 1;
      const pb = b.c.researcher?.pinned === true ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const byCounters = (b.bal.counters - a.bal.counters) || (b.bal.supports + b.bal.counters - a.bal.supports - a.bal.counters);
      if (byCounters !== 0) return byCounters;
      return a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0;
    }), [claims, balances]);

  const activeHyps = useMemo(() => hyps
    .filter((h) => h.status === undefined || h.status === 'active')
    .sort((a, b) => (ranks.get(a.id) ?? 99) - (ranks.get(b.id) ?? 99)), [hyps, ranks]);

  const settled = run.status === 'completed' || run.status === 'partial';

  const siblingStudies = useMemo(() => {
    const own = studies.find((g) => g.runs.some((r) => r.id === run.id));
    return { own, others: studies.filter((g) => g !== own) };
  }, [studies, run.id]);

  const lifecycle = async (act: 'cancel' | 'resume'): Promise<void> => {
    setLifecycleBusy(true);
    setCancelArmed(false);
    try {
      if (act === 'cancel') {
        // Server truth: the persisted flag takes effect at the next batch
        // boundary — surface that instead of a silent wait.
        const r = await cancelRun(run.id);
        setCancelRequested(r.requested);
        if (!r.requested) return; // nothing active to cancel — status refresh tells why
      } else {
        setCancelRequested(false);
        await resumeRun(run.id);
      }
      onMutated();
    } finally {
      setLifecycleBusy(false);
    }
  };

  // Hard-delete this study (server cascades events/objects/checkpoints in one
  // transaction), then return home. Errors surface via the map's ErrorBox path
  // (loadError) — a failed delete never silently leaves the researcher on a
  // deleted study.
  const deleteStudy = async (): Promise<void> => {
    setDeleteBusy(true);
    try {
      await deleteRun(run.id);
      window.location.hash = '#/';
    } catch (e) {
      setLoadError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
      setDeleteArmed(false);
    } finally {
      setDeleteBusy(false);
    }
  };

  // Spine action dispatch: a REAL affordance per action type — the server re-validates
  // the precondition and a 400 names the unsatisfied condition (shown, not swallowed).
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const dispatch = async (actionType: DispatchableAction): Promise<void> => {
    setLifecycleBusy(true);
    setDispatchError(null);
    try {
      await dispatchAction(run.id, actionType);
      onMutated();
    } catch (e) {
      setDispatchError(e instanceof Error ? e.message : String(e));
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
                  {`${t(runStatusKey(r.status))} · ${ellipsize(runLabel(r), 48)}${r.id === run.id ? t('map.currentMark') : ''}`}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={t('map.otherStudies')}>
            {siblingStudies.others.slice(0, 24).map((g) => (
              <option key={g.key} value={g.latest.id}>{ellipsize(runLabel(g.latest), 60)}</option>
            ))}
          </optgroup>
        </select>
        {/* Study management (Doubao-parity): delete THIS study — hard cascade
            on the server (events, objects, checkpoints, one transaction),
            armed confirm like cancel; never offered for a RUNNING study. */}
        {!running && (
          deleteArmed ? (
            <button
              type="button"
              className="map-del is-armed"
              disabled={deleteBusy}
              onClick={() => { void deleteStudy(); }}
            >
              {deleteBusy ? t('map.delBusy') : t('map.delConfirm')}
            </button>
          ) : (
            <button
              type="button"
              className="map-del"
              onClick={() => {
                setDeleteArmed(true);
                window.setTimeout(() => setDeleteArmed((v) => (v ? false : v)), 4000);
              }}
              aria-label={t('map.delete')}
              title={t('map.deleteHint')}
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          )
        )}
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
            cancelRequested={cancelRequested}
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

        {/* The MAP of the study map: the reasoning structure made spatial —
            sources ← claims (support/counter) ← ranked hypotheses. Reuses the
            B7 landscape graph (real store objects only); claim clicks open the
            map inspector, hypothesis clicks land on the hypotheses band. */}
        {!draftable && (claims.length > 0 || activeHyps.length > 0) && (
          <section className="map-node map-node--graph">
            <p className="map-node-label">{t('map.graphLabel')}</p>
            <div className="map-graph-frame">
              <EvidenceGraph
                run={run}
                sources={sources}
                claims={claims}
                relations={relations}
                onOpenClaim={(claimId) => { setInsp({ kind: 'claim', claimId }); }}
                onOpenHypothesis={() => { document.getElementById('map-hyps')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
              />
            </div>
          </section>
        )}

        {draftable && (
          <ScopeReview
            run={run}
            question={question}
            onQuestionChanged={() => { loadScience(run.id); onMutated(); }}
            onLaunched={onMutated}
          />
        )}

        {!draftable && settled && science === null && !scienceLoaded && (
          /* Same §21 CLS contract as the claims/hyps bands: the state band is the
             tallest top-of-map block — inserting it unreserved shifts everything
             below (measured 0.228 vs 0.1 budget). */
          <section className="map-node" aria-hidden="true">
            <p className="map-node-label">{t('map.stateLabel')}</p>
            <div className="map-band map-band--reserving map-band--state" />
          </section>
        )}
        {!draftable && settled && science === null && scienceLoaded && spineUnavailable && (
          <section className="map-node">
            <p className="map-node-label">{t('map.stateLabel')}</p>
            <div className="map-state map-state--insufficient" role="note">
              <p className="ss-line">{t('map.stateUnavailable')}</p>
            </div>
          </section>
        )}
        {!draftable && (
          <>
        {settled && science !== null && (
          <StateBand
            run={run}
            science={science}
            onResume={() => { void lifecycle('resume'); }}
            onDispatch={(a: DispatchableAction) => { void dispatch(a); }}
            dispatchError={dispatchError}
            busy={lifecycleBusy}
          />
        )}
        <section className="map-node">
          <p className="map-node-label">{t('map.evidenceLabel')}<span className="map-node-hint">{t('map.evidenceHint')}</span></p>
          {claims.length === 0 && !running
            ? scienceLoaded
              ? <p className="queue-empty">{t('map.evidenceEmpty')}</p>
              : <div className="map-band map-band--reserving" aria-hidden="true" />
            : (
              <div className="map-band">
                {claimOrder.slice(0, 7).map(({ c, bal }) => {
                  const excluded = c.researcher?.excluded === true;
                  const pinned = c.researcher?.pinned === true;
                  // Source attribution (provenance at a glance): the FIRST
                  // locator's document title — the researcher can see whose
                  // claim this is before opening the inspector.
                  const src = sourceById.get(c.locators[0]?.sourceDocumentId ?? '');
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
                      <span className="map-claim-main">
                        <span className="map-claim-text">{c.text}</span>
                        {src !== undefined && (
                          <span className="map-claim-src">
                            {decodeEntities(src.title)}
                            {c.locators.length > 1 && ` +${c.locators.length - 1}`}
                            {src.publicationYear !== undefined && ` · ${src.publicationYear}`}
                          </span>
                        )}
                      </span>
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

        <section className="map-node" id="map-hyps">
          <p className="map-node-label">{t('map.hypsLabel')}<span className="map-node-hint">{t('map.hypsHint')}</span></p>
          {science?.state.discriminatingObservations.slice(0, 1).map((o) => (
            <p key={o.betweenHypothesisIds.join('-')} className="map-discrim">
              <span className="map-discrim-tag">{t('map.discrimLabel')}</span>
              {o.observable}
            </p>
          ))}
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
                      <span className="map-hyp-statement">{zhFirst(h.statement, h.statementZh, lang)}</span>
                      {rank === 1 && leaderCard !== null && (() => {
                        const dims = leaderCard.dimensions
                          .filter((d) => d.value !== null)
                          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
                          .slice(0, 3);
                        const basis = dims
                          .map((d) => `${dimensionLabel(d.dimension, t)} ${d.qualitative !== undefined && d.qualitative !== 'not_assessed' ? t(`map.qual.${d.qualitative}` as DictKey) : (d.value ?? 0).toFixed(1)}`)
                          .join(' · ');
                        const audit = leaderCard.overallRationale.trim().length > 0 ? leaderCard.overallRationale : undefined;
                        return basis.length > 0
                          ? <span className="map-hyp-why" title={audit}>{t('map.hypWhy', { text: basis })}</span>
                          : null;
                      })()}
                      <span className="map-hyp-stats"><span>✓ {sup}</span><span>✗ {ctr}</span></span>
                    </button>
                  );
                })}
              </div>
            )}
        </section>

        {settled && science === null && (
          <section className="map-node">
            <p className="map-node-label">{t('map.verdictLabel')}</p>
            <div className="map-verdict map-verdict--empty">
              <p className="v-line">{t('map.noActiveHyps')}</p>
              {run.status === 'partial' && (
                <p className="v-line">
                  {t('map.partialExportPath')} · <a href={`#run/${run.id}/verify`}>{t('map.verifyPanel')}</a>
                </p>
              )}
            </div>
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
function LiveBand({ run, events, onCancel, cancelArmed, onArmCancel, busy, elapsedMin, cancelRequested }: {
  run: ResearchRun;
  events: RunEvent[];
  onCancel: () => void;
  cancelArmed: boolean;
  onArmCancel: () => void;
  busy: boolean;
  elapsedMin: number;
  cancelRequested: boolean;
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
      {cancelRequested && (
        <p className="mb-line" role="status">{t('map.cancelPending')}</p>
      )}
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
  const { t, lang } = useI18n();
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
              <p className="insp-body">{zhFirst(liveHyp.statement, liveHyp.statementZh, lang)}</p>
              <p className="insp-meta">
                {t('map.inspMechanism', { text: zhFirst(liveHyp.mechanism, liveHyp.mechanismZh, lang) })}
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

/**
 * CURRENT SCIENTIFIC STATE band (Product Spine M1-M4, 2026-08-28): the answer
 * to "这个研究现在知道什么" — leading explanation, why it leads, strongest
 * support/counter, biggest unknown, qualitative confidence, falsifier, next
 * best research action, and what changed. Kind-aware: template content is
 * REFUSED the leading slot (honest INSUFFICIENT instead of filler), and a
 * formal insufficient outcome is a conclusion, never an error state.
 */
function StateBand({ run, science, onResume, onDispatch, dispatchError, busy }: {
  run: ResearchRun;
  science: ScienceBundle;
  onResume: () => void;
  onDispatch: (actionType: DispatchableAction) => void;
  dispatchError: string | null;
  busy: boolean;
}): JSX.Element {
  const { t, lang } = useI18n();
  const s = science.state;
  const primary = science.nextActions[0] ?? null;
  const rest = science.nextActions.slice(1, 4);
  const leaderFalsifier = s.leading !== null
    ? s.falsifiers.find((f) => f.hypothesisId === s.leading?.hypothesisId) ?? null
    : null;
  const unknownText = (() => {
    const u = s.biggestUnknown;
    if (u === null) return null;
    switch (u.kind) {
      case 'unresolved_counter': return t('map.unknown.unresolvedCounter', { excerpt: u.excerpt });
      case 'hyp_uncertainty': return t('map.unknown.hypUncertainty', { text: u.text });
      case 'searched_no_counter': return t('map.unknown.searchedNoCounter', { n: u.queriesAttempted });
      case 'template_content': return t('map.unknown.templateContent');
      case 'no_active_hyps': return t('map.unknown.noActiveHyps');
    }
  })();

  // Forming (partial parked before hypotheses concluded): the partial band
  // owns the resume affordance — a premature state card would fake a verdict.
  if (s.kind === 'forming') return <></>;

  return (
    <section className="map-node">
      <p className="map-node-label">{t('map.stateLabel')}</p>

      {s.kind === 'template' ? (
        <div className="map-state map-state--template" role="note">
          <p className="ss-title">{t('map.stateTemplateTitle')}</p>
          <p className="ss-line">{t('map.stateTemplateBody')}</p>
          {s.templateEvidence.length > 0 && (
            <ul className="ss-markers">
              {s.templateEvidence.map((e) => <li key={e}>{markerZh(e, lang)}</li>)}
            </ul>
          )}
        </div>
      ) : s.kind === 'insufficient' ? (
        <div className="map-state map-state--insufficient" role="note">
          <p className="ss-title">{t('map.stateInsufficientTitle')}</p>
          <p className="ss-line">{t('map.stateShape', {
            claims: s.evidenceShape.claims, verified: s.evidenceShape.verified,
            support: s.evidenceShape.supportingRelations, counter: s.evidenceShape.counterRelations,
          })}</p>
          {(() => {
            // The WHY in researcher language: the honesty gate's refusal reason
            // (or any hypotheses-stage skip reason) rides on the run's stage
            // record. The known real-content refusal gets localized copy (the
            // raw reason stays on hover); everything else renders verbatim.
            const skipped = run.stages.find((st) => st.stage === 'generate_hypotheses');
            if (skipped?.error === undefined) return null;
            const raw = skipped.error;
            const isWireRefusal = raw.includes('deterministic development wire');
            return <p className="ss-line" title={raw}>{isWireRefusal ? t('map.insufficientWireReason') : t('map.stateInsufficientWhy', { text: raw.slice(0, 220) })}</p>;
          })()}
        </div>
      ) : (
        <div className="map-state">
          {s.leading !== null && <p className="ss-leader">{zhFirst(s.leading.statement, s.leading.statementZh, lang)}</p>}
          <div className="ss-grid">
            <div className="ss-cell">
              <p className="ss-k">{t('map.stateWhy')}</p>
              {s.leading !== null && s.leading.whyItLeads.length > 0
                ? s.leading.whyItLeads.map((d) => (
                  <p key={`${d.dimension}-${d.rationale}`} className="ss-why">
                    <span className={`ss-dim ss-dim--${d.qualitative ?? 'n'}`}>{dimensionLabel(d.dimension, t)}{d.qualitative !== null ? ` · ${t(`map.qual.${d.qualitative}` as DictKey)}` : ''}</span>
                    <span className="ss-why-text">{d.rationale}</span>
                  </p>
                ))
                : <p className="ss-why">{t('map.stateWhyEmpty')}</p>}
            </div>
            <div className="ss-cell">
              <p className="ss-k">{t('map.stateSupport')}</p>
              {s.strongestSupport !== null
                ? <p className="ss-evidence"><span className="ss-excerpt">{s.strongestSupport.text}</span>{s.strongestSupport.gradeCertainty !== null && <span className="ss-grade">{`GRADE ${s.strongestSupport.gradeCertainty}`}</span>}</p>
                : <p className="ss-evidence ss-evidence--none">—</p>}
            </div>
            <div className="ss-cell">
              <p className="ss-k">{t('map.stateCounter')}</p>
              {s.strongestCounter !== null
                ? <p className="ss-evidence is-counter"><span className="ss-excerpt">{s.strongestCounter.text}</span></p>
                : s.counters.searchedAndFoundNone !== null
                  ? <p className="ss-evidence">{t('map.stateCounterSearchedNone', { n: s.counters.searchedAndFoundNone.queriesAttempted })}</p>
                  : <p className="ss-evidence">{t('map.stateCounterNone')}</p>}
            </div>
            <div className="ss-cell">
              <p className="ss-k">{t('map.stateUnknown')}</p>
              {unknownText !== null && <p className="ss-evidence">{unknownText}</p>}
            </div>
          </div>
          <p className="ss-line">{t('map.stateConfidence', { level: t(`map.qual.${s.confidence.qualitative}` as DictKey) })}</p>
          {s.confidence.factors.length > 0 && (
            <details className="ss-factors">
              <summary>{t('map.stateConfidenceFactors')}</summary>
              <ul>
                {s.confidence.factors.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </details>
          )}
          {s.counterEvidenceCoverage !== null && (
            <p className="ss-line">{t('map.stateCoverage', { q: s.counterEvidenceCoverage.queriesAttempted, n: s.counterEvidenceCoverage.counterRelationsFound })}</p>
          )}
          <p className="ss-line">{t('map.stateOrdering', {
            basis: t(`map.order.basis.${s.ordering.basis}` as DictKey),
            sep: t(`map.order.sep.${s.ordering.topSeparation}` as DictKey),
            tau: s.ordering.agreement !== null ? s.ordering.agreement.toFixed(2) : '—',
          })}</p>
          {leaderFalsifier !== null && <p className="ss-line">{t('map.stateFalsifier', { text: leaderFalsifier.condition })}</p>}
          {s.competing.length > 0 && (
            <p className="ss-line">
              {s.competing.map((c) => (
                <span key={c.hypothesisId} className="ss-competing">{c.differsBy ?? zhFirst(c.statement, c.statementZh, lang)}</span>
              ))}
            </p>
          )}
        </div>
      )}

      {primary !== null && (() => {
        // Server composes the action text bilingually at one site (next-action.ts);
        // the map picks by language with zh fallback for older projections.
        const pa = primary.en !== undefined && lang === 'en' ? { ...primary, ...primary.en } : primary;
        return (
          <div className="map-action">
            <p className="ma-title">{t('map.actionLabel')}{primary.researcherDecisionRequired && <span className="ma-decision">{t('map.actionDecisionRequired')}</span>}</p>
            <p className="ma-objective">{pa.objective}</p>
            <div className="ma-grid">
              <p className="ma-line"><span className="ss-k">{t('map.actionGap')}</span>{pa.knowledgeGap}</p>
              <p className="ma-line"><span className="ss-k">{t('map.actionWhyNow')}</span>{pa.rationale}</p>
              <p className="ma-line"><span className="ss-k">{t('map.actionWouldChange')}</span>{pa.wouldChange}</p>
            </div>
            <p className="ma-meta">
              {`${t('map.actionDiscrimination')} ${t(`map.qual.${primary.expectedDiscrimination}` as DictKey)} · ${t('map.actionFeasibility')} ${t(`map.qual.${primary.feasibility}` as DictKey)} · ${t('map.actionCost')} ${t(`map.qual.${primary.costClass}` as DictKey)}`}
            </p>
            {primary.actionable && primary.actionHint.kind === 'resume' && (
              DISPATCHABLE_ACTIONS.includes(primary.actionType as DispatchableAction) ? (
                <button
                  type="button"
                  className="mb-act mb-act--primary"
                  disabled={busy}
                  onClick={() => onDispatch(primary.actionType as DispatchableAction)}
                >
                  {t(`map.actionBtn.${primary.actionType}` as DictKey)}
                </button>
              ) : (
                <button type="button" className="mb-act mb-act--primary" disabled={busy} onClick={onResume}>{t('map.actionRun')}</button>
              )
            )}
            {primary.actionable && primary.actionHint.kind === 'rerun-live' && (
              <a className="mb-act mb-act--primary" href={`#lab/new?q=${encodeURIComponent(run.questionText ?? '')}`}>{t('map.actionRerun')}</a>
            )}
            {dispatchError !== null && (
              <p className="ma-error" role="alert">{dispatchError}</p>
            )}
            <p className="ma-leg">
              {t('map.legLabel')}：{t(`map.leg.${science.experimentLeg.kind}` as DictKey)}
              {science.experimentLeg.executabilityPassed && ` · ${t('map.legExecutable')}`}
              {science.unconsumedFeedbackCount > 0 && ` · ${t('map.legFeedback', { n: science.unconsumedFeedbackCount })}`}
            </p>
            {rest.length > 0 && (
              <details className="ma-rest">
                <summary>{t('map.actionAlso')}（{rest.length}）</summary>
                <ul>
                  {rest.map((a) => <li key={a.id}><span className="ma-rest-type">{a.actionType}</span>{a.en !== undefined && lang === 'en' ? a.en.objective : a.objective}</li>)}
                </ul>
              </details>
            )}
          </div>
        );
      })()}

      {science.deltas.length > 0 && (
        <div className="map-delta">
          <p className="map-node-label">{t('map.deltaLabel')}</p>
          {science.deltas.slice(0, 2).map((d) => (
            <div key={d.id} className="md-item">
              <p className="md-head">
                <span
                  className="md-versions"
                  title={`${d.fromVersionLabel} → ${d.toVersionLabel}`}
                >{`${versionLabelDisplay(d.fromVersionLabel, t)} → ${versionLabelDisplay(d.toVersionLabel, t)}`}</span>
                <span className={`md-impact md-impact--${d.rankingImpact}`}>{t(`map.deltaImpact.${d.rankingImpact}` as DictKey)}</span>
                <span className={`md-quality md-quality--${d.qualityDelta.status}`}>{t(`map.deltaQuality.${d.qualityDelta.status}` as DictKey)}</span>
              </p>
              <p className="md-line">{t('map.deltaTrigger', { source: d.trigger.feedbackSource })}：{d.trigger.excerpt}</p>
              {d.whatChanged.slice(0, 3).map((op, i) => (
                <p key={`${op.objectId}-${i}`} className="md-op">
                  <span className="md-op-kind">{`${op.objectType} · ${op.operation}`}</span>
                  {op.before !== null && op.after !== null
                    ? <span title={`${op.before} → ${op.after}`}>{`${stripArchiveHash(op.before)} → ${stripArchiveHash(op.after)}`}</span>
                    : op.reason}
                </p>
              ))}
              <p className="md-line"><span className="ss-k">{t('map.deltaWhy')}</span>{d.explanation}</p>
            </div>
          ))}
          {science.deltas.length > 2 && <p className="md-more">+{science.deltas.length - 2}</p>}
        </div>
      )}

      <p className="ss-links">
        {t('map.nextSteps')} · <a href={`#run/${run.id}/plan`}>{t('map.linkPlan')}</a> · <a href={`#run/${run.id}/hypotheses`}>{t('map.linkCompare')}</a> · <a href={`#run/${run.id}/revisions`}>{t('map.linkFeedback')}</a> · <a href={`#run/${run.id}/verify`}>{t('map.linkExport')}</a>
      </p>
    </section>
  );
}
     
