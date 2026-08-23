import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';
import {
  analyzeTrajectory,
  SUPERVISOR_SIGNAL_KINDS,
  type SupervisorSignal,
  type TrajectoryObservation,
} from '../src/app/supervisor.js';

/**
 * Research supervisor (AVO fusion, G2): deterministic trajectory analysis over
 * the append-only event spine. The supervisor OBSERVES and RECOMMENDS; it never
 * mutates run state (that stays the orchestrator's exclusive authority) and it
 * never judges science (LLM advisory lives elsewhere). All offline, real Store.
 */

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-sup-'));

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

describe('supervisor signal vocabulary', () => {
  it('exposes a closed, documented set of signal kinds', () => {
    // AVO blog/paper failure modes mapped to machine-readable kinds; closed set
    // so consumers can switch exhaustively.
    expect([...SUPERVISOR_SIGNAL_KINDS].sort()).toEqual([
      'repeated_failure', 'stalled_horizon', 'unproductive_cycle',
    ].sort());
  });
});

describe('analyzeTrajectory — stall detection (AVO "stall when exploration line is exhausted")', () => {
  it('flags stalled_horizon when no events arrived within the quiet window', () => {
    const { store, runId } = openStore();
    // last event was created by createRun just now -> NOT stalled
    let obs = analyzeTrajectory({ store, runId, now: new Date().toISOString(), quietWindowMs: 60_000 });
    expect(obs.signals.some((s) => s.kind === 'stalled_horizon')).toBe(false);

    // pretend time advanced far beyond the quiet window -> stalled
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    obs = analyzeTrajectory({ store, runId, now: future, quietWindowMs: 60_000 });
    const sig = obs.signals.find((s) => s.kind === 'stalled_horizon');
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe('high');
    expect(sig!.recommendation.action).toBe('resume_or_replan');
  });

  it('reports a healthy trajectory with zero signals when work is recent and varied', () => {
    const { store, runId } = openStore();
    store.appendEvent(runId, { type: 'stage_started', stage: 'retrieve' }, at(30));
    store.appendEvent(runId, { type: 'stage_done', stage: 'retrieve' }, at(25));
    store.appendEvent(runId, { type: 'note', detail: { text: 'pivot: check alternative mechanism' } }, at(10));
    const obs = analyzeTrajectory({ store, runId, now: new Date().toISOString(), quietWindowMs: 3_600_000 });
    expect(obs.signals).toHaveLength(0);
    expect(obs.observation.eventCount).toBeGreaterThanOrEqual(4); // incl. run_created
  });
});

describe('analyzeTrajectory — repeated identical failures (AVO "unproductive cycles of edits")', () => {
  it('flags repeated_failure when the same failing signature recurs >= threshold', () => {
    const { store, runId } = openStore();
    for (let i = 0; i < 3; i++) {
      store.appendEvent(runId, { type: 'stage_failed', stage: 'execute', detail: { error: 'column drift: col_x' } }, at(40 - i));
    }
    const obs = analyzeTrajectory({ store, runId, now: new Date().toISOString(), quietWindowMs: 3_600_000 });
    const sig = obs.signals.find((s) => s.kind === 'repeated_failure');
    expect(sig).toBeDefined();
    expect(sig!.evidence.count).toBe(3);
    expect(sig!.recommendation.action).toBe('change_strategy');
  });

  it('does not flag distinct failures as repetition', () => {
    const { store, runId } = openStore();
    store.appendEvent(runId, { type: 'stage_failed', stage: 'execute', detail: { error: 'err A' } }, at(20));
    store.appendEvent(runId, { type: 'stage_failed', stage: 'plan', detail: { error: 'err B' } }, at(15));
    const obs = analyzeTrajectory({ store, runId, now: new Date().toISOString(), quietWindowMs: 3_600_000 });
    expect(obs.signals.some((s) => s.kind === 'repeated_failure')).toBe(false);
  });
});

describe('analyzeTrajectory — unproductive cycle (work happening, nothing improving)', () => {
  it('flags unproductive_cycle when completed iteration rounds share one fingerprint (P1-1: real source)', () => {
    const { store, runId } = openStore();
    // >=3 REAL IterationRecords with identical material fingerprints = repeated
    // passes, zero movement. (note-detail fingerprints were a dead path — no
    // production writer emits that field; see adversarial review 06.)
    for (let r = 1; r <= 3; r++) {
      store.putObject('iteration', {
        id: newId('itr'), runId, round: r,
        decidedAt: at(50 - r * 5), decision: 'continue',
        reopenStages: [], rationale: `round ${r}`,
        snapshot: {
          round: r, claims: 0, verifiedClaims: 0, hypotheses: 0, hypothesisVersionSum: 0,
          scorecards: 0, plans: 0, revisions: 0, experimentRunsCompleted: 0,
          feedbackSignals: 0, feedbackConsumed: 0, effectEstimates: 0,
          fingerprint: 'fp_identical_aabbccdd',
        },
        unblockHints: [],
      });
    }
    const obs = analyzeTrajectory({ store, runId, now: new Date().toISOString(), quietWindowMs: 3_600_000 });
    const sig = obs.signals.find((s) => s.kind === 'unproductive_cycle');
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe('medium');
    expect(sig!.recommendation.action).toBe('branch_or_deepen');
  });

  it('never fires unproductive_cycle below the iteration floor', () => {
    const { store, runId } = openStore();
    // only 2 iteration records: not yet a cycle regardless of fingerprints
    for (let r = 1; r <= 2; r++) {
      store.putObject('iteration', {
        id: newId('itr'), runId, round: r,
        decidedAt: at(30 - r), decision: 'continue',
        reopenStages: [], rationale: `round ${r}`,
        snapshot: {
          round: r, claims: 0, verifiedClaims: 0, hypotheses: 0, hypothesisVersionSum: 0,
          scorecards: 0, plans: 0, revisions: 0, experimentRunsCompleted: 0,
          feedbackSignals: 0, feedbackConsumed: 0, effectEstimates: 0,
          fingerprint: 'fp_identical_aabbccdd',
        },
        unblockHints: [],
      });
    }
    const obs = analyzeTrajectory({ store, runId, now: new Date().toISOString(), quietWindowMs: 3_600_000 });
    expect(obs.signals.some((s) => s.kind === 'unproductive_cycle')).toBe(false);
  });
});

describe('supervisor discipline invariants', () => {
  it('is read-only: analysis must not write events or objects', () => {
    const { store, runId } = openStore();
    const before = store.listEvents(runId).length;
    analyzeTrajectory({ store, runId, now: new Date().toISOString(), quietWindowMs: 60_000 });
    expect(store.listEvents(runId).length).toBe(before);
  });

  it('returns observation data usable by callers to persist their own decision record', () => {
    const { store, runId } = openStore();
    const obs: TrajectoryObservation = analyzeTrajectory({
      store, runId, now: new Date().toISOString(), quietWindowMs: 60_000,
    });
    // observation carries what a caller needs: windowed counts + signals typed end-to-end
    expect(obs.runId).toBe(runId);
    expect(obs.observation).toHaveProperty('eventCount');
    expect(obs.observation).toHaveProperty('windowEvents');
    obs.signals.forEach((s: SupervisorSignal) => {
      expect(SUPERVISOR_SIGNAL_KINDS).toContain(s.kind);
      expect(['low', 'medium', 'high']).toContain(s.severity);
      expect(s.recommendation.action.length).toBeGreaterThan(0);
    });
  });
});
