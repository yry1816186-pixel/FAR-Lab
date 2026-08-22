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
import { resolveRunProvider } from '../src/app/provider-resolver.js';
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
});
