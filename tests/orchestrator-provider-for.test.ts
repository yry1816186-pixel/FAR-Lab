import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import type { Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { Orchestrator } from '../src/app/orchestrator.js';
import { ModelProviderConfig, ResearchQuestion, newId } from '../src/domain/index.js';
import { resolveRunProvider, resolveRunReasoningRoute } from '../src/app/provider-resolver.js';
import type { ModelProvider } from '../src/shared/ports.js';
import type { StageHandler } from '../src/pipeline/types.js';
import type { ResearchRun, RunStageName } from '../src/domain/run.js';

// *** TEST-ONLY *** the orchestrator's providerFor seam: stage handlers must receive
// the per-run resolved provider (user model-config layer) and fall back to the env-chain
// provider when resolution yields null. Real Store/SQLite; a recording scope handler
// stands in for the pipeline (no model calls, no sources).

let tmp: string;
let db: Db;
let store: Store;

const envChainProvider: ModelProvider = {
  name: 'env-chain',
  liveReady: false,
  structuredCall: () => {
    throw new Error('no model call expected in this test');
  },
};

/** Minimal stage map: only 'scope', which records the provider each context carried. */
const recordingOrchestrator = (seen: { providerNames: string[] }, providerFor?: (run: ResearchRun) => ModelProvider | null) => {
  const scopeHandler: StageHandler = {
    stage: 'scope',
    applicable: async () => true,
    execute: async (ctx) => {
      seen.providerNames.push(ctx.provider.name);
      return { kind: 'done', summary: 'recorded' };
    },
  };
  const stages = new Map<RunStageName, StageHandler>([['scope', scopeHandler]]);
  return new Orchestrator({
    store,
    artifacts: openArtifactStore(path.join(tmp, 'artifacts')),
    provider: envChainProvider,
    ...(providerFor !== undefined ? { providerFor } : {}),
    sourceFor: () => {
      throw new Error('no source expected in this test');
    },
    stages,
    signals: new Map(),
  });
};

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-orch-provider-'));
  db = openDb(path.join(tmp, 'far.db'));
  store = new Store(db);
});

afterAll(() => {
  db.close(); // Windows: an open SQLite handle blocks temp-dir removal (EPERM)
  fs.rmSync(tmp, { recursive: true, force: true });
});

const newRun = async (providerConfigId?: string) => {
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'Why do off-targets cluster?', background: '', goalType: 'explanatory',
    scope: { domain: 'genome editing', phenomena: ['off-targets'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  return store.createRun(q, providerConfigId !== undefined ? { providerConfigId } : {});
};

describe('Orchestrator providerFor seam', () => {
  it('stages receive the per-run custom provider when one is bound', async () => {
    const cfg = ModelProviderConfig.parse({
      id: newId('mcfg'), label: 'route', wire: 'openai', baseUrl: 'https://example-invalid.test/v1',
      modelId: 'm', apiKey: 'test-fixture-key-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    store.putObject('model_config', cfg);
    const run = await newRun(cfg.id);
    const seen: { providerNames: string[] } = { providerNames: [] };
    await recordingOrchestrator(seen, (r) => resolveRunProvider(store, r)).execute(run.id, { stopAfter: 'retrieve' });
    expect(seen.providerNames).toEqual([`custom:${cfg.id}`]);
    store.deleteObject('model_config', cfg.id);
  });

  it('stages fall back to the env-chain provider when resolution yields null', async () => {
    const run = await newRun(); // no binding, no active default
    const seen: { providerNames: string[] } = { providerNames: [] };
    await recordingOrchestrator(seen, (r) => resolveRunProvider(store, r)).execute(run.id, { stopAfter: 'retrieve' });
    expect(seen.providerNames).toEqual(['env-chain']);
  });

  it('without the seam, stages use deps.provider (backwards-compatible composition)', async () => {
    const run = await newRun();
    const seen: { providerNames: string[] } = { providerNames: [] };
    await recordingOrchestrator(seen).execute(run.id, { stopAfter: 'retrieve' });
    expect(seen.providerNames).toEqual(['env-chain']);
  });

  it('a stopAfter exit PARKS the run before the lease releases — never running-without-lease', async () => {
    // Adoption-window closure (2026-08-29): executeOwned used to return with
    // status='running' and execute()'s finally then released the lease — a lease-less
    // 'running' run is exactly what the watchdog (or a process restart) adopts, which
    // would continue the full pipeline behind the user's back after a scope proposal
    // or CLI --stop-after.
    const run = await newRun();
    const seen: { providerNames: string[] } = { providerNames: [] };
    await recordingOrchestrator(seen).execute(run.id, { stopAfter: 'retrieve' });
    const after = store.getRun(run.id);
    expect(after?.status).toBe('paused');
    const parked = store.listEvents(run.id).find((e) => (e.detail as { reason?: string } | undefined)?.reason === 'stop_after_parked');
    expect(parked).toBeDefined();
    expect((parked?.detail as { after?: string }).after).toBe('retrieve');
    expect(store.getRunLease(run.id).holder).toBeNull(); // lease released; paused means unadoptable
  });

  it('parking-intent lifecycle: the park clears a parking:* tag; a full resume strips a stale one', async () => {
    // The crash guard: scopeProposal/CLI tag deliberately-stopped runs 'parking:*'
    // BEFORE execution so a worker that dies pre-park is never watchdog-adopted.
    // (a) tag survives the stopAfter execution and is cleared by the park;
    const runA = await newRun();
    const tagged = store.getRun(runA.id)!;
    store.updateRun({ ...tagged, tags: [...tagged.tags, 'parking:scope-proposal'] });
    await recordingOrchestrator({ providerNames: [] }).execute(runA.id, { stopAfter: 'retrieve' });
    const afterA = store.getRun(runA.id)!;
    expect(afterA.status).toBe('paused');
    expect(afterA.tags.some((t) => t.startsWith('parking:'))).toBe(false);
    // (b) a stale tag on a run resumed WITHOUT stopAfter is stripped by the owning
    // execution (parking_intent_cleared) — otherwise a later crash of THAT execution
    // would freeze the run (watchdog-exempt forever).
    const runB = await newRun();
    const taggedB = store.getRun(runB.id)!;
    store.updateRun({ ...taggedB, tags: [...taggedB.tags, 'parking:cli-stop-after'] });
    await recordingOrchestrator({ providerNames: [] }).execute(runB.id);
    const afterB = store.getRun(runB.id)!;
    expect(afterB.tags.some((t) => t.startsWith('parking:'))).toBe(false);
    expect(store.listEvents(runB.id).some((e) => (e.detail as { reason?: string } | undefined)?.reason === 'parking_intent_cleared')).toBe(true);
  });

  it('cancel() aborts the in-flight provider call at the wire — every stage request carries the run signal', async () => {
    // Wire-level cancel (2026-08-29): the registered gap "collaborative cancel without
    // wire-level abort" closed at the provider seam — makeContext wraps ctx.provider
    // with the run's AbortSignal, so orchestrator.cancel() kills the in-flight model
    // call within ms instead of waiting out the stage boundary (up to a 300s call).
    const run = await newRun();
    let seenSignal: AbortSignal | undefined;
    const recordingProvider: ModelProvider = {
      name: 'wire-recorder',
      liveReady: true,
      structuredCall: (req) => {
        seenSignal = req.signal;
        return new Promise(() => { /* never resolves — models the in-flight call */ });
      },
    };
    let midStage!: () => void;
    const midStageP = new Promise<void>((resolve) => { midStage = resolve; });
    const handler: StageHandler = {
      stage: 'scope',
      applicable: async () => true,
      execute: async (ctx) => {
        void ctx.provider.structuredCall({
          task: 'wire-cancel-probe', userPayload: { q: 'x' }, outputKind: 'json', purpose: 'test',
        }, (raw) => raw as object);
        midStage();
        await new Promise((r) => setTimeout(r, 50)); // let the cancel land
        return { kind: 'done', summary: 'probe complete' };
      },
    };
    const orch = new Orchestrator({
      store,
      artifacts: openArtifactStore(path.join(tmp, 'artifacts')),
      provider: envChainProvider,
      providerFor: () => recordingProvider,
      sourceFor: () => { throw new Error('no source expected in this test'); },
      stages: new Map<RunStageName, StageHandler>([['scope', handler]]),
      signals: new Map(),
    });
    const execP = orch.execute(run.id);
    await midStageP;
    expect(orch.cancel(run.id)).toBe(true);
    await execP;
    expect(seenSignal).toBeDefined();
    expect(seenSignal!.aborted).toBe(true); // the in-flight call's transport is dead
  });

  it('progress() is lease-fenced: a disowned worker never writes run state or notes', async () => {
    // Adversarial round-2 REL-4: the progress callback's unfenced updateRun could
    // roll back the adopter's transition after a mid-call adoption. Fence = the
    // design's own invariant ("a disowned worker must never write run state").
    const run = await newRun();
    const handler: StageHandler = {
      stage: 'scope',
      applicable: async () => true,
      execute: async (ctx) => {
        // simulate mid-stage adoption: release our own lease (expiry+adoption)
        const holder = store.getRunLease(ctx.run.id).holder;
        expect(holder).not.toBeNull();
        store.releaseLease(ctx.run.id, holder!);
        ctx.progress(1, 2, { reason: 'progress-from-disowned-worker' });
        return { kind: 'done', summary: 'unreachable-when-disowned' };
      },
    };
    const orch = new Orchestrator({
      store,
      artifacts: openArtifactStore(path.join(tmp, 'artifacts')),
      provider: envChainProvider,
      sourceFor: () => { throw new Error('no source expected in this test'); },
      stages: new Map<RunStageName, StageHandler>([['scope', handler]]),
      signals: new Map(),
    });
    await orch.execute(run.id); // lease-lost abort returns gracefully (audit-note path)
    const after = store.getRun(run.id)!;
    expect(after.stages.find((s) => s.stage === 'scope')?.subtasks).toBeUndefined(); // no doc write
    expect(after.stages.find((s) => s.stage === 'scope')?.state).not.toBe('done'); // stage never closed by the disowned worker
    expect(store.listEvents(run.id).some((e) => (e.detail as { reason?: string } | undefined)?.reason === 'progress-from-disowned-worker')).toBe(false);
    expect(store.listEvents(run.id).some((e) => (e.detail as { reason?: string } | undefined)?.reason === 'lease_lost_abort')).toBe(true);
  });

  it('a run-pinned routeOverride keeps the run on its registry route even with an active config set', async () => {
    // The live-observed bug: CLI --route zai run resumed into the workspace's
    // dead deepseek default. routeOverride must outrank the active config.
    const cfg = ModelProviderConfig.parse({
      id: newId('mcfg'), label: 'dead default', wire: 'openai', baseUrl: 'https://example-invalid.test/v1',
      modelId: 'm', apiKey: 'test-fixture-key-2', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    store.putObject('model_config', cfg);
    store.setMeta('activeModelConfigId', cfg.id);
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'pinned route?', background: '', goalType: 'exploratory',
      scope: { domain: 'test', phenomena: ['x'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = store.createRun(q, { routeOverride: 'zai' });
    const seen: { providerNames: string[] } = { providerNames: [] };
    await recordingOrchestrator(seen, (r) => resolveRunProvider(store, r)).execute(run.id, { stopAfter: 'retrieve' });
    expect(seen.providerNames).toEqual(['zai']); // pinned live route, never the dead active config
    expect(resolveRunReasoningRoute(store, run)).toBeNull(); // active config reasoning must not leak onto a pinned route
    store.deleteMeta('activeModelConfigId');
    store.deleteObject('model_config', cfg.id);
  });

  it('competition route mode refuses a pinned non-Qwen route (no side door around the gate)', async () => {
    store.setMeta('competition_route_mode', 'on');
    try {
      const q = ResearchQuestion.parse({
        id: newId('q'), text: 'pinned non-compliant route?', background: '', goalType: 'exploratory',
        scope: { domain: 'test', phenomena: ['x'] }, constraints: {}, createdAt: new Date().toISOString(),
      });
      const run = store.createRun(q, { routeOverride: 'zai' });
      const p = resolveRunProvider(store, run);
      expect(p?.name).toBe('competition-route-gate');
      const res = await p!.structuredCall(
        { task: 'probe', systemPrompt: '', userPayload: {}, outputKind: 'json', purpose: 'test' },
        () => ({ ok: true }),
      );
      expect(res.ok).toBe(false); // fail-closed refusal, never a silently non-compliant route
    } finally {
      store.deleteMeta('competition_route_mode');
    }
  });
});
