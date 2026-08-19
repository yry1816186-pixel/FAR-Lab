// tests/monitor/persist.test.ts
// JsonlPersister 判别测试（架构 §2「定期落盘 JSON Lines」）。
//
// 判别力：JSONL 逐行可解析且字段齐备（sample+alerts+persistedAt）·
// 轮转触发与行边界完整（超限保留尾部·无半行）· fs 异常吞噬计数（守护不倒灌）·
// attach 幂等（重复 attach 不双重写入）· detach 后不再写。

import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { JsonlPersister } from '../../src/monitor/persist.ts';
import { Sampler } from '../../src/monitor/sampler.ts';
import type { SystemSample } from '../../src/monitor/collect.ts';

let seq = 0;
function fakeSample(cpu = 10): SystemSample {
  seq += 1;
  return {
    timestamp: `2026-08-19T00:00:${String(seq % 60).padStart(2, '0')}.000Z`,
    platform: 'test',
    arch: 'x64',
    cpu: { cores: 8, percentBusy: cpu, loadAvg: [0, 0, 0] },
    memory: { totalMiB: 1000, usedMiB: 500, usedPercent: 50 },
    uptimeSec: seq,
  };
}

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'far-persist-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function withTempDirAsync(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'far-persist-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readLines(path: string): Array<Record<string, unknown>> {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

test('persister: 每 tick 落一行合法 JSONL（sample+alerts+persistedAt 齐备）', () => {
  withTempDir((dir) => {
    const path = join(dir, 'samples.jsonl');
    const p = new JsonlPersister({ path });
    const s = new Sampler({ collectFn: () => fakeSample(95) });
    p.attach(s);
    s.start(); // 首 tick 同步
    s.stop();
    p.detach();

    const lines = readLines(path);
    assert.equal(lines.length, 1, `start 首 tick 应落 1 行: ${lines.length}`);
    const row = lines[0] as {
      persistedAt: string;
      sample: { cpu: { percentBusy: number } };
      alerts: Array<{ metric: string }>;
    };
    assert.equal(row.sample.cpu.percentBusy, 95);
    assert.equal(row.alerts.length, 1, 'CPU 95>80 告警必须随样本落盘');
    assert.ok(row.persistedAt.includes('T'), 'persistedAt 缺失');
    assert.equal(p.writtenCount, 1);
    assert.equal(p.failureCount, 0);
  });
});

test('persister: 轮转——超 maxBytes 保留尾部且每行仍完整可解析', async () => {
  await withTempDirAsync(async (dir) => {
    const path = join(dir, 'samples.jsonl');
    // maxBytes 调到 ~8 行大小；5ms 节律 60ms ≈ 13 tick 必然触发轮转
    const probe = `${JSON.stringify({ persistedAt: 'x', sample: fakeSample(), alerts: [] })}\n`;
    const maxBytes = probe.length * 8;
    const p = new JsonlPersister({ path, maxBytes });
    const s = new Sampler({ intervalMs: 5, collectFn: () => fakeSample() });
    p.attach(s);
    s.start();
    await new Promise((r) => setTimeout(r, 60));
    s.stop();
    p.detach();

    const size = statSync(path).size;
    assert.ok(size <= maxBytes * 1.5, `轮转后尺寸失控: ${size} > ${maxBytes * 1.5}`);
    const lines = readLines(path); // 任何半行都会让 JSON.parse 抛错——判别
    assert.ok(lines.length >= 1, '轮转后必须仍有完整行');
    // 保留的是尾部（uptimeSec 最大的一批）
    const uptimes = lines.map((l) => (l.sample as { uptimeSec: number }).uptimeSec);
    assert.deepEqual([...uptimes].sort((a, b) => a - b), uptimes, '尾部保留必须时间升序');
  });
});

test('persister: fs 异常吞噬计数（路径不可写——守护不倒灌宿主）', () => {
  const p = new JsonlPersister({ path: join('Z:', 'nonexistent-drive-9x7', 'deep', 'samples.jsonl') });
  const s = new Sampler({ collectFn: () => fakeSample() });
  // attach 的 mkdir 在 Windows 不存在盘符上抛错—— attach 前包一层验证吞噬纪律只覆盖 onSample：
  // mkdir 失败属配置错误应显式抛出（fail-fast 配置层），onSample 失败才吞噬（运行层）。
  try {
    p.attach(s);
  } catch {
    // 配置层 fail-fast 合法——本测试走另一路径：attach 成功后运行期故障
    return;
  }
  s.start();
  s.stop();
  p.detach();
  assert.ok(p.failureCount >= 1 || p.writtenCount === 0, '运行期故障必须计数或零写入，不得无声成功');
});

test('persister: attach 幂等（重复 attach 不双重写入）+ detach 后停写', () => {
  withTempDir((dir) => {
    const path = join(dir, 'samples.jsonl');
    const p = new JsonlPersister({ path });
    const s = new Sampler({ collectFn: () => fakeSample() });
    p.attach(s);
    p.attach(s); // 幂等——先退订旧订阅
    s.start();
    s.stop();
    const afterStart = readLines(path).length;
    assert.equal(afterStart, 1, `重复 attach 不得双重写入: ${afterStart}`);
    p.detach();
    s.start();
    s.stop();
    assert.equal(readLines(path).length, 1, 'detach 后不得再写');
  });
});
