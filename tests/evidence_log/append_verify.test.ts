import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  appendEvidenceLog,
  appendRecord,
  canonicalHash,
  GENESIS_PREV_HASH,
  getEvidenceLogEntry,
  getChainHead,
  rowToCallRecord,
  verifyChainHead,
} from '../../src/evidence_log/index.ts';
import type {
  AppendRecordOptions,
  ProviderNeutralCredential,
  CallAuditData,
  SourceAnchor,
} from '../../src/evidence_log/index.ts';
import { COMPETITION_MODEL_SNAPSHOT } from '../../src/llm_gateway/adapters/aliyun_qwen/index.ts';
import { runMigrations } from '../../src/db/index.ts';

const OFFLINE_OPTIONS: AppendRecordOptions = {
  providerProfile: 'offline_replay',
};

// Windows: 'python' (真实安装); Unix: 'python3'。WindowsApps python3 是 Store stub,
// 在 coverage 并发下 spawnSync 偶发 status=null。对齐 ensure_py_deps.mjs / smt_backend.ts 约定。
const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';

const SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
  codeLocation: {
    filePath: 'tests/evidence_log/append_verify.test.ts',
    location: 'appendEvidenceLog',
    lineNumber: 1,
  },
};

function openDb(path = ':memory:'): Database.Database {
  const db = new Database(path);
  // 跑完整迁移链（含 0007 degraded_from 列）。trigger-bypass 测试用 DROP TRIGGER，
  // trigger 名跨迁移不变，runMigrations 不破坏其语义。
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function credential(index: number, modelId = 'offline-replay-fixture'): ProviderNeutralCredential {
  return {
    modelId,
    dashscopeRequestId: null,
    reproHash: `${index}`.repeat(64).slice(0, 64),
    gitCommitSha: 'b'.repeat(40),
    isoTimestamp: `2026-06-27T00:00:0${index}.000Z`,
  };
}

function audit(index: number): CallAuditData {
  return {
    requestPayload: `{"messages":[{"role":"user","content":"q${index}"}]}`,
    responsePayload: `{"choices":[{"message":{"content":"a${index}"}}]}`,
    finishReason: 'stop',
    usageTokensTotal: index,
  };
}

function appendFixtureRow(db: Database.Database, index: number): void {
  appendRecord(
    db,
    {
      stageId: `stage${index}`,
      cred: credential(index),
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: getChainHead(db)?.currentHash ?? GENESIS_PREV_HASH,
    },
    audit(index),
    OFFLINE_OPTIONS,
  );
}

function appendWithAuditOverride(db: Database.Database, auditOverride: Partial<CallAuditData>): void {
  appendRecord(
    db,
    {
      stageId: 'stage-validate',
      cred: credential(1),
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: GENESIS_PREV_HASH,
    },
    { ...audit(1), ...auditOverride },
    OFFLINE_OPTIONS,
  );
}

test('appendRecord validates CallAuditData 输入守卫（4 条·assertAuditData 此前未测）', () => {
  // assertAuditData (repository.ts:281-295) 对 4 个字段 fail-closed throw，此前零测覆盖。
  const cases = [
    { override: { requestPayload: '' }, msg: 'requestPayload must be non-empty' },
    { override: { responsePayload: '' }, msg: 'responsePayload must be non-empty' },
    { override: { finishReason: '' }, msg: 'finishReason must be non-empty' },
    { override: { usageTokensTotal: -1 }, msg: 'usageTokensTotal must be a non-negative integer or null' },
    { override: { usageTokensTotal: 1.5 }, msg: 'usageTokensTotal must be a non-negative integer or null' },
  ];
  for (const { override, msg } of cases) {
    const db = openDb();
    try {
      assert.throws(
        () => appendWithAuditOverride(db, override),
        { message: new RegExp(msg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) },
        `须报 ${msg}`,
      );
    } finally {
      db.close();
    }
  }
});

test('appendRecord writes a real chained log and verifyChainHead accepts it', () => {
  const db = openDb();
  try {
    appendFixtureRow(db, 1);
    appendFixtureRow(db, 2);
    appendFixtureRow(db, 3);

    const result = verifyChainHead(db);
    assert.equal(result.ok, true);
    assert.equal(result.verifiedCount, 3);
    assert.equal(result.brokenAtSeq, null);

    const rows = db
      .prepare('SELECT * FROM call_records ORDER BY seq ASC')
      .all() as Array<ReturnType<typeof appendRecord>['row']>;
    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.equal(canonicalHash(rowToCallRecord(row)), row.current_hash);
    }
  } finally {
    db.close();
  }
});

test('appendEvidenceLog transcribes a call record into auditable evidence_log rows', () => {
  const db = openDb();
  try {
    const record = appendRecord(
      db,
      {
        stageId: 'stage3_hypothesis',
        cred: credential(1),
        payloadKind: 'hypothesis',
        purposeTag: 'hypothesis',
        prevHash: GENESIS_PREV_HASH,
      },
      audit(1),
      OFFLINE_OPTIONS,
    );

    const evidence = appendEvidenceLog(db, {
      callRecordSeq: record.seq,
      evidenceId: 'ev-transcribed',
      evidencePayload: { claim: 'a testable claim' },
      sourceAnchor: SOURCE_ANCHOR,
    });

    assert.equal(evidence.evidenceId, 'ev-transcribed');
    assert.equal(evidence.callRecordSeq, record.seq);
    assert.equal(evidence.stageId, 'stage3_hypothesis');
    assert.equal(evidence.payloadKind, 'hypothesis');
    assert.match(evidence.evidencePayload, /testable claim/);
    assert.equal(evidence.sourceAnchor.codeLocation?.location, 'appendEvidenceLog');

    const row = db.prepare('SELECT * FROM evidence_log WHERE evidence_id = ?').get('ev-transcribed') as {
      source_anchor_git: string;
      source_anchor_req: string | null;
      source_anchor_path: string | null;
      source_anchor_lineno: number | null;
    };
    assert.equal(row.source_anchor_git, SOURCE_ANCHOR.gitCommitSha);
    assert.equal(row.source_anchor_req, null);
    assert.equal(row.source_anchor_path, SOURCE_ANCHOR.codeLocation?.filePath);
    assert.equal(row.source_anchor_lineno, SOURCE_ANCHOR.codeLocation?.lineNumber);

    assert.equal(getEvidenceLogEntry(db, 'ev-transcribed').sourceAnchor.rawResponseHash, SOURCE_ANCHOR.rawResponseHash);
  } finally {
    db.close();
  }
});

test('verifyChainHead detects current_hash tampering after trigger bypass in a test database', () => {
  const db = openDb();
  try {
    appendFixtureRow(db, 1);
    db.exec('DROP TRIGGER trg_call_records_no_update');
    db.prepare("UPDATE call_records SET current_hash = 'tampered' WHERE seq = 1").run();

    const result = verifyChainHead(db);
    assert.equal(result.ok, false);
    assert.equal(result.brokenAtSeq, 1);
    assert.match(result.expectedHash ?? '', /^[0-9a-f]{64}$/);
    assert.equal(result.actualHash, 'tampered');
  } finally {
    db.close();
  }
});

test('appendRecord rejects a stale prevHash before inserting', () => {
  const db = openDb();
  try {
    appendFixtureRow(db, 1);
    assert.throws(
      () =>
        appendRecord(
          db,
          {
            stageId: 'stage2',
            cred: credential(2),
            payloadKind: 'hypothesis',
            purposeTag: 'hypothesis',
            prevHash: GENESIS_PREV_HASH,
          },
          audit(2),
          OFFLINE_OPTIONS,
        ),
      /prevHash mismatch/,
    );
  } finally {
    db.close();
  }
});

test('competition snapshot guard is profile-aware', () => {
  const offlineDb = openDb();
  try {
    appendRecord(
      offlineDb,
      {
        stageId: 'offline',
        cred: credential(1, 'non-qwen-local-model'),
        payloadKind: 'meta',
        purposeTag: 'narrative',
        prevHash: GENESIS_PREV_HASH,
      },
      audit(1),
      OFFLINE_OPTIONS,
    );
    assert.equal(verifyChainHead(offlineDb).ok, true);
  } finally {
    offlineDb.close();
  }

  const competitionDb = openDb();
  try {
    assert.throws(
      () =>
        appendRecord(
          competitionDb,
          {
            stageId: 'competition',
            cred: credential(1, 'qwen-old-snapshot'),
            payloadKind: 'meta',
            purposeTag: 'narrative',
            prevHash: GENESIS_PREV_HASH,
          },
          audit(1),
          {
            providerProfile: 'competition_aliyun_qwen',
            competitionModelSnapshot: COMPETITION_MODEL_SNAPSHOT,
          },
        ),
      /competition model mismatch/,
    );
  } finally {
    competitionDb.close();
  }
});

test('Python verify_chain_head accepts a database written by TS appendRecord', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'far-chain-evidence-'));
  const dbPath = join(tempDir, 'evidence.db');
  const db = openDb(dbPath);
  try {
    appendFixtureRow(db, 1);
    appendFixtureRow(db, 2);
  } finally {
    db.close();
  }

  try {
    const script = [
      'import sqlite3',
      'from far_chain_repro.verify_chain import verify_chain_head',
      `db = sqlite3.connect(${JSON.stringify(dbPath)})`,
      'result = verify_chain_head(db)',
      'db.close()',
      'print(f"{result.ok}:{result.verified_count}:{result.broken_at_seq}")',
    ].join('; ');
    const result = spawnSync(PYTHON_CMD, ['-c', script], {
      cwd: new URL('../../', import.meta.url),
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: 'repro',
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'True:2:None');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
