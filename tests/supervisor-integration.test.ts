import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { Orchestrator } from '../src/app/orchestrator.js';
import { ResearchQuestion, newId, STAGE_ORDER, type RunStageName } from '../src/domain/index.js';
import type { StageHandler, StageOutcome } from '../src/pipeline/types.js';
import type { ArtifactStore, ModelProvider, SourceAdapter } from '../src/shared/ports.js';
import type { SourceFamily } from '../src/domain/source.js';

/**
 * Supervisor <-> orchestrator integration (AVO fusion G2 wiring): after each
 * COMPLETED pass the supervisor analyzes the trajectory and its signals are
 * PERSISTED as a note event with reason 'supervisor_observation'. Analysis is
 * read-only; the orchestrator stays the only state owner. Offline: fake stage
 * handlers, real Store on temp sqlite (same pattern as tests/iteration.test.ts).
 */

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-sup-orch-'));

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

const okHandler = (stage: RunStageName): StageHandler => ({
  stage,
  applicable: async () => true,
  execute: async (): Promise<StageOutcome> => ({ kind: 'done', summary: `${stage} done` }),
});

const buildOrchestrator = (store: Store) => {
  const stages = new Map(STAGE_ORDER.map((s) => [s, okHandler(s)] as const));
  return new Orchestrator({
    store,
    artifacts: {} as ArtifactStore,
    provider: {} as ModelProvider,
    sourceFor: ((_f: SourceFamily): SourceAdapter => { throw new Error('no source adapter in this test'); }),
    stages,
    signals: new Map(),
  });
};

const supervisorNotes = (store: Store, runId: string) =>
  store
    .listEvents(runId)
    .filter((e) => e.type === 'note' && (e.detail as Record<string, unknown>).reason === 'supervisor_observation');

describe('supervisor integration at the pass boundary', () => {
  it('persists a supervisor_observation note when a pass completes', async () => {
    const { store, runId } = openStore();
    await buildOrchestrator(store).execute(runId);

    const notes = supervisorNotes(store, runId);
    expect(notes.length).toBeGreaterThanOrEqual(1);
    const detail = notes.at(-1)!.detail as Record<string, unknown>;
    expect(detail).toHaveProperty('signals');
    expect(Array.isArray(detail.signals)).toBe(true);
    // healthy fake run, executed just now: no high-severity signal expected
    const highs = (detail.signals as Array<{ severity?: string }>).filter((s) => s.severity === 'high');
    expect(highs).toHaveLength(0);
  });

  it('surfaces repeated_failure evidence in the persisted observation', async () => {
    const { store, runId } = openStore();
    for (let i = 0; i < 3; i++) {
      store.appendEvent(runId, {
        type: 'stage_failed', stage: 'execute', detail: { error: 'column drift: col_x' },
      });
    }
    await buildOrchestrator(store).execute(runId);

    const notes = supervisorNotes(store, runId);
    expect(notes.length).toBeGreaterThanOrEqual(1);
    const detail = notes.at(-1)!.detail as { signals?: Array<{ kind?: string; evidence?: Record<string, unknown> }> };
    const sig = detail.signals?.find((s) => s.kind === 'repeated_failure');
    expect(sig).toBeDefined();
    expect(sig!.evidence?.['count']).toBe(3);
  });

  it('keeps analysis read-only: exactly one observation note per pass boundary', async () => {
    const { store, runId } = openStore();
    await buildOrchestrator(store).execute(runId);
    expect(supervisorNotes(store, runId)).toHaveLength(1);
  });
});
