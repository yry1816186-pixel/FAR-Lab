/**
 * frozen-corpus research run — orchestrator integration (night-r8).
 *
 * The N≥5-homogeneity mechanism, proven end-to-end at the run level: two full
 * offline runs pinned to the SAME frozen snapshot ground on byte-identical
 * corpora (same snapshotId + rootHash), the grounding receipt names the pin
 * (mode RECORDED_REPLAY + dataSource frozen:<id>), and a poisoned adapter
 * proves the pin makes ZERO retrieval calls. This is what
 * `far research start --reuse-snapshot <id>` executes.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import { RESEARCH_DEMO_DOCS, RESEARCH_DEMO_FIXTURES } from '../../src/research/research_fixtures.ts';
import { executeResearchRun, RunStore } from '../../src/research/run_lifecycle.ts';
import { verifyResearchRunDeterministic } from '../../src/research/verification.ts';
import { createCorpusSnapshot } from '../../src/retrieval/corpus.ts';
import { verifyCorpusSnapshot } from '../../src/retrieval/snapshot_store.ts';

let root: string;
let store: RunStore;
before(() => {
  root = mkdtempSync(join(tmpdir(), 'far-frozen-run-'));
  store = new RunStore(root);
});
after(() => rmSync(root, { recursive: true, force: true }));

/** Poisoned adapter: any retrieval call on a pinned run is a wiring defect. */
const poisonAdapter = {
  source: 'openalex' as const,
  sourceName: 'OpenAlex',
  async retrieve(): Promise<never> {
    throw new Error('pinned run must not retrieve — frozen corpus bypassed?');
  },
};

describe('frozen-corpus research run (orchestrator integration)', () => {
  const frozen = createCorpusSnapshot(
    RESEARCH_DEMO_DOCS,
    ['original live supporting query', 'counter: original live query'],
    '2026-08-16T00:00:00.000Z',
  );

  it('the pinned snapshot itself is store-verifiable (trust chain intact)', () => {
    assert.deepEqual(verifyCorpusSnapshot(frozen), { ok: true });
  });

  it('a run pinned to the snapshot grounds on it verbatim, receipt names the pin', async () => {
    const gateway = createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
    const run = await executeResearchRun({
      question: 'Does stellar activity inflate hot Jupiter radii?',
      gateway,
      profile: 'offline_replay',
      grounding: {
        // The poisoned adapter is INTENTIONALLY first-class: if the frozen
        // corpus is ever bypassed, this throws and the test fails loudly.
        adapter: poisonAdapter as never,
        frozenCorpus: frozen,
      },
      targetHypothesisCount: 3,
      hypothesisGenerationStrategy: 'legacy',
      store,
    });
    assert.equal(run.corpus.snapshotId, frozen.snapshotId, 'EXACT pinned corpus (N>=5 homogeneity)');
    assert.equal(run.corpus.rootHash, frozen.rootHash);
    assert.equal(run.corpus.documentCount, frozen.documentCount);

    const groundingReceipt = run.stageReceipts.find((r) => r.stageId === 'grounding');
    assert.ok(groundingReceipt !== undefined, 'grounding receipt present');
    assert.equal(groundingReceipt.mode, 'RECORDED_REPLAY', 'frozen replay is honestly not LIVE');
    assert.match(groundingReceipt.dataSource ?? '', /^frozen:[0-9a-f]{12}$/, 'receipt names the pinned snapshot');
    assert.equal(verifyResearchRunDeterministic(run).status, 'PASS');
  });

  it('two runs pinned to the same snapshot share the identical corpus identity', async () => {
    const gateway = createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
    const a = await executeResearchRun({
      question: 'Does stellar activity inflate hot Jupiter radii?',
      gateway,
      profile: 'offline_replay',
      grounding: { frozenCorpus: frozen },
      targetHypothesisCount: 3,
      hypothesisGenerationStrategy: 'legacy',
      store,
    });
    const b = await executeResearchRun({
      question: 'Does stellar activity inflate hot Jupiter radii?',
      gateway,
      profile: 'offline_replay',
      grounding: { frozenCorpus: frozen },
      targetHypothesisCount: 3,
      hypothesisGenerationStrategy: 'legacy',
      store,
    });
    assert.equal(a.corpus.snapshotId, b.corpus.snapshotId);
    assert.equal(a.corpus.rootHash, b.corpus.rootHash);
  });

  it('resume of a crashed pinned run reloads the SAME snapshot from the store (checkpoint pin)', async () => {
    // Point the lifecycle's store resolution at a temp dir and freeze there —
    // the resume must reload + re-verify via cp.frozenSnapshotId, not re-ground.
    const snapDir = join(root, 'snapstore');
    process.env.FAR_SNAPSHOT_STORE_DIR = snapDir;
    try {
      const { saveCorpusSnapshotStore } = await import('../../src/retrieval/snapshot_store.ts');
      saveCorpusSnapshotStore(frozen, snapDir);

      /** Fails on the Nth model call (simulated mid-run crash after grounding). */
      const base = createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
      const failOn2nd = (): typeof base => {
        let n = 0;
        return {
          register: (a) => base.register(a),
          registeredProfiles: () => base.registeredProfiles(),
          callLlm: (p, r) => {
            n += 1;
            if (n === 2) return Promise.reject(new Error('simulated crash after grounding'));
            return base.callLlm(p, r);
          },
        };
      };
      const startPinned = (gateway: typeof base) =>
        executeResearchRun({
          question: 'Does stellar activity inflate hot Jupiter radii?',
          gateway,
          profile: 'offline_replay',
          grounding: { frozenCorpus: frozen },
          targetHypothesisCount: 3,
          hypothesisGenerationStrategy: 'legacy',
          store,
        });

      // 1. Crash after grounding → checkpoint carries the pin.
      const crashed = await startPinned(failOn2nd()).then(() => null, () => 'crashed' as const);
      assert.equal(crashed, 'crashed');
      const cpId = store.listRunIds().at(-1);
      assert.ok(cpId !== undefined);
      const cp1 = store.loadCheckpoint(cpId);
      assert.ok(cp1 !== null);
      assert.equal(cp1.frozenSnapshotId, frozen.snapshotId, 'pin persisted in checkpoint');

      // 2. Resume WITHOUT any grounding args — the lifecycle reloads the store.
      const resumed = await executeResearchRun({
        runId: cpId,
        gateway: base,
        profile: 'offline_replay',
        targetHypothesisCount: 3,
        hypothesisGenerationStrategy: 'legacy',
        store,
      });
      assert.equal(resumed.corpus.snapshotId, frozen.snapshotId, 'resumed on the exact pinned corpus');

      // 3. Negative: snapshot file removed → resume FAILS CLOSED (a pinned run
      //    must never silently re-ground live mid-run).
      const crashed2 = await startPinned(failOn2nd()).then(() => null, () => 'crashed' as const);
      assert.equal(crashed2, 'crashed');
      const cpId2 = store.listRunIds().at(-1);
      assert.ok(cpId2 !== undefined);
      rmSync(join(snapDir, `${frozen.snapshotId}.json`), { force: true });
      await assert.rejects(
        () => executeResearchRun({
          runId: cpId2,
          gateway: base,
          profile: 'offline_replay',
          targetHypothesisCount: 3,
          hypothesisGenerationStrategy: 'legacy',
          store,
        }),
        /no snapshot|FAILED integrity/,
        'missing snapshot file must fail the resume closed',
      );
    } finally {
      delete process.env.FAR_SNAPSHOT_STORE_DIR;
    }
  });
});
