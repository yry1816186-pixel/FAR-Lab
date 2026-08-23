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
 * W-E closed-loop truth: a handler's {kind:'skipped'} must persist as stage state
 * 'skipped' (with the reason), and a completed run with an OPEN falsification loop
 * (revise never ran) must carry exactly one loop_status_guidance event — 'completed'
 * never silently masks the unclosed loop. Loop closed (revise done) => no guidance.
 */
describe('orchestrator: closed-loop truth and terminal guidance', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-loop-'));

  const build = (store: Store, stages: Map<RunStageName, StageHandler>) =>
    new Orchestrator({
      store,
      artifacts: {} as ArtifactStore,
      provider: {} as ModelProvider,
      sourceFor: ((_f: SourceFamily): SourceAdapter => {
        throw new Error('no source adapter in this test');
      }),
      stages,
      signals: new Map(),
    });

  const makeRun = (store: Store) => {
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    return store.createRun(q);
  };

  const okHandler = (stage: RunStageName): StageHandler => ({
    stage,
    applicable: async () => true,
    execute: async () => ({ kind: 'done', summary: `${stage} done` }),
  });

  it('handler-returned skip persists as skipped + reason, and an open loop gets one guidance event', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const run = makeRun(store);

    const stages = new Map<RunStageName, StageHandler>(
      STAGE_ORDER.map((stage) => [
        stage,
        stage === 'execute'
          ? {
              stage,
              applicable: async () => true,
              execute: async () => ({
                kind: 'skipped' as const,
                reason: 'experiment execution failed (run continues): sidecar missing',
              }),
            }
          : stage === 'feedback' || stage === 'revise'
            ? { stage, applicable: async () => false, execute: async () => ({ kind: 'done' as const, summary: 'unreachable' }) }
            : okHandler(stage),
      ] as const),
    );
    const after = await build(store, stages).execute(run.id);

    expect(after.status).toBe('completed');
    // truth fix: the skipped outcome is a skipped stage carrying its reason
    const execRec = after.stages.find((s) => s.stage === 'execute');
    expect(execRec?.state).toBe('skipped');
    expect(execRec?.error).toBe('experiment execution failed (run continues): sidecar missing');

    const events = store.listEvents(run.id);
    const skipEvent = events.find((e) => e.type === 'stage_skipped' && e.stage === 'execute');
    expect((skipEvent?.detail as { reason?: unknown })?.reason).toBe(
      'experiment execution failed (run continues): sidecar missing',
    );

    // open loop => exactly one guidance note with per-leg reasons and next actions
    const guidance = events.filter(
      (e) => (e.detail as { reason?: unknown })?.reason === 'loop_status_guidance',
    );
    expect(guidance).toHaveLength(1);
    const detail = guidance[0]?.detail as {
      closed: boolean;
      loop: { stage: string; state: string; reason: string }[];
      nextActions: string[];
    };
    expect(detail.closed).toBe(false);
    expect(detail.loop.map((l) => l.stage)).toEqual(['execute', 'feedback', 'revise']);
    // handler-skip keeps its own reason; applicable-false legs get the derived default
    expect(detail.loop[0]?.reason).toContain('sidecar missing');
    expect(detail.loop[1]?.reason).toContain('no feedback signals stored');
    expect(detail.loop[2]?.reason).toContain('no unconsumed feedback signals');
    expect(detail.nextActions.length).toBeGreaterThan(0);
    db.close();
  });

  it('closed loop (revise ran) gets NO guidance event', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const run = makeRun(store);

    const stages = new Map<RunStageName, StageHandler>(
      STAGE_ORDER.map((stage) => [stage, okHandler(stage)] as const),
    );
    const after = await build(store, stages).execute(run.id);
    expect(after.status).toBe('completed');

    const guidance = store
      .listEvents(run.id)
      .filter((e) => (e.detail as { reason?: unknown })?.reason === 'loop_status_guidance');
    expect(guidance).toHaveLength(0);
    db.close();
  });

  it('no-op resume of a completed open-loop run does not duplicate the guidance event', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const run = makeRun(store);

    const stages = new Map<RunStageName, StageHandler>(
      STAGE_ORDER.map((stage) => [
        stage,
        stage === 'feedback' || stage === 'revise'
          ? { stage, applicable: async () => false, execute: async () => ({ kind: 'done' as const, summary: 'unreachable' }) }
          : okHandler(stage),
      ] as const),
    );
    const orch = build(store, stages);
    await orch.execute(run.id);
    await orch.execute(run.id); // no-op resume (no new feedback signals)

    const guidance = store
      .listEvents(run.id)
      .filter((e) => (e.detail as { reason?: unknown })?.reason === 'loop_status_guidance');
    expect(guidance).toHaveLength(1);
    db.close();
  });
});
