import { describe, it, expect } from 'vitest';
import { deriveDecisions, decisionLabelKey, hypStatusLabel } from '../web/src/components/detail/revision-decisions';
import type { RunEvent } from '../web/src/api/types';
import { zh, en } from '../web/src/i18n/dict';

/**
 * Researcher-decision projection for the revisions surface (G12 walkthrough
 * finding): inspector decisions are actor:'human' note events on the event
 * stream but trigger no feedback entry — without this projection the
 * inspector's "enters the causal chain" promise is unreadable. The filter must
 * discriminate: only human decision notes, never edited_human (already in the
 * feedback chain) or machine notes, and unknown reasons never render raw.
 */
function note(seq: number, detail: Record<string, unknown>): RunEvent {
  return { seq, runId: 'run_x', at: '2026-08-27T00:00:00.000Z', type: 'note', detail };
}

const zhDict = zh as Record<string, string>;

const HUMAN_REASONS = [
  'hypothesis_status_changed',
  'hypothesis_forked',
  'claim_linked_human',
  'claim_annotated_human',
  'claim_pinned_human',
  'claim_unpinned_human',
  'claim_excluded_human',
  'claim_reclassified_human',
] as const;

describe('decision projection filter', () => {
  it('includes every human decision reason and maps it to a non-empty DictKey', () => {
    for (const reason of HUMAN_REASONS) {
      const labelKey = decisionLabelKey(note(1, { reason, actor: 'human' }));
      expect(labelKey, reason).toBeTruthy();
      expect(typeof labelKey, reason).toBe('string');
    }
  });

  it('excludes hypothesis_edited_human (already a full feedback->revision->diff chain entry)', () => {
    expect(decisionLabelKey(note(1, { reason: 'hypothesis_edited_human', actor: 'human' }))).toBeNull();
  });

  it('excludes machine/system notes and non-note events', () => {
    expect(decisionLabelKey(note(1, { reason: 'hypothesis_status_changed', actor: 'system' }))).toBeNull();
    expect(decisionLabelKey(note(1, { reason: 'hypothesis_status_changed' }))).toBeNull();
    expect(decisionLabelKey({ seq: 1, runId: 'r', at: '', type: 'stage_started', stage: 'scope' })).toBeNull();
  });

  it('excludes unknown human reasons instead of rendering raw event kinds', () => {
    expect(decisionLabelKey(note(1, { reason: 'totally_unknown_human_thing', actor: 'human' }))).toBeNull();
  });

  it('deriveDecisions preserves event-seq order and attaches details', () => {
    const decisions = deriveDecisions([
      note(178, { reason: 'hypothesis_status_changed', actor: 'human', hypothesisId: 'h1', from: 'active', to: 'rejected' }),
      note(40, { reason: 'loop_status_guidance' }),
      note(200, { reason: 'claim_pinned_human', actor: 'human', claimId: 'c1' }),
    ]);
    expect(decisions.map((d) => d.event.seq)).toEqual([178, 200]);
    expect(decisions[0].event.detail).toMatchObject({ from: 'active', to: 'rejected' });
    expect(decisions[1].labelKey).toContain('claim_pinned');
  });

  it('every mapped label key exists in BOTH dictionaries', () => {
    const enDict = en as Record<string, string>;
    for (const reason of HUMAN_REASONS) {
      const key = `rev.decision.${reason}`;
      expect(zhDict[key], `zh ${key}`).toBeTruthy();
      expect(enDict[key], `en ${key}`).toBeTruthy();
    }
    expect(zhDict['rev.hypStatus.rejected']).toBe('已淘汰');
    expect(enDict['rev.hypStatus.rejected']).toBe('rejected');
  });
});

describe('hypStatusLabel', () => {
  const throughZh = () => (key: string) => zhDict[key] ?? key;

  it('localizes known statuses via the zh dict', () => {
    expect(hypStatusLabel('rejected', throughZh())).toBe('已淘汰');
    expect(hypStatusLabel('promoted', throughZh())).toBe('主线');
    expect(hypStatusLabel('active', throughZh())).toBe('活跃');
  });

  it('renders unknown statuses verbatim (audit honesty, no invented labels)', () => {
    expect(hypStatusLabel('mystery_state', throughZh())).toBe('mystery_state');
  });
});
