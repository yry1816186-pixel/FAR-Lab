import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import type { ResearchRun, RunEvent } from '../api/types';
import { OverviewTab } from './detail/OverviewTab';
import { EvidenceTab } from './detail/EvidenceTab';
import { HypothesesTab } from './detail/HypothesesTab';
import { PlanTab } from './detail/PlanTab';
import { RevisionsTab } from './detail/RevisionsTab';
import { ProvenanceTab } from './detail/ProvenanceTab';
import { EventsTab } from './detail/EventsTab';
import { FeedbackDrawer } from './detail/FeedbackDrawer';
import type { FeedbackTarget } from './detail/FeedbackForm';
import { ExperimentsTab } from './detail/ExperimentsTab';

export type TabId = 'overview' | 'evidence' | 'hypotheses' | 'plan' | 'experiments' | 'revisions' | 'provenance' | 'events';

/** Route strings come from the URL — validate before casting to TabId. */
export function isTabId(v: string): v is TabId {
  return ['overview', 'evidence', 'hypotheses', 'plan', 'experiments', 'revisions', 'provenance', 'events'].includes(v);
}

const TABS: { id: TabId; labelKey: DictKey }[] = [
  { id: 'overview', labelKey: 'tab.overview' },
  { id: 'evidence', labelKey: 'tab.evidence' },
  { id: 'hypotheses', labelKey: 'tab.hypotheses' },
  { id: 'plan', labelKey: 'tab.plan' },
  { id: 'experiments', labelKey: 'tab.experiments' },
  { id: 'revisions', labelKey: 'tab.revisions' },
  { id: 'provenance', labelKey: 'tab.provenance' },
  { id: 'events', labelKey: 'tab.events' },
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
}): JSX.Element {
  const { t } = useI18n();
  const [tabId, setTabIdState] = useState<TabId>(tab ?? 'overview');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const setTabId = (next: TabId): void => {
    setTabIdState(next);
    onTabChange?.(next);
  };

  // Feedback drawer (CPP-1): the causal-revision entry, reachable from every
  // tab and pre-targetable by inline object actions. null = open untargeted.
  const [feedbackTarget, setFeedbackTarget] = useState<FeedbackTarget | null | undefined>(undefined);
  const openFeedback = (target?: FeedbackTarget): void => setFeedbackTarget(target ?? null);

  // Run switch resets to the overview tab and closes the drawer. A route-named
  // tab wins over the default on the next render (controlled tab effect below).
  useEffect(() => {
    setTabIdState(tab ?? 'overview');
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
      case 'overview': return <OverviewTab run={run} events={events} onMutated={onMutated} onFeedback={openFeedback} />;
      case 'evidence': return <EvidenceTab run={run} onFeedback={openFeedback} onOpenHypotheses={() => setTabId('hypotheses')} />;
      case 'hypotheses': return (
        <HypothesisTabWithNav run={run} onFeedback={openFeedback} setTabId={setTabId} />
      );
      case 'plan': return <PlanTab run={run} onFeedback={openFeedback} />;
      case 'experiments': return <ExperimentsTab run={run} />;
      case 'revisions': return <RevisionsTab run={run} />;
      case 'provenance': return <ProvenanceTab run={run} events={events} onMutated={onMutated} />;
      case 'events': return <EventsTab run={run} events={events} />;
    }
  };

  return (
    <div className="run-detail">
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
        {renderPanel()}
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
