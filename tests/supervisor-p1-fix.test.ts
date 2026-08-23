import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';
import { analyzeTrajectory, SUPERVISOR_SIGNAL_KINDS } from '../src/app/supervisor.js';

/**
 * P1-1 fix verification (adversarial review 06): unproductive_cycle must
 * consume the REAL persisted iteration fingerprints (IterationRecord.snapshot
 * via store objects), never a note-detail field no production writer emits.
 */

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-sup2-'));

const openStore = (): { store: Store; runId: string } => {
  const db = openDb(path.join(tmp(), 'far.db'));
  const store = new Store(db);
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  const run = store.createRun(q);
  return { store, runId: run.id };
};

const at = (minutesAgo: number): string => new Date(Date.now() - minutesAgo * 60_000).toISOString();

const putIteration = (
  store: Store,
  runId: string,
  round: number,
  fingerprint: string,
): void => {
  store.putObject('iteration', {
    id: newId('itr'), runId, round,
    decidedAt: new Date().toISOString(),
    decision: round % 2 === 1 ? 'continue' : 'stop',
    reopenStages: [], rationale: `fixture round ${round}`,
    snapshot: {
      round, claims: 0, verifiedClaims: 0, hypotheses: 0, hypothesisVersionSum: 0,
      scorecards: 0, plans: 0, revisions: 0, experimentRunsCompleted: 0,
      feedbackSignals: 0, feedbackConsumed: 0, effectEstimates: 0,
      fingerprint,
    },
    unblockHints: [],
  });
};

describe('unproductive_cycle consumes real iteration fingerprints (P1-1 fix)', () => {
  it('fires when >=3 iteration records share one material fingerprint (busy but flat)', () => {
    const { store, runId } = openStore();
    for (let r = 1; r <= 3; r++) putIteration(store, runId, r, `fp_identical_${'a'.repeat(8)}`);
    // busy activity so stall does not mask the cycle signal
    store.appendEvent(runId, { type: 'note', detail: { text: 'recent work' } });

    const obs = analyzeTrajectory({ store, runId, now: new Date().toISOString(), quietWindowMs: 3_600_000 });
    const sig = obs.signals.find((s) => s.kind === 'unproductive_cycle');
    expect(sig).toBeDefined();
    expect(sig!.evidence.iterations).toBe(3);
    expect(sig!.recommendation.action).toBe('branch_or_deepen');
  });

  it('stays silent when iteration fingerprints differ (material progress is real)', () => {
    const { store, runId } = openStore();
    putIteration(store, runId, 1, 'fp_alpha_111111');
    putIteration(store, runId, 2, 'fp_beta_222222');
    putIteration(store, runId, 3, 'fp_gamma_333333');
    store.appendEvent(runId, { type: 'note', detail: { text: 'recent work' } });

    const obs = analyzeTrajectory({ store, runId, now: new Date().toISOString(), quietWindowMs: 3_600_000 });
    expect(obs.signals.some((s) => s.kind === 'unproductive_cycle')).toBe(false);
  });

  it('does NOT fire on note-detail fingerprints alone (the old dead path)', () => {
    const { store, runId } = openStore();
    // notes carrying a fabricated detail.fingerprint but ZERO iteration records:
    // production writers never emit this field — the signal must stay off.
    for (let i = 0; i < 6; i++) {
      store.appendEvent(runId, { type: 'note', detail: { text: `step ${i}`, fingerprint: 'same' } }, at(50 - i));
    }
    const obs = analyzeTrajectory({ store, runId, now: new Date().toISOString(), quietWindowMs: 3_600_000 });
    expect(obs.signals.some((s) => s.kind === 'unproductive_cycle')).toBe(false);
  });
});

void SUPERVISOR_SIGNAL_KINDS;
