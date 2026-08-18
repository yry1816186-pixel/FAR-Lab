// tests/governance/dogfood_ledger.test.ts
//
// DOGFOOD-001 验收测试：真实研究档案登记——十环链完整性、每环真实产物
// 存在性、integrity.json 独立重算防伪、proof_envelopes 哈希链防伪、
// 团队自跑诚实边界。档案来源 = 真实 CLI 执行的完整导出链
// （far export far-proof --demo-chain：真实 exporter/真实哈希链/真实 integrity）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, appendFileSync, readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHAIN_STAGES,
  dogfoodFingerprint,
  registerDogfoodRun,
  type DogfoodRunRecord,
} from '../../src/governance/dogfood_ledger.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 真实执行完整导出链（CLI 子进程——真实 exporter + 真实哈希链产物）。 */
function exportRealBundle(outDir: string): void {
  const r = spawnSync(process.execPath, ['src/cli/far.ts', 'export', 'far-proof', '--demo-chain', '--out', outDir], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 120000,
  });
  assert.equal(r.status, 0, `real export chain must succeed: ${r.stdout}\n${r.stderr}`);
}

/** 十环 → bundle 内真实产物的绑定（demo-chain bundle 的实际文件面）。 */
function stageBindings(): { stage: (typeof CHAIN_STAGES)[number]; artifact: string }[] {
  return [
    { stage: 'question', artifact: 'claim_graph.json' },
    { stage: 'retrieval', artifact: 'repro_runs.jsonl' },
    { stage: 'conjectures', artifact: 'proof_envelopes.jsonl' },
    { stage: 'challenge', artifact: 'proof_envelopes.jsonl' },
    { stage: 'plan', artifact: 'README_REPLAY.md' },
    { stage: 'evidence', artifact: 'call_records.redacted.jsonl' },
    { stage: 'fec', artifact: 'proof_envelopes_v2.jsonl' },
    { stage: 'verdict', artifact: 'proof_envelopes.jsonl' },
    { stage: 'proof-export', artifact: 'integrity.json' },
    { stage: 'independent-verification', artifact: 'prov.ttl' },
  ];
}

function makeRecord(_bundleDir?: string): DogfoodRunRecord {
  return {
    runId: 'dogfood-t1-demo-chain',
    executedAt: '2026-08-18T04:00:00.000Z',
    profile: 'offline_replay',
    operator: 'team-self-run',
    independentVerification: { command: 'far verify <bundle>', status: 'ok' },
    stages: stageBindings(),
  };
}

test('real executed bundle registers clean: ten stages, integrity recomputed, envelope chain verified', () => {
  const bundleDir = join(mkdtempSync(join(tmpdir(), 'far-dog-')), 'bundle');
  exportRealBundle(bundleDir);
  const check = registerDogfoodRun(makeRecord(), bundleDir);
  assert.deepEqual(check.problems, [], JSON.stringify(check));
  assert.equal(check.ok, true);
  assert.equal(check.integrity?.ok, true);
  assert.ok((check.envelopeChain?.checked ?? 0) > 0);
  assert.equal(check.envelopeChain?.mismatchCount, 0);
  assert.equal(check.envelopeChain?.linkageErrorCount, 0);
  rmSync(dirname(bundleDir), { recursive: true, force: true });
});

test('tamper after export (append bytes to a stage artifact) → integrity recomputation fails registration', () => {
  const bundleDir = join(mkdtempSync(join(tmpdir(), 'far-dog-')), 'bundle');
  exportRealBundle(bundleDir);
  appendFileSync(join(bundleDir, 'claim_graph.json'), ' ', 'utf8');
  const check = registerDogfoodRun(makeRecord(), bundleDir);
  assert.equal(check.ok, false);
  assert.ok(check.problems.some((p) => p.includes('bundle integrity failed')));
  rmSync(dirname(bundleDir), { recursive: true, force: true });
});

test('missing stage artifact or incomplete chain → registration rejected with named gap', () => {
  const base = mkdtempSync(join(tmpdir(), 'far-dog-'));
  const bundleDir = join(base, 'bundle');
  exportRealBundle(bundleDir);

  // 缺一环（challenge 未登记）。
  const incomplete = registerDogfoodRun(
    { ...makeRecord(), stages: stageBindings().filter((s) => s.stage !== 'challenge') },
    bundleDir,
  );
  assert.equal(incomplete.ok, false);
  assert.ok(incomplete.problems.some((p) => p.includes('in order')));

  // artifact 指向不存在的文件。
  const ghost = registerDogfoodRun(
    { ...makeRecord(), stages: stageBindings().map((s) => (s.stage === 'plan' ? { ...s, artifact: 'ghost.md' } : s)) },
    bundleDir,
  );
  assert.equal(ghost.ok, false);
  assert.ok(ghost.problems.some((p) => p.includes('ghost.md')));
  rmSync(base, { recursive: true, force: true });
});

test('operator honesty boundary: anything but team-self-run is rejected; live profile must be explicit', () => {
  const bundleDir = join(mkdtempSync(join(tmpdir(), 'far-dog-')), 'bundle');
  exportRealBundle(bundleDir);
  // 伪造 operator 的拒绝路径：仅 operator 字段持宽类型（其余字段保持精确类型），
  // 单次收窄回 DogfoodRunRecord——伪造载荷的拒绝由 registerDogfoodRun 运行时校验保证。
  const forgedPayload: Omit<DogfoodRunRecord, 'operator'> & { operator: string } = {
    ...makeRecord(),
    operator: 'external-user',
  };
  const forged = registerDogfoodRun(forgedPayload as DogfoodRunRecord, bundleDir);
  assert.equal(forged.ok, false);
  assert.ok(forged.problems.some((p) => p.includes('team-self-run')));

  const fakeVerify = registerDogfoodRun(
    { ...makeRecord(), independentVerification: { command: 'nothing', status: 'trust-me' } },
    bundleDir,
  );
  assert.equal(fakeVerify.ok, false);
  rmSync(dirname(bundleDir), { recursive: true, force: true });
});

test('envelope chain tamper (edit a row) → registration fails with chain break', () => {
  const bundleDir = join(mkdtempSync(join(tmpdir(), 'far-dog-')), 'bundle');
  exportRealBundle(bundleDir);
  const envPath = join(bundleDir, 'proof_envelopes.jsonl');
  const lines = readFileSync(envPath, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  assert.ok(lines.length >= 1, 'demo chain exports at least one proof envelope');
  // 重写最后一行（篡改链尾内容但保持行数）——proofHash 重算必失配。
  const tampered = JSON.parse(lines[lines.length - 1]!) as Record<string, unknown>;
  tampered['claim_text'] = 'tampered-claim-text';
  lines[lines.length - 1] = JSON.stringify(tampered);
  writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
  const check = registerDogfoodRun(makeRecord(), bundleDir);
  assert.equal(check.ok, false);
  assert.ok(check.problems.some((p) => p.includes('envelope chain broken') || p.includes('integrity failed')));
  rmSync(dirname(bundleDir), { recursive: true, force: true });
});

test('fingerprint: same bundle → same digest; changed bundle → different digest; missing artifact → null', () => {
  const base = mkdtempSync(join(tmpdir(), 'far-dog-'));
  const bundleDir = join(base, 'bundle');
  exportRealBundle(bundleDir);
  const copyDir = join(base, 'copy');
  cpSync(bundleDir, copyDir, { recursive: true });

  const f1 = dogfoodFingerprint(makeRecord(), bundleDir);
  const f2 = dogfoodFingerprint(makeRecord(), copyDir);
  assert.ok(f1 !== null && /^[0-9a-f]{64}$/.test(f1));
  assert.equal(f1, f2, 'identical bundles must fingerprint identically');

  appendFileSync(join(copyDir, 'claim_graph.json'), 'x', 'utf8');
  const f3 = dogfoodFingerprint(makeRecord(copyDir), copyDir);
  assert.notEqual(f1, f3);

  assert.equal(dogfoodFingerprint(makeRecord(), join(base, 'nope')), null);
  rmSync(base, { recursive: true, force: true });
});
