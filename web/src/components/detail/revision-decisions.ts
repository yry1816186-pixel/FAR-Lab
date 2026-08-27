import type { RunEvent } from '../../api/types';
import { revDecisionKey, revHypStatusKey } from '../../i18n/keys';
import type { DictKey } from '../../i18n/dict';
import type { RevDecisionReason, RevHypStatus } from '../../i18n/keys';

/**
 * Researcher decisions (inspector promote/reject/fork, claim pin/annotate/
 * exclude/reclassify/relink) are human actor:'human' note events on the run's
 * append-only event stream. They trigger no feedback entry, so the revisions
 * surface projects them explicitly — otherwise the inspector's "enters the
 * causal chain" promise would be unreadable anywhere.
 * hypothesis_edited_human is intentionally NOT projected: it already produces
 * a full feedback→revision→diff chain entry and would double-count here.
 */
const DECISION_REASON_KEYS: Record<RevDecisionReason, DictKey> = {
  hypothesis_status_changed: revDecisionKey('hypothesis_status_changed'),
  hypothesis_forked: revDecisionKey('hypothesis_forked'),
  claim_linked_human: revDecisionKey('claim_linked_human'),
  claim_annotated_human: revDecisionKey('claim_annotated_human'),
  claim_pinned_human: revDecisionKey('claim_pinned_human'),
  claim_unpinned_human: revDecisionKey('claim_unpinned_human'),
  claim_excluded_human: revDecisionKey('claim_excluded_human'),
  claim_reclassified_human: revDecisionKey('claim_reclassified_human'),
};

export interface ResearcherDecision {
  event: RunEvent;
  labelKey: DictKey;
}

/** Label key distinguishing status flips (from/to are statuses) from forks (ids). */
export const STATUS_CHANGE_LABEL_KEY: DictKey = DECISION_REASON_KEYS.hypothesis_status_changed;

export function decisionLabelKey(event: RunEvent): DictKey | null {
  if (event.type !== 'note') return null;
  const detail = event.detail as { reason?: unknown; actor?: unknown } | undefined;
  if (detail === undefined || detail.actor !== 'human') return null;
  const reason = detail.reason;
  if (typeof reason !== 'string' || reason === 'hypothesis_edited_human') return null;
  // `in` guard: only known decision reasons are projected; unknown event kinds
  // are the event stream's job, not this audit surface's.
  return reason in DECISION_REASON_KEYS ? DECISION_REASON_KEYS[reason as RevDecisionReason] : null;
}

/** Event-seq-ordered decision projection for the revisions surface. */
export function deriveDecisions(events: RunEvent[]): ResearcherDecision[] {
  return events.flatMap((event) => {
    const labelKey = decisionLabelKey(event);
    return labelKey === null ? [] : [{ event, labelKey }];
  });
}

const HYP_STATUS_KEYS: Record<RevHypStatus, DictKey> = {
  active: revHypStatusKey('active'),
  promoted: revHypStatusKey('promoted'),
  rejected: revHypStatusKey('rejected'),
};

/** zh-localized hypothesis status; unknown values render verbatim (audit honesty). */
export function hypStatusLabel(
  status: string,
  t: (key: DictKey, vars?: Record<string, string | number>) => string,
): string {
  return status in HYP_STATUS_KEYS ? t(HYP_STATUS_KEYS[status as RevHypStatus]) : status;
}
