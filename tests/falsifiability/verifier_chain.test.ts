// tests/falsifiability/verifier_chain.test.ts
// Branch coverage boost: verifyVerdictNodes error paths (prev_hash chain break + current_hash tamper).
//
// verifyVerdictNodes (src/falsifiability/verifier.ts) recomputes each verdict_node's current_hash
// and checks the prev_hash → current_hash chain linkage. The happy path (valid chain → ok=true)
// is covered by integration tests; this file covers the two error return branches:
//   1. prev_hash mismatch (chain break at a node)
//   2. recomputed current_hash ≠ stored current_hash (hash tamper)
//
// DB setup: in-memory SQLite + runMigrations + PRAGMA foreign_keys=OFF (we insert verdict_nodes
// directly without the evidence_log parent that the FK normally requires; verifier.ts only reads
// verdict_nodes, not evidence_log, so FK absence does not affect the logic under test).
// verdict='INCONCLUSIVE' avoids the CONFIRMED-requires-evidence + UNTESTED-requires-reason triggers.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/migrator.ts';
import { hashCanonicalJson } from '../../src/evidence_log/hasher.ts';
import { GENESIS_PREV_HASH } from '../../src/evidence_log/types.ts';
import { verifyVerdictNodes } from '../../src/falsifiability/verifier.ts';

/** Recompute the verdict_node current_hash using the exact same field set as recomputeVerdictHash. */
function computeVerdictHash(fields: {
  verdictId: string;
  evidenceId: string;
  nodeKind: string;
  verdict: string;
  falsificationSpec: string;
  thresholdSpec: string | null;
  sourceAnchor: string;
  prevHash: string;
  verdictTraceHash: string;
}): string {
  return hashCanonicalJson({
    verdictId: fields.verdictId,
    evidenceId: fields.evidenceId,
    nodeKind: fields.nodeKind,
    verdict: fields.verdict,
    falsificationSpecJson: fields.falsificationSpec,
    thresholdSpecJson: fields.thresholdSpec,
    sourceAnchorJson: fields.sourceAnchor,
    prevHash: fields.prevHash,
    verdictTraceHash: fields.verdictTraceHash,
  });
}

interface InsertArgs {
  verdictId: string;
  evidenceId: string;
  nodeKind: string;
  verdict: string;
  falsificationSpec: string;
  thresholdSpec: string | null;
  sourceAnchor: string;
  prevHash: string;
  verdictTraceHash: string;
  currentHash?: string; // override for tamper tests
}

function insertVerdictNode(db: Database.Database, args: InsertArgs): void {
  const currentHash = args.currentHash ?? computeVerdictHash(args);
  db.prepare(
    `INSERT INTO verdict_nodes
       (verdict_id, evidence_id, node_kind, verdict, falsification_spec, threshold_spec,
        source_anchor, verdict_trace_hash, verdict_trace_json, prev_hash, current_hash)
     VALUES (@verdictId, @evidenceId, @nodeKind, @verdict, @falsificationSpec, @thresholdSpec,
        @sourceAnchor, @verdictTraceHash, '{}', @prevHash, @currentHash)`,
  ).run({ ...args, currentHash });
}

describe('verifyVerdictNodes: chain integrity error paths', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    // runMigrations forces foreign_keys=ON (migrator.ts:42); we disable it after migration
    // so we can insert verdict_nodes without the evidence_log parent FK (verifier.ts only
    // reads verdict_nodes, not evidence_log, so the FK absence does not affect the logic).
    db.pragma('foreign_keys = OFF');
  });
  afterEach(() => {
    db.close();
  });

  it('empty chain (no verdict_nodes) → ok=true, verifiedCount=0', () => {
    const result = verifyVerdictNodes(db);
    assert.equal(result.ok, true);
    assert.equal(result.verifiedCount, 0);
    assert.equal(result.brokenAtVerdictId, null);
  });

  it('valid single-node chain (genesis → node1) → ok=true, verifiedCount=1', () => {
    insertVerdictNode(db, {
      verdictId: 'V1',
      evidenceId: 'E1',
      nodeKind: 'hypothesis',
      verdict: 'INCONCLUSIVE',
      falsificationSpec: '{"spec":"test"}',
      thresholdSpec: null,
      sourceAnchor: '{"doi":"10.1/test"}',
      prevHash: GENESIS_PREV_HASH,
      verdictTraceHash: 'abc123',
    });
    const result = verifyVerdictNodes(db);
    assert.equal(result.ok, true);
    assert.equal(result.verifiedCount, 1);
  });

  it('valid two-node chain (genesis → V1 → V2) → ok=true, verifiedCount=2', () => {
    const v1Fields = {
      verdictId: 'V1', evidenceId: 'E1', nodeKind: 'hypothesis', verdict: 'INCONCLUSIVE',
      falsificationSpec: '{}', thresholdSpec: null, sourceAnchor: '{}',
      prevHash: GENESIS_PREV_HASH, verdictTraceHash: 'h1',
    };
    const v1Hash = computeVerdictHash(v1Fields);
    insertVerdictNode(db, v1Fields);
    insertVerdictNode(db, {
      verdictId: 'V2', evidenceId: 'E2', nodeKind: 'evidence', verdict: 'INCONCLUSIVE',
      falsificationSpec: '{}', thresholdSpec: null, sourceAnchor: '{}',
      prevHash: v1Hash, verdictTraceHash: 'h2',
    });
    const result = verifyVerdictNodes(db);
    assert.equal(result.ok, true);
    assert.equal(result.verifiedCount, 2);
  });

  it('prev_hash mismatch (chain break) → ok=false, brokenAtVerdictId identifies the node', () => {
    // V1 links to genesis correctly, but V2 claims a wrong prev_hash (not V1's current_hash).
    const v1Fields = {
      verdictId: 'V1', evidenceId: 'E1', nodeKind: 'hypothesis', verdict: 'INCONCLUSIVE',
      falsificationSpec: '{}', thresholdSpec: null, sourceAnchor: '{}',
      prevHash: GENESIS_PREV_HASH, verdictTraceHash: 'h1',
    };
    const v1Hash = computeVerdictHash(v1Fields);
    insertVerdictNode(db, v1Fields);
    insertVerdictNode(db, {
      verdictId: 'V2', evidenceId: 'E2', nodeKind: 'evidence', verdict: 'INCONCLUSIVE',
      falsificationSpec: '{}', thresholdSpec: null, sourceAnchor: '{}',
      prevHash: 'deadbeef'.repeat(8), // wrong prev_hash — does NOT match V1.current_hash
      verdictTraceHash: 'h2',
    });
    const result = verifyVerdictNodes(db);
    assert.equal(result.ok, false);
    assert.equal(result.brokenAtVerdictId, 'V2');
    assert.equal(result.actualHash, 'deadbeef'.repeat(8));
    assert.equal(result.expectedHash, v1Hash);
    assert.equal(result.verifiedCount, 1); // V1 verified before the break
  });

  it('current_hash tamper (recomputed ≠ stored) → ok=false, brokenAtVerdictId identifies the node', () => {
    // V1 has a valid prev_hash (genesis) but a tampered current_hash.
    insertVerdictNode(db, {
      verdictId: 'V1', evidenceId: 'E1', nodeKind: 'hypothesis', verdict: 'INCONCLUSIVE',
      falsificationSpec: '{}', thresholdSpec: null, sourceAnchor: '{}',
      prevHash: GENESIS_PREV_HASH, verdictTraceHash: 'h1',
      currentHash: '00'.repeat(32), // tampered — does not match recomputed hash
    });
    const result = verifyVerdictNodes(db);
    assert.equal(result.ok, false);
    assert.equal(result.brokenAtVerdictId, 'V1');
    assert.equal(result.actualHash, '00'.repeat(32));
    assert.equal(result.verifiedCount, 0); // nothing verified before tamper detected
  });

  it('first node prev_hash ≠ genesis → ok=false (chain must start at genesis)', () => {
    insertVerdictNode(db, {
      verdictId: 'V1', evidenceId: 'E1', nodeKind: 'hypothesis', verdict: 'INCONCLUSIVE',
      falsificationSpec: '{}', thresholdSpec: null, sourceAnchor: '{}',
      prevHash: 'not-genesis'.repeat(4), // wrong — must be GENESIS_PREV_HASH
      verdictTraceHash: 'h1',
    });
    const result = verifyVerdictNodes(db);
    assert.equal(result.ok, false);
    assert.equal(result.brokenAtVerdictId, 'V1');
    assert.equal(result.verifiedCount, 0);
  });
});
