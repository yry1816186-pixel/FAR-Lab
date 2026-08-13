// tests/api/research.test.ts
// Track-1A research REST routes（§12.3 最小真实子集·local-first 内存 registry）:
//   - POST /research (offline_replay) → 201 + ResearchRun（runMode=RECORDED_REPLAY 显式）
//   - GET /research/:runId → 200；未知 id → 404 结构化错误
//   - POST /research/:runId/feedback → revision 应用
//   - POST /research/:runId/analyze → Observation + revision（真实样本 replay）
//   - GET /research/:runId/evaluate → 程序化指标 + 确定性重算 PASS
//   - live profile 无凭证 → 503 fail-closed（绝不静默降级 replay）

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { buildServer } from '../../src/api/server.ts';
import { runMigrations } from '../../src/db/index.ts';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

async function makeApp(): Promise<ReturnType<typeof buildServer>> {
  return buildServer({ db: makeDb(), gitCommitSha: 'a'.repeat(40), jwtSecret: null, logger: false });
}

test('POST /api/v1/research (offline_replay) → 201 ResearchRun with honest runMode', async () => {
  const app = await makeApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/research',
      payload: { question: 'Does stellar activity inflate hot Jupiter radii?', profile: 'offline_replay' },
    });
    assert.equal(res.statusCode, 201);
    const body = res.json() as { ok: boolean; data: { runId: string; runMode: string; hypotheses: unknown[] } };
    assert.equal(body.ok, true);
    assert.equal(body.data.runMode, 'RECORDED_REPLAY');
    assert.ok(body.data.hypotheses.length >= 3);
    assert.ok(typeof body.data.runId === 'string' && body.data.runId.length > 0);
  } finally {
    await app.close();
  }
});

test('GET /api/v1/research/:runId → 200; unknown id → 404 structured error', async () => {
  const app = await makeApp();
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/research',
      payload: { question: 'Does dark matter self-interact?', profile: 'offline_replay' },
    });
    const runId = (created.json() as { data: { runId: string } }).data.runId;

    const got = await app.inject({ method: 'GET', url: `/api/v1/research/${runId}` });
    assert.equal(got.statusCode, 200);
    assert.equal((got.json() as { data: { runId: string } }).data.runId, runId);

    const missing = await app.inject({ method: 'GET', url: '/api/v1/research/unknown-id' });
    assert.equal(missing.statusCode, 404);
    const err = missing.json() as { error_code: string };
    assert.equal(err.error_code, 'research_run_not_found');
  } finally {
    await app.close();
  }
});

test('POST /api/v1/research/:runId/feedback → immutable revision', async () => {
  const app = await makeApp();
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/research',
      payload: { question: 'Does stellar activity inflate hot Jupiter radii?', profile: 'offline_replay' },
    });
    const runId = (created.json() as { data: { runId: string } }).data.runId;

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

    const got = await app.inject({ method: 'GET', url: `/api/v1/research/${runId}` });
    const run = (got.json() as { data: { revisions: unknown[] } }).data;
    assert.equal(run.revisions.length, 1);
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
