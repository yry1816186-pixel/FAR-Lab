import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { runResearchAction, ActionError } from '../src/server/actions.js';
import { ResearchQuestion, ScientificClaim, HypothesisCandidate } from '../src/domain/index.js';
import type { App } from '../src/app/composition.js';

/**
 * B4 object-level AI research actions — unit-level over the module (HTTP route
 * tests live with the route once registered). Grounding contract under test:
 * store-facts-only payload assembly, cited-id validation with disclosed
 * drops, receipt + audit events on every call, honest failure mapping.
 */

let tmp: string;
let app: App;
let runId: string;
let claimId: string;
let hypId: string;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-actions-'));
  app = await createApp({ dataDir: tmp, providerOverride: createTestStubProvider([]) });

  const q = ResearchQuestion.parse({
    id: 'q_test00000000000000000000000001',
    text: 'Why do solid electrolytes fail under lithium dendrite growth?',
    background: '',
    goalType: 'explanatory',
    scope: { domain: 'materials', phenomena: ['dendrite growth'] },
    constraints: {},
    createdAt: new Date().toISOString(),
  });
  const run = app.store.createRun(q);
  runId = run.id;

  const claim = ScientificClaim.parse({
    id: 'clm_test000000000000000000000001',
    runId,
    text: 'Dendrite penetration correlates with interfacial void density.',
    locators: [{ sourceDocumentId: 'src_test000000000000000000000001', quote: 'void density correlates with penetration' }],
    bindingStatus: 'verified',
    alignmentChecked: true,
  });
  app.store.putObject('claim', claim);
  claimId = claim.id;

  const hyp = HypothesisCandidate.parse({
    id: 'hyp_test000000000000000000000001',
    runId,
    statement: 'Void accumulation at the Li/electrolyte interface initiates dendrite penetration.',
    mechanism: 'Voids concentrate current at contact loss points.',
    derivation: { strategy: 'mechanism_driven', rationale: 'from interface failure literature', inputClaimIds: [claim.id] },
    assumptions: [{ id: 'a1', statement: 'voids form before penetration', kind: 'empirical', backingClaimIds: [] }],
    predictions: ['Void density precedes dendrite initiation in imaging'],
    supportingClaimIds: [claim.id],
    counterClaimIds: [],
    uncertainties: [],
    noveltyLabel: 'evidence_grounded',
    testability: 'testable_with_data',
    clusterKey: 'c1',
    version: 0,
    createdAt: new Date().toISOString(),
  });
  app.store.putObject('hypothesis', hyp);
  hypId = hyp.id;
});

afterAll(() => {
  app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('runResearchAction', () => {
  it('returns grounded analysis, validates cited ids, records receipt + audit events', async () => {
    const provider = createTestStubProvider([{
      forPurpose: 'research-action:challenge',
      rawOutput: JSON.stringify({
        headline: 'Contact-loss hypothesis rests on one imaging claim',
        points: [
          { kind: 'evidence_link', text: 'The only support is the void-density correlation.', claimId },
          { kind: 'evidence_link', text: 'This id does not exist and must be dropped.', claimId: 'clm_missing00000000000000000000x' },
          { kind: 'caveat', text: 'Correlation alone cannot establish temporal ordering.', claimId: 'clm_missing00000000000000000000x' },
        ],
        uncertainties: ['No longitudinal imaging in corpus'],
        nextStep: 'Time-resolved imaging before/after void formation',
      }),
    }]);
    const appLive = { ...app, provider } as unknown as App;

    const res = await runResearchAction(appLive, runId, { action: 'challenge', targetType: 'hypothesis', targetId: hypId });

    expect(res.action).toBe('challenge');
    expect(res.analysis.headline).toContain('Contact-loss');
    expect(res.analysis.points).toHaveLength(2); // invalid-ref evidence_link dropped; caveat kept sans claimId
    expect(res.droppedRefs).toContain('clm_missing00000000000000000000x');
    expect(res.groundingClaims).toBe(1); // the hypothesis's one bound claim
    expect(res.model.provider).toBe('test-stub');

    const events = app.store.listEvents(runId);
    const receiptEvent = events.find((e) => e.type === 'receipt_recorded');
    expect(receiptEvent).toBeDefined();
    const noteEvent = events.find((e) => e.type === 'note' && e.detail?.reason === 'research_action');
    expect(noteEvent?.detail?.action).toBe('challenge');
    // Receipt persisted with modelCall facts (provenance parity with pipeline).
    const receipts = app.store.listObjects('receipt', runId);
    expect(receipts.some((r) => r.modelCall !== undefined)).toBe(true);
  });

  it('400s for ask without a question; 404s for a missing target', async () => {
    await expect(runResearchAction(app, runId, { action: 'ask', targetType: 'hypothesis', targetId: hypId }))
      .rejects.toMatchObject({ status: 400, code: 'question_required' });
    await expect(runResearchAction(app, runId, { action: 'challenge', targetType: 'claim', targetId: 'clm_nope000000000000000000000x' }))
      .rejects.toMatchObject({ status: 404, code: 'target_not_found' });
    await expect(runResearchAction(app, 'run_missing0000000000000000000x', { action: 'challenge', targetType: 'claim', targetId: 'x' }))
      .rejects.toBeInstanceOf(ActionError);
  });

  it('502s honestly when the model fails (fail-closed, no fabricated analysis)', async () => {
    const provider = createTestStubProvider([{
      forPurpose: 'research-action:falsify_probe',
      fail: { kind: 'provider_error', message: 'route down (scripted)' },
    }]);
    const appLive = { ...app, provider } as unknown as App;
    await expect(
      runResearchAction(appLive, runId, { action: 'falsify_probe', targetType: 'hypothesis', targetId: hypId }),
    ).rejects.toMatchObject({ status: 502, code: 'action_model_failed' });
  });

  it('claim targets carry their source title and quote into the payload', async () => {
    const provider = createTestStubProvider([{
      forPurpose: 'research-action:counter_evidence',
      rawOutput: JSON.stringify({
        headline: 'No counter-evidence in corpus',
        points: [{ kind: 'gap', text: 'Corpus lacks failed-replication coverage of void imaging.' }],
        uncertainties: [],
      }),
    }]);
    const appLive = { ...app, provider } as unknown as App;
    const res = await runResearchAction(appLive, runId, { action: 'counter_evidence', targetType: 'claim', targetId: claimId });
    expect(res.analysis.points[0]!.kind).toBe('gap');
    expect(res.droppedRefs).toEqual([]);
  });
});
