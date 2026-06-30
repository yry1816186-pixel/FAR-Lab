import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

const ddl = readFileSync(new URL('../../schema/migrations/0001_initial.sql', import.meta.url), 'utf8');

function openDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(ddl);
  return db;
}

function countRows(db: Database.Database, tableName: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
  if (typeof row !== 'object' || row === null || !('count' in row)) {
    throw new Error(`countRows: invalid result for ${tableName}`);
  }
  const count = row.count;
  if (typeof count !== 'number') {
    throw new Error(`countRows: non-numeric count for ${tableName}`);
  }
  return count;
}

test('0001_initial.sql executes in SQLite memory and creates the five core tables', () => {
  const db = openDb();
  try {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = rows.map((row) => row.name);
    assert.ok(names.includes('call_records'));
    assert.ok(names.includes('evidence_log'));
    assert.ok(names.includes('verdict_nodes'));
    assert.ok(names.includes('evidence_edges'));
    assert.ok(names.includes('repro_runs'));
    assert.ok(names.includes('schema_meta'));
  } finally {
    db.close();
  }
});

test('core rows can be inserted with valid foreign-key topology', () => {
  const db = openDb();
  try {
    db.prepare(
      `INSERT INTO call_records (
        stage_id, payload_kind, purpose_tag, model_id, dashscope_request_id,
        repro_hash, git_commit_sha, iso_timestamp, request_payload, response_payload,
        response_payload_hash, finish_reason, usage_tokens_total, prev_hash, current_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'stage1_understanding',
      'understanding',
      'hypothesis',
      'offline-replay-fixture',
      null,
      'a'.repeat(64),
      'b'.repeat(40),
      '2026-06-27T00:00:00Z',
      '{}',
      '{}',
      'c'.repeat(64),
      'stop',
      0,
      '0'.repeat(64),
      'd'.repeat(64),
    );

    db.prepare(
      `INSERT INTO evidence_log (
        evidence_id, call_record_seq, stage_id, payload_kind, evidence_payload,
        source_anchor, source_anchor_git, source_anchor_req, source_anchor_ts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('ev-1', 1, 'stage1_understanding', 'understanding', '{}', '{}', 'b'.repeat(40), null, '2026-06-27T00:00:00Z');

    db.prepare(
      `INSERT INTO verdict_nodes (
        verdict_id, evidence_id, node_kind, verdict, falsification_spec,
        untested_reason, source_anchor, prev_hash, current_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('v-1', 'ev-1', 'root', 'UNTESTED', '{}', 'not tested yet', '{}', '0'.repeat(64), 'e'.repeat(64));

    db.prepare(
      `INSERT INTO repro_runs (
        repro_run_id, verdict_id, call_record_seq, seven_factor_snapshot, repro_hash,
        replay_prover, status, prev_hash, current_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('rr-1', 'v-1', 1, '{}', 'a'.repeat(64), '{}', 'success', '0'.repeat(64), 'f'.repeat(64));

    assert.equal(countRows(db, 'call_records'), 1);
    assert.equal(countRows(db, 'evidence_log'), 1);
    assert.equal(countRows(db, 'verdict_nodes'), 1);
    assert.equal(countRows(db, 'repro_runs'), 1);
  } finally {
    db.close();
  }
});

test('schema guards reject invalid enum values and append-only updates', () => {
  const db = openDb();
  try {
    assert.throws(
      () =>
        db.prepare(
          `INSERT INTO call_records (
            stage_id, payload_kind, purpose_tag, model_id, repro_hash,
            git_commit_sha, iso_timestamp, request_payload, response_payload,
            finish_reason, prev_hash, current_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          'stage1_understanding',
          'understanding',
          'not_a_purpose',
          'offline-replay-fixture',
          'a'.repeat(64),
          'b'.repeat(40),
          '2026-06-27T00:00:00Z',
          '{}',
          '{}',
          'stop',
          '0'.repeat(64),
          'd'.repeat(64),
        ),
      /CHECK constraint failed/,
    );

    db.prepare(
      `INSERT INTO call_records (
        stage_id, payload_kind, purpose_tag, model_id, repro_hash,
        git_commit_sha, iso_timestamp, request_payload, response_payload,
        finish_reason, prev_hash, current_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'stage1_understanding',
      'understanding',
      'hypothesis',
      'offline-replay-fixture',
      'a'.repeat(64),
      'b'.repeat(40),
      '2026-06-27T00:00:00Z',
      '{}',
      '{}',
      'stop',
      '0'.repeat(64),
      'd'.repeat(64),
    );

    assert.throws(
      () => db.prepare("UPDATE call_records SET stage_id = 'changed' WHERE seq = 1").run(),
      /append-only/,
    );
  } finally {
    db.close();
  }
});
