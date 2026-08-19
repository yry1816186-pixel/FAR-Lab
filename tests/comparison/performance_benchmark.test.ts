// tests/comparison/performance_benchmark.test.ts
//
// Phase 3 Task 3.4 — 性能基准。
//
// 测量关键路径性能，核验门槛：
//   1. seal 耗时（proof envelope V2 seal）—— 门槛 < 2s
//   2. CLI FSM 哈希链吞吐（computeStageReceipt sha256）—— 测 ops/s
//   3. V2 kernel 单次裁决延迟 —— 测 ms/op
//   4. cross-lang 一致性延迟（14 GV × V2 kernel）—— 门槛 < 30s
//
// 真实依赖：sealProofEnvelopeV2 @ src/proof_envelope/v2/sealer.ts:32
//           computeStageReceipt @ src/cli/stage_receipt.ts:21（真实 sha256）
//           decideFiveValueVerdict @ src/falsifiability/verdict_kernel_v2.ts:253

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sealProofEnvelopeV2 } from '../../src/proof_envelope/v2/sealer.ts';
import { computeStageReceipt, verifyStageReceiptChain, GENESIS_RECEIPT, type StageReceipt } from '../../src/cli/stage_receipt.ts';
import { hashCanonicalJson } from '../../src/evidence_log/hasher.ts';
import { decideFiveValueVerdict } from '../../src/falsifiability/verdict_kernel_v2.ts';
import type { VerdictKernelInput } from '../../src/falsifiability/verdict_kernel_v2.ts';
import { makeValidEnvelopeV2Core } from '../proof_envelope/v2/fixtures.ts';

const GV_DIR = fileURLToPath(new URL('../../golden_vectors/cases/', import.meta.url));

// P2-A（BY4-G1）收紧：2s → 200ms（实测 ~28ms + 10× 余量）。
// 原 2s 门槛无法预警真实回归（28ms → 1s 仍假绿）；200ms 允许 CI 抖动但抓住数量级回归。
// 若 CI 平台波动导致误报（>10×），应复查实现而非放宽门槛（性能预算纪律·报告 7.2 主题 1）。
const SEAL_THRESHOLD_MS = 200;
const GV_CROSS_LANG_THRESHOLD_MS = 30000;

function loadAllGoldenVectorKernels(): readonly VerdictKernelInput[] {
  const files = readdirSync(GV_DIR)
    .filter((f) => /^GV-\d+\.json$/.test(f))
    .sort();
  return files.map((file) => {
    const parsed = JSON.parse(readFileSync(join(GV_DIR, file), 'utf8'));
    return parsed.input.kernel as VerdictKernelInput;
  });
}

test(`benchmark: sealProofEnvelopeV2 latency < ${SEAL_THRESHOLD_MS}ms`, () => {
  const input = makeValidEnvelopeV2Core();
  // warmup
  sealProofEnvelopeV2(input);

  const N = 100;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    sealProofEnvelopeV2(input);
  }
  const elapsed = performance.now() - t0;
  const avgMs = elapsed / N;

  console.log(`\n===== sealProofEnvelopeV2 benchmark =====`);
  console.log(`  iterations: ${N}`);
  console.log(`  total: ${elapsed.toFixed(2)}ms`);
  console.log(`  avg: ${avgMs.toFixed(3)}ms`);
  console.log(`  threshold: < ${SEAL_THRESHOLD_MS}ms`);
  console.log(`  result: ${avgMs < SEAL_THRESHOLD_MS ? 'PASS' : 'FAIL'}`);
  console.log(`==========================================\n`);

  assert.ok(avgMs < SEAL_THRESHOLD_MS, `seal avg latency ${avgMs}ms must be < ${SEAL_THRESHOLD_MS}ms`);
});

test('benchmark: CLI FSM stage receipt hash throughput', () => {
  const sampleOutput = { stage: 'CLAIM_CANDIDATE', claimId: 'C-001', payload: { hypothesis: 'test claim' } };
  // warmup
  computeStageReceipt(GENESIS_RECEIPT, sampleOutput);

  const N = 10000;
  const t0 = performance.now();
  let receipt = GENESIS_RECEIPT;
  for (let i = 0; i < N; i++) {
    receipt = computeStageReceipt(receipt, { ...sampleOutput, seq: i });
  }
  const elapsed = performance.now() - t0;
  const opsPerSec = Math.round(N / (elapsed / 1000));
  const avgMicros = (elapsed / N) * 1000;

  // 验证链完整性（真实 sha256 重算）
  const receipts: StageReceipt[] = [];
  let prev = GENESIS_RECEIPT;
  for (let i = 0; i < Math.min(N, 1000); i++) {
    const output = { ...sampleOutput, seq: i };
    const outputHash = hashCanonicalJson(output as Record<string, unknown>);
    const r = computeStageReceipt(prev, output);
    receipts.push({ stage: 'CLAIM_CANDIDATE' as const, prevReceipt: prev, outputHash, receipt: r });
    prev = r;
  }

  console.log(`\n===== CLI FSM stage receipt hash benchmark =====`);
  console.log(`  iterations: ${N}`);
  console.log(`  total: ${elapsed.toFixed(2)}ms`);
  console.log(`  avg: ${avgMicros.toFixed(2)}µs/op`);
  console.log(`  throughput: ${opsPerSec.toLocaleString()} ops/s`);
  console.log(`  chain integrity: ${verifyStageReceiptChain(receipts) ? 'verified' : 'BROKEN'}`);
  console.log(`===============================================\n`);

  assert.ok(opsPerSec > 1000, `hash throughput ${opsPerSec} ops/s must be > 1000 ops/s`);
});

test(`benchmark: 15 GV × V2 kernel cross-lang consistency latency < ${GV_CROSS_LANG_THRESHOLD_MS}ms`, () => {
  const kernels = loadAllGoldenVectorKernels();
  assert.equal(kernels.length, 15, 'must load 15 GV kernels');

  // warmup
  decideFiveValueVerdict(kernels[0]!);

  const N = 10;
  const t0 = performance.now();
  for (let round = 0; round < N; round++) {
    for (const kernel of kernels) {
      decideFiveValueVerdict(kernel);
    }
  }
  const elapsed = performance.now() - t0;
  const singleRoundMs = elapsed / N;
  const perGvMs = singleRoundMs / kernels.length;

  console.log(`\n===== 14 GV × V2 kernel benchmark =====`);
  console.log(`  golden vectors: ${kernels.length}`);
  console.log(`  rounds: ${N}`);
  console.log(`  total: ${elapsed.toFixed(2)}ms`);
  console.log(`  per round (14 GV): ${singleRoundMs.toFixed(2)}ms`);
  console.log(`  per GV: ${perGvMs.toFixed(3)}ms`);
  console.log(`  threshold: < ${GV_CROSS_LANG_THRESHOLD_MS}ms per round`);
  console.log(`  result: ${singleRoundMs < GV_CROSS_LANG_THRESHOLD_MS ? 'PASS' : 'FAIL'}`);
  console.log(`========================================\n`);

  assert.ok(
    singleRoundMs < GV_CROSS_LANG_THRESHOLD_MS,
    `14 GV cross-lang latency ${singleRoundMs}ms must be < ${GV_CROSS_LANG_THRESHOLD_MS}ms`,
  );
});
