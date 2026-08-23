import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FileSearch, FlaskConical, History, Lightbulb, ListChecks, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import type { ResearchRun, RunEvent } from '../api/types';
import { RunHeader } from './detail/RunHeader';
import { OverviewTab } from './detail/OverviewTab';
import { EvidenceTab } from './detail/EvidenceTab';
import { HypothesesTab } from './detail/HypothesesTab';
import { PlanTab } from './detail/PlanTab';
import { RevisionsTab } from './detail/RevisionsTab';
import { ProvenanceTab } from './detail/ProvenanceTab';
import { EventsTab } from './detail/EventsTab';
import { ResearchStatePanel } from './detail/ResearchStatePanel';
import { FeedbackDrawer } from './detail/FeedbackDrawer';
import type { FeedbackTarget } from './detail/FeedbackForm';
import { ExperimentsTab } from './detail/ExperimentsTab';
import { StreamStatusChip } from './detail/StreamStatusChip';
import type { StreamSnapshot } from '../hooks/eventStreamTracker';

/**
 * Research page information architecture (2026-08 product rebuild): the eight
 * pipeline-projection tabs collapse into six task-oriented sections that match
 * the researcher's mental model. Old hash routes keep working — LEGACY_TABS
 * redirects them (shareable links from earlier versions never break).
 */
export type TabId = 'research' | 'evidence' | 'hypotheses' | 'plan' | 'revisions' | 'verify';

const TAB_IDS: readonly TabId[] = ['research', 'evidence', 'hypotheses', 'plan', 'revisions', 'verify'];

/** Pre-rebuild tab ids -> current sections (hash-route compatibility). */
const LEGACY_TABS: Record<string, TabId> = {
  overview: 'research',
  events: 'research',
  experiments: 'plan',
  provenance: 'verify',
};

/** Route strings come from the URL — resolve (incl. legacy ids) before casting to TabId. */
export function resolveTabId(v: string): TabId | null {
  if ((TAB_IDS as readonly string[]).includes(v)) return v as TabId;
  return LEGACY_TABS[v] ?? null;
}

const TABS: { id: TabId; labelKey: DictKey; Icon: LucideIcon }[] = [
  { id: 'research', labelKey: 'tab.research', Icon: FlaskConical },
  { id: 'evidence', labelKey: 'tab.evidence', Icon: FileSearch },
  { id: 'hypotheses', labelKey: 'tab.hypotheses', Icon: Lightbulb },
  { id: 'plan', labelKey: 'tab.plan', Icon: ListChecks },
  { id: 'revisions', labelKey: 'tab.revisions', Icon: History },
  { id: 'verify', labelKey: 'tab.verify', Icon: ShieldCheck },
];

export interface EventsState {
  events: RunEvent[];
  lastSeq: number;
  total: number;
  error: string | null;
}

/**
 * Cross-tab claim navigation (S3): switching to the evidence tab mounts it
 * fresh; the anchor scroll must run AFTER mount — hence the timeout + a
 * focus() so keyboard users land on the claim, not just a visual jump.
 */
function HypothesisTabWithNav({
  run,
  onFeedback,
  setTabId,
}: {
  run: ResearchRun;
  onFeedback: (target?: FeedbackTarget) => void;
  setTabId: (tab: TabId) => void;
}): JSX.Element {
  const openClaim = useCallback((claimId: string): void => {
    setTabId('evidence');
    window.setTimeout(() => {
      const el = document.getElementById(`claim-${claimId}`);
      if (el !== null) {
        el.scrollIntoView({ block: 'center' });
        el.classList.add('claim-flash');
        window.setTimeout(() => el.classList.remove('claim-flash'), 1600);
      }
    }, 250);
  }, [setTabId]);
  return <HypothesesTab run={run} onFeedback={onFeedback} onOpenClaim={openClaim} />;
}

export function RunDetail({
  run,
  events,
  onMutated,
  tab,
  onTabChange,
  focusClaimId,
  onClaimFocused,
  stream,
}: {
  run: ResearchRun;
  events: EventsState;
  onMutated: () => void;
  /** Controlled tab (hash-route shareable, S3): undefined = use internal state. */
  tab?: TabId;
  onTabChange?: (tab: TabId) => void;
  /** Pending claim to reveal (B2 palette search): switches to evidence and flash-highlights. */
  focusClaimId?: string | null;
  onClaimFocused?: () => void;
  /** Realtime stream health (HX-3): drives the visible reconnect/fallback chip. */
  stream: StreamSnapshot;
}): JSX.Element {
  const { t } = useI18n();
  const [tabId, setTabIdState] = useState<TabId>(tab ?? 'research');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const setTabId = (next: TabId): void => {
    setTabIdState(next);
    onTabChange?.(next);
  };

  // Feedback drawer (CPP-1): the causal-revision entry, reachable from every
  // tab and pre-targetable by inline object actions. null = open untargeted.
  const [feedbackTarget, setFeedbackTarget] = useState<FeedbackTarget | null | undefined>(undefined);
  const openFeedback = (target?: FeedbackTarget): void => setFeedbackTarget(target ?? null);

  // Run switch resets to the research tab and closes the drawer. A route-named
  // tab wins over the default on the next render (controlled tab effect below).
  useEffect(() => {
    setTabIdState(tab ?? 'research');
    setFeedbackTarget(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run-switch only; later `tab` values flow through the controlled effect
  }, [run.id]);

  // External tab control: hash navigation while the same run stays open.
  useEffect(() => {
    if (tab !== undefined) setTabIdState(tab);
  }, [tab]);

  // Palette claim navigation (B2): same affordance as the ACH block — switch
  // to evidence, scroll the claim into view, flash it, then clear the pending
  // request. The evidence tab loads claims asynchronously, so presence is
  // retried a bounded number of times; the pending id is ALWAYS consumed
  // (cleanup included) so a stale request can never replay onto another run.
  useEffect(() => {
    if (focusClaimId === null || focusClaimId === undefined) return;
    setTabId('evidence');
    const claimId = focusClaimId;
    let consumed = false;
    const consume = (): void => {
      if (consumed) return;
      consumed = true;
      onClaimFocused?.();
    };
    let attempt = 0;
    let flashTimer = 0;
    const timer = window.setInterval(() => {
      attempt += 1;
      const el = document.getElementById(`claim-${claimId}`);
      if (el !== null) {
        window.clearInterval(timer);
        el.scrollIntoView({ block: 'center' });
        el.classList.add('claim-flash');
        flashTimer = window.setTimeout(() => el.classList.remove('claim-flash'), 1600);
        consume();
      } else if (attempt >= 12) {
        // ~3s total: honest give-up — the claim may have been superseded by a
        // revision since the search index saw it; the tab switch still landed.
        window.clearInterval(timer);
        consume();
      }
    }, 250);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(flashTimer);
      consume();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on pending claim only
  }, [focusClaimId]);

  const focusTab = (index: number): void => {
    const clamped = Math.max(0, Math.min(TABS.length - 1, index));
    setTabId(TABS[clamped]!.id);
    tabRefs.current[clamped]?.focus();
  };

  const onKeyDown = (ev: React.KeyboardEvent, index: number): void => {
    switch (ev.key) {
      case 'ArrowRight': ev.preventDefault(); focusTab(index + 1); break;
      case 'ArrowLeft': ev.preventDefault(); focusTab(index - 1); break;
      case 'Home': ev.preventDefault(); focusTab(0); break;
      case 'End': ev.preventDefault(); focusTab(TABS.length - 1); break;
      default: break;
    }
  };

  const renderPanel = (): ReactNode => {
    switch (tabId) {
      case 'research':
        return (
          <>
            <OverviewTab run={run} events={events} onMutated={onMutated} onFeedback={openFeedback} onNavigate={setTabId} />
            {/* AVO fusion (G2/G3/G8): living research state — supervisor health,
                evaluator family and trajectory lineage. Progressive disclosure
                inside; raw event stream remains one disclosure below. */}
            <ResearchStatePanel runId={run.id} />
            {/* The raw event stream stays one disclosure away (audit-grade
                transparency without making it the researcher's daily view). */}
            <details className="tech-details events-disclosure">
              <summary>{t('events.disclosureTitle')}</summary>
              <EventsTab run={run} events={events} />
            </details>
          </>
        );
      case 'evidence': return <EvidenceTab run={run} onFeedback={openFeedback} onOpenHypotheses={() => setTabId('hypotheses')} />;
      case 'hypotheses': return (
        <HypothesisTabWithNav run={run} onFeedback={openFeedback} setTabId={setTabId} />
      );
      case 'plan':
        return (
          <>
            <PlanTab run={run} onFeedback={openFeedback} />
            <ExperimentsTab run={run} />
          </>
        );
      case 'revisions': return <RevisionsTab run={run} />;
      case 'verify': return <ProvenanceTab run={run} events={events} onMutated={onMutated} />;
    }
  };

  return (
    <div className="run-detail">
      <RunHeader run={run} />
      {(run.status === 'running' || run.status === 'queued') && <StreamStatusChip snapshot={stream} />}
      <div className="tabs" role="tablist" aria-label={t('tab.listLabel')}>
        {TABS.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => { tabRefs.current[i] = el; }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={tabId === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={tabId === tab.id ? 0 : -1}
            className={`tab${tabId === tab.id ? ' tab--active' : ''}`}
            onClick={() => setTabId(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <tab.Icon size={14} aria-hidden="true" />
            {t(tab.labelKey)}
          </button>
        ))}
      </div>
      <div
        className="tab-panel"
        role="tabpanel"
        id={`panel-${tabId}`}
        aria-labelledby={`tab-${tabId}`}
        tabIndex={0}
      >
        <div className="tab-content">
          {renderPanel()}
        </div>
      </div>
      {feedbackTarget !== undefined && (
        <FeedbackDrawer
          run={run}
          target={feedbackTarget ?? undefined}
          onClose={() => setFeedbackTarget(undefined)}
          onSubmitted={onMutated}
          onViewRevisions={() => {
            setFeedbackTarget(undefined);
            setTabId('revisions');
          }}
        />
      )}
    </div>
  );
}
