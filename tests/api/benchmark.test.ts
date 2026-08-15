/**
 * benchmark 路由测试 —— GET /api/v1/benchmark 端点 + loadReport 边界。
 *
 * 历史溯源（已归档）: 09 §4 + 24 §5.
 *
 * 覆盖：
 *   - GET /api/v1/benchmark → 200 + 完整报告（报告已生成·suiteIntegrityRoot 64-hex）
 *   - 缓存：两次请求返回相同 suiteIntegrityRoot
 *   - loadReport 不存在路径 → 503 SERVICE_UNAVAILABLE
 *   - loadReport 损坏 JSON → 500 INTERNAL_ERROR
 *   - loadReport shape 不符（合法 JSON 缺字段）→ 500 INTERNAL_ERROR
 *
 * 前置：benchmark/benchmark_report.json 为确定性生成物（R6 政策后不 git 跟踪·由
 * ensureBenchmarkReport 按需生成——固定 now → suiteIntegrityRoot 稳定）。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { runMigrations } from '../../src/db/index.ts';
import { buildServer } from '../../src/api/server.ts';
import { loadReport, __resetBenchmarkCache } from '../../src/api/routes/benchmark.ts';
import { ApiError } from '../../src/api/errors/error_handler.ts';
import { ensureBenchmarkReport } from '../_helpers/benchmark_report.ts';

ensureBenchmarkReport();

const HEX64 = /^[0-9a-f]{64}$/;

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function buildApp() {
  return buildServer({
    db: openDb(),
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
}

interface ReportDto {
  readonly suiteIntegrityRoot: string;
  readonly entries: readonly unknown[];
  readonly problemCount: number;
  readonly schemaVersion: number;
}

test('GET /api/v1/benchmark → 200 + 完整报告（报告已生成）', async () => {
  __resetBenchmarkCache();
  const app = await buildApp();
  try {
    const response = await app.inject({ method: 'GET', url: '/api/v1/benchmark' });
    assert.equal(response.statusCode, 200);
    const body = (response.json() as { readonly ok: boolean; readonly data: ReportDto }).data;
    assert.ok(body.schemaVersion === 2, `schemaVersion ${body.schemaVersion}(V10-F-04 对抗修复:钉回 v2;FF-15 保证盘上为 v2)`);
    assert.match(body.suiteIntegrityRoot, HEX64);
    assert.ok(body.entries.length >= 1, 'should have ≥1 problem');
    assert.equal(body.problemCount, body.entries.length);
  } finally {
    await app.close();
  }
});

test('GET /api/v1/benchmark 缓存：两次请求返回相同 suiteIntegrityRoot', async () => {
  __resetBenchmarkCache();
  const app = await buildApp();
  try {
    const r1 = await app.inject({ method: 'GET', url: '/api/v1/benchmark' });
    const r2 = await app.inject({ method: 'GET', url: '/api/v1/benchmark' });
    assert.equal(r1.statusCode, 200);
    assert.equal(r2.statusCode, 200);
    const b1 = (r1.json() as { readonly ok: boolean; readonly data: ReportDto }).data;
    const b2 = (r2.json() as { readonly ok: boolean; readonly data: ReportDto }).data;
    assert.equal(b1.suiteIntegrityRoot, b2.suiteIntegrityRoot);
  } finally {
    await app.close();
  }
});

test('loadReport 不存在路径 → 503 SERVICE_UNAVAILABLE', () => {
  __resetBenchmarkCache();
  try {
    loadReport(join(tmpdir(), 'far-bench-definitely-nonexistent.json'));
    assert.fail('loadReport should have thrown for missing file');
  } catch (err) {
    assert.ok(err instanceof ApiError, `expected ApiError, got ${(err as Error).name}`);
    if (err instanceof ApiError) {
      assert.equal(err.statusCode, 503);
      assert.equal(err.errorCode, 'SERVICE_UNAVAILABLE');
    }
  } finally {
    __resetBenchmarkCache();
  }
});

test('loadReport 损坏 JSON → 500 INTERNAL_ERROR', () => {
  __resetBenchmarkCache();
  const tmp = join(tmpdir(), `far-bench-corrupt-${process.pid}.json`);
  writeFileSync(tmp, '{ this is not valid json', 'utf8');
  try {
    loadReport(tmp);
    assert.fail('loadReport should have thrown for corrupt JSON');
  } catch (err) {
    assert.ok(err instanceof ApiError, `expected ApiError, got ${(err as Error).name}`);
    if (err instanceof ApiError) {
      assert.equal(err.statusCode, 500);
      assert.equal(err.errorCode, 'INTERNAL_ERROR');
    }
  } finally {
    rmSync(tmp, { force: true });
    __resetBenchmarkCache();
  }
});

test('loadReport shape 不符（合法 JSON 缺字段）→ 500 INTERNAL_ERROR', () => {
  __resetBenchmarkCache();
  const tmp = join(tmpdir(), `far-bench-badshape-${process.pid}.json`);
  writeFileSync(tmp, JSON.stringify({ foo: 'bar', not: 'a report' }), 'utf8');
  try {
    loadReport(tmp);
    assert.fail('loadReport should have thrown for bad shape');
  } catch (err) {
    assert.ok(err instanceof ApiError, `expected ApiError, got ${(err as Error).name}`);
    if (err instanceof ApiError) {
      assert.equal(err.statusCode, 500);
      assert.equal(err.errorCode, 'INTERNAL_ERROR');
    }
  } finally {
    rmSync(tmp, { force: true });
    __resetBenchmarkCache();
  }
});

test('loadReport 文件变更后重读（mtime 失效·不返回陈旧缓存）', async () => {
  __resetBenchmarkCache();
  const tmp = join(tmpdir(), `far-bench-mtime-${process.pid}.json`);
  const makeReport = (root: string) => JSON.stringify({
    schemaVersion: 2,
    entries: [{ problemId: 'P-1' }],
    suiteIntegrityRoot: root,
  });
  try {
    writeFileSync(tmp, makeReport('a'.repeat(64)), 'utf8');
    const first = loadReport(tmp);
    assert.equal(first.suiteIntegrityRoot, 'a'.repeat(64));

    // 模拟 generate 脚本重写报告：等 20ms 确保 mtime 变化后覆盖。
    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(tmp, makeReport('b'.repeat(64)), 'utf8');

    const second = loadReport(tmp);
    assert.equal(
      second.suiteIntegrityRoot,
      'b'.repeat(64),
      '文件已变更（mtime 前进）时不得返回旧缓存',
    );
  } finally {
    rmSync(tmp, { force: true });
    __resetBenchmarkCache();
  }
});
