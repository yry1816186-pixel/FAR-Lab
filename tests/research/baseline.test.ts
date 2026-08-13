// tests/research/baseline.test.ts
// Four fair baselines (§14.2): same model + question; capability gaps are
// reported as N/A (honest), never scored as zero; the full system is the only
// variant with deterministic kernel + citation binding.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import { createReplayAdapter } from '../../src/retrieval/index.ts';
import { RESEARCH_DEMO_DOCS, RESEARCH_DEMO_FIXTURES } from '../../src/research/research_fixtures.ts';
import { runDirectBaseline, runRagBaseline, runNoKernelBaseline, runAllBaselines } from '../../src/research/evaluation/baseline.ts';
import { runResearch } from '../../src/research/orchestrator.ts';

function replayGateway() {
  return createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
}

const QUESTION = 'Does stellar activity inflate hot Jupiter radii?';

describe('baseline runners (offline replay)', () => {
  test('direct: single-turn, no corpus, no kernel', async () => {
    const out = await runDirectBaseline(replayGateway(), 'offline_replay', QUESTION);
    assert.equal(out.kind, 'direct');
    assert.equal(out.deterministicKernelRan, false);
    assert.equal(out.corpusDocumentCount, null);
    assert.equal(out.citationBindingRate, null);
    assert.ok(out.bestHypothesis !== null && out.bestHypothesis.length > 0);
    assert.equal(out.selfScoredFalsifiableRate, null);
  });

  test('rag: retrieval context injected, still no kernel', async () => {
    const out = await runRagBaseline(
      replayGateway(),
      'offline_replay',
      QUESTION,
      createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS),
    );
    assert.equal(out.kind, 'rag');
    assert.equal(out.corpusDocumentCount, 2);
    assert.equal(out.deterministicKernelRan, false);
    assert.equal(out.citationBindingRate, null);
  });

  test('no_kernel: model self-scores; incomplete falsification is measurable', async () => {
    const out = await runNoKernelBaseline(replayGateway(), 'offline_replay', QUESTION);
    assert.equal(out.kind, 'no_kernel');
    assert.equal(out.deterministicKernelRan, false);
    // fixture has 1 incomplete falsification method (lt without value) out of 3.
    assert.equal(out.selfScoredFalsifiableRate, 2 / 3);
  });

  test('runAllBaselines: full is the only variant with kernel + binding', async () => {
    const gateway = replayGateway();
    const fullRun = await runResearch({
      question: QUESTION,
      gateway,
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      environment: {
        gitCommit: null, gitDirty: null, nodeVersion: 'test', platform: 'test', lockfileHash: null, packageVersion: null,
      },
    });
    const entries = await runAllBaselines({
      question: QUESTION,
      gateway,
      profile: 'offline_replay',
      adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS),
      fullRun,
    });
    assert.equal(entries.length, 4);
    const kinds = entries.map((e) => e.kind).sort();
    assert.deepEqual(kinds, ['direct', 'full', 'no_kernel', 'rag']);

    const full = entries.find((e) => e.kind === 'full');
    assert.ok(full !== undefined);
    assert.equal(full.deterministicKernelRan, true);
    assert.equal(full.citationBindingRate, 1);
    assert.equal(full.unboundEvidenceCount, 0);
    assert.equal(full.hypothesisCount, 3);

    for (const e of entries.filter((x) => x.kind !== 'full')) {
      assert.equal(e.deterministicKernelRan, false);
      assert.equal(e.citationBindingRate, null, `${e.kind} must report N/A binding, not a fake score`);
    }
  });
});
