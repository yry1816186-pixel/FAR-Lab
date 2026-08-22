import { useEffect, useRef, useState } from 'react';
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

type TabId = 'overview' | 'evidence' | 'hypotheses' | 'plan' | 'experiments' | 'revisions' | 'provenance' | 'events';

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

export function RunDetail({
  run,
  events,
  onMutated,
}: {
  run: ResearchRun;
  events: EventsState;
  onMutated: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const [tabId, setTabId] = useState<TabId>('overview');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Feedback drawer (CPP-1): the causal-revision entry, reachable from every
  // tab and pre-targetable by inline object actions. null = open untargeted.
  const [feedbackTarget, setFeedbackTarget] = useState<FeedbackTarget | null | undefined>(undefined);
  const openFeedback = (target?: FeedbackTarget): void => setFeedbackTarget(target ?? null);

  // Run switch resets to the overview tab and closes the drawer.
  useEffect(() => {
    setTabId('overview');
    setFeedbackTarget(undefined);
  }, [run.id]);

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
      case 'evidence': return <EvidenceTab run={run} onFeedback={openFeedback} />;
      case 'hypotheses': return <HypothesesTab run={run} onFeedback={openFeedback} />;
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
