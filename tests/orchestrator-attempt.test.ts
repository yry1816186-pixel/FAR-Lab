import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { Orchestrator } from '../src/app/orchestrator.js';
import { ResearchQuestion, newId, RunStageName } from '../src/domain/index.js';
import { STAGE_ORDER } from '../src/domain/run.js';
import type { StageHandler } from '../src/pipeline/types.js';
import type { ModelProvider, ArtifactStore, SourceAdapter } from '../src/shared/ports.js';
import type { SourceFamily } from '../src/domain/source.js';

/**
 * Attempt-counter semantics (adversarial audit D-3): attempts are provenance facts.
 * A stage that failed once and succeeds after resume must end with attempt=2 in the
 * run doc — the persisted count must never regress on the done/skipped/failed transition.
 */
describe('orchestrator: stage attempt counter never regresses', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-attempt-'));

  const buildOrchestrator = (store: Store, stages: Map<RunStageName, StageHandler>) =>
    new Orchestrator({
      store,
      artifacts: {} as ArtifactStore, // not exercised: handlers never touch artifacts here
      provider: {} as ModelProvider, // not exercised: handlers make no model calls
      sourceFor: ((_f: SourceFamily): SourceAdapter => {
        throw new Error('no source adapter in this test');
      }),
      stages,
      signals: new Map(),
    });

  const okHandler = (stage: RunStageName): StageHandler => ({
    stage,
    applicable: async () => true,
    execute: async () => ({ kind: 'done', summary: `${stage} done` }),
  });

  it('failed -> resume -> done keeps attempt=2 in the run doc (matches events)', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = store.createRun(q);

    let scopeCalls = 0;
    const stages = new Map<RunStageName, StageHandler>(
      STAGE_ORDER.map((stage) => [
        stage,
        stage === 'scope'
          ? {
              stage,
              applicable: async () => true,
              execute: async () => {
                scopeCalls += 1;
                if (scopeCalls === 1) throw new Error('transient failure on first attempt');
                return { kind: 'done', summary: 'scope done on retry' };
              },
            }
          : okHandler(stage),
      ] as const),
    );
    const orch = buildOrchestrator(store, stages);

    // 1st pass: scope fails -> run partial; failed record keeps its first-start attempt=1
    const afterFail = await orch.execute(run.id);
    const failedRec = afterFail.stages.find((s) => s.stage === 'scope');
    expect(afterFail.status).toBe('partial');
    expect(afterFail.lastError).toBe('transient failure on first attempt');
    expect(failedRec?.state).toBe('failed');
    expect(failedRec?.attempt).toBe(1);

    // 2nd pass (resume): scope retries (attempt 2) and succeeds
    const afterResume = await orch.execute(run.id);
    const doneRec = afterResume.stages.find((s) => s.stage === 'scope');
    expect(afterResume.status).toBe('completed');
    expect(doneRec?.state).toBe('done');
    // the load-bearing assertion: after one failure + resume, attempt stays 2 (audit D-3 —
    // the done transition previously reset it to the pre-start value)
    expect(doneRec?.attempt).toBe(2);

    // events stay truthful and now agree with the run doc
    const starts = store
      .listEvents(run.id)
      .filter((e) => e.type === 'stage_started' && e.stage === 'scope')
      .map((e) => e.detail.attempt);
    expect(starts).toEqual([1, 2]);

    // re-read from disk: persistence agrees (not just the in-memory return value)
    const reread = store.getRun(run.id)?.stages.find((s) => s.stage === 'scope');
    expect(reread?.attempt).toBe(2);
    db.close();
  });

  it('skipped transition also preserves the running-incremented attempt', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = store.createRun(q);

    let applicableCalls = 0;
    const stages = new Map<RunStageName, StageHandler>(
      STAGE_ORDER.map((stage) => [
        stage,
        stage === 'feedback'
          ? {
              stage,
              // first pass: applicable (fail below on execute); second pass: not applicable -> skipped
              applicable: async () => {
                applicableCalls += 1;
                return applicableCalls === 1;
              },
              execute: async () => {
                throw new Error('feedback execute fails on first pass');
              },
            }
          : okHandler(stage),
      ] as const),
    );
    const orch = buildOrchestrator(store, stages);

    const afterFail = await orch.execute(run.id);
    expect(afterFail.stages.find((s) => s.stage === 'feedback')?.attempt).toBe(1);

    const afterResume = await orch.execute(run.id);
    const skippedRec = afterResume.stages.find((s) => s.stage === 'feedback');
    expect(skippedRec?.state).toBe('skipped');
    // running transition incremented to 2; the skip transition must not reset it back to 1
    expect(skippedRec?.attempt).toBe(2);    expect(afterResume.status).toBe('completed');
    db.close();
  });
});
