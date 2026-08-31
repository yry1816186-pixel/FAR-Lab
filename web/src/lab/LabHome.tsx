import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ApiError } from '../api/client';
import { Badge, ErrorBox, TimeAgo } from '../components/common';
import { useI18n } from '../i18n/LanguageContext';
import { getHypotheses } from '../api/endpoints';
import type { Conversation, HypothesisCandidate, RunSummary } from '../api/types';
import { runStatusKey, runStatusTone } from '../tones';
import { groupStudies, runLabel } from '../studies';
import { useHealth } from '../hooks/useHealth';
import { NewResearch } from './NewResearch';
import './lab.css';

/** Studies shown before the expand toggle (search overrides). */
const STUDY_PREVIEW = 10;

/**
 * Lab home — the product's front door AND its only creation surface (Research
 * Experience Architecture A). One entry point, no competing destinations:
 * the new-research compose zone sits at the top of the workspace, followed by
 * what needs my judgment now (intervention queue), my studies (index, one
 * study per question), and — only on a fresh workspace — the first-use path
 * (what this is, environment check, model config). No system-object lists:
 * every row is a decision or a study, in researcher language.
 */
export function LabHome({
  runs, runsLoading, runsError, conversations,
  composeOpen, onComposeOpenChange, initialQuestion,
  onOpenStudy, onOpenConversation, onStartConversation, onOpenSettings, onRetryRuns, onLaunched, onJudgmentCount,
}: {
  runs: RunSummary[];
  runsLoading: boolean;
  runsError: ApiError | null;
  conversations: Conversation[];
  /** Compose zone expanded (mirrors `#lab/new`) — the shell owns the state so
   *  the URL and the panel can never disagree. */
  composeOpen: boolean;
  onComposeOpenChange: (open: boolean) => void;
  /** Question handed to the compose zone (deep link / spine rerun). */
  initialQuestion: string | null;
  onOpenStudy: (runId: string) => void;
  onOpenConversation: (id: string) => void;
  /** Open a fresh dialogue to shape the question before launching. */
  onStartConversation: () => void;
  onOpenSettings: () => void;
  onRetryRuns: () => void;
  onLaunched: (runId: string) => void;
  /** Lifts the judgment-queue size to the shell (rail badge) — one truth. */
  onJudgmentCount?: (n: number) => void;
}): JSX.Element {
  const { t } = useI18n();
/** Fixed-height placeholders shown while runs load: the queue layout keeps its
 * final footprint from first paint, so late-arriving rows cannot shift it
 * (perf §21 CLS ceiling 0.1; live-observed 0.135 under a loaded suite). */
const QueueSkeleton = ({ rows = 2 }: { rows?: number }): JSX.Element => (
  <>
    {Array.from({ length: rows }, (_, i) => <div key={i} className="queue-item queue-item--skeleton" />)}
  </>
);
  const fresh = !runsLoading && runs.length === 0;
  const [counterStudyIds, setCounterStudyIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [showAllStudies, setShowAllStudies] = useState(false);
  const { health, healthError, checking } = useHealth();

  // Stable probe key: completed-run ids + their updatedAt — unchanged polls
  // (identical arrays from the 5s list refresh) do NOT re-probe hypotheses.
  const probeKey = useMemo(
    () => runs.filter((r) => r.status === 'completed').slice(0, 5).map((r) => r.id).join('|'),
    [runs],
  );
  // Judgment items: counter-evidence studies (top completed studies probed).
  useEffect(() => {
    if (runs.length === 0) { setCounterStudyIds([]); return; }
    // Probe at most the latest 5 completed runs; more would just slow the home.
    const probe = runs.filter((r) => r.status === 'completed').slice(0, 5);
    const c = new AbortController();
    void Promise.all(probe.map(async (r) => {
      try {
        const h = await getHypotheses(r.id, c.signal);
        return (h.hypotheses.filter((x: HypothesisCandidate) => (x.counterClaimIds?.length ?? 0) > 0).length > 0) ? r.id : null;
      } catch { return null; }
    })).then((ids) => { setCounterStudyIds(ids.filter((x): x is string => x !== null)); });
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- probe keyed on the stable id set of completed runs, not the polled array reference (5s re-probe storm, §27 R2-P1-2)
  }, [probeKey]);

  const live = runs.filter((r) => r.status === 'running' || r.status === 'queued');
  const attentionAll = runs.filter((r) => r.status === 'partial' || r.status === 'failed');
  const attention = attentionAll.slice(0, 4);
  const attentionHidden = attentionAll.length - attention.length;
  // §8.2 drafts (created/paused): a study awaiting its launch decision IS a
  // judgment item — it floats in the queue (most recent first), not buried in
  // the library index. The map's ScopeReview owns the actual resume surface.
  const drafts = runs
    .filter((r) => r.status === 'created' || r.status === 'paused')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 4);

  const studies = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return groupStudies(runs);
    const filtered = runs.filter((r) =>
      runLabel(r).toLowerCase().includes(needle) ||
      (r.domain ?? '').toLowerCase().includes(needle) ||
      t(runStatusKey(r.status)).toLowerCase().includes(needle));
    return groupStudies(filtered);
  }, [runs, query, t]);

  // Density (§8.6): the index previews recent studies and expands on demand —
  // a 35-study library must not scroll the judgment queue off the first screen.
  // Searching overrides the preview (matches are the intent).
  const searching = query.trim().length > 0;
  const visibleStudies = searching ? studies.slice(0, 50) : showAllStudies ? studies : studies.slice(0, STUDY_PREVIEW);

  const probeSet = new Set(counterStudyIds);
  // Second-wave rows (counter probe) insert AFTER first paint — each extra
  // row pushes the studies section down and burns CLS budget (measured 0.106
  // with 2 rows on a loaded workspace; §21 ceiling 0.1). The queue is a
  // PREVIEW surface: one counter decision here, the rest live in the studies
  // index (which carries its own counter markers) — first paint stays stable.
  const counterStudies = runs.filter((r) => probeSet.has(r.id)).slice(0, 1);

  // Rail badge truth: every study waiting on the researcher (queue rows may
  // cap for layout; the count stays complete — never a smaller number than
  // the actual workload).
  useEffect(() => {
    onJudgmentCount?.(live.length + attentionAll.length + drafts.length + counterStudies.length);
  }, [live.length, attentionAll.length, drafts.length, counterStudies.length, onJudgmentCount]);

  // One compose zone, one truth. FirstUse stays mounted across the initial
  // runs request so a fresh-workspace transition cannot discard a question,
  // selected file, dictation result, or an in-flight parse.
  // It is never a second destination — the rail's 工作台 entry is the only
  // navigation item that leads here.
  const composeZone = (autoFocus: boolean): JSX.Element => (
    <NewResearch
      open={composeOpen}
      onOpenChange={onComposeOpenChange}
      initialQuestion={initialQuestion}
      autoFocus={autoFocus}
      onLaunched={onLaunched}
      onOpenConversation={onStartConversation}
    />
  );

  return (
    <div className="lab-root">
      {/* No topline on the home: the rail's 工作台 entry already names this
          surface — a second header bar burned vertical space and doubled the
          brand voice (fresh-zone review 2026-08-29). */}
      <main className="queue-canvas">
        {runsError !== null && <ErrorBox error={runsError} onRetry={onRetryRuns} />}

        <FirstUse
          active={fresh}
          health={health}
          healthError={healthError !== null}
          checking={checking}
          onOpenSettings={onOpenSettings}
          compose={composeZone(fresh)}
        >
          {!fresh && (
          <>
            <section className="queue-section" aria-labelledby="labq-judgment">
              <h2 className="queue-section-title" id="labq-judgment">{t('labhome.judgmentTitle')}</h2>
              <p className="queue-section-sub">{t('labhome.judgmentSub')}</p>
              {runsLoading
                ? <QueueSkeleton rows={4} />
                : live.length === 0 && attention.length === 0 && counterStudies.length === 0 && drafts.length === 0
                ? <p className="queue-empty">{t('labhome.judgmentEmpty')}</p>
                : (
                  <>
                    {live.map((r) => (
                      <QueueRow
                        key={r.id} sev="live"
                        title={runLabel(r).slice(0, 90)}
                        why={r.progress !== undefined
                          ? t('labhome.liveWhyProgress', { stage: t(`stage.${r.currentStage}`), done: r.progress.done, total: r.progress.total })
                          : t('labhome.liveWhy', { stage: t(`stage.${r.currentStage}`) })}
                        action={t('labhome.watch')}
                        onClick={() => onOpenStudy(r.id)}
                      />
                    ))}
                    {drafts.map((r) => (
                      <QueueRow
                        key={`draft-${r.id}`} sev="review"
                        title={runLabel(r).slice(0, 90)}
                        why={r.status === 'paused'
                          ? t('labhome.draftWhyProposed')
                          : t('labhome.draftWhyNew')}
                        action={t('labhome.draftResume')}
                        onClick={() => onOpenStudy(r.id)}
                      />
                    ))}
                    {attention.map((r) => (
                      <QueueRow
                        key={r.id} sev="attention"
                        title={runLabel(r).slice(0, 90)}
                        why={t('labhome.attentionWhy', {
                          status: t(runStatusKey(r.status)),
                          reason: failureCause(r.lastError ?? t('labhome.seeStudyMap'), t),
                        })}
                        action={t('labhome.handle')}
                        onClick={() => onOpenStudy(r.id)}
                      />
                    ))}
                    {attentionHidden > 0 && (
                      <p className="queue-empty">{t('labhome.attentionHidden', { n: attentionHidden })}</p>
                    )}
                    {counterStudies.map((r) => (
                      <QueueRow
                        key={`ctr-${r.id}`} sev="review"
                        title={runLabel(r).slice(0, 90)}
                        why={t('labhome.counterWhy')}
                        action={t('labhome.review')}
                        onClick={() => onOpenStudy(r.id)}
                      />
                    ))}
                  </>
                )}
            </section>

            <section className="queue-section" aria-labelledby="labq-studies">
              <div className="queue-section-head">
                <h2 className="queue-section-title" id="labq-studies">{t('labhome.studiesTitle')}</h2>
                <div className="lab-search">
                  <Search size={12} aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    placeholder={t('labhome.searchStudies')}
                    aria-label={t('labhome.searchStudies')}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
              <p className="queue-section-sub">{t('labhome.studiesSub')}</p>
              {runsLoading
                ? <QueueSkeleton rows={5} />
                : studies.length === 0
                ? <p className="queue-empty">{t('labhome.studiesNoMatch')}</p>
                : visibleStudies.map((g) => {
                  const active = g.activeCount > 0;
                  // Dot encodes ATTENTION, not identity: running pulses, drafts
                  // and attention states carry warm colors, settled studies go
                  // neutral — the badge already states the outcome, and a
                  // colored dot on top contradicted it (blue × completed).
                  const latest = g.latest.status;
                  const sev = latest === 'running' || latest === 'queued' ? 'sev-live'
                    : latest === 'partial' || latest === 'failed' ? 'sev-attention'
                    : latest === 'created' || latest === 'paused' ? 'sev-review'
                    : 'sev-done';
                  return (
                    <button
                      type="button"
                      key={g.key}
                      className={`queue-item queue-item--study ${sev}`}
                      onClick={() => onOpenStudy(g.latest.id)}
                    >
                      <span className="q-dot" aria-hidden="true" />
                      <span className="q-main">
                        <span className="q-title">{g.question}</span>
                        <span className="q-why">
                          {g.runs.length > 1 && t('labhome.runsCount', { n: g.runs.length })}
                          {' · '}
                          {active
                            ? <Badge tone="info">{t('labhome.studyActive')}</Badge>
                            : <Badge tone={runStatusTone(g.latest.status)}>{t(runStatusKey(g.latest.status))}</Badge>}
                          {' · '}
                          <TimeAgo iso={g.latest.createdAt} />
                        </span>
                      </span>
                      <span className="q-act">{t('labhome.openMap')}</span>
                    </button>
                  );
                })}
              {!searching && studies.length > STUDY_PREVIEW && (
                <button
                  type="button"
                  className="lab-studies-toggle"
                  aria-expanded={showAllStudies}
                  onClick={() => setShowAllStudies((v) => !v)}
                >
                  {showAllStudies
                    ? t('labhome.collapseStudies')
                    : t('labhome.showAllStudies', { n: studies.length })}
                </button>
              )}
            </section>

            {conversations.length > 0 && (
              <section className="queue-section" aria-labelledby="labq-convs">
                <h2 className="queue-section-title" id="labq-convs">{t('labhome.convsTitle')}</h2>
                <p className="queue-section-sub">{t('labhome.convsSub')}</p>
                <div className="lab-conv-row">
                  {conversations.slice(0, 6).map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      className="lab-conv-chip"
                      onClick={() => onOpenConversation(c.id)}
                      title={c.title}
                    >
                      <span className="lab-conv-title">{c.title}</span>
                      <span className="lab-conv-meta">{t('conv.turns', { n: c.turns })} · <TimeAgo iso={c.updatedAt} /></span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
          )}
        </FirstUse>
      </main>
    </div>
  );
}

/** First-use zone (G1): what this is, is the engine ready, and the compose
 *  zone itself — the first-run researcher types their question HERE, not after
 *  a navigation hop. */
function FirstUse({ active, health, healthError, checking, onOpenSettings, compose, children }: {
  active: boolean;
  health: { status: string; db: string; providers: { name: string; kind: string; liveReady: boolean }[] } | null;
  healthError: boolean;
  checking: boolean;
  onOpenSettings: () => void;
  compose: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  const { t } = useI18n();
  const liveProviders = health?.providers.filter((p) => p.kind === 'live') ?? [];
  const ready = liveProviders.filter((p) => p.liveReady);
  const engineOk = health !== null && health.db === 'ok';
  const routesOk = ready.length > 0;

  return (
    <section className={active ? 'firstuse' : undefined} aria-labelledby={active ? 'fu-title' : undefined}>
      <div hidden={!active}>
        <h1 className="fu-title" id="fu-title">{t('labhome.fuTitle')}</h1>
        <p className="fu-lede">{t('labhome.fuLede')}</p>

        <div className="fu-checks" role="list" aria-label={t('labhome.fuChecks')}>
          <div className="fu-check" role="listitem">
            <span className={`fu-dot ${engineOk ? 'ok' : healthError || !checking ? 'err' : 'wait'}`} aria-hidden="true" />
            <span className="fu-check-main">
              <span className="fu-check-name">{t('labhome.fuEngine')}</span>
              <span className="fu-check-why">
                {checking && health === null && !healthError ? t('labhome.fuChecking') : engineOk ? t('labhome.fuEngineOk') : t('labhome.fuEngineBad')}
              </span>
            </span>
          </div>
          <div className="fu-check" role="listitem">
            <span className={`fu-dot ${routesOk ? 'ok' : healthError || (!checking && health !== null) ? 'warn' : 'wait'}`} aria-hidden="true" />
            <span className="fu-check-main">
              <span className="fu-check-name">{t('labhome.fuRoutes')}</span>
              <span className="fu-check-why">
                {checking && health === null && !healthError
                  ? t('labhome.fuChecking')
                  : healthError
                    ? t('labhome.fuRoutesUnknown')
                    : routesOk
                      ? t('labhome.fuRoutesOk', { ready: ready.length, total: liveProviders.length })
                      : t('labhome.fuRoutesZero')}
              </span>
              {/* Route detail (P2 fix): WHICH routes are ready — one CHIP per
                  route, the mark inside the chip so it cannot read as a
                  separator ("✓ zai – dashscope" was misread as "dashscope
                  not ready"). Unready chips say WHY via title. */}
              {!checking && !healthError && liveProviders.length > 0 && (
                <span className="fu-routes-detail">
                  {liveProviders.map((p) => (
                    <span key={p.name} className={`fu-route${p.liveReady ? ' is-ready' : ''}`} title={p.liveReady ? t('labhome.fuRouteReady') : t('labhome.fuRouteNotReady')}>
                      {p.name}{p.liveReady ? ' ✓' : ` · ${t('labhome.fuRouteNotReadyShort')}`}
                    </span>
                  ))}
                </span>
              )}
              {/* Repair path whenever ANY route is unready (not only at zero):
                  the chip names the gap; this link owns the next action. */}
              {!checking && !healthError && ready.length < liveProviders.length && (
                <button type="button" className="fu-check-act" onClick={onOpenSettings}>{t('labhome.fuConfigure')}</button>
              )}
            </span>
          </div>
        </div>

        {!routesOk && !checking && (
          <p className="fu-hint">{t('labhome.fuRoutesHint')}</p>
        )}
      </div>

      {/* The compose zone IS the first step — the researcher types here, in
          the same surface that will later hold the queue and the studies. */}
      {compose}

      {active && <p className="fu-note">{t('labhome.fuNote')}</p>}
      {children}
    </section>
  );
}

/** Researcher-language failure causes (§14: internal jargon recedes; raw
 * strings stay reachable via the title tooltip for diagnosis). */
function failureCause(raw: string, t: ReturnType<typeof useI18n>['t']): string {
  if (/rate_limited|429/.test(raw)) return t('labhome.causeRateLimited');
  if (/quota_exceeded|HTTP 402/.test(raw)) return t('labhome.causeQuota');
  if (/timeout|budget \d+ms/.test(raw)) return t('labhome.causeTimeout');
  if (/network|ECONN|fetch failed/.test(raw)) return t('labhome.causeNetwork');
  return raw.length > 90 ? `${raw.slice(0, 90)}…` : raw;
}

function QueueRow({ sev, title, why, action, onClick }: {
  sev: 'live' | 'attention' | 'review';
  title: string;
  why: string;
  action: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <div className={`queue-item sev-${sev}`}>
      <span className="q-dot" aria-hidden="true" />
      <span className="q-main">
        <span className="q-title">{title}</span>
        <span className="q-why">{why}</span>
      </span>
      <button type="button" className="q-act" onClick={onClick}>{action}</button>
    </div>
  );
}
