/**
 * tests/research/run_lifecycle.test.ts — persistent run lifecycle contracts.
 *
 * Pins (directives §14/§16): checkpoint persistence per stage, resume that
 * skips completed stages (no repeated model calls for done work), cancellation
 * → CANCELLED, gate refusal → FAILED(gate_refused), store atomicity, and the
 * event sequence. All on the offline replay path (fast, deterministic); the
 * LIVE path uses the same driver (verified separately by the live evidence
 * runs recorded in PROGRESS).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLlmGateway, type LlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import type { LlmRequest, LlmResponse, ProviderAdapter, ProviderProfile } from '../../src/llm_gateway/types.ts';
import { createReplayAdapter } from '../../src/retrieval/index.ts';
import {
  renameWithRetry,
  executeResearchRun,
  RunStore,
  parseCheckpoint,
  cancelRun,
  addRunEventListener,
  type ResearchRunEvent,
} from '../../src/research/run_lifecycle.ts';
import { RESEARCH_DEMO_DOCS, RESEARCH_DEMO_FIXTURES } from '../../src/research/research_fixtures.ts';
import { verifyResearchRunDeterministic } from '../../src/research/verification.ts';

/** Gateway wrapper that counts model calls (resume must not repeat done work). */
class CountingGateway implements LlmGateway {
  private readonly inner: LlmGateway;
  calls = 0;

  constructor(inner: LlmGateway) {
    this.inner = inner;
  }

  register(adapter: ProviderAdapter): void {
    this.inner.register(adapter);
  }

  registeredProfiles(): readonly ProviderProfile[] {
    return this.inner.registeredProfiles();
  }

  async callLlm(profile: ProviderProfile, request: LlmRequest): Promise<LlmResponse> {
    this.calls += 1;
    return this.inner.callLlm(profile, request);
  }
}

/** Gateway wrapper that throws on the Nth call (simulated mid-run crash). */
class FailOnNthGateway implements LlmGateway {
  private readonly inner: LlmGateway;
  private readonly failAt: number;
  calls = 0;

  constructor(inner: LlmGateway, failAt: number) {
    this.inner = inner;
    this.failAt = failAt;
  }

  register(adapter: ProviderAdapter): void {
    this.inner.register(adapter);
  }

  registeredProfiles(): readonly ProviderProfile[] {
    return this.inner.registeredProfiles();
  }

  async callLlm(profile: ProviderProfile, request: LlmRequest): Promise<LlmResponse> {
    this.calls += 1;
    if (this.calls === this.failAt) {
      throw new Error(`simulated crash on model call #${this.failAt}`);
    }
    return this.inner.callLlm(profile, request);
  }
}

/**
 * Gateway wrapper that delays each call: cancellation lands at the NEXT stage
 * boundary (an in-flight provider call is not itself abortable in this
 * codebase — the honest documented semantics).
 */
class DelayedGateway implements LlmGateway {
  private readonly inner: LlmGateway;
  private readonly delayMs: number;
  calls = 0;

  constructor(inner: LlmGateway, delayMs: number) {
    this.inner = inner;
    this.delayMs = delayMs;
  }

  register(adapter: ProviderAdapter): void {
    this.inner.register(adapter);
  }

  registeredProfiles(): readonly ProviderProfile[] {
    return this.inner.registeredProfiles();
  }

  async callLlm(profile: ProviderProfile, request: LlmRequest): Promise<LlmResponse> {
    this.calls += 1;
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return this.inner.callLlm(profile, request);
  }
}

describe('run lifecycle (offline replay)', () => {
  let storeRoot: string;
  let store: RunStore;
  let baseGateway: LlmGateway;

  beforeEach(() => {
    storeRoot = mkdtempSync(join(tmpdir(), 'far-research-lifecycle-'));
    store = new RunStore(storeRoot);
    baseGateway = createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
  });

  afterEach(() => {
    rmSync(storeRoot, { recursive: true, force: true });
  });

  const offlineArgs = (gateway: LlmGateway, question: string) => ({
    question,
    gateway,
    profile: 'offline_replay' as const,
    grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
    targetHypothesisCount: 3,
    store,
  });

  it('completes: checkpoint + frozen run persisted, verify PASS', async () => {
    const run = await executeResearchRun({
      ...offlineArgs(baseGateway, 'Does stellar activity inflate hot Jupiter radii?'),
    });
    const cp = store.loadCheckpoint(run.runId);
    assert.ok(cp !== null, 'checkpoint persisted');
    assert.equal(cp.state, 'COMPLETED');
    assert.equal(cp.completedStages.length, 8, 'all stages completed');
    assert.ok(existsSync(store.runPath(run.runId)), 'frozen run persisted');
    assert.equal(verifyResearchRunDeterministic(run).status, 'PASS');
  });

  it('emits run_started → stage events → run_completed with monotonic seq', async () => {
    // Delayed calls give the poll time to attach the listener at CREATED
    // state (the initial checkpoint is persisted before stage 1 runs).
    const delayed = new DelayedGateway(baseGateway, 25);
    const cpPromise = new Promise<string>((resolve) => {
      const timer = setInterval(() => {
        const ids = store.listRunIds();
        if (ids.length > 0) {
          clearInterval(timer);
          resolve(ids[0]!);
        }
      }, 2);
    });

    const execution = executeResearchRun({
      ...offlineArgs(delayed, 'Does stellar activity inflate hot Jupiter radii?'),
    });
    const runId = await cpPromise;
    const collected: ResearchRunEvent[] = [];
    const unsubscribe = addRunEventListener(runId, (e) => collected.push(e));
    await execution;
    unsubscribe();

    const types = collected.map((e) => e.type);
    assert.ok(types.includes('stage_completed'), 'stage events observed');
    assert.equal(types[types.length - 1], 'run_completed');
    const seqs = collected.map((e) => e.seq);
    for (let i = 1; i < seqs.length; i += 1) {
      assert.ok(seqs[i]! > seqs[i - 1]!, 'seq strictly increasing');
    }
  });

  it('resume skips completed stages (no repeated model calls, same result)', async () => {
    // Full reference run: decompose + hypotheses + 3 critiques + plan = 6 calls.
    const refGateway = new CountingGateway(baseGateway);
    const ref = await executeResearchRun({
      ...offlineArgs(refGateway, 'Does stellar activity inflate hot Jupiter radii?'),
    });
    assert.equal(refGateway.calls, 6, 'full run = 6 model calls');

    // Simulated crash on call #4 (critique #2): stages through falsifiability
    // gate are complete; critique is not.
    const failGateway = new FailOnNthGateway(baseGateway, 4);
    await assert.rejects(
      executeResearchRun({
        ...offlineArgs(failGateway, 'Does stellar activity inflate hot Jupiter radii?'),
      }),
      /simulated crash on model call #4/,
    );
    const failedId = store.listRunIds().find((id) => id !== ref.runId)!;
    const failedCp = store.loadCheckpoint(failedId)!;
    assert.equal(failedCp.state, 'FAILED');
    assert.equal(failedCp.errorKind, 'pipeline');
    assert.deepEqual([...failedCp.completedStages], [
      'researchability_gate',
      'grounding',
      'hypothesis_generation',
      'citation_binding',
      'falsifiability_gate',
    ], 'crash mid-critique: earlier stages checkpointed');

    // Resume with a healthy gateway: only critique(3) + plan(1) = 4 more calls.
    const resumeGateway = new CountingGateway(baseGateway);
    const resumed = await executeResearchRun({
      gateway: resumeGateway,
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      runId: failedId,
      store,
    });
    assert.equal(resumeGateway.calls, 4, 'resume does not repeat completed model stages');
    assert.equal(resumed.runId, failedId, 'same run id across resume');
    assert.equal(resumed.hypotheses.length, 3);
    assert.equal(verifyResearchRunDeterministic(resumed).status, 'PASS');
    // Deterministic replay → identical hypotheses to the reference run.
    assert.deepEqual(
      resumed.hypotheses.map((h) => h.id).sort(),
      ref.hypotheses.map((h) => h.id).sort(),
    );
    // Receipts continuity: sequence numbers strictly increase, no duplicates.
    const seqs = resumed.stageReceipts.map((r) => r.sequence);
    assert.equal(new Set(seqs).size, seqs.length, 'receipt sequences unique after resume');
  });

  it('pre-aborted signal → CANCELLED, no stages executed', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      executeResearchRun({
        ...offlineArgs(baseGateway, 'Does stellar activity inflate hot Jupiter radii?'),
        signal: controller.signal,
      }),
      /aborted/i,
    );
    const runId = store.listRunIds()[0]!;
    const cp = store.loadCheckpoint(runId)!;
    assert.equal(cp.state, 'CANCELLED');
    assert.equal(cp.completedStages.length, 0);
  });

  it('gate-refused question → FAILED(gate_refused), no model call, nothing fabricated', async () => {
    const gateway = new CountingGateway(baseGateway);
    await assert.rejects(
      executeResearchRun({
        ...offlineArgs(gateway, 'write a poem about stars'),
      }),
      /UNSUPPORTED|refused/i,
    );
    const runId = store.listRunIds()[0]!;
    const cp = store.loadCheckpoint(runId)!;
    assert.equal(cp.state, 'FAILED');
    assert.equal(cp.errorKind, 'gate_refused');
    assert.equal(gateway.calls, 0, 'deterministic refusal happens before any model call');
    assert.ok(!existsSync(store.runPath(runId)), 'no frozen run written for a refused question');
  });

  it('resume of a COMPLETED run is rejected (idempotency guard)', async () => {
    const run = await executeResearchRun({
      ...offlineArgs(baseGateway, 'Does stellar activity inflate hot Jupiter radii?'),
    });
    await assert.rejects(
      executeResearchRun({
        gateway: baseGateway,
        profile: 'offline_replay',
        runId: run.runId,
        store,
      }),
      /already COMPLETED/,
    );
  });

  it('parseCheckpoint rejects structural corruption (fail loud)', () => {
    assert.throws(() => parseCheckpoint('{"nope": 1}'), /structurally invalid/);
    assert.throws(() => parseCheckpoint('null'), /not an object/);
  });

  it('cancelRun aborts an active run at the next stage boundary', async () => {
    const slowGateway = new DelayedGateway(baseGateway, 40);
    const execution = executeResearchRun({
      ...offlineArgs(slowGateway, 'Does stellar activity inflate hot Jupiter radii?'),
    });
    const runId = await new Promise<string>((resolve) => {
      const timer = setInterval(() => {
        const ids = store.listRunIds();
        if (ids.length > 0) {
          clearInterval(timer);
          resolve(ids[0]!);
        }
      }, 5);
    });
    // Cancel while call #1 (decompose) is still in flight; the stage completes,
    // then the next stage boundary observes the abort → CANCELLED checkpoint.
    const cancelTimer = setTimeout(() => cancelRun(runId), 10);
    await assert.rejects(execution, /aborted/i);
    clearTimeout(cancelTimer);
    const cp = store.loadCheckpoint(runId)!;
    assert.equal(cp.state, 'CANCELLED');
    assert.ok(cp.completedStages.length >= 1, 'finished stage checkpointed before cancel');
  });
});

describe('renameWithRetry (Windows EPERM resilience — 2026-08-14 UX finding)', () => {
  const failingRename = (failTimes: number, code: string) => {
    let calls = 0;
    return (_from: string, _to: string): void => {
      calls += 1;
      if (calls <= failTimes) {
        const err = new Error(`synthetic ${code}`) as NodeJS.ErrnoException;
        err.code = code;
        throw err;
      }
      calls = -100; // succeed only once
    };
  };

  it('retries transient EPERM and succeeds once the lock clears', () => {
    const rename = failingRename(3, 'EPERM');
    const sleeps: number[] = [];
    renameWithRetry('a.tmp', 'a.json', rename, (ms) => sleeps.push(ms));
    assert.deepEqual(sleeps, [20, 40, 80], 'exponential backoff between attempts');
  });

  it('falls back to an in-place write when the lock never clears', () => {
    const rename = failingRename(99, 'EPERM');
    // The fallback path reads `from` and writes `to` — use real temp files.
    const dir = mkdtempSync(join(tmpdir(), 'far-rename-retry-'));
    const from = join(dir, 'from.json');
    const to = join(dir, 'to.json');
    writeFileSync(from, '{"ok":true}', 'utf8');
    try {
      renameWithRetry(from, to, rename, () => {});
      assert.equal(readFileSync(to, 'utf8'), '{"ok":true}');
      assert.ok(!existsSync(from), 'tmp cleaned up after fallback');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws immediately on non-transient errors (ENOENT)', () => {
    const rename = ((): void => {
      const err = new Error('no such file') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });
    assert.throws(() => renameWithRetry('a', 'b', rename, () => {}), /no such file/);
  });
});
