import { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { ApiError } from '../api/client';
import { Badge, ErrorBox, TimeAgo } from '../components/common';
import { useI18n } from '../i18n/LanguageContext';
import { getHypotheses } from '../api/endpoints';
import type { Conversation, HypothesisCandidate, RunSummary } from '../api/types';
import { runStatusKey, runStatusTone } from '../tones';
import { groupStudies, runLabel } from '../studies';
import { useHealth } from '../hooks/useHealth';
import './lab.css';

/** Studies shown before the expand toggle (search overrides). */
const STUDY_PREVIEW = 10;

/**
 * Lab home — the product's front door (Research Experience Architecture A).
 * Three researcher-owned zones: what needs my judgment now (intervention
 * queue), my studies (index, one study per question), and — only on a fresh
 * workspace — the first-use path (what this is, environment check, model
 * config, first question). No system-object lists: every row is a decision
 * or a study, in researcher language.
 */
export function LabHome({
  runs, runsLoading, runsError, conversations,
  onOpenStudy, onNewResearch, onOpenConversation, onOpenSettings, onRetryRuns,
}: {
  runs: RunSummary[];
  runsLoading: boolean;
  runsError: ApiError | null;
  conversations: Conversation[];
  onOpenStudy: (runId: string) => void;
  onNewResearch: () => void;
  onOpenConversation: (id: string) => void;
  onOpenSettings: () => void;
  onRetryRuns: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const fresh = !runsLoading && runs.length === 0;
  const [counterStudyIds, setCounterStudyIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [showAllStudies, setShowAllStudies] = useState(false);
  const { health, healthError, checking } = useHealth();

  // Judgment items: counter-evidence studies (top completed studies probed).
  useEffect(() => {
    if (runs.length === 0) { setCounterStudyIds([]); return; }
    const completed = runs.filter((r) => r.status === 'completed');
    // Probe at most the latest 5 completed runs; more would just slow the home.
    const probe = completed.slice(0, 5);
    const c = new AbortController();
    void Promise.all(probe.map(async (r) => {
      try {
        const h = await getHypotheses(r.id, c.signal);
        return (h.hypotheses.filter((x: HypothesisCandidate) => (x.counterClaimIds?.length ?? 0) > 0).length > 0) ? r.id : null;
      } catch { return null; }
    })).then((ids) => { setCounterStudyIds(ids.filter((x): x is string => x !== null)); });
    return () => c.abort();
  }, [runs]);

  const live = runs.filter((r) => r.status === 'running' || r.status === 'queued');
  const attention = runs.filter((r) => r.status === 'partial' || r.status === 'failed').slice(0, 4);

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
  const counterStudies = runs.filter((r) => probeSet.has(r.id));

  return (
    <div className="lab-root">
      <header className="lab-topline">
        <span className="lab-title">{t('labhome.title')}</span>
        <span className="lab-spacer" />
        <button type="button" className="lab-new-btn" onClick={onNewResearch}>
          <Plus size={13} aria-hidden="true" /> {t('labhome.newResearch')}
        </button>
      </header>

      <main className="queue-canvas">
        {runsError !== null && <ErrorBox error={runsError} onRetry={onRetryRuns} />}

        {fresh ? (
          <FirstUse
            health={health}
            healthError={healthError !== null}
            checking={checking}
            onNewResearch={onNewResearch}
            onOpenSettings={onOpenSettings}
          />
        ) : (
          <>
            <section className="queue-section" aria-labelledby="labq-judgment">
              <h2 className="queue-section-title" id="labq-judgment">{t('labhome.judgmentTitle')}</h2>
              <p className="queue-section-sub">{t('labhome.judgmentSub')}</p>
              {live.length === 0 && attention.length === 0 && counterStudies.length === 0
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
                    {attention.map((r) => (
                      <QueueRow
                        key={r.id} sev="attention"
                        title={runLabel(r).slice(0, 90)}
                        why={t('labhome.attentionWhy', {
                          status: t(runStatusKey(r.status)),
                          reason: failureCause(r.lastError ?? t('labhome.seeStudyMap')),
                        })}
                        action={t('labhome.handle')}
                        onClick={() => onOpenStudy(r.id)}
                      />
                    ))}
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
              {studies.length === 0
                ? <p className="queue-empty">{t('labhome.studiesNoMatch')}</p>
                : visibleStudies.map((g) => {
                  const active = g.activeCount > 0;
                  return (
                    <button
                      type="button"
                      key={g.key}
                      className="queue-item queue-item--study sev-info"
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
      </main>
    </div>
  );
}

/** First-use zone (G1): what this is, is the engine ready, and the one first step. */
function FirstUse({ health, healthError, checking, onNewResearch, onOpenSettings }: {
  health: { status: string; db: string; providers: { name: string; kind: string; liveReady: boolean }[] } | null;
  healthError: boolean;
  checking: boolean;
  onNewResearch: () => void;
  onOpenSettings: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const liveProviders = health?.providers.filter((p) => p.kind === 'live') ?? [];
  const ready = liveProviders.filter((p) => p.liveReady);
  const engineOk = health !== null && health.db === 'ok';
  const routesOk = ready.length > 0;

  return (
    <section className="firstuse" aria-labelledby="fu-title">
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
            {!routesOk && !checking && !healthError && (
              <button type="button" className="fu-check-act" onClick={onOpenSettings}>{t('labhome.fuConfigure')}</button>
            )}
          </span>
        </div>
      </div>

      {!routesOk && !checking && (
        <p className="fu-hint">{t('labhome.fuRoutesHint')}</p>
      )}

      <button type="button" className="fu-start" onClick={onNewResearch}>
        {t('labhome.fuStart')}
      </button>
      <p className="fu-note">{t('labhome.fuNote')}</p>
    </section>
  );
}

/** Researcher-language failure causes (§14: internal jargon recedes; raw
 * strings stay reachable via the title tooltip for diagnosis). */
function failureCause(raw: string): string {
  if (/rate_limited|429/.test(raw)) return '模型路线限流——稍后恢复即可续跑';
  if (/quota_exceeded|HTTP 402/.test(raw)) return '模型配额耗尽——充值或切换路线后可续跑';
  if (/timeout|budget \d+ms/.test(raw)) return '模型响应超时——可从断点恢复';
  if (/network|ECONN|fetch failed/.test(raw)) return '网络错误——可从断点恢复';
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
