/**
 * ENG-OBS-001 测试族：correlation / sampling / PII-secret redaction / telemetry-off。
 *
 * 覆盖（session_recorder 三旋钮 + 既有 correlation 字段）：
 *   correlation —— 同 run 事件按 runId 关联、stageId 成对、非法 kind 拒绝；
 *   redaction  —— secret/PII、完整 PEM block、敏感容器和顶层关联标识在落盘前脱敏；
 *   off        —— FAR_SESSION_RECORD=off / enabled:false → 不建目录不落盘 record no-op stats 全零；
 *   sampling   —— (0,1) 按 runId 整体确定性抽样：同 run 不产生孤儿事件，同输入结果一致。
 *
 * 权威：src/trace/session_recorder.ts。零容忍合规。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionRecorder, redactPayload, replaySession } from '../../src/trace/session_recorder.ts';

const TS = '2026-08-17T00:00:00Z';
const FAKE_SK = ['sk', 'abcdefghijklmnop1234'].join('-');
const FAKE_GITHUB_TOKEN = ['ghp', 'abcdefghijklmnopqrst'].join('_');
const FAKE_JWT = [
  'eyJhbGciOiJIUzI1NiJ9',
  'eyJzdWIiOiJyZWQtdGVhbSJ9',
  'c2lnbmF0dXJlLWNhbmFyeQ',
].join('.');

function tempFile(name: string): string {
  return join(mkdtempSync(join(tmpdir(), 'far-session-obs-')), name);
}

function baseEvent(runId: string) {
  return { ts: TS, kind: 'run_started' as const, runId };
}

test('correlation: 同 run 事件按 runId 关联且 stageId 成对回放', () => {
  const path = tempFile('correlate.jsonl');
  try {
    const rec = SessionRecorder.open(path);
    rec.record(baseEvent('run-1'));
    rec.record({ ts: TS, kind: 'stage_started', runId: 'run-1', stageId: 'retrieve' });
    rec.record({ ts: TS, kind: 'stage_completed', runId: 'run-1', stageId: 'retrieve' });
    rec.close();
    const replay = replaySession(path);
    assert.equal(replay.skippedLines, 0);
    const events = replay.events;
    assert.ok(events.every((e) => e.runId === 'run-1'), '同一 run 的事件共享 runId（关联锚）');
    const started = events.filter((e) => e.kind === 'stage_started');
    const completed = events.filter((e) => e.kind === 'stage_completed');
    assert.equal(started.length, 1);
    assert.deepEqual(completed.map((e) => e.stageId), started.map((e) => e.stageId), 'stageId 配对');
  } finally {
    rmSync(join(path, '..'), { recursive: true, force: true });
  }
});

test('correlation: 非法 kind 拒绝（防垃圾事件进 session）', () => {
  const path = tempFile('badkind.jsonl');
  try {
    const rec = SessionRecorder.open(path);
    assert.throws(() => rec.record({ ts: TS, kind: 'definitely_not_a_kind' as never, runId: 'r' }));
    rec.close();
  } finally {
    rmSync(join(path, '..'), { recursive: true, force: true });
  }
});

test('correlation: 空 runId、非 UTC 时间和缺 stageId 的 stage 事件拒绝', () => {
  const path = tempFile('bad-correlation.jsonl');
  try {
    const rec = SessionRecorder.open(path);
    assert.throws(() => rec.record({ ts: TS, kind: 'run_started', runId: '' }), /runId/);
    assert.throws(() => rec.record({ ts: '2026-08-17T08:00:00+08:00', kind: 'run_started', runId: 'r' }), /UTC/);
    assert.throws(() => rec.record({ ts: TS, kind: 'stage_started', runId: 'r' }), /stageId/);
    rec.close();
  } finally {
    rmSync(join(path, '..'), { recursive: true, force: true });
  }
});

test('redaction: secret/PII 与敏感容器在落盘前替换，非敏感保留', () => {
  const path = tempFile('redact.jsonl');
  try {
    const rec = SessionRecorder.open(path);
    rec.record({
      ...baseEvent('run-2'),
      payload: {
        model: 'qwen-max',
        apiKey: FAKE_SK,
        nested: { githubToken: FAKE_GITHUB_TOKEN, note: 'plain text ok' },
        authorization: ['Bearer OPAQUE_AUTH_MARKER'],
        credentials: { nested: 'OPAQUE_CREDENTIAL_MARKER' },
        privateKey: 'OPAQUE_PRIVATE_KEY_MARKER',
        auth: `Bearer ${FAKE_JWT}`,
        clientSecretValue: 'OPAQUE_CLIENT_SECRET_MARKER',
        contact: 'alice@example.test / +1 (555) 010-1234',
        forwarded: `request carried Bearer ${FAKE_JWT}`,
        pem: '-----BEGIN RSA PRIVATE KEY-----\nPRIVATE_BODY_MARKER\n-----END RSA PRIVATE KEY-----',
      },
    });
    rec.close();
    const raw = readFileSync(path, 'utf8');
    assert.ok(!raw.includes(FAKE_SK), 'sk- 形状不得落盘');
    assert.ok(!raw.includes(FAKE_GITHUB_TOKEN), 'ghp_ 形状不得落盘');
    assert.ok(!raw.includes('BEGIN RSA PRIVATE KEY'), 'PEM 头不得落盘');
    assert.ok(!raw.includes('PRIVATE_BODY_MARKER') && !raw.includes('END RSA PRIVATE KEY'), 'PEM 正文和 footer 不得落盘');
    assert.ok(!raw.includes('OPAQUE_AUTH_MARKER'), '敏感键的数组值不得落盘');
    assert.ok(!raw.includes('OPAQUE_CREDENTIAL_MARKER'), '敏感键的对象值不得落盘');
    assert.ok(!raw.includes('OPAQUE_PRIVATE_KEY_MARKER'), '无 PEM header 的 privateKey 字段也不得落盘');
    assert.ok(!raw.includes(FAKE_JWT), 'auth alias 与自由文本 Bearer JWT 都不得落盘');
    assert.ok(!raw.includes('OPAQUE_CLIENT_SECRET_MARKER'), '以 Value 结尾的 clientSecret 字段不得落盘');
    assert.ok(!raw.includes('alice@example.test') && !raw.includes('+1 (555) 010-1234'), '常见 PII 不得落盘');
    assert.ok(raw.includes('[REDACTED]'), '脱敏占位须可见');
    assert.ok(raw.includes('qwen-max') && raw.includes('plain text ok'), '非敏感字段保留');
  } finally {
    rmSync(join(path, '..'), { recursive: true, force: true });
  }
});

test('redaction: 纯函数边界——非字符串/数组/对象原样返回', () => {
  assert.equal(redactPayload(42), 42);
  assert.deepEqual(redactPayload(['a', FAKE_SK]), ['a', '[REDACTED]']);
  assert.equal(redactPayload(null), null);
});

test('redaction: 顶层 runId/stageId 脱敏后仍稳定可关联', () => {
  const path = tempFile('redact-identifiers.jsonl');
  try {
    const unsafeRunId = 'alice@example.test';
    const unsafeStageId = ['sk', 'stage_identifier_123456'].join('-');
    const rec = SessionRecorder.open(path);
    rec.record({ ts: TS, kind: 'stage_started', runId: unsafeRunId, stageId: unsafeStageId });
    rec.record({ ts: TS, kind: 'stage_completed', runId: unsafeRunId, stageId: unsafeStageId });
    rec.close();

    const raw = readFileSync(path, 'utf8');
    assert.ok(!raw.includes(unsafeRunId) && !raw.includes(unsafeStageId), '不安全顶层标识不得落盘');
    const replay = replaySession(path).events;
    assert.equal(replay.length, 2);
    assert.equal(replay[0]!.runId, replay[1]!.runId, '脱敏后仍保持 run 关联');
    assert.equal(replay[0]!.stageId, replay[1]!.stageId, '脱敏后仍保持 stage 关联');
  } finally {
    rmSync(join(path, '..'), { recursive: true, force: true });
  }
});

test('telemetry-off: enabled:false 优先于采样/事件校验，不建目录不落盘', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'far-session-off-')), 'sub', 'never.jsonl');
  try {
    const rec = SessionRecorder.open(path, { enabled: false, samplingRate: 0 });
    assert.equal(rec.record({ ...baseEvent('run-3'), kind: 'definitely_not_a_kind' as never }), 0, '关闭态 record 是真 no-op');
    rec.close();
    assert.ok(!existsSync(path), '关闭态不得创建文件（含父目录）');
    assert.deepEqual(rec.stats(), { events: 0, bytes: 0 });
  } finally {
    rmSync(join(path, '..', '..'), { recursive: true, force: true });
  }
});

test('telemetry-off: FAR_SESSION_RECORD=off 环境变量同样生效（优先级：显式 opts > env）', () => {
  const prev = process.env.FAR_SESSION_RECORD;
  const path = tempFile('envoff.jsonl');
  process.env.FAR_SESSION_RECORD = 'off';
  try {
    const rec = SessionRecorder.open(path);
    assert.equal(rec.record(baseEvent('run-4')), 0);
    assert.ok(!existsSync(path), 'env off 也不得落盘');
    rec.close();

    const forcedPath = join(path, '..', 'explicit-on.jsonl');
    const forced = SessionRecorder.open(forcedPath, { enabled: true });
    assert.equal(forced.record(baseEvent('run-4')), 1, '显式 enabled:true 覆盖 env off');
    forced.close();
    assert.ok(existsSync(forcedPath));
  } finally {
    if (prev === undefined) delete process.env.FAR_SESSION_RECORD;
    else process.env.FAR_SESSION_RECORD = prev;
    rmSync(join(path, '..'), { recursive: true, force: true });
  }
});

test('sampling: rate=0.5 按 run 整体确定采样，不产生孤儿生命周期事件', () => {
  const mk = () => {
    const path = tempFile('sample.jsonl');
    const rec = SessionRecorder.open(path, { samplingRate: 0.5 });
    for (let i = 0; i < 40; i += 1) {
      const runId = `run-${i}`;
      rec.record(baseEvent(runId));
      rec.record({ ts: TS, kind: 'stage_started', runId, stageId: 's' });
      rec.record({ ts: TS, kind: 'stage_completed', runId, stageId: 's' });
      rec.record({ ts: TS, kind: 'run_completed', runId });
    }
    rec.close();
    return { path, stats: rec.stats() };
  };
  const a = mk();
  const b = mk();
  try {
    const ra = replaySession(a.path);
    const rb = replaySession(b.path);
    assert.ok(ra.events.length > 0 && ra.events.length < 160, `0.5 采样应产生真子集（got ${ra.events.length}/160）`);
    const grouped = Map.groupBy(ra.events, (event) => event.runId);
    for (const events of grouped.values()) {
      assert.deepEqual(events.map((event) => event.kind), ['run_started', 'stage_started', 'stage_completed', 'run_completed']);
    }
    assert.equal(a.stats.events, ra.events.length, 'stats.events 只计实际写入事件');
    assert.deepEqual(ra.events.map((event) => event.seq), Array.from({ length: ra.events.length }, (_, i) => i + 1), '落盘 seq 连续');
    assert.equal(readFileSync(a.path, 'utf8'), readFileSync(b.path, 'utf8'), '同输入两次采样结果逐字节一致（确定性）');
    assert.deepEqual(rb.events.map((e) => e.seq), ra.events.map((e) => e.seq));
  } finally {
    rmSync(join(a.path, '..'), { recursive: true, force: true });
    rmSync(join(b.path, '..'), { recursive: true, force: true });
  }
});

test('sequence: 重开已有 session 后 seq 继续单调，stats 只计本 recorder 写入', () => {
  const path = tempFile('append.jsonl');
  try {
    const first = SessionRecorder.open(path);
    first.record(baseEvent('run-a'));
    first.close();

    const second = SessionRecorder.open(path);
    assert.equal(second.record(baseEvent('run-b')), 2);
    second.close();

    assert.deepEqual(replaySession(path).events.map((event) => event.seq), [1, 2]);
    assert.equal(second.stats().events, 1);
  } finally {
    rmSync(join(path, '..'), { recursive: true, force: true });
  }
});

test('sampling: 非法 rate 拒绝（0 / >1 / NaN）', () => {
  const path = tempFile('badrate.jsonl');
  try {
    assert.throws(() => SessionRecorder.open(path, { samplingRate: 0 }), /samplingRate/);
    assert.throws(() => SessionRecorder.open(path, { samplingRate: 1.5 }), /samplingRate/);
    assert.throws(() => SessionRecorder.open(path, { samplingRate: Number.NaN }), /samplingRate/);
  } finally {
    rmSync(join(path, '..'), { recursive: true, force: true });
  }
});
