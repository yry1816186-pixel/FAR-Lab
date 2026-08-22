import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { ModelProviderConfig, ResearchQuestion, newId } from '../src/domain/index.js';

// *** TEST-ONLY *** composition-level e2e: a run bound to a user model config
// routes its model calls through THAT config's provider. The config carries an
// EMPTY key, so the custom provider fails closed (auth_error, zero network) and
// the whole chain is exercised honestly: API store -> orchestrator -> per-run
// resolver -> custom provider -> receipt (provider=custom:<id>) -> stage failure.

let tmp: string;
let app: App;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-modelcfg-e2e-'));
  app = await createApp({ dataDir: tmp }); // REAL composition incl. the providerFor seam
});

afterAll(() => {
  app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('model-config e2e: bound run routes through its custom provider', () => {
  it('a run with an empty-key custom config fails closed with a custom:* receipt', async () => {
    const cfg = ModelProviderConfig.parse({
      id: newId('mcfg'),
      label: 'e2e empty-key route',
      wire: 'openai',
      baseUrl: 'https://example-invalid.test/v1',
      modelId: 'fixture-model',
      apiKey: '', // fail-closed: no network, no fabricated output
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    app.store.putObject('model_config', cfg);

    const q = ResearchQuestion.parse({
      id: newId('q'),
      text: 'Why do off-target edits cluster at certain motifs?',
      background: '',
      goalType: 'explanatory',
      scope: { domain: 'genome editing', phenomena: ['off-target clustering'] },
      constraints: {},
      createdAt: new Date().toISOString(),
    });
    const run = app.store.createRun(q, { providerConfigId: cfg.id });

    const final = await app.orchestrator.execute(run.id);

    // The pipeline must NOT look healthy: the bound route has no key, so the very
    // first model call (scope) fails closed. Stage failure lands the run in
    // 'partial' (resumable) with the auth_error visible in lastError.
    expect(final.status).toBe('partial');
    expect(final.lastError ?? '').toContain('auth_error');
    const scopeRec = final.stages.find((s) => s.stage === 'scope');
    expect(scopeRec?.state).toBe('failed');
    expect(scopeRec?.error ?? '').toContain('auth_error');

    // The receipt proves the call actually went through the run's custom provider
    // (not the env-chain one) — provenance records the route that really served.
    const receipts = app.store.listObjects('receipt', run.id);
    const modelReceipt = receipts.find((r) => r.kind === 'model_call' && r.modelCall?.provider === `custom:${cfg.id}`);
    expect(modelReceipt).toBeDefined();
    expect(modelReceipt?.modelCall?.provider).toBe(`custom:${cfg.id}`);
    expect(modelReceipt?.modelCall?.modelId).toBe('fixture-model');
    expect(modelReceipt?.executionMode).toBe('live');
  });
});
