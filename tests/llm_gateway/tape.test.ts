// tests/llm_gateway/tape.test.ts
// CAMPAIGN-REPLAY-001 第 2 层（Model Tape）+ 第 3 层（Decision Log）：
// 四专项验收面——完整 replay / 缺失 tape / 版本漂移 / 部分 replay + mode labeling
// + 脱敏门 + 决策账五问报告。真实依赖：真实文件系统（tmp 目录）与纯函数，无 mock。

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  MissingTapeError,
  TapeVersionDriftError,
  partialReplayReport,
  recordTapeCall,
  replayFromTape,
  tapeRequestHash,
} from '../../src/llm_gateway/tape.ts';
import {
  GENESIS_PREV,
  buildStoredDecision,
  replayAnswerReport,
  verifyDecisionChain,
} from '../../src/agent_loop/decision_log.ts';
import type { StoredDecision } from '../../src/agent_loop/decision_log.ts';

const CODE_V1 = 'a'.repeat(40);

function sampleRequest(temperature = 0.2): unknown {
  return { messages: [{ role: 'user', content: 'summarize the corpus' }], temperature, maxTokens: 512 };
}

function sampleResponse(content = 'summary text'): unknown {
  return { credential: { requestId: 'req-1', tokenUsage: { prompt: 10, completion: 5, total: 15, measured: true } }, content };
}

// ---------------------------------------------------------------------------
// ① 完整 replay（逐字节一致 + mode 标注）
// ---------------------------------------------------------------------------

test('CAMPAIGN-REPLAY-001 完整: 录制 LIVE 调用 → 回放逐字节一致 + mode=RECORDED_REPLAY', () => {
  const root = mkdtempSync(join(tmpdir(), 'far-tape-'));
  try {
    const rec = recordTapeCall(root, {
      stageId: 'stage4-extract',
      profile: 'competition_aliyun_qwen',
      request: sampleRequest(),
      response: sampleResponse(),
      codeVersion: CODE_V1,
      recordedAt: '2026-08-18T00:00:00Z',
    });
    assert.equal(rec.ok, true);
    if (!rec.ok) return;

    const replayed = replayFromTape<{ content: string }>(root, 'stage4-extract', 'competition_aliyun_qwen', sampleRequest(), CODE_V1);
    assert.equal(replayed.mode, 'RECORDED_REPLAY', '回放永不标 LIVE');
    assert.deepEqual(replayed.response, sampleResponse());
    assert.equal(replayed.tapeEntry.requestHash, tapeRequestHash('competition_aliyun_qwen', sampleRequest()));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CAMPAIGN-REPLAY-001 mode labeling: 落盘 tape 的录制标记是 LIVE（事实），回放标记恒 RECORDED_REPLAY（防伪）', () => {
  const root = mkdtempSync(join(tmpdir(), 'far-tape-'));
  try {
    const rec = recordTapeCall(root, {
      stageId: 's1', profile: 'p', request: { a: 1 }, response: { b: 2 },
      codeVersion: CODE_V1, recordedAt: '2026-08-18T00:00:00Z',
    });
    assert.equal(rec.ok, true);
    if (!rec.ok) return;
    const onDisk = JSON.parse(readFileSync(rec.path, 'utf8')) as { mode: string };
    assert.equal(onDisk.mode, 'LIVE', '录制事实标记');
    const replayed = replayFromTape(root, 's1', 'p', { a: 1 }, CODE_V1);
    assert.notEqual(replayed.mode, 'LIVE');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// ② 缺失 tape（fail-closed）
// ---------------------------------------------------------------------------

test('CAMPAIGN-REPLAY-001 缺失 tape: 未录制的 stage 回放 → MissingTapeError（不落网络不空响应）', () => {
  const root = mkdtempSync(join(tmpdir(), 'far-tape-'));
  try {
    assert.throws(
      () => replayFromTape(root, 'never-recorded', 'p', { x: 1 }, CODE_V1),
      MissingTapeError,
    );
    const err = new MissingTapeError('stg', 'f'.repeat(64));
    assert.match(err.message, /no tape, no replay/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// ③ 版本漂移
// ---------------------------------------------------------------------------

test('CAMPAIGN-REPLAY-001 版本漂移: 录制构建 ≠ 当前构建 → TapeVersionDriftError；显式放行才可回放', () => {
  const root = mkdtempSync(join(tmpdir(), 'far-tape-'));
  try {
    const rec = recordTapeCall(root, {
      stageId: 's1', profile: 'p', request: { a: 1 }, response: { b: 2 },
      codeVersion: CODE_V1, recordedAt: '2026-08-18T00:00:00Z',
    });
    assert.equal(rec.ok, true);
    const currentBuild = 'b'.repeat(40);
    assert.throws(
      () => replayFromTape(root, 's1', 'p', { a: 1 }, currentBuild),
      TapeVersionDriftError,
    );
    // 显式放行（记录性决策）→ 可回放，仍标 RECORDED_REPLAY
    const forced = replayFromTape(root, 's1', 'p', { a: 1 }, currentBuild, { allowVersionDrift: true });
    assert.equal(forced.mode, 'RECORDED_REPLAY');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// ④ 部分 replay（显式报告，不静默缩水）
// ---------------------------------------------------------------------------

test('CAMPAIGN-REPLAY-001 部分 replay: 2/3 覆盖 → partial=true + 缺失清单显式', () => {
  const root = mkdtempSync(join(tmpdir(), 'far-tape-'));
  try {
    for (const stage of ['s1', 's2']) {
      const rec = recordTapeCall(root, {
        stageId: stage, profile: 'p', request: { stage }, response: { ok: true },
        codeVersion: CODE_V1, recordedAt: '2026-08-18T00:00:00Z',
      });
      assert.equal(rec.ok, true);
    }
    const report = partialReplayReport(root, [
      { stageId: 's1', profile: 'p', request: { stage: 's1' } },
      { stageId: 's2', profile: 'p', request: { stage: 's2' } },
      { stageId: 's3', profile: 'p', request: { stage: 's3' } },
    ]);
    assert.equal(report.partial, true);
    assert.deepEqual(report.covered, ['s1', 's2']);
    assert.deepEqual(report.missing, ['s3']);

    const full = partialReplayReport(root, [
      { stageId: 's1', profile: 'p', request: { stage: 's1' } },
    ]);
    assert.equal(full.partial, false, '全覆盖不是 partial');
    assert.equal(full.missing.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 脱敏门（cache.ts 预留检测器的启用——fail-closed）
// ---------------------------------------------------------------------------

test('CAMPAIGN-REPLAY-001 脱敏门: 响应含密钥形状 → 拒录（宁可损失 tape 不落盘密钥）', () => {
  const root = mkdtempSync(join(tmpdir(), 'far-tape-'));
  try {
    const leaked = recordTapeCall(root, {
      stageId: 's-leak', profile: 'p',
      request: { q: 'hi' },
      response: { content: `here is the key sk-${'x'.repeat(30)} use it` },
      codeVersion: CODE_V1, recordedAt: '2026-08-18T00:00:00Z',
    });
    assert.equal(leaked.ok, false);
    if (leaked.ok) return;
    assert.equal(leaked.reason, 'secret-detected');
    assert.match(leaked.detector, /response:sk- key/);
    // 请求侧密钥同样拒
    const reqLeak = recordTapeCall(root, {
      stageId: 's-req', profile: 'p',
      request: { auth: `Bearer ${'y'.repeat(40)}` },
      response: { content: 'ok' },
      codeVersion: CODE_V1, recordedAt: '2026-08-18T00:00:00Z',
    });
    assert.equal(reqLeak.ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 第 3 层：Orchestration Decision Log（五问 + 哈希链）
// ---------------------------------------------------------------------------

function decisionChain(): StoredDecision[] {
  const d1 = buildStoredDecision([], {
    at: '2026-08-18T00:00:01Z', kind: 'selected', subject: 'hypothesis-3',
    chosen: 'H3 进多策略对比', why: 'scorecard A 级 + 文献覆盖广',
    rejected: [], ruleTriggered: null, degradedAt: null,
  });
  const d2 = buildStoredDecision([d1], {
    at: '2026-08-18T00:00:02Z', kind: 'rejected', subject: 'hypothesis-1',
    chosen: 'H1 淘汰', why: '可证伪性门拒（方法残缺）',
    rejected: ['H1'], ruleTriggered: null, degradedAt: null,
  });
  const d3 = buildStoredDecision([d1, d2], {
    at: '2026-08-18T00:00:03Z', kind: 'budget_rule', subject: 'question-7',
    chosen: '停止循环', why: '估算消耗达预算上限',
    rejected: [], ruleTriggered: 'guardian.budget-tripped', degradedAt: null,
  });
  const d4 = buildStoredDecision([d1, d2, d3], {
    at: '2026-08-18T00:00:04Z', kind: 'degraded', subject: 'stage6-report',
    chosen: '降级为单臂描述视图', why: '第二臂证据不足',
    rejected: [], ruleTriggered: null, degradedAt: 'report.degraded-scope',
  });
  return [d1, d2, d3, d4];
}

test('CAMPAIGN-REPLAY-001 决策账: 哈希链构建 + 全链校验通过 + 五问报告全维度', () => {
  const chain = decisionChain();
  const check = verifyDecisionChain(chain);
  assert.equal(check.valid, true, JSON.stringify(check));
  assert.equal(chain[0]?.entry.prevHash, GENESIS_PREV);

  const report = replayAnswerReport(chain);
  assert.equal(report.entryCount, 4);
  assert.deepEqual(report.selected.map((s) => s.subject), ['hypothesis-3']);
  assert.ok(report.rejected.some((r) => r.subject === 'hypothesis-1' && r.items.includes('H1')));
  assert.deepEqual(report.rulesTriggered.map((r) => r.rule), ['guardian.budget-tripped']);
  assert.deepEqual(report.degradations.map((d) => d.at), ['report.degraded-scope']);
});

test('CAMPAIGN-REPLAY-001 决策账 fail-closed: 篡改/断链/跳号各自可定位检出', () => {
  const chain = decisionChain();

  // 篡改第 2 条的 why
  const tampered = chain.map((sd, i) =>
    i === 1 ? { entry: { ...sd.entry, why: '改过的理由' }, hash: sd.hash } : sd,
  );
  const t1 = verifyDecisionChain(tampered);
  assert.equal(t1.valid, false);
  assert.equal(t1.firstBrokenSeq, 2);
  assert.match(t1.reason ?? '', /tampered/);

  // 抽走第 2 条（断链 + 跳号）
  const gapped = [chain[0], chain[2], chain[3]] as StoredDecision[];
  const t2 = verifyDecisionChain(gapped);
  assert.equal(t2.valid, false);

  // 交换顺序
  const reordered = [chain[1], chain[0], chain[2], chain[3]] as StoredDecision[];
  assert.equal(verifyDecisionChain(reordered).valid, false);
});
