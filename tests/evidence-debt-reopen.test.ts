import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { Orchestrator } from '../src/app/orchestrator.js';
import { ResearchQuestion, SourceDocument, newId, RunStageName } from '../src/domain/index.js';
import { STAGE_ORDER } from '../src/domain/run.js';
import type { StageHandler } from '../src/pipeline/types.js';
import type { ModelProvider, ArtifactStore, SourceAdapter } from '../src/shared/ports.js';
import type { SourceFamily } from '../src/domain/source.js';

// *** TEST-ONLY *** §5.2 evidence-debt reopen: a COMPLETED run whose corpus grew
// afterwards (counter-search adds unverified sources) reopens verify_sources +
// build_evidence on resume — and ONLY those. No reopen without evidence debt.

describe('orchestrator: evidence-debt reopen on completed runs', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-edebt-'));

  const build = (store: Store, calls: string[]) =>
    new Orchestrator({
      store,
      artifacts: {} as ArtifactStore,
      provider: {} as ModelProvider,
      sourceFor: ((_f: SourceFamily): SourceAdapter => { throw new Error('no adapter in this test'); }),
      stages: new Map<RunStageName, StageHandler>(
        STAGE_ORDER.map((stage) => [stage, {
          stage,
          applicable: async () => true,
          execute: async () => {
            calls.push(stage);
            return { kind: 'done' as const, summary: `${stage} done` };
          },
        } satisfies [RunStageName, StageHandler]]),
      ),
      signals: new Map(),
    });

  const completedRun = (store: Store): string => {
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = store.createRun(q);
    const now = new Date().toISOString();
    for (const s of run.stages) { s.state = 'done'; s.endedAt = now; s.startedAt = now; s.attempt = 1; }
    run.status = 'completed';
    store.updateRun(run);
    return run.id;
  };

  const unverifiedDoc = (store: Store, runId: string): void => {
    store.putObject('source_document', SourceDocument.parse({
      id: newId('src'), runId, family: 'openalex',
      identifiers: [{ kind: 'doi', value: '10.1/counter-x' }],
      title: 'Post-completion counter evidence', authors: [],
      contentDepth: 'abstract', accessState: 'open', abstractText: 'contradicts',
      contentHash: 'a'.repeat(64), retrievedAt: new Date().toISOString(), parseStatus: 'ok',
    }));
  };

  it('reopens verify_sources + build_evidence when the corpus grew after completion', async () => {
    const dir = tmp();
    const store = new Store(openDb(path.join(dir, 'far.db')));
    const runId = completedRun(store);
    unverifiedDoc(store, runId);

    const calls: string[] = [];
    const out = await build(store, calls).execute(runId);

    expect(calls.sort()).toEqual(['build_evidence', 'verify_sources']);
    expect(out.status).toBe('completed');
    const resumed = store.listEvents(runId).filter((e) => e.type === 'run_resumed');
    expect(resumed.some((e) => (e.detail as { reopened?: string })?.reopened === 'evidence_debt')).toBe(true);
    // attempts were incremented by the reopen re-run (provenance facts survive)
    const doc = store.getRun(runId)!;
    for (const s of doc.stages.filter((x) => x.stage === 'verify_sources' || x.stage === 'build_evidence')) {
      expect(s.state).toBe('done');
      expect(s.attempt).toBe(2);
    }
  });

  it('no reopen without evidence debt: completed resume stays a no-op', async () => {
    const dir = tmp();
    const store = new Store(openDb(path.join(dir, 'far.db')));
    const runId = completedRun(store);
    // no unverified docs -> nothing to do

    const calls: string[] = [];
    const out = await build(store, calls).execute(runId);

    expect(calls).toEqual([]);
    expect(out.status).toBe('completed');
    // a no-op completed resume still flips status (pre-existing semantics: one
    // run_resumed status event) — but NEVER an evidence-debt stage reopen
    const reopened = store.listEvents(runId).filter((e) => (e.detail as { reopened?: string })?.reopened === 'evidence_debt');
    expect(reopened).toHaveLength(0);
    const doc = store.getRun(runId)!;
    for (const s of doc.stages) expect(s.attempt).toBe(1);
  });
});
