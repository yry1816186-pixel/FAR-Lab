// tests/research/climate_replay.test.ts
// climate 领域 replay loader（CPS-4 G1：离线 climate 接线修复）——
// committed REAL GISS fixture（tests/fixtures/research/giss_zonann_annual.csv，
// 1880-2025 全记录）是离线/RECORDED_REPLAY 实验路径的单一真相源。
// 与 exoplanet_replay 同构：fixture 缺失/不可解析 → fail-closed（绝不静默空样本）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadClimateReplayRows } from '../../src/research/adapters/climate_replay.ts';

test('loader: committed GISS fixture → 146 annual points (1880-2025), 2025 = +1.19 C', () => {
  const { rows, card } = loadClimateReplayRows();
  assert.equal(rows.length, 146, '1880..2025 = 146 annual points');
  assert.equal(rows[0]!.year, 1880);
  assert.equal(rows.at(-1)!.year, 2025);
  assert.ok(Math.abs(rows.at(-1)!.anomalyC - 1.19) < 1e-9, '2025 anomaly = +1.19 C (matches official GISTEMP)');
  // 年份严格升序（与 live 解析器输出语义一致）。
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i]!.year > rows[i - 1]!.year, `year order broken at ${i}`);
  }
  assert.equal(card.rowCount, 146);
  assert.equal(card.persistentId, 'giss-gistemp-v4-zonann#glob');
  // replay 标识（对齐 exoplanet replay card 的 committed-sample 语义）。
  assert.match(card.version, /committed real sample/);
  assert.match(card.reproductionCommand, /replay fixture: .+giss_zonann_annual\.csv/);
});

test('loader: deterministic — two loads are deep-equal (no wall-clock, no randomness)', () => {
  assert.deepEqual(loadClimateReplayRows(), loadClimateReplayRows());
});

test('loader: missing fixture fails closed (read error propagates, no silent empty)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-climate-replay-'));
  try {
    assert.throws(
      () => loadClimateReplayRows(join(dir, 'missing.csv')),
      /ENOENT|climate replay fixture is empty or unreadable/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loader: unparseable fixture fails closed (aligned with exoplanet replay semantics)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-climate-replay-'));
  try {
    const garbage = join(dir, 'garbage.csv');
    writeFileSync(garbage, 'not,a,giss,csv\n1,2,3\n', 'utf8');
    assert.throws(
      () => loadClimateReplayRows(garbage),
      /climate replay fixture is empty or unreadable/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
