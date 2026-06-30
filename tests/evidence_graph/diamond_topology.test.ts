import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  CycleDetectedError,
  addCycleGuard,
  hasPath,
  insertEdge,
} from '../../src/evidence_graph/index.ts';

const ddl = readFileSync(new URL('../../schema/migrations/0001_initial.sql', import.meta.url), 'utf8');
const sourceAnchor = '{}';

function openGraphDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(ddl);
  for (const node of ['A', 'B', 'C', 'D', 'L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10']) {
    insertVerdictNode(db, node);
  }
  return db;
}

function insertVerdictNode(db: Database.Database, verdictId: string): void {
  const callSeq = db
    .prepare(
      `INSERT INTO call_records (
        stage_id, payload_kind, purpose_tag, model_id, repro_hash,
        git_commit_sha, iso_timestamp, request_payload, response_payload,
        finish_reason, prev_hash, current_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'stage1_understanding',
      'understanding',
      'hypothesis',
      'offline-replay-fixture',
      '1'.repeat(64),
      '2'.repeat(40),
      '2026-06-27T00:00:00Z',
      '{}',
      '{}',
      'stop',
      '0'.repeat(64),
      `${verdictId}3`.padEnd(64, '3').slice(0, 64),
    ).lastInsertRowid;

  db.prepare(
    `INSERT INTO evidence_log (
      evidence_id, call_record_seq, stage_id, payload_kind, evidence_payload,
      source_anchor, source_anchor_git, source_anchor_req, source_anchor_ts
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `ev-${verdictId}`,
    callSeq,
    'stage1_understanding',
    'understanding',
    '{}',
    '{}',
    '2'.repeat(40),
    null,
    '2026-06-27T00:00:00Z',
  );

  db.prepare(
    `INSERT INTO verdict_nodes (
      verdict_id, evidence_id, node_kind, verdict, falsification_spec,
      untested_reason, source_anchor, prev_hash, current_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    verdictId,
    `ev-${verdictId}`,
    'hypothesis',
    'UNTESTED',
    '{}',
    'fixture node for graph topology',
    '{}',
    '0'.repeat(64),
    `${verdictId}4`.padEnd(64, '4').slice(0, 64),
  );
}

test('legal diamond topology A->B, A->C, B->D, C->D is accepted', () => {
  const db = openGraphDb();
  try {
    assert.doesNotThrow(() =>
      insertEdge(db, { fromNode: 'A', toNode: 'B', edgeKind: 'derives_from', sourceAnchor }),
    );
    assert.doesNotThrow(() =>
      insertEdge(db, { fromNode: 'A', toNode: 'C', edgeKind: 'derives_from', sourceAnchor }),
    );
    assert.doesNotThrow(() =>
      insertEdge(db, { fromNode: 'B', toNode: 'D', edgeKind: 'derives_from', sourceAnchor }),
    );
    assert.doesNotThrow(() =>
      insertEdge(db, { fromNode: 'C', toNode: 'D', edgeKind: 'derives_from', sourceAnchor }),
    );

    assert.equal(hasPath(db, 'A', 'D'), true);
    assert.equal(hasPath(db, 'D', 'A'), false);
  } finally {
    db.close();
  }
});

test('reverse edge D->A in the diamond is rejected as a cycle', () => {
  const db = openGraphDb();
  try {
    insertEdge(db, { fromNode: 'A', toNode: 'B', edgeKind: 'derives_from', sourceAnchor });
    insertEdge(db, { fromNode: 'A', toNode: 'C', edgeKind: 'derives_from', sourceAnchor });
    insertEdge(db, { fromNode: 'B', toNode: 'D', edgeKind: 'derives_from', sourceAnchor });
    insertEdge(db, { fromNode: 'C', toNode: 'D', edgeKind: 'derives_from', sourceAnchor });

    assert.throws(
      () => addCycleGuard(db, 'D', 'A'),
      (error: unknown) =>
        error instanceof CycleDetectedError && error.fromId === 'D' && error.toId === 'A',
    );
    assert.throws(
      () => insertEdge(db, { fromNode: 'D', toNode: 'A', edgeKind: 'iterates', sourceAnchor }),
      CycleDetectedError,
    );
  } finally {
    db.close();
  }
});

test('SQL_HAS_PATH stays fast on a depth-10 chain', () => {
  const db = openGraphDb();
  try {
    for (let index = 0; index < 10; index += 1) {
      insertEdge(db, {
        fromNode: `L${index}`,
        toNode: `L${index + 1}`,
        edgeKind: 'derives_from',
        sourceAnchor,
      });
    }

    const start = Date.now();
    assert.throws(() => addCycleGuard(db, 'L10', 'L0'), CycleDetectedError);
    assert.ok(Date.now() - start < 100);
  } finally {
    db.close();
  }
});
