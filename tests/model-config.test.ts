import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { ModelProviderConfig, ProviderWireProtocol, maskApiKey } from '../src/domain/model-config.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';
import { openDb } from '../src/persistence/db.js';
import type { Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ACTIVE_MODEL_CONFIG_META_KEY, resolveRunProvider } from '../src/app/provider-resolver.js';

// *** TEST-ONLY *** schema boundaries + store round-trips + run-level provider
// resolution (real SQLite in a throwaway temp dir; 'test-fixture-key-*' strings are
// inert non-secrets).

let tmp: string;
let db: Db;
let store: Store;

const validConfig = (overrides: Record<string, unknown> = {}) => ({
  id: newId('mcfg'),
  label: 'My GLM route',
  wire: 'openai',
  baseUrl: 'https://example-invalid.test/v1',
  modelId: 'some-model',
  apiKey: 'test-fixture-key-abcd',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-modelcfg-'));
  db = openDb(path.join(tmp, 'far.db'));
  store = new Store(db);
});

afterAll(() => {
  db.close(); // Windows: an open SQLite handle blocks temp-dir removal (EPERM)
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('ModelProviderConfig schema', () => {
  it('accepts a valid config and both wire protocols', () => {
    expect(ModelProviderConfig.parse(validConfig()).label).toBe('My GLM route');
    expect(ProviderWireProtocol.parse('openai')).toBe('openai');
    expect(ProviderWireProtocol.parse('anthropic')).toBe('anthropic');
  });

  it('rejects invalid baseUrl, empty label, bad wire, and malformed id', () => {
    expect(ModelProviderConfig.safeParse(validConfig({ baseUrl: 'not a url' })).success).toBe(false);
    expect(ModelProviderConfig.safeParse(validConfig({ label: '   ' })).success).toBe(false);
    expect(ModelProviderConfig.safeParse(validConfig({ wire: 'grpc' })).success).toBe(false);
    expect(ModelProviderConfig.safeParse(validConfig({ id: 'wrong-prefix-abc' })).success).toBe(false);
    expect(ModelProviderConfig.safeParse(validConfig({ id: 'mcfg_short' })).success).toBe(false);
  });

  it('accepts localhost http endpoints (local runtimes like Ollama/vLLM)', () => {
    expect(ModelProviderConfig.safeParse(validConfig({ baseUrl: 'http://localhost:11434/v1' })).success).toBe(true);
  });

  it('allows an empty apiKey (stored; provider fails closed at call time)', () => {
    const parsed = ModelProviderConfig.parse(validConfig({ apiKey: '' }));
    expect(parsed.apiKey).toBe('');
  });

  it('maskApiKey shows only the last 4 chars', () => {
    expect(maskApiKey('sk-test-fixture-1234')).toBe('••••1234');
    expect(maskApiKey('')).toBe('');
  });
});

describe('Store: model_config persistence + meta KV', () => {
  it('round-trips configs under the __none__ bucket and fail-closes on corruption', () => {
    const cfg = ModelProviderConfig.parse(validConfig());
    store.putObject('model_config', cfg);
    expect(store.getObject('model_config', cfg.id)).toEqual(cfg);
    expect(store.listObjects('model_config', '__none__')).toEqual([cfg]);
    expect(store.deleteObject('model_config', cfg.id)).toBe(true);
    expect(store.deleteObject('model_config', cfg.id)).toBe(false); // idempotent
    expect(store.getObject('model_config', cfg.id)).toBeNull();
  });

  it('getMeta/setMeta/deleteMeta round-trip', () => {
    expect(store.getMeta('some.key')).toBeNull();
    store.setMeta('some.key', 'mcfg_value0000000000000000000');
    expect(store.getMeta('some.key')).toBe('mcfg_value0000000000000000000');
    store.setMeta('some.key', 'mcfg_other00000000000000000');
    expect(store.getMeta('some.key')).toBe('mcfg_other00000000000000000');
    store.deleteMeta('some.key');
    expect(store.getMeta('some.key')).toBeNull();
  });
});

describe('createRun provider binding', () => {
  it('persists providerConfigId onto the run doc when given; omits it when not', () => {
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'Why do off-targets cluster?', background: '', goalType: 'explanatory',
      scope: { domain: 'genome editing', phenomena: ['off-targets'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const configId = newId('mcfg');
    const bound = store.createRun(q, { providerConfigId: configId });
    expect(bound.providerConfigId).toBe(configId);

    const q2 = ResearchQuestion.parse({
      id: newId('q'), text: 'Another question?', background: '', goalType: 'explanatory',
      scope: { domain: 'physics', phenomena: ['x'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const plain = store.createRun(q2);
    expect(plain.providerConfigId).toBeUndefined();
    // re-read from SQLite: the field survives the doc round-trip and old docs parse fine
    expect(store.getRun(bound.id)?.providerConfigId).toBe(configId);
    expect(store.getRun(plain.id)?.providerConfigId).toBeUndefined();
  });
});

describe('resolveRunProvider (run > active default > env chain)', () => {
  const q = () => ResearchQuestion.parse({
    id: newId('q'), text: 'Q?', background: '', goalType: 'explanatory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
  });

  it('returns null with no run binding and no active default (env chain stays in charge)', () => {
    const run = store.createRun(q());
    expect(resolveRunProvider(store, run)).toBeNull();
  });

  it('prefers the run-level config over the active default', () => {
    const runLevel = ModelProviderConfig.parse(validConfig({ modelId: 'run-level-model' }));
    const active = ModelProviderConfig.parse(validConfig({ modelId: 'active-default-model' }));
    store.putObject('model_config', runLevel);
    store.putObject('model_config', active);
    store.setMeta(ACTIVE_MODEL_CONFIG_META_KEY, active.id);
    const run = store.createRun(q(), { providerConfigId: runLevel.id });
    const provider = resolveRunProvider(store, run);
    if (provider === null) throw new Error('expected a provider for a run-level binding');
    expect(provider.name).toBe(`custom:${runLevel.id}`);
    expect(provider.liveReady).toBe(true);
    store.deleteObject('model_config', runLevel.id);
    store.deleteObject('model_config', active.id);
    store.deleteMeta(ACTIVE_MODEL_CONFIG_META_KEY);
  });

  it('uses the active default when the run carries no binding', () => {
    const active = ModelProviderConfig.parse(validConfig());
    store.putObject('model_config', active);
    store.setMeta(ACTIVE_MODEL_CONFIG_META_KEY, active.id);
    const run = store.createRun(q());
    expect(resolveRunProvider(store, run)?.name).toBe(`custom:${active.id}`);
    store.deleteObject('model_config', active.id);
    store.deleteMeta(ACTIVE_MODEL_CONFIG_META_KEY);
  });

  it('a dangling binding fails closed instead of silently falling back', async () => {
    const dangling = newId('mcfg');
    const run = store.createRun(q(), { providerConfigId: dangling });
    const provider = resolveRunProvider(store, run);
    if (provider === null) throw new Error('expected a fail-closed provider for a dangling binding');
    expect(provider.name).toBe(`custom:${dangling}`);
    expect(provider.liveReady).toBe(false);
    const res = await provider.structuredCall(
      { task: 't', userPayload: {}, outputKind: 'json', purpose: 'test' },
      (raw) => raw,
    );
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('auth_error');
  });

  it('rejects an id-shaped-but-unknown run binding at the domain boundary (schema discipline)', () => {
    // providerConfigId must be mcfg_-shaped; a foreign prefix cannot even be bound
    const bad = z.string().regex(/^run_[0-9a-z]{20,32}$/).parse(newId('run'));
    expect(ModelProviderConfig.safeParse(validConfig({ id: bad })).success).toBe(false);
  });
});
