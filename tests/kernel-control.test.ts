import { describe, expect, it } from 'vitest';
import { makeKernelControlState, selectNextBestAction } from '../src/domain/kernel-control.js';

describe('state-driven kernel control', () => {
  it('selects highest priority action deterministically', () => {
    const action = selectNextBestAction([
      { kind: 'retrieve', rationale: 'close evidence gap', expectedInformationGain: 'high', priority: 2 },
      { kind: 'review', rationale: 'human review', expectedInformationGain: 'low', priority: 1 },
    ], 1, 2);
    expect(action?.kind).toBe('retrieve');
  });

  it('persists bounded budget, attempt and stuck/cancel predicates', () => {
    const state = makeKernelControlState({
      id: 'kc_01j3x8m0s4k2x8m0s4k2x8m0s4',
      runId: 'run_01j3x8m0s4k2x8m0s4k2x8m0s4',
      cap: 100,
      spent: 90,
      attempts: 4,
      noChange: 3,
      cancelRequested: true,
      lastAction: 'retrieve',
      nextAction: { kind: 'retrieve', rationale: 'same gap', expectedInformationGain: 'high' },
    });
    expect(state.budget.remaining).toBe(10);
    expect(state.stuck.detected).toBe(true);
    expect(state.cancellation.requested).toBe(true);
    expect(state.completion.satisfied).toBe(false);
  });
});
