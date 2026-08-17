// tests/api/research.test.ts
// research REST routes（异步生命周期契约·file-backed RunStore 为真相源）:
//   - POST /research → 202 {runId, state:'CREATED', statusUrl, eventsUrl}（后台执行）
//   - GET /research → 运行列表；GET /:runId/status → checkpoint 摘要（remainingStages 有序）
//   - GET /:runId → COMPLETED 后 200 冻结 ResearchRun；未 COMPLETED → 409；未知 → 404
//   - POST /:runId/cancel → cancelled:false（非活跃）；未知 → 404
//   - GET /:runId/events → SSE（state 快照 → research 事件 → 终态关流·ping 保活）
//   - POST /:runId/feedback → revision 应用并回写 store
//   - POST /:runId/analyze → Observation + revision（真实样本 replay）
//   - GET /:runId/evaluate → 程序化指标 + 确定性重算 PASS
//   - live profile 无凭证 → 503 fail-closed（绝不静默降级 replay）

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import Fastify from 'fastify';

import { buildServer } from '../../src/api/server.ts';
import { errorHandler } from '../../src/api/errors/error_handler.ts';
import { runMigrations } from '../../src/db/index.ts';
import { registerResearchRoutes } from '../../src/api/routes/research.ts';
import { RunStore, executeResearchRun, type RunCheckpoint } from '../../src/research/run_lifecycle.ts';
import { createLlmGateway, type LlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import type { LlmRequest, LlmResponse, ProviderAdapter, ProviderProfile } from '../../src/llm_gateway/types.ts';
import { createReplayAdapter } from '../../src/retrieval/index.ts';
import { RESEARCH_DEMO_DOCS, RESEARCH_DEMO_FIXTURES } from '../../src/research/research_fixtures.ts';
import type { ResearchRun } from '../../src/research/types.ts';

// Per-process store root (read once per route registration — set before makeApp).
const storeRoot = mkdtempSync(join(tmpdir(), 'far-research-api-'));
process.env.FAR_RESEARCH_RUNS_DIR = storeRoot;

after(() => {
  delete process.env.FAR_RESEARCH_RUNS_DIR;
  rmSync(storeRoot, { recursive: true, force: true });
});

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

async function makeApp(): Promise<ReturnType<typeof buildServer>> {
  return buildServer({ db: makeDb(), gitCommitSha: 'a'.repeat(40), jwtSecret: null, logger: false });
}

/** The built fastify app (makeApp result awaited). */
type TestApp = Awaited<ReturnType<typeof makeApp>>;

interface StatusRow {
  readonly runId: string;
  readonly state: string;
  readonly completedStages: readonly string[];
  readonly remainingStages: readonly string[];
  readonly runReady: boolean;
  readonly error: string | null;
  readonly errorKind: string | null;
}

function makeCreatedCheckpoint(runId: string, question: string): RunCheckpoint {
  const at = new Date().toISOString();
  return {
    runId,
    question,
    profile: 'offline_replay',
    sources: ['openalex'],
    maxPerQuery: 5,
    target: 3,
    state: 'CREATED',
    completedStages: [],
    ctx: {},
    startedAt: at,
    updatedAt: at,
    error: null,
    errorKind: null,
    completedAt: null,
  };
}

/** Poll GET /:runId/status until the run reaches one of `states` (fail on timeout). */
async function waitForRunState(
  app: TestApp,
  runId: string,
  states: readonly string[],
  timeoutMs = 15_000,
): Promise<StatusRow> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await app.inject({ method: 'GET', url: `/api/v1/research/${runId}/status` });
    assert.equal(res.statusCode, 200, `status endpoint must answer 200 (got ${res.statusCode}: ${res.body})`);
    const row = (res.json() as { data: StatusRow }).data;
    if (states.includes(row.state)) {
      return row;
    }
    if (Date.now() > deadline) {
      assert.fail(`run ${runId} did not reach [${states.join('|')}] within ${timeoutMs}ms (state=${row.state}, error=${row.error ?? 'n/a'})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Gateway wrapper that delays each model call (SSE tests need observable windows). */
class DelayedGateway implements LlmGateway {
  private readonly inner: LlmGateway;
  private readonly delayMs: number;

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
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return this.inner.callLlm(profile, request);
  }
}

test('POST /api/v1/research → 202 CREATED + runId; COMPLETED run retrievable with honest runMode', async () => {
  const app = await makeApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/research',
      payload: { question: 'Does stellar activity inflate hot Jupiter radii?', profile: 'offline_replay' },
    });
    assert.equal(res.statusCode, 202);
    const created = res.json() as {
      ok: boolean;
      data: { runId: string; state: string; statusUrl: string; eventsUrl: string };
    };
    assert.equal(created.ok, true);
    assert.equal(created.data.state, 'CREATED');
    assert.ok(typeof created.data.runId === 'string' && created.data.runId.length > 0);
    assert.equal(created.data.statusUrl, `/api/v1/research/${created.data.runId}/status`);
    assert.equal(created.data.eventsUrl, `/api/v1/research/${created.data.runId}/events`);

    const final = await waitForRunState(app, created.data.runId, ['COMPLETED', 'FAILED']);
    assert.equal(final.state, 'COMPLETED', `run should complete (error: ${final.error ?? 'n/a'})`);
    assert.equal(final.runReady, true, 'completed run must have its frozen run file');
    assert.deepEqual([...final.remainingStages], [], 'no stages remain after completion');

    const got = await app.inject({ method: 'GET', url: `/api/v1/research/${created.data.runId}` });
    assert.equal(got.statusCode, 200);
    const body = got.json() as { ok: boolean; data: { runId: string; runMode: string; hypotheses: unknown[] } };
    assert.equal(body.data.runId, created.data.runId);
    assert.equal(body.data.runMode, 'RECORDED_REPLAY');
    assert.ok(body.data.hypotheses.length >= 3);
  } finally {
    await app.close();
  }
});

test('concurrent POST preparations return the callback-owned runId despite reverse interleaving and directory order', async () => {
  const isolatedRoot = mkdtempSync(join(tmpdir(), 'far-research-api-interleaved-'));
  const store = new RunStore(isolatedRoot);
  const app = Fastify({ logger: false });
  const firstQuestion = 'Does intervention alpha change endpoint one?';
  const secondQuestion = 'Does intervention beta change endpoint two?';
  const firstRunId = 'far-z-owned-by-first-request';
  const secondRunId = 'far-a-owned-by-second-request';
  const runIdByQuestion = new Map([
    [firstQuestion, firstRunId],
    [secondQuestion, secondRunId],
  ]);
  interface PendingExecution {
    readonly args: Parameters<typeof executeResearchRun>[0];
    readonly reject: (reason: unknown) => void;
    settled: boolean;
  }
  const pending: PendingExecution[] = [];
  const unhandled: unknown[] = [];
  const recordUnhandled = (reason: unknown): void => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', recordUnhandled);

  // Deliberately hold request 1 at preparation. Request 2 then persists and
  // reports first, followed by request 1, while both executions remain in
  // flight. A shared directory-set difference has no request ownership here.
  const executeInterleaved: typeof executeResearchRun = (args) =>
    new Promise<ResearchRun>((_resolve, reject) => {
      pending.push({ args, reject, settled: false });
      if (pending.length !== 2) return;
      const first = pending[0];
      const second = pending[1];
      assert.ok(first !== undefined && second !== undefined);
      for (const entry of [second, first]) {
        const question = entry.args.question;
        assert.ok(question !== undefined);
        const runId = runIdByQuestion.get(question);
        assert.ok(runId !== undefined);
        entry.args.store.saveCheckpoint(makeCreatedCheckpoint(runId, question));
        entry.args.onRunPrepared?.(runId);
      }
    });

  const rejectPending = (entry: PendingExecution, message: string): void => {
    if (entry.settled) return;
    entry.settled = true;
    entry.reject(new Error(message));
  };

  try {
    await registerResearchRoutes(app, { store, executeRun: executeInterleaved });
    const firstResponsePromise = app.inject({
      method: 'POST',
      url: '/research',
      payload: { question: firstQuestion, profile: 'offline_replay' },
    });
    const secondResponsePromise = app.inject({
      method: 'POST',
      url: '/research',
      payload: { question: secondQuestion, profile: 'offline_replay' },
    });
    const [firstResponse, secondResponse] = await Promise.all([firstResponsePromise, secondResponsePromise]);

    assert.equal(firstResponse.statusCode, 202);
    assert.equal(secondResponse.statusCode, 202);
    const firstCreated = firstResponse.json() as { runId: string; state: string };
    const secondCreated = secondResponse.json() as { runId: string; state: string };
    assert.deepEqual(firstCreated, { runId: firstRunId, state: 'CREATED', statusUrl: `/api/v1/research/${firstRunId}/status`, eventsUrl: `/api/v1/research/${firstRunId}/events` });
    assert.deepEqual(secondCreated, { runId: secondRunId, state: 'CREATED', statusUrl: `/api/v1/research/${secondRunId}/status`, eventsUrl: `/api/v1/research/${secondRunId}/events` });
    assert.deepEqual(store.listRunIds(), [secondRunId, firstRunId], 'lexicographic directory order is the reverse of request order');
    assert.equal(store.loadCheckpoint(firstRunId)?.question, firstQuestion);
    assert.equal(store.loadCheckpoint(secondRunId)?.question, secondQuestion);

    // Settle in reverse request order after both 202 responses. The route's
    // same-turn rejection observers must consume both background failures.
    const first = pending[0];
    const second = pending[1];
    assert.ok(first !== undefined && second !== undefined);
    rejectPending(second, 'controlled second execution shutdown');
    rejectPending(first, 'controlled first execution shutdown');
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
  } finally {
    for (const entry of pending) {
      rejectPending(entry, 'test cleanup');
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    process.off('unhandledRejection', recordUnhandled);
    await app.close();
    rmSync(isolatedRoot, { recursive: true, force: true });
  }
});

test('preparation failures and unbound callback ids return structured 500 without unhandled rejection', async () => {
  const rejectedExecutor: typeof executeResearchRun = async () => {
    throw new Error('controlled rejected preparation');
  };
  const throwingExecutor: typeof executeResearchRun = () => {
    throw new Error('controlled synchronous preparation throw');
  };
  const invalidIdExecutor: typeof executeResearchRun = (args) => {
    args.onRunPrepared?.('../outside');
    return new Promise<ResearchRun>(() => {});
  };
  const missingCheckpointExecutor: typeof executeResearchRun = (args) => {
    args.onRunPrepared?.('ghost-run');
    return new Promise<ResearchRun>(() => {});
  };
  const wrongOwnerExecutor: typeof executeResearchRun = (args) => {
    args.store.saveCheckpoint(makeCreatedCheckpoint('other-run', 'A different request'));
    args.onRunPrepared?.('other-run');
    return new Promise<ResearchRun>(() => {});
  };
  const cases: ReadonlyArray<{ readonly name: string; readonly executeRun: typeof executeResearchRun }> = [
    { name: 'rejected Promise', executeRun: rejectedExecutor },
    { name: 'synchronous throw', executeRun: throwingExecutor },
    { name: 'invalid callback id', executeRun: invalidIdExecutor },
    { name: 'callback without checkpoint', executeRun: missingCheckpointExecutor },
    { name: 'callback bound to another request', executeRun: wrongOwnerExecutor },
  ];
  const unhandled: unknown[] = [];
  const recordUnhandled = (reason: unknown): void => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', recordUnhandled);
  try {
    for (const failureCase of cases) {
      const isolatedRoot = mkdtempSync(join(tmpdir(), 'far-research-api-start-failure-'));
      const app = Fastify({ logger: false });
      app.setErrorHandler(errorHandler);
      try {
        await registerResearchRoutes(app, {
          store: new RunStore(isolatedRoot),
          executeRun: failureCase.executeRun,
        });
        const response = await app.inject({
          method: 'POST',
          url: '/research',
          payload: { question: 'Does a controlled preparation failure stay handled?', profile: 'offline_replay' },
        });
        assert.equal(response.statusCode, 500, failureCase.name);
        assert.equal((response.json() as { error_code: string }).error_code, 'research_run_start_failed', failureCase.name);
        await new Promise<void>((resolve) => setImmediate(resolve));
      } finally {
        await app.close();
        rmSync(isolatedRoot, { recursive: true, force: true });
      }
    }
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', recordUnhandled);
  }
});

test('GET /api/v1/research → run list rows; status 404 unknown; frozen-run 404 unknown id', async () => {
  const app = await makeApp();
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/research',
      payload: { question: 'Does dark matter self-interact?', profile: 'offline_replay' },
    });
    const runId = (created.json() as { data: { runId: string } }).data.runId;
    await waitForRunState(app, runId, ['COMPLETED', 'FAILED']);

    const list = await app.inject({ method: 'GET', url: '/api/v1/research' });
    assert.equal(list.statusCode, 200);
    const rows = (list.json() as { data: { runs: Array<{ runId: string; question: string; state: string; error: string | null }> } }).data.runs;
    const mine = rows.find((r) => r.runId === runId);
    assert.ok(mine !== undefined, 'created run appears in the listing');
    assert.equal(mine.question, 'Does dark matter self-interact?');
    assert.equal(mine.state, 'COMPLETED');
    assert.equal(mine.error, null);

    for (const url of [
      '/api/v1/research/unknown-id',
      '/api/v1/research/unknown-id/status',
      '/api/v1/research/unknown-id/cancel',
    ]) {
      const missing = await app.inject({ method: url.includes('/cancel') ? 'POST' : 'GET', url });
      assert.equal(missing.statusCode, 404, `${url} → 404`);
      assert.equal((missing.json() as { error_code: string }).error_code, 'research_run_not_found');
    }
  } finally {
    await app.close();
  }
});

test('encoded path traversal runId is rejected before any sibling checkpoint can be read', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'far-research-api-boundary-'));
  const runsRoot = join(parent, 'runs');
  const outsideDir = join(parent, 'outside');
  mkdirSync(outsideDir, { recursive: true });
  writeFileSync(
    join(outsideDir, 'checkpoint.json'),
    `${JSON.stringify(makeCreatedCheckpoint('../outside', 'OUTSIDE_SENTINEL'))}\n`,
    'utf8',
  );
  const app = Fastify({ logger: false });
  try {
    app.setErrorHandler(errorHandler);
    await registerResearchRoutes(app, { store: new RunStore(runsRoot) });

    for (const probe of [
      { method: 'GET' as const, url: '/research/%2e%2e%2foutside/status' },
      { method: 'GET' as const, url: '/research/%2e%2e%2foutside' },
      { method: 'POST' as const, url: '/research/%2e%2e%2foutside/feedback', payload: {
        source: 'human', actor: 'red-team', text: 'must not reach outside storage',
      } },
    ]) {
      const response = await app.inject(probe);
      assert.equal(response.statusCode, 400, `${probe.method} ${probe.url}: ${response.body}`);
      const body = response.json() as { error_code: string; message: string };
      assert.equal(body.error_code, 'invalid_research_run_id');
      assert.doesNotMatch(response.body, /OUTSIDE_SENTINEL/);
    }
  } finally {
    await app.close();
    rmSync(parent, { recursive: true, force: true });
  }
});

test('gate-refused question → FAILED(gate_refused) in checkpoint; frozen-run GET → 409 while not COMPLETED', async () => {
  const app = await makeApp();
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/research',
      payload: { question: 'write a poem about stars', profile: 'offline_replay' },
    });
    assert.equal(created.statusCode, 202);
    const runId = (created.json() as { data: { runId: string } }).data.runId;

    const final = await waitForRunState(app, runId, ['FAILED', 'COMPLETED']);
    assert.equal(final.state, 'FAILED');
    assert.equal(final.errorKind, 'gate_refused');
    assert.ok(final.error !== null && final.error.length > 0, 'refusal reason recorded');
    // remainingStages keeps pipeline order (all 8 stages remain after a refusal).
    assert.deepEqual([...final.remainingStages], [
      'researchability_gate',
      'grounding',
      'hypothesis_generation',
      'citation_binding',
      'falsifiability_gate',
      'critique',
      'scoring',
      'plan',
    ]);
    assert.equal(final.runReady, false);

    // checkpoint exists but state ≠ COMPLETED → 409 research_run_not_completed
    const got = await app.inject({ method: 'GET', url: `/api/v1/research/${runId}` });
    assert.equal(got.statusCode, 409);
    const err = got.json() as { error_code: string; detail: { state: string } };
    assert.equal(err.error_code, 'research_run_not_completed');
    assert.equal(err.detail.state, 'FAILED');
  } finally {
    await app.close();
  }
});

test('POST /api/v1/research/:runId/cancel → cancelled:false for a finished run', async () => {
  const app = await makeApp();
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/research',
      payload: { question: 'Does stellar activity inflate hot Jupiter radii?', profile: 'offline_replay' },
    });
    const runId = (created.json() as { data: { runId: string } }).data.runId;
    await waitForRunState(app, runId, ['COMPLETED', 'FAILED']);

    const cancel = await app.inject({ method: 'POST', url: `/api/v1/research/${runId}/cancel` });
    assert.equal(cancel.statusCode, 200);
    const body = cancel.json() as { data: { runId: string; cancelled: boolean; state: string } };
    assert.equal(body.data.runId, runId);
    assert.equal(body.data.cancelled, false, 'a finished run is not active → nothing to cancel');
    assert.equal(body.data.state, 'COMPLETED');
  } finally {
    await app.close();
  }
});

test('POST /api/v1/research/:runId/feedback → immutable revision (persisted to the store)', async () => {
  const app = await makeApp();
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/research',
      payload: { question: 'Does stellar activity inflate hot Jupiter radii?', profile: 'offline_replay' },
    });
    const runId = (created.json() as { data: { runId: string } }).data.runId;
    await waitForRunState(app, runId, ['COMPLETED', 'FAILED']);

    const fb = await app.inject({
      method: 'POST',
      url: `/api/v1/research/${runId}/feedback`,
      payload: {
        source: 'human',
        actor: 'reviewer-1',
        text: 'Pre-register a control analysis on activity-corrected vs uncorrected subsamples.',
        triggers: ['plan_rewrite'],
      },
    });
    assert.equal(fb.statusCode, 200);
    const fbBody = fb.json() as { ok: boolean; data: { revision: { number: number }; planChanges: string[] } };
    assert.equal(fbBody.ok, true);
    assert.equal(fbBody.data.revision.number, 1);
    assert.ok(fbBody.data.planChanges.length >= 1);

    // The revision is written through to the store, not just the memory cache.
    const got = await app.inject({ method: 'GET', url: `/api/v1/research/${runId}` });
    const run = (got.json() as { data: { revisions: unknown[] } }).data;
    assert.equal(run.revisions.length, 1);
    const stored = new RunStore(storeRoot).loadRun(runId);
    assert.ok(stored !== null, 'updated run persisted via store.saveRun');
    assert.equal(stored.revisions.length, 1);
  } finally {
    await app.close();
  }
});

test('POST /api/v1/research/:runId/analyze (replay sample) → observation + revision', async () => {
  const app = await makeApp();
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/research',
      payload: { question: 'Does stellar activity inflate hot Jupiter radii?', profile: 'offline_replay' },
    });
    const runId = (created.json() as { data: { runId: string } }).data.runId;
    await waitForRunState(app, runId, ['COMPLETED', 'FAILED']);

    const analyzed = await app.inject({
      method: 'POST',
      url: `/api/v1/research/${runId}/analyze`,
      payload: { live: false },
    });
    assert.equal(analyzed.statusCode, 200);
    const body = analyzed.json() as { ok: boolean; data: { observation: { result: { status: string; n: number } }; revision: { number: number } } };
    assert.equal(body.ok, true);
    assert.equal(body.data.observation.result.status, 'SUCCESS');
    assert.ok(body.data.observation.result.n >= 10);
    assert.ok(body.data.revision.number >= 1);
  } finally {
    await app.close();
  }
});

test('GET /api/v1/research/:runId/evaluate → metrics + deterministic recompute PASS', async () => {
  const app = await makeApp();
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/research',
      payload: { question: 'Does stellar activity inflate hot Jupiter radii?', profile: 'offline_replay' },
    });
    const runId = (created.json() as { data: { runId: string } }).data.runId;
    await waitForRunState(app, runId, ['COMPLETED', 'FAILED']);

    const evaluated = await app.inject({ method: 'GET', url: `/api/v1/research/${runId}/evaluate` });
    assert.equal(evaluated.statusCode, 200);
    const body = evaluated.json() as {
      ok: boolean;
      data: { deterministicRecompute: string; metrics: Array<{ name: string }> };
    };
    assert.equal(body.data.deterministicRecompute, 'PASS');
    const names = body.data.metrics.map((m) => m.name);
    assert.ok(names.includes('citationBindingRate'));
    assert.ok(names.includes('unboundEvidenceCount'));
  } finally {
    await app.close();
  }
});

test('POST /api/v1/research with competition profile without key → 503 fail-closed (no silent replay)', async () => {
  const app = await makeApp();
  const previous = process.env.FAR_DASHSCOPE_API_KEY;
  delete process.env.FAR_DASHSCOPE_API_KEY;
  delete process.env.DASHSCOPE_API_KEY;
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/research',
      payload: { question: 'Does dark matter self-interact?', profile: 'competition_aliyun_qwen' },
    });
    assert.equal(res.statusCode, 503);
    const err = res.json() as { error_code: string };
    assert.equal(err.error_code, 'research_live_profile_unavailable');
  } finally {
    if (previous !== undefined) process.env.FAR_DASHSCOPE_API_KEY = previous;
    await app.close();
  }
});

test('legacy `source` field merges into `sources` (back-compat)', async () => {
  const app = await makeApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/research',
      payload: { question: 'Does stellar activity inflate hot Jupiter radii?', profile: 'offline_replay', source: 'arxiv' },
    });
    assert.equal(res.statusCode, 202);
    const runId = (res.json() as { data: { runId: string } }).data.runId;
    const final = await waitForRunState(app, runId, ['COMPLETED', 'FAILED']);
    assert.equal(final.state, 'COMPLETED');
    // The checkpoint records the merged source list.
    const cp = new RunStore(storeRoot).loadCheckpoint(runId);
    assert.ok(cp !== null);
    assert.deepEqual([...cp.sources], ['openalex', 'arxiv']);
  } finally {
    await app.close();
  }
});

test('GET /api/v1/research/:runId/events → SSE state snapshot + forwarded events + close on completion', async () => {
  const app = await makeApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  assert.ok(address !== null && typeof address !== 'string', 'expected TCP address');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    // Start a run DIRECTLY in-process with a delayed gateway: the server's SSE
    // route reads the checkpoint from the shared store root and subscribes to
    // the same in-process event bus — no timing race (each model call is
    // delayed far longer than the SSE connect).
    const store = new RunStore(storeRoot);
    const gateway = new DelayedGateway(
      createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]),
      60,
    );
    const preparation: { runId?: string } = {};
    const execution = executeResearchRun({
      question: 'Does stellar activity inflate hot Jupiter radii?',
      gateway,
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      targetHypothesisCount: 3,
      store,
      onRunPrepared: (runId) => {
        preparation.runId = runId;
      },
    });
    const runId = preparation.runId;
    assert.ok(runId !== undefined, 'executor reports its id after the initial checkpoint is durable');

    const res = await fetch(`${base}/api/v1/research/${runId}/events`, {
      signal: AbortSignal.timeout(15_000),
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /^text\/event-stream/);
    // Hijacked SSE responses must still carry CORS headers (2026-08-14 UX
    // finding: EventSource from the vite dev origin was blocked — live
    // progress silently degraded to polling on every workbench run).
    assert.equal(
      res.headers.get('access-control-allow-origin'),
      'http://localhost:5173',
      'SSE echoes the request Origin for cross-origin dev setups',
    );
    assert.ok(res.body !== null);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let received = '';
    while (!received.includes('"type":"run_completed"')) {
      const { done, value } = await reader.read();
      if (done) break;
      received += decoder.decode(value, { stream: true });
    }
    const finalRead = await reader.read(); // stream must close after the terminal event
    assert.ok(finalRead.done, 'SSE connection closes after run_completed');

    assert.ok(received.includes('event: state'), 'initial state snapshot frame present');
    assert.ok(received.includes('event: research'), 'lifecycle events forwarded as research frames');
    assert.ok(received.includes('"type":"stage_completed"'), 'stage events observed');
    assert.ok(received.includes('"type":"run_completed"'), 'terminal event observed');
    const run = await execution;
    assert.equal(run.runId, runId);
  } finally {
    await app.close();
  }
});

test('GET /research/:runId/events on a terminal run → state snapshot then immediate close', async () => {
  const app = await makeApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  assert.ok(address !== null && typeof address !== 'string', 'expected TCP address');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/research',
      payload: { question: 'Does stellar activity inflate hot Jupiter radii?', profile: 'offline_replay' },
    });
    const runId = (created.json() as { data: { runId: string } }).data.runId;
    await waitForRunState(app, runId, ['COMPLETED', 'FAILED']);

    const res = await fetch(`${base}/api/v1/research/${runId}/events`, { signal: AbortSignal.timeout(8000) });
    assert.equal(res.status, 200);
    assert.ok(res.body !== null);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let received = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += decoder.decode(value, { stream: true });
    }
    assert.ok(received.includes('event: state'), 'snapshot frame present');
    assert.ok(received.includes('"state":"COMPLETED"'), 'snapshot reports the terminal state');
    assert.ok(!received.includes('event: research'), 'no live events after a terminal state');
  } finally {
    await app.close();
  }
});

test('SSE keepalive ping arrives while the run is in flight (configurable interval)', async () => {
  // Bare instance (not buildServer) so the ping interval can be lowered.
  const app = Fastify({ logger: false });
  await registerResearchRoutes(app, { eventsPingMs: 150 });
  const syntheticCheckpoint: RunCheckpoint = {
    runId: 'far-ping-probe',
    question: 'ping probe (synthetic, never executed)',
    profile: 'offline_replay',
    sources: ['openalex'],
    maxPerQuery: 5,
    target: 3,
    state: 'VALIDATING',
    completedStages: [],
    ctx: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    error: null,
    errorKind: null,
    completedAt: null,
  };
  new RunStore(storeRoot).saveCheckpoint(syntheticCheckpoint);
  await app.listen({ port: 0, host: '127.0.0.1' });
  try {
    const address = app.server.address();
    assert.ok(address !== null && typeof address !== 'string', 'expected TCP address');
    const base = `http://127.0.0.1:${address.port}`;
    const controller = new AbortController();
    const res = await fetch(`${base}/research/far-ping-probe/events`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    });
    assert.equal(res.status, 200);
    assert.ok(res.body !== null);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let received = '';
    while (!received.includes(': ping')) {
      const { done, value } = await reader.read();
      if (done) assert.fail('connection closed before a keepalive ping arrived');
      received += decoder.decode(value, { stream: true });
    }
    controller.abort();
    assert.ok(received.includes(': ping'), 'keepalive comment line observed');
  } finally {
    await app.close();
  }
});
