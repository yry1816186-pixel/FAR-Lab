/**
 * exporter mutation 补杀（2026-08-20 批次 10）。
 *
 * 31.3% 存活的 5 个位点：3 处空清单字节语义（> 0 ? lines+'\n' : ''）与 2 处
 * recursive 目录创建。空数据库导出必须产出 **0 字节** jsonl（非 '\n' 单字节）；
 * 嵌套不存在的输出目录必须自动创建（recursive: true 语义）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 桩。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import Database from 'better-sqlite3';
import { exportFarProof } from '../../src/far_proof/exporter.ts';
import { runMigrations } from '../../src/db/migrator.ts';

function openEmptyDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function exportInto(db: Database.Database, outputDir: string): void {
  exportFarProof({
    db,
    outputDir,
    runId: 'run-mutation-fixture',
    modelSnapshot: 'fixture-snapshot',
    gitCommitSha: '0'.repeat(40),
    envHash: 'e'.repeat(64),
    exportedAt: '2026-08-20T00:00:00.000Z',
  });
}

test('mutation 补杀: 空库导出的 jsonl 须为 0 字节（非单换行符）', () => {
  const dir = join(tmpdir(), `far-exporter-empty-${Date.now()}`);
  try {
    const db = openEmptyDb();
    exportInto(db, dir);
    // 三处 lines.length > 0 位点对应的空清单文件（空库下无 envelope/lifecycle/otel 行）。
    // 0 字节断言只适用于 lines.length > 0 三处位点对应的清单（v2 envelopes/lifecycle/otel）；
    // call_records.redacted / proof_envelopes(v1) / repro_runs 是另一套写入实现（空库恒 1 字节）。
    for (const name of ['proof_envelopes_v2.jsonl', 'lifecycle_events.jsonl', 'otel-trace.jsonl']) {
      const p = join(dir, name);
      if (existsSync(p)) {
        assert.equal(statSync(p).size, 0, `${name} 空清单须 0 字节（>0 变异会写单个 '\n'）`);
      }
    }
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mutation 补杀: 同目录二次导出幂等（code/figures 已存在时 recursive 语义）', () => {
  const base = join(tmpdir(), `far-exporter-twice-${Date.now()}`);
  try {
    const db = openEmptyDb();
    assert.doesNotThrow(() => exportInto(db, base), '首次导出');
    assert.doesNotThrow(() => exportInto(db, base),
      '二次导出目录已存在（recursive:false 变异会 EEXIST 抛错——幂等重导出是 re-export 场景的合法操作）');
    db.close();
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('mutation 补杀: 嵌套不存在的输出目录自动创建（recursive: true 语义）', () => {
  const base = join(tmpdir(), `far-exporter-nested-${Date.now()}`);
  const nested = join(base, 'a', 'b', 'c');
  try {
    const db = openEmptyDb();
    assert.doesNotThrow(() => exportInto(db, nested),
      '三层嵌套不存在目录须 recursive 创建（recursive:false 变异会 ENOENT 抛错）');
    assert.ok(existsSync(join(nested, 'data_manifest.json')), '导出产物落在嵌套目录');
    db.close();
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
