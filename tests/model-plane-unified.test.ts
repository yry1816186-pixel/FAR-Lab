import { afterAll, afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { createApp } from '../src/app/composition.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import { runResearchAction } from '../src/server/actions.js';
import { invokeStructured, withModelSlot } from '../src/pipeline/llm.js';
import { makeRunBudget } from '../src/app/run-budget.js';
import { ProvenanceReceipt, ResearchQuestion, ScientificClaim, HypothesisCandidate, newId } from '../src/domain/index.js';
import { MetaAnalysisSpec } from '../src/domain/meta.js';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { executeMetaAnalysis } from '../src/experiment/executor-meta.js';
import type { App } from '../src/app/composition.js';
import type { ModelProvider, StructuredCallResult } from '../src/shared/ports.js';

/**
 * Model-plane CONVERGENCE (coordination-fix wave 2026-08-23): research actions,
 * the meta executor and the agent kernel all run through invokeStructured —
 * one budget gate, one receipt shape, one concurrency cap. These tests pin the
 * seams that used to drift per call site.
 */

const actionEnvDirs: string[] = [];
const actionApps: App[] = [];

/** Fresh app per test: the scripted stub is single-use, and budget/config tests
 *  mutate run state that must not leak across assertions. */
const makeActionEnv = async (steps: StubStep[]): Promise<{ app: App; runId: string; claimId: string; hypId: string }> => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-mplane-'));
  actionEnvDirs.push(tmp);
  const app = await createApp({ dataDir: tmp, providerOverride: createTestStubProvider(steps) });
  actionApps.push(app);

  const q = ResearchQuestion.parse({
    id: 'q_test00000000000000000000000001',
    text: 'Why do solid electrolytes fail under lithium dendrite growth?',
    background: '', goalType: 'explanatory',
    scope: { domain: 'materials', phenomena: ['dendrite growth'] }, constraints: {},
    createdAt: new Date().toISOString(),
  });
  const run = app.store.createRun(q);

  const claim = ScientificClaim.parse({
    id: 'clm_test000000000000000000000001',
    runId: run.id,
    text: 'Dendrite penetration correlates with interfacial void density.',
    locators: [{ sourceDocumentId: 'src_test000000000000000000000001', quote: 'void density correlates with penetration' }],
    bindingStatus: 'verified',
    alignmentChecked: true,
  });
  app.store.putObject('claim', claim);

  const hyp = HypothesisCandidate.parse({
    id: 'hyp_test000000000000000000000001',
    runId: run.id,
    statement: 'Void accumulation at the Li/electrolyte interface initiates dendrite penetration.',
    mechanism: 'Voids concentrate current at contact loss points.',
    derivation: { strategy: 'mechanism_driven', rationale: 'fixture', inputClaimIds: [claim.id] },
    assumptions: [{ id: 'a1', statement: 'voids form before penetration', kind: 'empirical', backingClaimIds: [] }],
    predictions: ['Void density precedes dendrite initiation in imaging'],
    supportingClaimIds: [claim.id],
    counterClaimIds: [],
    testability: 'testable_with_data',
    noveltyLabel: 'evidence_grounded',
    createdAt: new Date().toISOString(),
  });
  app.store.putObject('hypothesis', hyp);
  return { app, runId: run.id, claimId: claim.id, hypId: hyp.id };
};

const actionOutFor = (claimId: string): StubStep[] => [{
  forPurpose: 'research-action:challenge',
  rawOutput: JSON.stringify({
    headline: 'Interface voids are the load-bearing link',
    points: [
      { kind: 'evidence_link', text: 'The sole verified claim ties void density to penetration.', claimId },
    ],
    uncertainties: [],
    nextStep: 'image void dynamics before dendrite initiation',
  }),
}];

afterAll(() => {
  for (const a of actionApps) a.close();
  for (const d of actionEnvDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('research actions on the unified model plane', () => {
  it('records a receipt with the action stage + a full receipt_recorded event detail', async () => {
    const { app, runId, hypId } = await makeActionEnv(actionOutFor('clm_test000000000000000000000001'));
    const res = await runResearchAction(app, runId, { action: 'challenge', targetType: 'hypothesis', targetId: hypId });
    expect(res.droppedRefs).toHaveLength(0);

    const receipts = app.store.listObjects('receipt', runId).filter((r) => r.kind === 'model_call');
    expect(receipts.length).toBeGreaterThanOrEqual(1);
    const last = receipts.at(-1)!;
    // Converged shape: the hand-written receipt had NO stage — the unified plane
    // stamps it (this is the drift the convergence closed).
    expect(last.stage).toBe('action:challenge');
    expect(last.modelCall?.usage).toBeDefined();
    expect(last.modelCall?.requestHash).toBeDefined();

    const ev = app.store.listEvents(runId).filter((e) => e.type === 'receipt_recorded').at(-1)!;
    expect(ev.receiptId).toBe(last.id);
    expect(ev.stage).toBe('action:challenge');
    expect((ev.detail as Record<string, unknown>).provider).toBe(res.model.provider);
    expect((ev.detail as Record<string, unknown>).modelId).toBe(res.model.modelId);
  });

  it('serves from the run-configured provider chain, never a silent env fallback', async () => {
    // Dangling run.providerConfigId resolves to the fail-closed missing-config
    // provider: if the action still used app.provider this call would SUCCEED
    // against the scripted stub.
    const { app, runId, hypId } = await makeActionEnv([]);
    const run = app.store.getRun(runId)!;
    run.providerConfigId = 'mcfg_deleted00000000000000000' as typeof run.providerConfigId;
    app.store.updateRun(run);
    await expect(
      runResearchAction(app, runId, { action: 'challenge', targetType: 'hypothesis', targetId: hypId }),
    ).rejects.toMatchObject({ status: 502, code: 'action_model_failed' });
  });

  it('refuses new calls when the run budget is spent (429, operational pause)', async () => {
    const { app, runId, hypId } = await makeActionEnv([]);
    // Pre-spend the cap via a receipt (spend is receipt-derived — the only authority).
    app.store.putObject('receipt', ProvenanceReceipt.parse({
      id: newId('rcp'), runId, kind: 'model_call', executionMode: 'live',
      at: new Date().toISOString(),
      modelCall: {
        provider: 'fixture', modelId: 'fixture', usage: { inputTokens: 1000, outputTokens: 1000, totalTokens: 2000 },
        latencyMs: 1, requestHash: '0'.repeat(64), outputHash: '0'.repeat(64),
      },
      stage: 'fixture',
    }));
    const prevCap = process.env.FARLAB_RUN_TOKEN_BUDGET;
    process.env.FARLAB_RUN_TOKEN_BUDGET = '1000';
    try {
      const budget = makeRunBudget(app.store, runId);
      expect(budget.hasRemaining()).toBe(false);
      await expect(
        runResearchAction(app, runId, { action: 'challenge', targetType: 'hypothesis', targetId: hypId }),
      ).rejects.toMatchObject({ status: 429, code: 'action_budget_exhausted' });
    } finally {
      if (prevCap === undefined) delete process.env.FARLAB_RUN_TOKEN_BUDGET;
      else process.env.FARLAB_RUN_TOKEN_BUDGET = prevCap;
    }
  });
});

describe('meta executor extraction is receipted through the plane', () => {
  const dirs: string[] = [];
  const dbs: ReturnType<typeof openDb>[] = [];

  afterEach(() => {
    for (const db of dbs.splice(0)) db.close();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  const makeEnv = (): { store: Store; runId: string; artifacts: ReturnType<typeof openArtifactStore> } => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-mplane-meta-'));
    dirs.push(dir);
    const db = openDb(path.join(dir, 'test.db'));
    dbs.push(db);
    const store = new Store(db);
    const question = ResearchQuestion.parse({
      id: newId('q'), text: 'Does vitamin D reduce RTI risk?', background: '', goalType: 'exploratory',
      scope: { domain: 'medicine', phenomena: ['vitamin d'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = store.createRun(question);
    return { store, runId: run.id, artifacts: openArtifactStore(path.join(dir, 'artifacts')) };
  };

  it('the extraction model call leaves a model_call receipt bound to the run', async () => {
    const { store, runId, artifacts } = makeEnv();
    for (const text of [
      'Trial reports OR 0.55 (95% CI 0.35 to 0.85) for RTI.',
      'Trial reports odds ratio 0.65 (95% CI 0.45 to 0.92).',
      'Trial reports OR 0.50 (95% CI 0.30 to 0.80).',
    ]) {
      store.putObject('claim', ScientificClaim.parse({
        id: newId('clm'), runId, text,
        locators: [{ sourceDocumentId: newId('src'), quote: text.slice(0, 40) }],
        bindingStatus: 'verified', alignmentChecked: true, uncertainties: [],
      }));
    }
    const spec = MetaAnalysisSpec.parse({
      id: newId('xsp'), runId, planId: newId('pln'), planStepId: newId('task'),
      question: 'Does vitamin D reduce RTI risk?',
      experimentType: 'statistical_meta',
      inclusionCriteria: 'randomized trials reporting an odds ratio for respiratory tract infection',
      effectMeasure: 'log_or', metaModel: 'random_dl', minStudies: 2, alpha: 0.05, ciLevel: 0.95,
      comparison: { id: 'cmp_meta1', effectMeasure: 'log_or', direction: 'below', threshold: 0, thresholdProvenance: 'null-boundary', primary: true },
      approvals: [], exploratoryNote: 'exploratory literature pool fixture for the unified-plane receipt test',
      createdAt: new Date().toISOString(),
    });
    const stub = createTestStubProvider([{
      forPurpose: 'meta-effect-extraction',
      rawOutput: JSON.stringify({
        estimates: [
          { claimId: 'FROM_STORE_1', sourceDocumentId: 'FROM_STORE_1', measure: 'or', point: 0.55, ciLow: 0.35, ciHigh: 0.85 },
        ],
      }),
    }]);
    // The claim ids above are minted at runtime — patch them into the scripted
    // output before running (stub steps are static, so rebuild with real ids).
    const claimIds = store.listObjects('claim', runId).map((c) => c.id);
    const docIds = store.listObjects('claim', runId).map((c) => c.locators[0]?.sourceDocumentId ?? '');
    const steps: StubStep[] = [{
      forPurpose: 'meta-effect-extraction',
      rawOutput: JSON.stringify({
        estimates: claimIds.map((cid, i) => ({
          claimId: cid, sourceDocumentId: docIds[i], measure: 'or',
          point: [0.55, 0.65, 0.5][i]!, ciLow: [0.35, 0.45, 0.3][i]!, ciHigh: [0.85, 0.92, 0.8][i]!,
        })),
      }),
    }];
    void stub;

    const out = await executeMetaAnalysis(store, artifacts, spec, {
      provider: createTestStubProvider(steps),
      now: () => '2026-08-23T00:00:00.000Z',
    });

    const receipts = store.listObjects('receipt', runId).filter((r) => r.kind === 'model_call');
    expect(receipts).toHaveLength(1); // the extraction call — previously unrecorded
    expect(receipts[0]!.stage).toBe('execute');
    const receiptModel = `${receipts[0]!.modelCall!.provider}/${receipts[0]!.modelCall!.modelId}`;
    for (const est of out.estimates) expect(est.extractionModelRef).toBe(receiptModel);
  });
});

describe('invokeStructured global concurrency cap', () => {
  const ConcurrencyOut = z.object({ ok: z.boolean() });

  const slowProvider = (peakRef: { peak: number }): ModelProvider => {
    let inFlight = 0;
    return {
      name: 'slow-fixture',
      liveReady: true,
      structuredCall<T>(_req: never, parse: (raw: unknown) => T | Error): Promise<StructuredCallResult<T>> {
        inFlight += 1;
        peakRef.peak = Math.max(peakRef.peak, inFlight);
        return new Promise((resolve) => {
          setTimeout(() => {
            inFlight -= 1;
            const parsed = parse({ ok: true });
            resolve({
              ...(parsed instanceof Error ? { ok: false as const, error: { kind: 'invalid_output' as const, message: parsed.message } } : { ok: true as const, data: parsed as T }),
              receipt: {
                provider: 'slow-fixture', modelId: 'slow-1', executionMode: 'live' as const,
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                latencyMs: 30, requestHash: '0'.repeat(64), outputHash: '0'.repeat(64), finishReason: 'stop' as const,
              },
            } as StructuredCallResult<T>);
          }, 30);
        });
      },
    };
  };

  it('overlaps at most the cap provider calls (default 6) and completes all', async () => {
    const peakRef = { peak: 0 };
    const sharedSlow = slowProvider(peakRef); // ONE instance: its in-flight counter must see the overlap
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        invokeStructured<z.infer<typeof ConcurrencyOut>>(
          { provider: sharedSlow, recordReceipt: () => {}, runId: 'run_fixture0000000000000000' },
          { stage: 'test', purpose: `concurrency:${i}`, systemPrompt: 's', payload: { i }, schema: ConcurrencyOut, maxTokens: 8 },
        )),
    );
    expect(results).toHaveLength(10);
    expect(results.every((r) => r.data.ok === true)).toBe(true);
    expect(peakRef.peak).toBeLessThanOrEqual(6); // default FARLAB_MODEL_CONCURRENCY
    expect(peakRef.peak).toBeGreaterThan(1); // it really overlapped
  });

  it('withModelSlot releases slots on error (a failed occupant never blocks the queue)', async () => {
    let entered = 0;
    const run = async (): Promise<void> => {
      await withModelSlot(async () => {
        entered += 1;
        await new Promise((r) => setTimeout(r, 5));
        if (entered === 1) throw new Error('first fails');
      }).catch(() => {});
    };
    await Promise.all(Array.from({ length: 8 }, () => run()));
    expect(entered).toBe(8);
  });
});
