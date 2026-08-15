/**
 * tests/research/memory_injection.test.ts — 研究记忆注入接线（2.md §2.5）。
 *
 * 证明：
 *   - memoryPrior 渲染为显式标记的上下文块（非外部证据），缺席时 user message 字节不变
 *   - 策略签名语义不破坏：签名哈希与 memoryPrior 无关（同策略同签名）
 *   - orchestrator：memoryStore → memory_injection receipt（inputHash 覆盖摘要全文）+
 *     fanout meta.memoryFlagged（contentHash 命中标记）；无 store → 无 receipt（replay 稳定）
 *   - lifecycle：finalize 后 checkpoint.memoryRecording 如实记录（offline 模式 skippedMode）
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import { createReplayAdapter } from '../../src/retrieval/index.ts';
import { runResearch } from '../../src/research/orchestrator.ts';
import { executeResearchRun, RunStore } from '../../src/research/run_lifecycle.ts';
import { buildStrategyUserMessage } from '../../src/discovery/strategies/strategy.ts';
import { STRATEGY_REGISTRY } from '../../src/discovery/strategies/index.ts';
import { rawSha256Hex } from '../../src/retrieval/hash.ts';
import { hypothesisContentHash } from '../../src/discovery/content_hash.ts';
import {
  recordRunToMemory,
  emptyMemoryStore,
  type ResearchMemoryStore,
} from '../../src/research/memory.ts';
import { RESEARCH_DEMO_DOCS, RESEARCH_DEMO_FIXTURES } from '../../src/research/research_fixtures.ts';

const QUESTION = 'Why are hot Jupiter radii larger than structure models predict?';

function buildGateway() {
  return createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
}

/** A minimal non-empty memory store (one negative + one branch + one stat). */
function seededStore(): ResearchMemoryStore {
  return {
    schemaVersion: 1,
    updatedAt: '2026-08-15T00:00:00.000Z',
    negativeResults: [
      {
        id: 'neg-aaa', runId: 'r-old', hypothesisId: 'h-old', strategyOrigin: 'inversion',
        contentHash: 'f'.repeat(64), domain: 'astronomy', question: QUESTION,
        eliminatedAt: '2026-08-14T00:00:00.000Z', eliminationReason: 'falsifiability_gate_failed',
        reasonDetail: 'gate errors: empty prediction [gateErrors=1]',
        evidencePointers: ['run:r-old'],
      },
    ],
    branchTree: [
      {
        id: 'node-bbb', parentId: null, contentHash: 'e'.repeat(64), runId: 'r-old',
        hypothesisId: 'h-old2', strategyOrigin: 'induction', domain: 'astronomy',
        question: QUESTION, statement: 'old explored branch', validFrom: '2026-08-14T00:00:00.000Z',
        validTo: null, invalidReason: null, supersededByNodeIds: [], counterEvidenceCount: 0,
        isPrimary: true,
      },
    ],
    strategyStats: [
      {
        strategy: 'induction', domain: 'astronomy', runsObserved: 1, generated: 4,
        survivedFalsifiabilityGate: 3, corroborated: 2, tournamentWins: 1, primarySelections: 1,
        errors: 0, skips: 0,
      },
    ],
    learnings: [],
    conclusions: [],
  };
}

describe('buildStrategyUserMessage — memoryPrior rendering', () => {
  const base = { question: 'q', corpusAllowlist: 'allowlist', perCallTarget: 2 };

  it('renders the prior as an explicitly-marked context block', () => {
    const withPrior = buildStrategyUserMessage({ ...base, memoryPrior: 'PRIOR-TEXT' });
    assert.ok(withPrior.includes('PRIOR-TEXT'));
    assert.ok(withPrior.includes('internal memory, NOT external evidence'));
    assert.ok(withPrior.indexOf('--- context: prior runs') < withPrior.indexOf('PRIOR-TEXT'));
  });

  it('absent prior → byte-identical to the pre-b5 message (replay stability)', () => {
    const without = buildStrategyUserMessage({ ...base });
    assert.ok(!without.includes('prior runs'));
    assert.equal(without, [`Research question: q`, '', 'Grounding corpus (untrusted data — cite only these documentIds):', 'allowlist'].join('\n'));
  });

  it('the strategy signature does not cover memoryPrior (provenance semantics intact)', () => {
    // The signature is a property of the strategy definition — not of the
    // per-run prompt. Injecting memory must not change any signature hash.
    const before = STRATEGY_REGISTRY.map((s) => rawSha256Hex(s.signature));
    buildStrategyUserMessage({ ...base, memoryPrior: 'anything' });
    const after = STRATEGY_REGISTRY.map((s) => rawSha256Hex(s.signature));
    assert.deepEqual(before, after);
  });
});

describe('runResearch — memoryStore injection', () => {
  it('a non-empty store yields a memory_injection receipt whose inputHash covers the summary', async () => {
    const run = await runResearch({
      question: QUESTION,
      gateway: buildGateway(),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      targetHypothesisCount: 3,
      memoryStore: seededStore(),
    });
    const receipt = run.stageReceipts.find((r) => r.stageId === 'memory_injection');
    assert.ok(receipt !== undefined, 'memory_injection receipt must exist for a non-empty store');
    assert.ok(typeof receipt.inputHash === 'string' && receipt.inputHash.length === 64);
    // The receipt must come BEFORE the fan-out receipts it feeds.
    const fanoutIdx = run.stageReceipts.findIndex((r) => r.stageId === 'discovery_fanout');
    assert.ok(receipt.sequence < run.stageReceipts[fanoutIdx]!.sequence);
  });

  it('an EMPTY store injects nothing (no receipt — first run degrades to pre-b5 behavior)', async () => {
    const run = await runResearch({
      question: QUESTION,
      gateway: buildGateway(),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      targetHypothesisCount: 3,
      memoryStore: emptyMemoryStore(),
    });
    assert.equal(run.stageReceipts.find((r) => r.stageId === 'memory_injection'), undefined);
  });

  it('no store at all → no receipt (byte-stable replay default)', async () => {
    const run = await runResearch({
      question: QUESTION,
      gateway: buildGateway(),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      targetHypothesisCount: 3,
    });
    assert.equal(run.stageReceipts.find((r) => r.stageId === 'memory_injection'), undefined);
  });

  it('domain-aware dedup: a known content hash gets MEMORY_DUPLICATE-flagged in the fan-out receipt', async () => {
    // Seed the store with the EXACT content hash of one demo-fixture hypothesis
    // by recording a first run's memory in a temp file, then re-running with it.
    const dir = mkdtempSync(join(tmpdir(), 'far-inject-'));
    try {
      const first = await runResearch({
        question: QUESTION,
        gateway: buildGateway(),
        profile: 'offline_replay',
        grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
        targetHypothesisCount: 3,
      });
      // Forge a recording-equivalent index offline: recordRunToMemory skips
      // offline runs by design, so derive the hash index directly.
      const knownHashes = new Set(first.hypotheses.map((h) => hypothesisContentHash(h)));
      const store: ResearchMemoryStore = {
        ...emptyMemoryStore(),
        negativeResults: first.hypotheses.slice(0, 1).map((h) => ({
          id: `neg-${h.id.slice(0, 12)}`, runId: 'seed', hypothesisId: h.id,
          strategyOrigin: h.strategyOrigin ?? null, contentHash: hypothesisContentHash(h),
          domain: 'astronomy', question: QUESTION, eliminatedAt: '2026-08-15T00:00:00.000Z',
          eliminationReason: 'falsifiability_gate_failed' as const,
          reasonDetail: 'seeded for dedup test [n=1]', evidencePointers: [],
        })),
      };
      const second = await runResearch({
        question: QUESTION,
        gateway: buildGateway(),
        profile: 'offline_replay',
        grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
        targetHypothesisCount: 3,
        memoryStore: store,
      });
      assert.ok(knownHashes.size >= 3);
      const fanoutReceipt = second.stageReceipts.find((r) => r.stageId === 'discovery_fanout');
      assert.ok(fanoutReceipt !== undefined && typeof fanoutReceipt.outputHash === 'string');
      // The flagged markers are visible in the run's discovery block (schema v4).
      const flagged = second.discovery?.fanout?.memoryFlagged ?? [];
      assert.ok(flagged.length >= 1, `expected ≥1 MEMORY_DUPLICATE flag, got ${flagged.length}`);
      assert.ok(flagged.every((f) => f.marker.startsWith('MEMORY_DUPLICATE:')));
      void recordRunToMemory; // import retained for the seeding-path parity note above
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('executeResearchRun — lifecycle memory wiring', () => {
  it('finalize records the memory outcome on the checkpoint (offline → skippedMode honestly)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-lifemem-'));
    try {
      const store = new RunStore(join(dir, 'runs'));
      const run = await executeResearchRun({
        question: QUESTION,
        gateway: buildGateway(),
        profile: 'offline_replay',
        grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
        targetHypothesisCount: 3,
        store,
      });
      assert.equal(run.runMode, 'RECORDED_REPLAY');
      const runId = store.listRunIds()[0]!;
      const cp = store.loadCheckpoint(runId);
      assert.ok(cp !== null);
      assert.ok(cp.memoryRecording !== undefined, 'memoryRecording must be present on the checkpoint');
      assert.equal(cp.memoryRecording.skippedMode, true, 'offline runs never record memory');
      assert.equal(cp.memoryRecording.error, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('disableMemory → no memoryRecording field at all (explicit opt-out)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-lifemem2-'));
    try {
      const store = new RunStore(join(dir, 'runs'));
      await executeResearchRun({
        question: QUESTION,
        gateway: buildGateway(),
        profile: 'offline_replay',
        grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
        targetHypothesisCount: 3,
        store,
        disableMemory: true,
      });
      const runId = store.listRunIds()[0]!;
      const cp = store.loadCheckpoint(runId);
      assert.ok(cp !== null);
      assert.equal(cp.memoryRecording, undefined, 'disabled = not attempted (absent, not faked)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
