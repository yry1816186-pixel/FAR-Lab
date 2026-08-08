// tests/hardware/detect.test.ts
// 硬件探测层测试：尽力而为、绝不 crash、结构完整、确定性注记存在。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectHardware } from '../../src/hardware/detect.ts';

test('detectHardware returns a complete report shape', async () => {
  const r = await detectHardware();
  assert.equal(typeof r.timestamp, 'string');
  assert.ok(new Date(r.timestamp).getTime() > 0, 'timestamp parses');
  assert.equal(r.cpu.status, 'OK');
  assert.equal(typeof r.cpu.arch, 'string');
  assert.ok(r.cpu.arch.length > 0);
  assert.ok(Number.isInteger(r.cpu.cores) && r.cpu.cores >= 1, `cores=${r.cpu.cores}`);
  assert.ok(Number.isInteger(r.cpu.totalMem) && r.cpu.totalMem >= 1, `mem=${r.cpu.totalMem}`);
});

test('detectHardware never throws even without any GPU tool', async () => {
  // GPU 探测是尽力而为：无论环境如何（无 nvidia-smi / rocm-smi / system_profiler），
  // 都必须返回 UNKNOWN 结构而不是抛异常。
  const r = await detectHardware();
  assert.ok(['OK', 'UNKNOWN', 'UNAVAILABLE'].includes(r.gpu.status));
  assert.ok(Array.isArray(r.gpu.devices));
  // probeError 是 string | null：OK 时为 null，否则为诊断字符串。
  if (r.gpu.status === 'UNKNOWN') {
    assert.equal(typeof r.gpu.probeError, 'string');
  }
});

test('detectHardware accelerator field is consistent', async () => {
  const r = await detectHardware();
  assert.ok(['OK', 'UNAVAILABLE'].includes(r.accelerator.wasm));
  assert.ok(['OK', 'UNAVAILABLE'].includes(r.accelerator.webgpu));
  assert.equal(r.accelerator.platform, process.platform);
  assert.ok(r.accelerator.note.includes('determinism never'), r.accelerator.note);
});

test('detectHardware is idempotent across repeated calls', async () => {
  const a = await detectHardware();
  const b = await detectHardware();
  // CPU 部分每次探测结果应稳定（同一进程内）。
  assert.equal(a.cpu.arch, b.cpu.arch);
  assert.equal(a.cpu.cores, b.cpu.cores);
  assert.equal(a.cpu.totalMem, b.cpu.totalMem);
});
