// tests/ci/eval_ring_audit.test.ts
// 职责：C2 eval-ring 诚实降级审计闸门双层断言（10_CI_pipeline.md §0 ⑦ + §1 STEP 10）
// 断言 1（代码路径层）：auditEvalRingCodePath 检出评测环直连模型调用层的违规 import
// 断言 2（数据层）：auditEvalRingDataLayer 检出评测环通道 record 含 dashscope 响应特征
// 附加：spawnSync 调 scripts/eval_ring_audit.mjs 验证 CI 脚本退出码

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { auditEvalRingCodePath, auditEvalRingDataLayer } from '../../src/audit/eval_ring_audit.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const auditScript = join(repoRoot, 'scripts', 'eval_ring_audit.mjs');
const schemaPath = join(repoRoot, 'schema', 'migrations', '0001_initial.sql');

function openDbWithSchema(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(schemaPath, 'utf8'));
  return db;
}

interface InsertArgs {
  readonly purposeTag: string;
  readonly responsePayload: string;
}

function insertCallRecord(db: Database.Database, args: InsertArgs): void {
  db.prepare(
    `INSERT INTO call_records (
      stage_id, payload_kind, purpose_tag, model_id, dashscope_request_id,
      repro_hash, git_commit_sha, iso_timestamp, request_payload, response_payload,
      response_payload_hash, finish_reason, usage_tokens_total, prev_hash, current_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'stage_eval_ring_audit',
    'meta',
    args.purposeTag,
    'offline-replay-fixture',
    null,
    'a'.repeat(64),
    'b'.repeat(40),
    '2026-06-27T00:00:00Z',
    '{}',
    args.responsePayload,
    'c'.repeat(64),
    'stop',
    0,
    '0'.repeat(64),
    'd'.repeat(64),
  );
}

function makeEvalRingDir(base: string): string {
  const evalRingDir = join(base, 'eval-ring');
  mkdirSync(evalRingDir, { recursive: true });
  return evalRingDir;
}

test('auditEvalRingCodePath returns not_applicable (never "passed") when eval-ring directory does not exist', () => {
  // fail-closed：目录缺失时审计零文件，status 必须是 not_applicable，禁是 passed。
  const tmp = mkdtempSync(join(tmpdir(), 'eval-ring-audit-missing-'));
  try {
    const result = auditEvalRingCodePath(tmp);
    assert.equal(result.status, 'not_applicable');
    assert.equal(result.auditedFiles, 0);
    assert.equal(result.violations.length, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('auditEvalRingCodePath returns not_applicable when eval-ring dir exists but has no .ts files', () => {
  // 反假绿：目录存在但无代码可审计时同样禁声称 passed。
  const tmp = mkdtempSync(join(tmpdir(), 'eval-ring-audit-empty-'));
  try {
    makeEvalRingDir(tmp); // 建空目录
    const result = auditEvalRingCodePath(tmp);
    assert.equal(result.status, 'not_applicable');
    assert.equal(result.auditedFiles, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('auditEvalRingCodePath returns passed for clean directory with real .ts files audited', () => {
  // 真断言：实际审计 ≥1 文件且零违规才落 passed（auditedFiles>0）。
  const tmp = mkdtempSync(join(tmpdir(), 'eval-ring-audit-clean-'));
  try {
    const evalRingDir = makeEvalRingDir(tmp);
    writeFileSync(
      join(evalRingDir, 'scorer.ts'),
      'export function score(input: string): number { return input.length; }\n',
      'utf8',
    );
    const result = auditEvalRingCodePath(tmp);
    assert.equal(result.status, 'passed');
    assert.equal(result.auditedFiles, 1);
    assert.equal(result.violations.length, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('auditEvalRingCodePath detects forbidden competition adapter import', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'eval-ring-audit-violation-'));
  try {
    const evalRingDir = makeEvalRingDir(tmp);
    writeFileSync(
      join(evalRingDir, 'bad.ts'),
      "import { callForCompetitionCredential } from '../llm_gateway/adapters/aliyun_qwen';\n",
      'utf8',
    );
    const result = auditEvalRingCodePath(tmp);
    assert.equal(result.status, 'failed');
    assert.equal(result.auditedFiles, 1);
    assert.ok(
      result.violations.length >= 1,
      `expected >= 1 violation, got ${result.violations.length}`,
    );
    const rules = result.violations.map((v) => v.rule);
    assert.ok(rules.includes('eval_ring_imports_aliyun_qwen_adapter'));
    assert.ok(rules.includes('eval_ring_calls_competition_credential'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('auditEvalRingCodePath detects provider/index and callBailianForCred imports', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'eval-ring-audit-provider-'));
  try {
    const evalRingDir = makeEvalRingDir(tmp);
    writeFileSync(
      join(evalRingDir, 'legacy.ts'),
      "import { callBailianForCred } from '../../provider/index';\n",
      'utf8',
    );
    const result = auditEvalRingCodePath(tmp);
    assert.equal(result.status, 'failed');
    const rules = result.violations.map((v) => v.rule);
    assert.ok(rules.includes('eval_ring_imports_provider_index'));
    assert.ok(rules.includes('eval_ring_calls_bailian_cred'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('auditEvalRingCodePath recurses into subdirectories', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'eval-ring-audit-nested-'));
  try {
    const evalRingDir = makeEvalRingDir(tmp);
    const nestedDir = join(evalRingDir, 'judges');
    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(
      join(nestedDir, 'judge.ts'),
      "import { callForCompetitionCredential } from '../../../llm_gateway/adapters/aliyun_qwen';\n",
      'utf8',
    );
    const result = auditEvalRingCodePath(tmp);
    assert.equal(result.status, 'failed');
    assert.ok(result.violations.length >= 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('auditEvalRingDataLayer returns ok when eval-ring records have plain-text payloads', () => {
  const db = openDbWithSchema();
  try {
    insertCallRecord(db, { purposeTag: 'eval', responsePayload: 'plain text result' });
    insertCallRecord(db, { purposeTag: 'scoring', responsePayload: 'score=0.82' });
    insertCallRecord(db, { purposeTag: 'gt_read', responsePayload: 'gt row 42' });
    const result = auditEvalRingDataLayer(db);
    assert.equal(result.ok, true);
    assert.equal(result.violations.length, 0);
  } finally {
    db.close();
  }
});

test('auditEvalRingDataLayer returns ok for non-eval-ring purpose tags with dashscope body', () => {
  const db = openDbWithSchema();
  try {
    // hypothesis 是主环通道，不在评测环白名单内 → 不应被审计为违规
    insertCallRecord(db, {
      purposeTag: 'hypothesis',
      responsePayload: '{"choices":[{"message":{"content":"..."}}]}',
    });
    const result = auditEvalRingDataLayer(db);
    assert.equal(result.ok, true);
    assert.equal(result.violations.length, 0);
  } finally {
    db.close();
  }
});

test('auditEvalRingDataLayer flags scoring record with dashscope choices body', () => {
  const db = openDbWithSchema();
  try {
    insertCallRecord(db, {
      purposeTag: 'scoring',
      responsePayload: '{"choices":[{"message":{"content":"..."}}]}',
    });
    const result = auditEvalRingDataLayer(db);
    assert.equal(result.ok, false);
    assert.ok(
      result.violations.length >= 1,
      `expected >= 1 violation, got ${result.violations.length}`,
    );
    const rules = result.violations.map((v) => v.rule);
    assert.ok(rules.includes('eval_ring_data_dashscope_choices'));
  } finally {
    db.close();
  }
});

test('auditEvalRingDataLayer flags gt_read record with dashscope_request_id in body', () => {
  const db = openDbWithSchema();
  try {
    insertCallRecord(db, {
      purposeTag: 'gt_read',
      responsePayload: '{"dashscope_request_id":"req-abc","result":"ok"}',
    });
    const result = auditEvalRingDataLayer(db);
    assert.equal(result.ok, false);
    assert.ok(result.violations.length >= 1);
    const rules = result.violations.map((v) => v.rule);
    assert.ok(rules.includes('eval_ring_data_dashscope_request_id'));
  } finally {
    db.close();
  }
});

test('auditEvalRingDataLayer ignores JSON arrays and primitives in response_payload', () => {
  const db = openDbWithSchema();
  try {
    // JSON 数组 / 纯数字 / 纯字符串均非 dashscope 对象响应 → 不违规
    insertCallRecord(db, { purposeTag: 'eval', responsePayload: '[1, 2, 3]' });
    insertCallRecord(db, { purposeTag: 'scoring', responsePayload: '42' });
    insertCallRecord(db, { purposeTag: 'gt_read', responsePayload: '"just a string"' });
    const result = auditEvalRingDataLayer(db);
    assert.equal(result.ok, true);
    assert.equal(result.violations.length, 0);
  } finally {
    db.close();
  }
});

test('eval_ring_audit.mjs reports N/A (never "passed") and exits 0 when src/eval-ring/ does not exist', () => {
  // fail-closed：src/eval-ring/ 不存在时脚本必须打印 N/A（禁 "passed/OK code-path audit"）。
  // exit 0 不阻断 CI（评测环属 V2），但绑定不变量由数据层审计 + 本测试套件强制。
  assert.ok(
    !existsSync(join(repoRoot, 'src', 'eval-ring')),
    'precondition: src/eval-ring should not exist for N/A assertion',
  );
  const result = spawnSync(process.execPath, [auditScript], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `expected exit 0 but got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  // 必须显式声明 N/A（审计零文件），禁声称 passed。
  assert.match(result.stdout, /code-path N\/A/);
  // 禁出现假装审计通过的措辞。
  assert.doesNotMatch(result.stdout, /code-path audit passed|OK \(audited/);
});
