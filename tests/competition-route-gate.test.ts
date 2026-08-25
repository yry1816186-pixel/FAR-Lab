import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ModelProviderConfig, ResearchQuestion, newId } from '../src/domain/index.js';
import type { ResearchRun } from '../src/domain/run.js';
import {
  resolveRunProvider,
  readCompetitionRouteMode,
  writeCompetitionRouteMode,
  ACTIVE_MODEL_CONFIG_META_KEY,
  COMPETITION_ROUTE_META_KEY,
} from '../src/app/provider-resolver.js';

/**
 * R2 lane 11 — competition route gate at the resolver chokepoint. All offline/
 * deterministic (real SQLite, no network): the gate must make the official
 * Qwen-via-Bailian rule (evidence/W-MP/RESEARCH-competition-2026-08-25.md §A1)
 * hold for EVERY route production can take (pipeline runs + resident agent), and
 * OFF (default) must be bit-exact legacy behavior.
 */

const dirs: string[] = [];
const dbs: Array<ReturnType<typeof openDb>> = [];
afterAll(() => {
  for (const db of dbs) db.close(); // release the SQLite handle BEFORE rmSync (Windows EPERM otherwise)
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

/** ModelConfigId shape is `mcfg_[0-9a-z]{20,32}` (domain/ids.ts idOf) — pad stable labels to it. */
const mid = (s: string): string => `mcfg_${s.padEnd(20, '0').slice(0, 20)}`;

const BAILIAN_URL = 'https://ws-x.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
const LEGACY_BAILIAN_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

interface CfgOver {
  id?: string; label?: string; modelId?: string; baseUrl?: string; fallbackConfigIds?: string[];
}

const makeCfg = (over: CfgOver = {}) =>
  ModelProviderConfig.parse({
    id: over.id ?? newId('mcfg'), label: over.label ?? 'route',
    wire: 'openai',
    baseUrl: over.baseUrl ?? BAILIAN_URL,
    modelId: over.modelId ?? 'qwen3.7-plus',
    apiKey: 'k',
    fallbackConfigIds: over.fallbackConfigIds ?? [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });

const makeStoreWithRun = async (): Promise<{ store: Store; run: ResearchRun }> => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-comp-route-'));
  dirs.push(dir);
  const db = openDb(path.join(dir, 'far.db'));
  dbs.push(db);
  const store = new Store(db);
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  const run = store.createRun(q);
  return { store, run };
};

const CALL_REQ = { task: 't', userPayload: { a: 1 }, outputKind: 'json' as const, purpose: 'test' };

describe('competition route gate — mode OFF is exact legacy behavior', () => {
  it('non-Qwen custom config resolves to the real provider (unchanged)', async () => {
    const { store, run } = await makeStoreWithRun();
    const cfg = makeCfg({ modelId: 'glm-4.6', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' });
    store.putObject('model_config', cfg);
    const p = resolveRunProvider(store, { ...run, providerConfigId: cfg.id });
    expect(p?.name).toBe(`custom:${cfg.id}`);
    expect(p?.liveReady).toBe(true);
    expect(readCompetitionRouteMode(store)).toBe(false);
  });

  it('no config at all resolves to null (env-chain handoff, as before)', async () => {
    const { store, run } = await makeStoreWithRun();
    expect(resolveRunProvider(store, run)).toBeNull();
  });
});

describe('competition route gate — mode ON enforces Qwen-via-Bailian fail-closed', () => {
  it('no config selected: fail-closed refusal instead of the env-chain default (zai leak sealed)', async () => {
    const { store, run } = await makeStoreWithRun();
    writeCompetitionRouteMode(store, true);
    const p = resolveRunProvider(store, run);
    expect(p).not.toBeNull();
    expect(p?.name).toBe('competition-route-gate');
    expect(p?.liveReady).toBe(false);
    const res = await p!.structuredCall(CALL_REQ, (r) => r);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('provider_error');
    expect(res.error?.retryable).toBe(false);
    expect(res.error?.message).toContain('no model config selected');
    expect(res.receipt.provider).toBe('competition-route-gate');
    expect(res.receipt.executionMode).toBe('live');
  });

  it('non-Qwen modelId: refusal names the offending config and model id', async () => {
    const { store, run } = await makeStoreWithRun();
    const cfg = makeCfg({ id: mid('nonqwen'), label: 'glm-route', modelId: 'glm-4.6' });
    store.putObject('model_config', cfg);
    writeCompetitionRouteMode(store, true);
    const p = resolveRunProvider(store, { ...run, providerConfigId: cfg.id });
    const res = await p!.structuredCall(CALL_REQ, (r) => r);
    expect(res.ok).toBe(false);
    expect(res.error?.message).toContain('glm-route');
    expect(res.error?.message).toContain('"glm-4.6" is not Qwen-family');
  });

  it('Qwen model on a non-Bailian endpoint: refusal names the baseUrl (endpoint form matters)', async () => {
    const { store, run } = await makeStoreWithRun();
    const cfg = makeCfg({ label: 'proxy-route', modelId: 'qwen3.7-plus', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' });
    store.putObject('model_config', cfg);
    writeCompetitionRouteMode(store, true);
    const p = resolveRunProvider(store, { ...run, providerConfigId: cfg.id });
    const res = await p!.structuredCall(CALL_REQ, (r) => r);
    expect(res.ok).toBe(false);
    expect(res.error?.message).toContain('not a Bailian (*.aliyuncs.com) endpoint');
    expect(res.error?.message).toContain('proxy-route');
  });

  it('compliant config (workspace MaaS form): resolves the REAL provider — zero gate friction', async () => {
    const { store, run } = await makeStoreWithRun();
    const cfg = makeCfg({ label: 'bailian-maas', modelId: 'qwen3.7-plus', baseUrl: BAILIAN_URL });
    store.putObject('model_config', cfg);
    writeCompetitionRouteMode(store, true);
    const p = resolveRunProvider(store, { ...run, providerConfigId: cfg.id });
    expect(p?.name).toBe(`custom:${cfg.id}`);
    expect(p?.liveReady).toBe(true);
  });

  it('compliant config (legacy dashscope global form): also accepted', async () => {
    const { store, run } = await makeStoreWithRun();
    const cfg = makeCfg({ label: 'bailian-legacy', modelId: 'qwen-plus', baseUrl: LEGACY_BAILIAN_URL });
    store.putObject('model_config', cfg);
    writeCompetitionRouteMode(store, true);
    expect(resolveRunProvider(store, { ...run, providerConfigId: cfg.id })?.name).toBe(`custom:${cfg.id}`);
  });

  it('compliant PRIMARY with a NON-compliant declared fallback: refusal names the fallback config', async () => {
    const { store, run } = await makeStoreWithRun();
    const bad = makeCfg({ id: mid('badfb'), label: 'glm-fallback', modelId: 'glm-4.6' });
    const good = makeCfg({ id: mid('goodprimary'), label: 'qwen-primary', fallbackConfigIds: [bad.id] });
    store.putObject('model_config', bad);
    store.putObject('model_config', good);
    writeCompetitionRouteMode(store, true);
    const p = resolveRunProvider(store, { ...run, providerConfigId: good.id });
    const res = await p!.structuredCall(CALL_REQ, (r) => r);
    expect(res.ok).toBe(false);
    expect(res.error?.message).toContain('glm-fallback');
  });

  it('dangling run config id stays the pre-existing fail-closed missingConfigProvider', async () => {
    const { store, run } = await makeStoreWithRun();
    writeCompetitionRouteMode(store, true);
    const p = resolveRunProvider(store, { ...run, providerConfigId: 'mcfg_deleted' });
    expect(p?.name).toBe('custom:mcfg_deleted');
    const res = await p!.structuredCall(CALL_REQ, (r) => r);
    expect(res.error?.kind).toBe('auth_error'); // missing-config fail-closed semantics unchanged
  });

  it('run-level config beats the meta default: a compliant run config resolves even with a non-compliant active default', async () => {
    const { store, run } = await makeStoreWithRun();
    const badDefault = makeCfg({ id: mid('baddefault'), label: 'bad-default', modelId: 'kimi-k3' });
    const goodRun = makeCfg({ id: mid('goodrun'), label: 'run-route' });
    store.putObject('model_config', badDefault);
    store.putObject('model_config', goodRun);
    store.setMeta(ACTIVE_MODEL_CONFIG_META_KEY, badDefault.id);
    writeCompetitionRouteMode(store, true);
    expect(resolveRunProvider(store, { ...run, providerConfigId: goodRun.id })?.name).toBe(`custom:${goodRun.id}`);
    // ...while resolving THROUGH the meta default is refused:
    const viaMeta = resolveRunProvider(store, run);
    const res = await viaMeta!.structuredCall(CALL_REQ, (r) => r);
    expect(res.ok).toBe(false);
    expect(res.error?.message).toContain('bad-default');
  });
});

describe('competition route gate — the switch itself', () => {
  it('writeCompetitionRouteMode(false) removes the meta key (no residue)', async () => {
    const { store } = await makeStoreWithRun();
    writeCompetitionRouteMode(store, true);
    expect(store.getMeta(COMPETITION_ROUTE_META_KEY)).toBe('on');
    writeCompetitionRouteMode(store, false);
    expect(store.getMeta(COMPETITION_ROUTE_META_KEY)).toBeNull();
    expect(readCompetitionRouteMode(store)).toBe(false);
  });

  it('toggling OFF re-enables a previously refused route (gate re-read per resolution)', async () => {
    const { store, run } = await makeStoreWithRun();
    const cfg = makeCfg({ label: 'dev-route', modelId: 'glm-4.6', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' });
    store.putObject('model_config', cfg);
    writeCompetitionRouteMode(store, true);
    expect(resolveRunProvider(store, { ...run, providerConfigId: cfg.id })?.name).toBe('competition-route-gate');
    writeCompetitionRouteMode(store, false);
    expect(resolveRunProvider(store, { ...run, providerConfigId: cfg.id })?.name).toBe(`custom:${cfg.id}`);
  });
});
