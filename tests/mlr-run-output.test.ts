/**
 * Instrument lock for the 2026-09-05 MLR ledger bug: `research start --json` emits
 * an early {runId,status} ack and a FINAL run report keyed `id` (ResearchRun shape).
 * The old last-line `.runId` read returned undefined for every completed run —
 * 9 live runs were written as runId-less rows invisible to resume and judging.
 * These tests lock BOTH output shapes and the no-json-line refusal path.
 */
import { describe, it, expect } from 'vitest';
import { parseRunOutput } from '../eval/lib.mjs';

describe('parseRunOutput (research start --json stdout)', () => {
  it('reads runId from the FINAL run report, whose identifier field is `id` (the live-burned shape)', () => {
    const stdout = [
      '{"runId":"run_early123","status":"running"}',
      'progress note on stderr-merged output',
      '{"id":"run_final456","status":"completed","currentStage":"export","progress":{"done":12,"total":12}}',
    ].join('\n');
    expect(parseRunOutput(stdout)).toEqual({ runId: 'run_final456', status: 'completed' });
  });

  it('still reads the early ack when it is the only json line (crash/partial path)', () => {
    const stdout = 'noise\n{"runId":"run_only789","status":"running"}\nmore noise';
    expect(parseRunOutput(stdout)).toEqual({ runId: 'run_only789', status: 'running' });
  });

  it('prefers runId over id when the final line carries both (forward-compatible)', () => {
    const stdout = '{"runId":"run_a","id":"run_b","status":"completed"}';
    expect(parseRunOutput(stdout)).toEqual({ runId: 'run_a', status: 'completed' });
  });

  it('returns undefined runId when no json line exists — caller must refuse to write a row', () => {
    expect(parseRunOutput('plain text only\nno json here')).toEqual({ runId: undefined, status: undefined });
  });

  it('last json line wins even if an earlier one looked terminal', () => {
    const stdout = '{"runId":"run_x","status":"completed"}\n{"id":"run_y","status":"partial"}';
    expect(parseRunOutput(stdout)).toEqual({ runId: 'run_y', status: 'partial' });
  });
});
