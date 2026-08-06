/**
 * session_recorder.test.ts —— 运行时 JSONL session 录制/回放（批次 3-H·借鉴 pi JSONL session）。
 *
 * 覆盖：
 *   1. SessionRecorder 追加录制（seq 递增·close 幂等·closed 后 record 抛错）。
 *   2. replaySession 回放（行序保持·损坏行跳过计数·空行忽略）。
 *   3. 未知 kind 校验抛错。
 *   4. serializeEvent 可选字段（stageId/payload 条件展开）。
 *   5. fsm_runner 集成：传 sessionPath → run 后 JSONL 含 run_started/stage_completed/run_completed。
 *   6. 零回归：不传 sessionPath → 六阶段照常产出（session 可选字段不影响既有路径）。
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/index.ts';
import { runAgentLoop, type RunAgentLoopArgs } from '../../src/agent_loop/fsm_runner.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type { LlmResponse } from '../../src/llm_gateway/types.ts';
import {
  SessionRecorder,
  replaySession,
  serializeEvent,
  defaultSessionPath,
} from '../../src/trace/session_recorder.ts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'far-session-test-'));
}

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function fixtureResponse(content: string): LlmResponse {
  return {
    credential: {
      providerProfile: 'offline_replay',
      providerRequestId: null,
      modelId: 'test-fixture-model',
      modelVersion: null,
      capability: 'structured',
      isoTimestamp: '2026-06-27T00:00:00.000Z',
      tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    },
    content,
    raw: { replayed: true, messageCount: 2 },
  };
}

function createSequentialGateway(contents: readonly string[]): LlmGateway {
  let callIndex = 0;
  return {
    register: () => {},
    callLlm: async (): Promise<LlmResponse> => {
      const content = contents[callIndex];
      if (content === undefined) {
        throw new Error(`fixture gateway exhausted at call ${callIndex + 1}`);
      }
      callIndex += 1;
      return fixtureResponse(content);
    },
    registeredProfiles: () => [],
  };
}

const SIX_PAYLOADS: readonly string[] = [
  JSON.stringify({
    kind: 'understanding',
    problemStatement: 'classify variable stars',
    scope: 'astronomy',
    keyTerms: ['macro_f1'],
    falsifiableAngle: 'via macro_f1',
  }),
  JSON.stringify({
    kind: 'integration',
    citations: [{ evidenceId: 'ev-001', source: 'arxiv', doi: null, title: 't' }],
    knowledgeGraphSummary: 'gaps in taxonomy',
    gaps: ['rare subclasses'],
  }),
  JSON.stringify({
    kind: 'hypothesis',
    claim: 'macro_f1 >= 0.85 on RR Lyrae',
    falsificationMethod: { prediction: 'macro_f1 >= 0.85', metric: 'macro_f1', comparator: 'gt', value: 0.85 },
    supportingCitations: ['ev-001'],
    scopeSlipText: 'RR Lyrae subset',
  }),
  JSON.stringify({
    kind: 'evidence',
    evidenceRecords: [
      { evidenceId: 'ev-001', supportsOrRefutes: 'supports', entailmentScore: 0.9, source: { evidenceId: 'ev-001', source: 'arxiv', doi: null, title: 't' } },
    ],
    conflictingEvidenceCount: 0,
  }),
  JSON.stringify({
    kind: 'plan',
    datasetChoices: ['ASAS-SN'],
    methodChoices: ['RF'],
    scheduleOrFeedback: 'train/validate split',
    executableChecks: [],
  }),
  JSON.stringify({
    kind: 'feedback',
    feedbackSignal: { continueIteration: false, iterationNumber: 1, maxIterations: 3, refinements: [] },
    iterationSummary: 'converged',
  }),
];

function runArgs(overrides: Partial<RunAgentLoopArgs> = {}): RunAgentLoopArgs {
  return {
    runId: 'session-e2e-1',
    researchInput: 'test claim',
    gateway: createSequentialGateway(SIX_PAYLOADS),
    profile: 'offline_replay',
    finishReasonExtractor: () => 'stop',
    reproHashProvider: () => 'f'.repeat(64),
    gitCommitSha: 'a'.repeat(40),
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: openDb(),
    termination: { maxIterations: 1, maxTokensPerRun: 50000, maxDurationMs: 60000 },
    ...overrides,
  };
}

test('recorder appends sequential events and closes idempotently', () => {
  const dir = tempDir();
  try {
    const path = join(dir, 'run.jsonl');
    const rec = SessionRecorder.open(path);
    rec.record({ kind: 'run_started', runId: 'r1', ts: '2026-01-01T00:00:00.000Z' });
    const seq2 = rec.record({
      kind: 'stage_completed',
      runId: 'r1',
      stageId: 'stage3_hypothesis',
      ts: '2026-01-01T00:00:01.000Z',
      payload: { degraded: false },
    });
    assert.equal(seq2, 2);
    assert.equal(rec.stats().events, 2);
    assert.ok(rec.stats().bytes > 0);
    rec.close();
    rec.close(); // idempotent
    assert.throws(() => rec.record({ kind: 'run_completed', runId: 'r1', ts: '2026-01-01T00:00:02.000Z' }), /closed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('replay returns events in order and skips corrupt lines', () => {
  const dir = tempDir();
  try {
    const path = join(dir, 'run.jsonl');
    const rec = SessionRecorder.open(path);
    rec.record({ kind: 'run_started', runId: 'r1', ts: '2026-01-01T00:00:00.000Z' });
    rec.record({ kind: 'stage_completed', runId: 'r1', stageId: 'stage1_understanding', ts: '2026-01-01T00:00:01.000Z' });
    rec.close();
    // 注入损坏行 + 空行
    const content = readFileSync(path, 'utf8');
    const corrupted = content + '{"broken"\n\nnot-json\n';
    const writePath = join(dir, 'corrupt.jsonl');
    writeFileSync(writePath, corrupted, 'utf8');

    const replay = replaySession(writePath);
    assert.equal(replay.events.length, 2);
    assert.equal(replay.events[0]!.kind, 'run_started');
    assert.equal(replay.events[1]!.stageId, 'stage1_understanding');
    assert.equal(replay.skippedLines, 2, 'corrupt non-empty lines counted');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unknown event kind throws', () => {
  const dir = tempDir();
  try {
    const rec = SessionRecorder.open(join(dir, 'x.jsonl'));
    assert.throws(
      () => rec.record({ kind: 'not-a-kind' as never, runId: 'r', ts: '2026-01-01T00:00:00.000Z' }),
      /unknown event kind/,
    );
    rec.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('serializeEvent conditionally includes optional fields', () => {
  const base = { kind: 'run_started' as const, runId: 'r', ts: 't' };
  const plain = serializeEvent(base);
  assert.equal(JSON.parse(plain).stageId, undefined);
  assert.equal(JSON.parse(plain).payload, undefined);
  const full = serializeEvent({ ...base, stageId: 's1', payload: { a: 1 } });
  const parsed = JSON.parse(full) as { stageId: string; payload: { a: number } };
  assert.equal(parsed.stageId, 's1');
  assert.equal(parsed.payload.a, 1);
});

test('defaultSessionPath nests under sessions dir', () => {
  const p = defaultSessionPath('/tmp/far', 'run-abc');
  assert.ok(p.includes('sessions'), `path should include sessions dir: ${p}`);
  assert.ok(p.endsWith('run-abc.jsonl'), `path should end with run-abc.jsonl: ${p}`);
});

test('fsm_runner integration: sessionPath produces run_started/stage_completed/run_completed', async () => {
  const dir = tempDir();
  try {
    const sessionPath = join(dir, 'run.jsonl');
    const args = runArgs({ sessionPath });
    const state = await runAgentLoop(args);

    assert.ok(state.terminated);
    const replay = replaySession(sessionPath);
    const kinds = replay.events.map((e) => e.kind);
    assert.equal(kinds[0], 'run_started', 'first event is run_started');
    assert.equal(kinds[kinds.length - 1], 'run_completed', 'last event is run_completed');
    const stageEvents = kinds.filter((k) => k === 'stage_completed');
    assert.ok(stageEvents.length >= 3, `expected >=3 stage_completed, got ${stageEvents.length}`);
    const completed = replay.events[kinds.length - 1]!;
    assert.equal(completed.payload?.iterations, 1);
    assert.equal(replay.skippedLines, 0);
    // stage_completed 事件带 stageId + contentHash 锚
    const stageEvent = replay.events.find((e) => e.kind === 'stage_completed');
    assert.ok(stageEvent?.stageId, 'stage_completed must carry stageId');
    assert.ok(stageEvent?.payload?.contentHash, 'stage_completed must carry contentHash anchor');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('no sessionPath → six stages produced (zero regression baseline)', async () => {
  const state = await runAgentLoop(runArgs({}));
  assert.ok(state.terminated);
  assert.equal(state.artifacts.length, 6, 'six stages produced without session path');
});
