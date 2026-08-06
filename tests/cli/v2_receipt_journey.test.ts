/**
 * V2 收据 CLI 用户旅程端到端测试（PROGRESS.md T3a·2026-08-06）。
 *
 * 覆盖完整用户旅程（真实 CLI 子进程·非单函数调用）：
 *   1. 密封 V2 envelope（fixture）→ 写盘（模拟 producer 产出）；
 *   2. `far export receipt-v2 --envelope <path> --out <path>` → exit 0 + 收据 JSON 落盘
 *      （manifest + 六维 verificationResult + contractBindingSet）；
 *   3. `far verify --v2 --envelope <path>` → exit 0（六维 assurance PASS + clean-room 独立根复算）；
 *   4. 篡改 envelope（改 claim 内容·破坏内容寻址密封）→ `far verify --v2` → exit 7 FAIL
 *      （integrity/manifest 维度捕获篡改·反 theater）；
 *   5. `--bundle` 路径从 .far-proof 包读取 envelope（bundle 形态）。
 *
 * Authority: src/cli/commands/export_receipt_v2.ts + src/cli/commands/verify_v2.ts +
 *            src/cli/far.ts（verify --v2 路由 + export receipt-v2 注册）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import { sealProofEnvelopeV2 } from '../../src/proof_envelope/v2/sealer.ts';
import type { ProofEnvelopeV2 } from '../../src/proof_envelope/v2/types.ts';
import { makeValidEnvelopeV2Core } from '../proof_envelope/v2/fixtures.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

function sealedEnvelope(): ProofEnvelopeV2 {
  return sealProofEnvelopeV2(makeValidEnvelopeV2Core()).envelope;
}

function runFar(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [join(REPO_ROOT, 'src', 'cli', 'far.ts'), ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// ---------------------------------------------------------------------------
// 测试 1：完整用户旅程（seal → export receipt-v2 → verify --v2）
// ---------------------------------------------------------------------------

test('V2 收据旅程：seal → far export receipt-v2 → far verify --v2 全绿（exit 0）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-v2-journey-'));
  try {
    // 1. 密封 envelope → 写盘（producer 侧产物）
    const envPath = join(tmp, 'envelope.json');
    writeFileSync(envPath, `${JSON.stringify(sealedEnvelope(), null, 2)}\n`, 'utf8');

    // 2. export receipt-v2（--out 落盘）
    const receiptPath = join(tmp, 'receipt.json');
    const exp = runFar(['export', 'receipt-v2', '--envelope', envPath, '--out', receiptPath]);
    assert.equal(exp.status, 0, `export receipt-v2 须 exit 0（stderr: ${exp.stderr}）`);
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    assert.equal(receipt.schemaVersion, 'far.v2_receipt.v1');
    assert.ok(receipt.manifest?.rootDigest, 'manifest rootDigest 须存在');
    assert.match(receipt.manifest.rootDigest, /^[0-9a-f]{64}$/);
    assert.ok(receipt.verificationResult?.dimensions, '六维 verificationResult 须存在');
    for (const dim of [
      'provenance', 'integrity', 'identity',
      'processConformance', 'executionReproduction', 'scientificVerdict',
    ]) {
      assert.ok(dim in receipt.verificationResult.dimensions, `维度 ${dim} 须存在`);
    }
    assert.ok(receipt.contractBindingSet?.bindings, 'contractBindingSet 须存在');

    // 3. verify --v2（六维 assurance + clean-room 独立根复算）
    const v = runFar(['verify', '--v2', '--envelope', envPath, '--json']);
    assert.equal(v.status, 0, `verify --v2 须 exit 0（stderr: ${v.stderr}）`);
    const vresult = JSON.parse(v.stdout);
    assert.equal(vresult.receiptStanding, 'ACTIVE');
    const outcomes = Object.values(vresult.dimensions) as { outcome: string }[];
    for (const o of outcomes) {
      assert.ok(
        ['PASS', 'NOT_APPLICABLE', 'WARN'].includes(o.outcome),
        `维度 outcome 须 PASS/NOT_APPLICABLE/WARN（got ${o.outcome}）`,
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 测试 2：篡改检测（内容寻址密封破坏 → verify FAIL exit 7）
// ---------------------------------------------------------------------------

test('V2 收据旅程：篡改 envelope claim → far verify --v2 exit 7（integrity FAIL）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-v2-tamper-'));
  try {
    const env = sealedEnvelope();
    const envPath = join(tmp, 'envelope.json');
    writeFileSync(envPath, `${JSON.stringify(env, null, 2)}\n`, 'utf8');

    // 篡改：改 claim 文本（未重新密封·proofHash/manifest digest 失配）
    // JSON.parse 产出 unknown → 单层收窄断言（项目惯例·禁 as any / as unknown as）
    const tampered = JSON.parse(readFileSync(envPath, 'utf8')) as {
      claim: { text?: string };
    };
    assert.ok(tampered.claim, 'fixture claim 须存在');
    tampered.claim = {
      ...tampered.claim,
      text: 'TAMPERED: claim text altered after sealing',
    };
    const tamperedPath = join(tmp, 'tampered.json');
    writeFileSync(tamperedPath, `${JSON.stringify(tampered, null, 2)}\n`, 'utf8');

    const v = runFar(['verify', '--v2', '--envelope', tamperedPath, '--json']);
    assert.equal(v.status, 7, '篡改后 verify --v2 须 exit 7（FAIL）');
    const vresult = JSON.parse(v.stdout);
    const integrity = vresult.dimensions?.integrity;
    assert.ok(integrity, 'integrity 维度须存在');
    assert.equal(integrity.outcome, 'FAIL');
    assert.ok(
      Array.isArray(integrity.reasonCodes) && integrity.reasonCodes.length > 0,
      'FAIL 须带 reasonCode',
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 测试 3：bundle 路径（verify --v2 --bundle <dir> 从包内 envelope.json 读取）
// ---------------------------------------------------------------------------

test('V2 收据旅程：verify --v2 --bundle <dir> 从包内 envelope.json 读取 → exit 0', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-v2-bundle-'));
  try {
    const bundleDir = join(tmp, 'proof.far-proof');
    mkdirSync(bundleDir, { recursive: true });
    writeFileSync(
      join(bundleDir, 'envelope.json'),
      `${JSON.stringify(sealedEnvelope(), null, 2)}\n`,
      'utf8',
    );

    const v = runFar(['verify', '--v2', '--bundle', bundleDir]);
    assert.equal(v.status, 0, `verify --v2 --bundle 须 exit 0（stderr: ${v.stderr}）`);
    assert.match(v.stdout, /Six Independent Assurance Dimensions/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 测试 4：错误路径（缺 envelope → exit 2；文件不存在 → exit 2）
// ---------------------------------------------------------------------------

test('V2 收据旅程：缺 --envelope → exit 2（参数门 fail-closed）', () => {
  const r = runFar(['verify', '--v2']);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /Error: --envelope <path> or --bundle <path> required/);
});

test('V2 收据旅程：envelope 文件不存在 → exit 2', () => {
  const r = runFar(['verify', '--v2', '--envelope', join(tmpdir(), 'no-such-envelope.json')]);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /envelope file not found/);
});
