import { describe, it, expect } from 'vitest';
import { normalizeEvidence, normalizeHypotheses, normalizeRevisions } from '../web/src/api/normalize';

/**
 * Fail-closed normalization (W-G follow-up, web review F-01): the module's own contract
 * says "an unknown shape must surface as an error, never as an empty list that would
 * silently look like no data". The three former bare-array firstArray paths are now
 * requireArray — these tests lock that unknown envelopes throw schemaError instead of
 * returning empties.
 */
describe('normalize fail-closed on unknown envelope shapes', () => {
  it('normalizeEvidence: unknown object envelope throws, never returns empty collections', () => {
    expect(() => normalizeEvidence({ evidence_bundle: [{ id: 'clm_x' }] })).toThrow();
    expect(() => normalizeEvidence({ data: 'not-an-array' })).toThrow();
  });

  it('normalizeHypotheses: unknown object envelope throws', () => {
    expect(() => normalizeHypotheses({ candidates: 'not-an-array' })).toThrow();
    expect(() => normalizeHypotheses({ unrelated: { deep: true } })).toThrow();
  });

  it('normalizeRevisions: known envelope with a MISSING key throws (API always sends all three)', () => {
    expect(() => normalizeRevisions({ feedbacks: [], revisions: [] })).toThrow(); // diffs missing
    expect(() => normalizeRevisions({ revisions: [], versionDiffs: [] })).toThrow(); // feedbacks missing
  });

  it('legitimate shapes still pass: bare arrays and full envelopes', () => {
    expect(() => normalizeEvidence([])).not.toThrow();
    expect(() => normalizeHypotheses([])).not.toThrow();
    const full = { feedbacks: [], revisions: [], versionDiffs: [] };
    expect(() => normalizeRevisions(full)).not.toThrow();
  });
});
