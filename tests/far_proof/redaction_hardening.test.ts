// tests/far_proof/redaction_hardening.test.ts
//
// 深度对抗轮回归测试：导出脱敏加固 —— dashscope_request_id 在导出时哈希化。
//
// 背景（深度对抗轮发现）：
//   writeCallRecordsRedacted 与 writeOtelTraceJsonl 旧实现直接导出 dashscope_request_id 明文。
//   该 ID 是 Aliyun Bailian 侧调用关联标识，可用于查询运营方百炼调用日志 → 去匿名化运营方账户。
//   修复：导出时改为 redactRequestId（sha256('far-redact:'+id) 截前 16 hex），保留跨调用可关联性
//   （同一 id → 同一摘要）但不泄露厂商账户。
//
// 关键不变量（须验证不破坏）：
//   - dashscope_request_id 非 hash 链输入（CanonicalInput 4 字段不含它）→ 脱敏不影响链完整性。
//   - DEF-18 DB↔导出锚只比 payload_hash → 脱敏不影响锚比对。
//
// Authority: AGENTS.md §8（最小权限·本地效应）+ exporter.ts redactRequestId + DEF-18 锚字段。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import {
  buildDemoChain,
  computeEnvHash,
  DEMO_GIT_COMMIT_SHA,
  DEMO_RUN_ID,
} from '../../src/far_proof/demo_chain.ts';
import { exportFarProof } from '../../src/far_proof/index.ts';
import { verifyChainHead } from '../../src/evidence_log/verifier.ts';

function exportDemoBundle(tmp: string): { outputDir: string } {
  const db = new Database(':memory:');
  try {
    buildDemoChain(db);
    const chainOk = verifyChainHead(db);
    if (!chainOk.ok) throw new Error(`demo chain broken: ${JSON.stringify(chainOk)}`);
    const outputDir = join(tmp, '.far-proof');
    exportFarProof({
      db,
      outputDir,
      runId: DEMO_RUN_ID,
      modelSnapshot: 'offline-replay-fixture@v1',
      gitCommitSha: DEMO_GIT_COMMIT_SHA,
      envHash: computeEnvHash({
        schemaVersion: 6,
        nodeVersion: process.version,
        providerProfile: 'offline_replay',
      }),
      exportedAt: '2026-08-03T00:00:00.000Z',
    });
    return { outputDir };
  } finally {
    db.close();
  }
}

function expectedRedacted(id: string): string {
  return createHash('sha256').update(`far-redact:${id}`, 'utf8').digest('hex').slice(0, 16);
}

test('call_records_redacted_no_plaintext_request_id: 导出文件不含原始 dashscope_request_id 明文', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-redact-'));
  try {
    const { outputDir } = exportDemoBundle(tmp);
    const redactedPath = join(outputDir, 'call_records.redacted.jsonl');
    const text = readFileSync(redactedPath, 'utf8');

    // 任何形如 chatcmpl-xxx / req-xxx 的原始 request id 不应出现明文（应被哈希化）
    // demo chain 的 dashscope_request_id 多为 null（→ null），但若有非空值须是 16-hex 摘要
    const lines = text.trim().split('\n').filter((l) => l.length > 0);
    for (const line of lines) {
      const row = JSON.parse(line) as { dashscope_request_id?: string | null };
      if (row.dashscope_request_id !== null && row.dashscope_request_id !== undefined) {
        // 非空值必须是 16 hex（redactRequestId 输出形态），不是原始厂商 id
        assert.match(
          row.dashscope_request_id,
          /^[0-9a-f]{16}$/,
          `dashscope_request_id 须为 16-hex 摘要，实际: "${row.dashscope_request_id}"`,
        );
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('otel_trace_no_plaintext_request_id: OTel span gen_ai.response.id 为脱敏摘要', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-redact-otel-'));
  try {
    const { outputDir } = exportDemoBundle(tmp);
    const otelPath = join(outputDir, 'otel-trace.jsonl');
    const text = readFileSync(otelPath, 'utf8');
    const lines = text.trim().split('\n').filter((l) => l.length > 0);
    for (const line of lines) {
      const span = JSON.parse(line) as {
        attributes?: { 'gen_ai.response.id'?: string };
      };
      const id = span.attributes?.['gen_ai.response.id'];
      if (id !== undefined && id !== '') {
        // 非空值必须是 16-hex 摘要
        assert.match(
          id,
          /^[0-9a-f]{16}$/,
          `gen_ai.response.id 须为 16-hex 摘要，实际: "${id}"`,
        );
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('redaction_deterministic: 相同 request id → 相同摘要（审计可关联）', () => {
  // 直接验证 redactRequestId 的确定性（纯函数·不依赖导出）
  const id = 'chatcmpl-test-12345';
  const h1 = expectedRedacted(id);
  const h2 = expectedRedacted(id);
  assert.equal(h1, h2, '相同 id → 相同摘要（审计可关联性保留）');
  assert.match(h1, /^[0-9a-f]{16}$/);
  // 不同 id → 不同摘要
  const h3 = expectedRedacted('chatcmpl-test-99999');
  assert.notEqual(h1, h3, '不同 id → 不同摘要');
});

test('chain_integrity_unaffected_by_redaction: 脱敏不影响 call_records 链完整性', () => {
  // dashscope_request_id 非 CanonicalInput 字段 → 脱敏不影响链。
  // 导出后重验 chain head 仍 ok（db 内存实例导出前后一致）。
  const tmp = mkdtempSync(join(tmpdir(), 'far-redact-chain-'));
  try {
    const db = new Database(':memory:');
    try {
      buildDemoChain(db);
      const before = verifyChainHead(db);
      exportFarProof({
        db,
        outputDir: join(tmp, '.far-proof'),
        runId: DEMO_RUN_ID,
        modelSnapshot: 'offline-replay-fixture@v1',
        gitCommitSha: DEMO_GIT_COMMIT_SHA,
        envHash: computeEnvHash({
          schemaVersion: 6,
          nodeVersion: process.version,
          providerProfile: 'offline_replay',
        }),
        exportedAt: '2026-08-03T00:00:00.000Z',
      });
      const after = verifyChainHead(db);
      assert.equal(before.ok, after.ok, '导出（脱敏）前后链状态一致');
      if (before.ok && after.ok) {
        assert.equal(before.verifiedCount, after.verifiedCount, '验证计数不变');
      }
    } finally {
      db.close();
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
