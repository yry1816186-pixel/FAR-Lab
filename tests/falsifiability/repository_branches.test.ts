// tests/falsifiability/repository_branches.test.ts
// Branch coverage boost for src/falsifiability/repository.ts (target 59% → 75%+).
//
// Uncovered branches mapped to their functions:
//
// assertRecordVerdictArgs (lines 298-317):
//   L299-301:  evidenceId.trim() === ''
//   L302-304:  parentVerdictId !== null && parentVerdictId.trim() === ''
//   L305-307:  metricValue !== null && !Number.isFinite(metricValue)
//   L308-310:  !Number.isInteger(conflictingEvidenceCount) || < 0
//
// assertConfirmedEvidenceExists (lines 329-343):
//   L339-343:  evidence_payload is empty string (DB NOT NULL → ''; trim()+length=0)
//
// parseVerdictTrace (lines 369-381):
//   L370-372:  value === null || typeof value !== 'object'
//   L376-378:  decisiveRuleId missing or empty
//
// parseStringArray (lines 383-392):
//   L384-386:  raw is not an array
//   L388-390:  item in array is not a string
//
// parseRuleTrace (lines 395-416):
//   L396-398:  raw is not an array
//   L400-402:  item is null or not object
//   L404-406:  item.ruleId missing or empty
//   L407-409:  item.triggered not boolean
//   L410-412:  item.details present but not string
//
// parseEvidenceSufficiency (lines 419-433):
//   L423-425:  raw is null or not object
//   L427-429:  status invalid
//   L430-432:  powerStatus invalid
//
// UNREACHABLE DEFENSE CODE (not tested):
//   L143-144:  recordVerdict readback null — INSERT succeeded but SELECT null (SQLite impossible)
//   L207-208:  supersedeVerdict UPDATE changes !== 1 — WHERE verdict_id=PK always matches 1
//   L211-212:  supersedeVerdict oldVerdict disappeared — defense in depth
//   L350:      parseVerdict invalid verdict — CHECK constraint + enum guard trigger prevents this
//   L357:      parseVerdictNodeKind invalid node_kind — CHECK constraint prevents this

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/migrator.ts';
import { GENESIS_PREV_HASH } from '../../src/evidence_log/types.ts';
import { ConfirmedEvidenceMissingError } from '../../src/falsifiability/errors.ts';
import {
  recordVerdict,
  getVerdict,
  getActiveVerdicts,
} from '../../src/falsifiability/repository.ts';
import type { RecordVerdictArgs } from '../../src/falsifiability/types.ts';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Minimal valid RecordVerdictArgs. Callers override specific fields to trigger validation errors. */
function makeArgs(overrides: Partial<RecordVerdictArgs> = {}): RecordVerdictArgs {
  return {
    evidenceId: 'E1',
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    verdict: 'INCONCLUSIVE',
    falsificationSpec: {
      prediction: 'test-prediction',
      metric: 'accuracy',
      falsificationThreshold: 0.95,
      thresholdSemantics: 'gt',
    },
    thresholdSpec: null,
    metricValue: null,
    conflictingEvidenceCount: 0,
    scopeSlipText: null,
    untestedReason: null,
    sourceAnchor: {
      gitCommitSha: 'a'.repeat(40),
      dashscopeRequestId: null,
      isoTimestamp: '2024-01-01T00:00:00Z',
      rawResponseHash: 'b'.repeat(64),
    },
    replayProver: null,
    verdictTrace: {
      reasonCodes: ['R1'],
      ruleTrace: [{ ruleId: 'r1', triggered: true }],
      decisiveRuleId: 'r1',
      evidenceSufficiency: { status: 'unknown', powerStatus: 'unknown' },
    },
    ...overrides,
  };
}

/** Valid falsification_spec JSON used by raw-INSERT tests so rowToVerdictNode parses past it. */
const VALID_FALSIFICATION_JSON = JSON.stringify({
  prediction: 'test',
  metric: 'accuracy',
  falsificationThreshold: 0.5,
  thresholdSemantics: 'gt',
});

/** Valid source_anchor JSON used by raw-INSERT tests so rowToVerdictNode parses past it. */
const VALID_SOURCE_ANCHOR_JSON = JSON.stringify({
  gitCommitSha: 'a'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2024-01-01T00:00:00Z',
  rawResponseHash: 'b'.repeat(64),
});

/**
 * Raw-INSERT a verdict_node row for parseVerdictTrace branch testing.
 * verdict_trace_json is provided explicitly; all other columns use valid
 * defaults so that rowToVerdictNode reaches parseVerdictTrace without
 * tripping over earlier parsers (falsificationSpec, sourceAnchor, etc.).
 */
function rawInsertVerdictNode(
  db: Database.Database,
  overrides: Partial<{
    verdictId: string;
    evidenceId: string;
    nodeKind: string;
    verdict: string;
    falsificationSpec: string;
    sourceAnchor: string;
    prevHash: string;
    currentHash: string;
    verdictTraceJson: string;
    thresholdSpec: string | null;
    replayProver: string | null;
  }> = {},
): void {
  const row = {
    verdictId: 'V_TEST',
    evidenceId: 'E_TEST',
    nodeKind: 'hypothesis',
    verdict: 'INCONCLUSIVE',
    falsificationSpec: VALID_FALSIFICATION_JSON,
    sourceAnchor: VALID_SOURCE_ANCHOR_JSON,
    prevHash: GENESIS_PREV_HASH,
    currentHash: '00'.repeat(32),
    verdictTraceJson: '{}',
    ...overrides,
  };
  db.prepare(`
    INSERT INTO verdict_nodes
      (verdict_id, evidence_id, node_kind, verdict, falsification_spec,
       source_anchor, prev_hash, current_hash, verdict_trace_json,
       threshold_spec, replay_prover)
    VALUES
      (@verdictId, @evidenceId, @nodeKind, @verdict, @falsificationSpec,
       @sourceAnchor, @prevHash, @currentHash, @verdictTraceJson,
       @thresholdSpec, @replayProver)
  `).run({
    verdictId: row.verdictId,
    evidenceId: row.evidenceId,
    nodeKind: row.nodeKind,
    verdict: row.verdict,
    falsificationSpec: row.falsificationSpec,
    sourceAnchor: row.sourceAnchor,
    prevHash: row.prevHash,
    currentHash: row.currentHash,
    verdictTraceJson: row.verdictTraceJson,
    thresholdSpec: row.thresholdSpec,
    replayProver: row.replayProver,
  });
}

// ===========================================================================
// Tests
// ===========================================================================

describe('recordVerdict: assertRecordVerdictArgs validation branches', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    db.pragma('foreign_keys = OFF');
  });
  afterEach(() => { db.close(); });

  // ---- evidenceId ----
  it('throws when evidenceId is empty string (line 299-301)', () => {
    assert.throws(
      () => recordVerdict(db, makeArgs({ evidenceId: '' })),
      { message: /evidenceId must be non-empty/ },
    );
  });

  it('throws when evidenceId is whitespace only', () => {
    assert.throws(
      () => recordVerdict(db, makeArgs({ evidenceId: '   ' })),
      { message: /evidenceId must be non-empty/ },
    );
  });

  // ---- parentVerdictId ----
  it('throws when parentVerdictId is empty string (not null) (line 302-304)', () => {
    assert.throws(
      () => recordVerdict(db, makeArgs({ parentVerdictId: '' })),
      { message: /parentVerdictId must be null or non-empty/ },
    );
  });

  it('throws when parentVerdictId is whitespace only', () => {
    assert.throws(
      () => recordVerdict(db, makeArgs({ parentVerdictId: '  ' })),
      { message: /parentVerdictId must be null or non-empty/ },
    );
  });

  it('accepts parentVerdictId = null (valid)', () => {
    const node = recordVerdict(db, makeArgs({ parentVerdictId: null }));
    assert.equal(node.parentVerdictId, null);
    assert.equal(node.verdict, 'INCONCLUSIVE');
  });

  // ---- metricValue ----
  it('throws when metricValue is Infinity (line 305-307)', () => {
    assert.throws(
      () => recordVerdict(db, makeArgs({ metricValue: Infinity })),
      { message: /metricValue must be finite or null/ },
    );
  });

  it('throws when metricValue is NaN', () => {
    assert.throws(
      () => recordVerdict(db, makeArgs({ metricValue: NaN })),
      { message: /metricValue must be finite or null/ },
    );
  });

  it('throws when metricValue is -Infinity', () => {
    assert.throws(
      () => recordVerdict(db, makeArgs({ metricValue: -Infinity })),
      { message: /metricValue must be finite or null/ },
    );
  });

  it('accepts metricValue = null (valid)', () => {
    const node = recordVerdict(db, makeArgs({ metricValue: null }));
    assert.equal(node.metricValue, null);
  });

  it('accepts metricValue = 0 (valid finite)', () => {
    const node = recordVerdict(db, makeArgs({ metricValue: 0 }));
    assert.equal(node.metricValue, 0);
  });

  // ---- conflictingEvidenceCount ----
  it('throws when conflictingEvidenceCount is negative (line 308-310)', () => {
    assert.throws(
      () => recordVerdict(db, makeArgs({ conflictingEvidenceCount: -1 })),
      { message: /conflictingEvidenceCount must be a non-negative integer/ },
    );
  });

  it('throws when conflictingEvidenceCount is a float (not integer)', () => {
    assert.throws(
      () => recordVerdict(db, makeArgs({ conflictingEvidenceCount: 1.5 })),
      { message: /conflictingEvidenceCount must be a non-negative integer/ },
    );
  });

  it('accepts conflictingEvidenceCount = 0 (valid)', () => {
    const node = recordVerdict(db, makeArgs({ conflictingEvidenceCount: 0 }));
    assert.equal(node.conflictingEvidenceCount, 0);
  });

  it('accepts conflictingEvidenceCount = 5 (valid)', () => {
    const node = recordVerdict(db, makeArgs({ conflictingEvidenceCount: 5 }));
    assert.equal(node.conflictingEvidenceCount, 5);
  });
});

// ---------------------------------------------------------------------------

describe('recordVerdict: assertConfirmedEvidenceExists empty-payload branch', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    db.pragma('foreign_keys = OFF');
  });
  afterEach(() => { db.close(); });

  it('throws ConfirmedEvidenceMissingError when evidence_payload is empty (line 339-343)', () => {
    // Insert an evidence_log row with an empty evidence_payload.
    // evidence_payload is TEXT NOT NULL but '' passes the NOT NULL constraint;
    // assertConfirmedEvidenceExists sees ''.trim().length === 0 and throws.
    db.prepare(`
      INSERT INTO evidence_log
        (evidence_id, call_record_seq, stage_id, payload_kind,
         evidence_payload, source_anchor, source_anchor_git,
         source_anchor_req, source_anchor_ts)
      VALUES
        ('E_CONF', 1, 'S1', 'hypothesis',
         '', '{}', 'git-sha', null, '2024-01-01T00:00:00Z')
    `).run();

    assert.throws(
      () => recordVerdict(db, makeArgs({
        evidenceId: 'E_CONF',
        verdict: 'CONFIRMED',
      })),
      (err: unknown) =>
        err instanceof ConfirmedEvidenceMissingError &&
        /non-empty evidence_payload/.test((err as Error).message) &&
        /E_CONF/.test((err as Error).message),
    );
  });

  it('throws ConfirmedEvidenceMissingError when evidence_log row is missing entirely (line 333-337)', () => {
    // No evidence_log row exists at all → assertConfirmedEvidenceExists
    // finds row === undefined → throws.
    assert.throws(
      () => recordVerdict(db, makeArgs({
        evidenceId: 'E_MISSING',
        verdict: 'CONFIRMED',
      })),
      ConfirmedEvidenceMissingError,
    );
  });
});

// ---------------------------------------------------------------------------
// parseVerdictTrace / parseStringArray / parseRuleTrace / parseEvidenceSufficiency
// These are tested by raw-INSERTing verdict_nodes with bad verdict_trace_json
// and calling getVerdict() which triggers rowToVerdictNode→parseVerdictTrace.
// ---------------------------------------------------------------------------

describe('rowToVerdictNode → parseVerdictTrace error paths via getVerdict', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    db.pragma('foreign_keys = OFF');
  });
  afterEach(() => { db.close(); });

  // ---- parseVerdictTrace: null / non-object (lines 370-372) ----
  it('throws when verdict_trace_json parses to null (line 370-372)', () => {
    rawInsertVerdictNode(db, { verdictTraceJson: 'null' });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /verdict_trace_json must be an object/ },
    );
  });

  it('throws when verdict_trace_json parses to a primitive (line 370-372)', () => {
    rawInsertVerdictNode(db, { verdictTraceJson: '123' });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /verdict_trace_json must be an object/ },
    );
  });

  // ---- parseVerdictTrace: decisiveRuleId (lines 376-378) ----
  it('throws when decisiveRuleId is missing from trace object (line 376-378)', () => {
    const trace = { reasonCodes: ['R1'], ruleTrace: [{ ruleId: 'r1', triggered: true }], evidenceSufficiency: { status: 'unknown', powerStatus: 'unknown' } };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /decisiveRuleId must be non-empty string/ },
    );
  });

  it('throws when decisiveRuleId is empty string (line 376-378)', () => {
    const trace = { reasonCodes: ['R1'], ruleTrace: [{ ruleId: 'r1', triggered: true }], decisiveRuleId: '', evidenceSufficiency: { status: 'unknown', powerStatus: 'unknown' } };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /decisiveRuleId must be non-empty string/ },
    );
  });

  // ---- parseStringArray: not array (lines 384-386) ----
  it('throws when reasonCodes is not an array (line 384-386)', () => {
    const trace = { reasonCodes: 'not-an-array', ruleTrace: [{ ruleId: 'r1', triggered: true }], decisiveRuleId: 'd1', evidenceSufficiency: { status: 'unknown', powerStatus: 'unknown' } };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /reasonCodes must be array/ },
    );
  });

  // ---- parseStringArray: item not string (lines 388-390) ----
  it('throws when reasonCodes contains a non-string item (line 388-390)', () => {
    const trace = { reasonCodes: [123], ruleTrace: [{ ruleId: 'r1', triggered: true }], decisiveRuleId: 'd1', evidenceSufficiency: { status: 'unknown', powerStatus: 'unknown' } };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /reasonCodes\[0\] must be string/ },
    );
  });

  // ---- parseRuleTrace: not array (lines 396-398) ----
  it('throws when ruleTrace is not an array (line 396-398)', () => {
    const trace = { reasonCodes: ['R1'], ruleTrace: 'not-an-array', decisiveRuleId: 'd1', evidenceSufficiency: { status: 'unknown', powerStatus: 'unknown' } };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /ruleTrace must be array/ },
    );
  });

  // ---- parseRuleTrace: item null (lines 400-402) ----
  it('throws when ruleTrace[0] is null (line 400-402)', () => {
    const trace = { reasonCodes: ['R1'], ruleTrace: [null], decisiveRuleId: 'd1', evidenceSufficiency: { status: 'unknown', powerStatus: 'unknown' } };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /ruleTrace\[0\] must be object/ },
    );
  });

  // ---- parseRuleTrace: item not object (lines 400-402) ----
  it('throws when ruleTrace[0] is a primitive (line 400-402)', () => {
    const trace = { reasonCodes: ['R1'], ruleTrace: ['not-an-object'], decisiveRuleId: 'd1', evidenceSufficiency: { status: 'unknown', powerStatus: 'unknown' } };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /ruleTrace\[0\] must be object/ },
    );
  });

  // ---- parseRuleTrace: ruleId missing (lines 404-406) ----
  it('throws when ruleTrace[0].ruleId is missing (line 404-406)', () => {
    const trace = { reasonCodes: ['R1'], ruleTrace: [{ triggered: true }], decisiveRuleId: 'd1', evidenceSufficiency: { status: 'unknown', powerStatus: 'unknown' } };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /ruleTrace\[0\]\.ruleId must be non-empty string/ },
    );
  });

  // ---- parseRuleTrace: ruleId empty (lines 404-406) ----
  it('throws when ruleTrace[0].ruleId is empty string (line 404-406)', () => {
    const trace = { reasonCodes: ['R1'], ruleTrace: [{ ruleId: '', triggered: true }], decisiveRuleId: 'd1', evidenceSufficiency: { status: 'unknown', powerStatus: 'unknown' } };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /ruleTrace\[0\]\.ruleId must be non-empty string/ },
    );
  });

  // ---- parseRuleTrace: triggered not boolean (lines 407-409) ----
  it('throws when ruleTrace[0].triggered is not boolean (line 407-409)', () => {
    const trace = { reasonCodes: ['R1'], ruleTrace: [{ ruleId: 'r1', triggered: 'yes' }], decisiveRuleId: 'd1', evidenceSufficiency: { status: 'unknown', powerStatus: 'unknown' } };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /ruleTrace\[0\]\.triggered must be boolean/ },
    );
  });

  it('throws when ruleTrace[0].triggered is a number (line 407-409)', () => {
    const trace = { reasonCodes: ['R1'], ruleTrace: [{ ruleId: 'r1', triggered: 1 }], decisiveRuleId: 'd1', evidenceSufficiency: { status: 'unknown', powerStatus: 'unknown' } };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /ruleTrace\[0\]\.triggered must be boolean/ },
    );
  });

  // ---- parseRuleTrace: details present but not string (lines 410-412) ----
  it('throws when ruleTrace[0].details is present but not a string (line 410-412)', () => {
    const trace = { reasonCodes: ['R1'], ruleTrace: [{ ruleId: 'r1', triggered: true, details: 123 }], decisiveRuleId: 'd1', evidenceSufficiency: { status: 'unknown', powerStatus: 'unknown' } };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /ruleTrace\[0\]\.details must be string if present/ },
    );
  });

  it('accepts ruleTrace[0].details string (valid optional field)', () => {
    const trace = { reasonCodes: ['R1'], ruleTrace: [{ ruleId: 'r1', triggered: true, details: 'some detail' }], decisiveRuleId: 'd1', evidenceSufficiency: { status: 'unknown', powerStatus: 'unknown' } };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    const node = getVerdict(db, 'V_TEST');
    assert.ok(node !== null);
    assert.equal(node.verdictTrace.ruleTrace.length, 1);
    const step = node.verdictTrace.ruleTrace[0];
    assert.ok(step !== undefined);
    assert.equal(step.ruleId, 'r1');
    assert.equal(step.triggered, true);
    assert.equal(step.details, 'some detail');
  });

  // ---- parseEvidenceSufficiency: null / not object (lines 423-425) ----
  it('throws when evidenceSufficiency is null (line 423-425)', () => {
    const trace = { reasonCodes: ['R1'], ruleTrace: [{ ruleId: 'r1', triggered: true }], decisiveRuleId: 'd1', evidenceSufficiency: null };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /evidenceSufficiency must be object/ },
    );
  });

  it('throws when evidenceSufficiency is not an object (line 423-425)', () => {
    const trace = { reasonCodes: ['R1'], ruleTrace: [{ ruleId: 'r1', triggered: true }], decisiveRuleId: 'd1', evidenceSufficiency: 123 };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /evidenceSufficiency must be object/ },
    );
  });

  // ---- parseEvidenceSufficiency: status invalid (lines 427-429) ----
  it('throws when evidenceSufficiency.status is invalid (line 427-429)', () => {
    const trace = { reasonCodes: ['R1'], ruleTrace: [{ ruleId: 'r1', triggered: true }], decisiveRuleId: 'd1', evidenceSufficiency: { status: 'bad-status', powerStatus: 'unknown' } };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /evidenceSufficiency\.status invalid/ },
    );
  });

  it('throws when evidenceSufficiency.status is not a string (line 427-429)', () => {
    const trace = { reasonCodes: ['R1'], ruleTrace: [{ ruleId: 'r1', triggered: true }], decisiveRuleId: 'd1', evidenceSufficiency: { status: 42, powerStatus: 'unknown' } };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /evidenceSufficiency\.status invalid/ },
    );
  });

  // ---- parseEvidenceSufficiency: powerStatus invalid (lines 430-432) ----
  it('throws when evidenceSufficiency.powerStatus is invalid (line 430-432)', () => {
    const trace = { reasonCodes: ['R1'], ruleTrace: [{ ruleId: 'r1', triggered: true }], decisiveRuleId: 'd1', evidenceSufficiency: { status: 'unknown', powerStatus: 'bad-power' } };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /evidenceSufficiency\.powerStatus invalid/ },
    );
  });

  it('throws when evidenceSufficiency.powerStatus is not a string (line 430-432)', () => {
    const trace = { reasonCodes: ['R1'], ruleTrace: [{ ruleId: 'r1', triggered: true }], decisiveRuleId: 'd1', evidenceSufficiency: { status: 'unknown', powerStatus: false } };
    rawInsertVerdictNode(db, { verdictTraceJson: JSON.stringify(trace) });
    assert.throws(
      () => getVerdict(db, 'V_TEST'),
      { message: /evidenceSufficiency\.powerStatus invalid/ },
    );
  });

  // ---- getActiveVerdicts: happy path with valid trace (smoke) ----
  it('getActiveVerdicts returns empty array when no verdicts', () => {
    const active = getActiveVerdicts(db);
    assert.equal(active.length, 0);
  });
});
