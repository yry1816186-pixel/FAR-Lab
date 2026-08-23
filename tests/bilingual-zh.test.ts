import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import { ProvenanceReceipt, ResearchQuestion, newId } from '../src/domain/index.js';
import { HypothesisCandidate } from '../src/domain/index.js';
import type { StageContext } from '../src/pipeline/types.js';
import { translateHypothesesZh } from '../src/pipeline/stages/hypotheses.js';

/**
 * W-C bilingual display layer (user-approved hybrid): generation-time zh renderings
 * are a display aid — flag-gated, fill-once, failure-degrading, never run-blocking.
 * All model calls are the TEST-ONLY scripted stub; zero network.
 */

const openDbs: Db[] = [];
const tmpDirs: string[] = [];

const makeCtx = (steps: StubStep[], zhDisplay: boolean): { ctx: StageContext; store: Store; runId: string } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-zh-'));
  tmpDirs.push(dir);
  const db = openDb(path.join(dir, 'test.db'));
  openDbs.push(db);
  const store = new Store(db);
  const question = ResearchQuestion.parse({
    id: newId('q'), text: 'q', background: '', goalType: 'exploratory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  const run = store.createRun(question);
  const ctx: StageContext = {
    run,
    store,
    artifacts: openArtifactStore(path.join(dir, 'artifacts')),
    provider: createTestStubProvider(steps),
    sourceFor: () => {
      throw new Error('TEST FIXTURE: no source adapter in this test');
    },
    recordReceipt: (partial) => {
      store.putObject(
        'receipt',
        ProvenanceReceipt.parse({ ...partial, id: newId('rcp'), runId: run.id, at: new Date().toISOString() }),
      );
    },
    cancelled: () => false,
    log: () => {},
    ...(zhDisplay ? { zhDisplay: true } : {}),
  };
  return { ctx, store, runId: run.id };
};

const makeHyp = (runId: string, statement: string, mechanism: string): HypothesisCandidate =>
  HypothesisCandidate.parse({
    id: newId('hyp'), runId, version: 0, status: 'active', statement, mechanism,
    derivation: { strategy: 'evidence_conditioned', rationale: 'fixture', inputClaimIds: [] },
    createdAt: new Date().toISOString(),
  });

afterEach(() => {
  for (const db of openDbs.splice(0)) db.close();
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('W-C bilingual display layer: translateHypothesesZh', () => {
  it('flag off (default test context) makes zero provider calls and returns null', async () => {
    const { ctx, store } = makeCtx([], false);
    const hyp = makeHyp(ctx.run.id, 'Vitamin D reduces RTI risk via innate immunity.', 'induces antimicrobial peptides');
    store.putObject('hypothesis', hyp);
    const note = await translateHypothesesZh(ctx, [{ id: hyp.id, statement: hyp.statement, mechanism: hyp.mechanism }]);
    expect(note).toBeNull();
    expect(store.getObject('hypothesis', hyp.id)?.statementZh).toBeUndefined();
  });

  it('flag on: one batched call fills statementZh/mechanismZh fill-once', async () => {
    const { ctx, store } = makeCtx([], true);
    const h1 = makeHyp(ctx.run.id, 'Vitamin D reduces RTI risk via innate immunity.', 'induces antimicrobial peptides');
    const h2 = makeHyp(ctx.run.id, 'Vitamin D has no effect on RTI risk.', '');
    store.putObject('hypothesis', h1);
    store.putObject('hypothesis', h2);
    const targets = [
      { id: h1.id, statement: h1.statement, mechanism: h1.mechanism },
      { id: h2.id, statement: h2.statement, mechanism: h2.mechanism },
    ];
    const zhPayload = {
      translations: [
        { hypothesisId: h1.id, statementZh: '维生素D通过先天免疫降低呼吸道感染风险。', mechanismZh: '诱导抗菌肽' },
        { hypothesisId: h2.id, statementZh: '维生素D对呼吸道感染风险无影响。', mechanismZh: '' },
      ],
    };
    // keyed stub step: purpose-addressed, does not consume the sequential cursor
    const scripted = makeCtx(
      [{ forPurpose: 'bilingual-zh:statements', rawOutput: JSON.stringify(zhPayload) }],
      true,
    );
    const translate = translateHypothesesZh({ ...ctx, provider: scripted.ctx.provider }, targets);

    expect(await translate).toBe('2/2 representative statements translated');
    const stored1 = store.getObject('hypothesis', h1.id);
    expect(stored1?.statementZh).toBe('维生素D通过先天免疫降低呼吸道感染风险。');
    expect(stored1?.mechanismZh).toBe('诱导抗菌肽');
    const stored2 = store.getObject('hypothesis', h2.id);
    expect(stored2?.statementZh).toBe('维生素D对呼吸道感染风险无影响。');
    expect(stored2?.mechanismZh).toBeUndefined(); // empty mechanism stays absent, never ''

    // fill-once: a second pass never overwrites an existing translation
    await translateHypothesesZh({ ...ctx, provider: scripted.ctx.provider }, targets);
    expect(store.getObject('hypothesis', h1.id)?.statementZh).toBe('维生素D通过先天免疫降低呼吸道感染风险。');
  });

  it('provider failure degrades to a visible skip note; objects untouched', async () => {
    const { ctx, store } = makeCtx(
      [{ forPurpose: 'bilingual-zh:statements', fail: { kind: 'provider_error', message: 'fixture outage' } }],
      true,
    );
    const hyp = makeHyp(ctx.run.id, 'Vitamin D reduces RTI risk.', '');
    store.putObject('hypothesis', hyp);
    const note = await translateHypothesesZh(ctx, [{ id: hyp.id, statement: hyp.statement, mechanism: hyp.mechanism }]);
    expect(note).toContain('skipped');
    expect(note).toContain('fixture outage');
    expect(store.getObject('hypothesis', hyp.id)?.statementZh).toBeUndefined();
  });

  it('empty targets make zero calls even with the flag on', async () => {
    const { ctx } = makeCtx([], true);
    expect(await translateHypothesesZh(ctx, [])).toBeNull();
  });
});
