import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { Orchestrator } from '../src/app/orchestrator.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';
import type { ModelProvider, StructuredCallRequest, StructuredCallResult } from '../src/shared/ports.js';
import type { StageHandler } from '../src/pipeline/types.js';
import type { RunStageName } from '../src/domain/run.js';

/**
 * FA-PRF-04 (endgame audit CANC-6): the wire-level cancel seam existed
 * end-to-end (api -> orchestrator.cancel -> AbortController -> provider
 * wrapper -> transport) but nothing pinned its TIMING — a regression to
 * "wait out the stage boundary (up to a 300s model call)" would stay green.
 *
 * This test drives the REAL orchestrator (real store, real lease, real
 * wireCancels registry) against a provider whose single call only ever exits
 * via its injected AbortSignal, and asserts cancel() kills that call within
 * 1s (CI-generous; observed locally ~1ms).
 */

let tmp: string;
let db: Db;
let store: Store;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-cancel-wire-'));
  db = openDb(path.join(tmp, 'far.db'));
  store = new Store(db);
});

afterAll(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('wire-level cancel timing (FA-PRF-04)', () => {
  it('cancel() aborts the in-flight provider call within 1s, not at the stage boundary', async () => {
    let callEntered: (() => void) | undefined;
    const callEnteredP = new Promise<void>((res) => { callEntered = res; });
    let abortObserved: ((elapsed: number) => void) | undefined;
    const abortAtP = new Promise<number>((res) => { abortObserved = res; });

    const hangingProvider: ModelProvider = {
      name: 'hanging-provider',
      liveReady: true,
      structuredCall: (req: StructuredCallRequest) =>
        new Promise<StructuredCallResult<unknown>>((_resolve, reject) => {
          callEntered?.();
          const sig = req.signal;
          if (sig === undefined) {
            reject(new Error('test contract: orchestrator wrapper must inject the run AbortSignal'));
            return;
          }
          if (sig.aborted) {
            reject(new Error('aborted before call start'));
            return;
          }
          const t0 = performance.now();
          sig.addEventListener('abort', () => {
            abortObserved?.(performance.now() - t0);
            reject(new Error('caller-visible cancellation: aborted'));
          }, { once: true });
          // no resolve path — the ONLY exits are abort or test timeout (failure)
        }),
    };

    const scopeHandler: StageHandler = {
      stage: 'scope',
      applicable: async () => true,
      execute: async (ctx) => {
        await ctx.provider.structuredCall(
          { task: 'cancel-timing-probe', userPayload: { probe: 1 }, outputKind: 'json', purpose: 'test' },
          (raw) => raw,
        ).catch((e: unknown) => { throw e; });
        return { kind: 'done', summary: 'unreachable: the call only exits via abort' };
      },
    };

    const orch = new Orchestrator({
      store,
      artifacts: openArtifactStore(path.join(tmp, 'artifacts')),
      provider: hangingProvider,
      sourceFor: () => { throw new Error('no source expected'); },
      stages: new Map<RunStageName, StageHandler>([['scope', scopeHandler]]),
      signals: new Map(),
    });

    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'cancel timing probe', background: '', goalType: 'explanatory',
      scope: { domain: 'reliability', phenomena: ['cancellation'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = store.createRun(q);

    const executing = orch.execute(run.id).then(
      (r) => { console.log(`CANCEL-DEBUG execute resolved status=${r.status} stage=${r.currentStage}`); return r; },
      (e) => { console.log(`CANCEL-DEBUG execute rejected: ${e instanceof Error ? e.message : String(e)}`); throw e; },
    );
    const entered = await Promise.race([
      callEnteredP.then(() => 'entered'),
      new Promise<string>((res) => setTimeout(() => res(`timeout: run status=${store.getRun(run.id)?.status ?? 'gone'} stage=${store.getRun(run.id)?.currentStage ?? '?'} events=${store.listEvents(run.id).map((e) => e.type).slice(-4).join(',')}`), 4_000)),
    ]);
    if (entered !== 'entered') throw new Error(`provider call never started — ${entered}`);
    const cancelRequestedAt = performance.now();
    expect(orch.cancel(run.id)).toBe(true);

    const abortedIn = await abortAtP;
    const totalMs = performance.now() - cancelRequestedAt;
    const finalRun = await executing; // cancel path persists a canceled run and resolves

    console.log(`CANCEL-WIRE-TIMING: provider abort observed ${abortedIn.toFixed(1)}ms after signal arm; ${totalMs.toFixed(1)}ms after cancel(); run status=${finalRun.status}`);
    expect(abortedIn).toBeLessThan(1_000);
    expect(totalMs).toBeLessThan(1_000);
    expect(finalRun.status).toBe('cancelled');
  }, 30_000);
});
