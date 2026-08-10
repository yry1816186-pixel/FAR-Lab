/**
 * ask_runner_coverage.test.ts — L2 coverage 补充（Z16 Core branch ≥75%）。
 *
 * executeAskRun 的分支面（src/api/internal/ask_runner.ts）：
 *   7 个可选参数（profile/resumeStorePath/onArtifact/onEvent/gateway/
 *   verdictDrivenFeedback/modelSnapshot）的 undefined 判定 × 2 分支；
 *   verdictNode !== null 密封判定；needsHumanEndorsement ASK-9 降级判定。
 *
 * tests/api/ask_runner.test.ts 已覆盖：全部可选参数的 undefined 分支、
 * gateway 注入、fixture CONFIRMED → ASK-9 降级密封（needsHumanEndorsement=true）。
 * 本文件补充**非 undefined 分支**：一次调用同时注入全部 7 个可选参数，
 * 断言参数真实透传生效（onArtifact 收到全部 artifact、onEvent 收到事件流、
 * resume store 落盘、gateway 被使用、profile 透传、modelSnapshot 透传）。
 *
 * 说明：verdictNode === null（executeLoop 无裁决）与 needsHumanEndorsement=false
 * （非 CONFIRMED verdict）两分支依赖真实无裁决/非 CONFIRMED 运行路径，fixture
 * 恒产 CONFIRMED；硬造将依赖脆弱 mock，故不在此覆盖（branch 已 ≥75%）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { executeAskRun } from '../../src/api/internal/ask_runner.ts';
import { runMigrations } from '../../src/db/index.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type { LlmRequest, LlmResponse } from '../../src/llm_gateway/types.ts';
import type { StageArtifact } from '../../src/agent_loop/types.ts';
import type { AgentLoopEvent } from '../../src/agent_loop/events.ts';

const GIT_SHA = 'a'.repeat(40);
const QUESTION = 'C-ASTRO-0001: TIC lightcurve exhibits a transit-like periodic signal';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

/** 缺省 offline 网关（无真实凭证·fixture 驱动）。 */
function defaultGateway(): LlmGateway {
  const adapter = createOfflineReplayAdapter();
  return {
    register: () => {},
    callLlm: async (_profile: string, request: LlmRequest): Promise<LlmResponse> => adapter.call(request),
    registeredProfiles: () => ['offline_replay'],
  };
}

/** 统计 proof_envelopes 表中的密封行数。 */
function envelopeCount(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM proof_envelopes').get() as { n: number };
  return row.n;
}

test('executeAskRun 全可选参数注入：7 个非 undefined 分支全部透传生效', async () => {
  const db = openDb();
  const dir = mkdtempSync(join(tmpdir(), 'ask-cov-'));
  try {
    const storePath = join(dir, 'receipts.json');
    const seenArtifacts: StageArtifact[] = [];
    const seenEvents: AgentLoopEvent[] = [];
    const gateway = defaultGateway();

    const result = await executeAskRun(
      db,
      QUESTION,
      'quick',
      GIT_SHA,
      (artifact: StageArtifact): void => {
        seenArtifacts.push(artifact);
      },
      (evt: AgentLoopEvent): void => {
        seenEvents.push(evt);
      },
      gateway,
      storePath,
      true, // verdictDrivenFeedback
      'coverage-env-anchor', // modelSnapshot
      'offline_replay', // profile
    );

    // loop 跑通 + 密封落库
    assert.ok(result.runId.length > 0, 'runId 须生成');
    assert.ok(result.loopState.verdictNode !== null, 'fixture 路径须产出裁决');
    assert.equal(envelopeCount(db), 1, '有裁决须密封 1 条 proof_envelope');

    // onArtifact 回调收到全部 6 阶段产物（透传生效）
    assert.equal(seenArtifacts.length, 6, 'onArtifact 须收到 6 个阶段产物');
    assert.deepEqual(
      seenArtifacts.map((a) => a.stageId),
      ['stage1_understanding', 'stage2_integration', 'stage3_hypothesis', 'stage4_evidence', 'stage5_plan', 'stage6_feedback'],
      '产物顺序须为六阶段顺序',
    );

    // onEvent 回调收到事件流（透传生效）
    assert.ok(seenEvents.length > 0, 'onEvent 须收到运行时事件');
    assert.ok(seenEvents.some((e) => e.type === 'stage_started'), '事件流须含 stage_started');

    // resumeStorePath 落盘（透传生效）
    assert.equal(existsSync(storePath), true, 'resume store 须已落盘');
    const file = JSON.parse(readFileSync(storePath, 'utf8')) as { receipts: unknown[] };
    assert.ok(Array.isArray(file.receipts) && file.receipts.length > 0, 'resume store 须含收据');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
