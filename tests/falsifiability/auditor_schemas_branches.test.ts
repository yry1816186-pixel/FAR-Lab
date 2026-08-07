/**
 * auditor_schemas_branches.test.ts — branch coverage boost for
 * src/falsifiability/auditor.ts (76.00% → target) and
 * src/falsifiability/schemas.ts (78.72% → target).
 *
 * auditor.ts uncovered lines: 96-97 (short impl WARN), 125-126 (NaN/Inf threshold FAIL),
 *   135-136 (alpha out of range FAIL), 138-139 (invalid seed FAIL), 166-167 (UNREACHABLE:
 *   AUDITOR_ENABLED=true as const).
 *
 * schemas.ts uncovered lines: 118-122 (parseJsonObject catch), 129 (invalid semantics throw),
 *   177 (optionalString non-string throw), 189-192 (optionalNullableString string + non-string
 *   throw), 215 (optionalFiniteNumber NaN throw).
 *
 * 零容忍合规: 无 any / @ts-ignore / 空 catch / 桩。noUncheckedIndexedAccess: 数组访问用
 * destructuring + assert.ok 窄化。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/index.ts';
import {
  auditContract,
  registerContract,
} from '../../src/falsifiability/index.ts';
import {
  parseFalsificationSpec,
  parseJsonObject,
  parseReplayProver,
  parseSourceAnchor,
  parseThresholdSpec,
} from '../../src/falsifiability/schemas.ts';
import type { FalsifiabilityContract } from '../../src/falsifiability/index.ts';

// ---------------------------------------------------------------------------
// DB helpers (same pattern as auditor.test.ts)
// ---------------------------------------------------------------------------

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  // FK ON _after_ migrations (migrator.ts:42 forces ON, this is a no-op reassertion)
  db.pragma('foreign_keys = ON');
  return db;
}

const GENESIS_HASH = '0'.repeat(64);

function makeContract(db: Database.Database): FalsifiabilityContract {
  return registerContract(db, {
    claimId: 'claim-branch-test',
    measurableImplication:
      '若 BLS period 信号显著则 odd-even depth 超过探测阈值 (when SNR high then depth observable)',
    metric: 'bls_snr',
    comparator: 'gt',
    thresholdValue: 7.0,
    compiledAt: '2026-06-30T00:00:00.000Z',
  });
}

// =========================================================================
// auditor.ts branch coverage
// =========================================================================

describe('auditor.ts: RULE-FS-001 short measurable_implication → WARN (lines 96-97)', () => {
  it('measurableImplication trimmed length 1-9 produces WARN', () => {
    const db = openDb();
    try {
      const contract = makeContract(db);
      // 'short' has trimmed length 5, below the 10-char threshold
      const shortContract: FalsifiabilityContract = {
        ...contract,
        measurableImplication: 'short',
      };
      const result = auditContract(db, shortContract, GENESIS_HASH);
      const [fs001] = result.events;
      assert.ok(fs001);
      assert.equal(fs001.ruleId, 'RULE-FS-001');
      assert.equal(fs001.outcome, 'WARN');
      assert.match(fs001.detail, /too short/);
    } finally {
      db.close();
    }
  });
});

describe('auditor.ts: RULE-FS-002 NaN/Infinity thresholdValue → FAIL (lines 125-126)', () => {
  it('NaN thresholdValue triggers FAIL', () => {
    const db = openDb();
    try {
      const contract = makeContract(db);
      const nanContract: FalsifiabilityContract = {
        ...contract,
        thresholdValue: NaN,
      };
      const result = auditContract(db, nanContract, GENESIS_HASH);
      const [, , fs002] = result.events;
      assert.ok(fs002);
      assert.equal(fs002.ruleId, 'RULE-FS-002');
      assert.equal(fs002.outcome, 'FAIL');
      assert.match(fs002.detail, /NaN|non-finite/);
    } finally {
      db.close();
    }
  });

  it('Infinity thresholdValue triggers FAIL', () => {
    const db = openDb();
    try {
      const contract = makeContract(db);
      const infContract: FalsifiabilityContract = {
        ...contract,
        thresholdValue: Infinity,
      };
      const result = auditContract(db, infContract, GENESIS_HASH);
      const [, , fs002] = result.events;
      assert.ok(fs002);
      assert.equal(fs002.ruleId, 'RULE-FS-002');
      assert.equal(fs002.outcome, 'FAIL');
    } finally {
      db.close();
    }
  });
});

describe('auditor.ts: RULE-FS-003 alpha out of range → FAIL (lines 135-136)', () => {
  it('alpha=0 triggers FAIL (alpha <= 0)', () => {
    const db = openDb();
    try {
      const contract = makeContract(db);
      const zeroAlpha: FalsifiabilityContract = { ...contract, alpha: 0 };
      const result = auditContract(db, zeroAlpha, GENESIS_HASH);
      const [, , , fs003] = result.events;
      assert.ok(fs003);
      assert.equal(fs003.ruleId, 'RULE-FS-003');
      assert.equal(fs003.outcome, 'FAIL');
      assert.match(fs003.detail, /alpha=0/);
    } finally {
      db.close();
    }
  });

  it('alpha=1 triggers FAIL (alpha >= 1)', () => {
    const db = openDb();
    try {
      const contract = makeContract(db);
      const oneAlpha: FalsifiabilityContract = { ...contract, alpha: 1 };
      const result = auditContract(db, oneAlpha, GENESIS_HASH);
      const [, , , fs003] = result.events;
      assert.ok(fs003);
      assert.equal(fs003.outcome, 'FAIL');
      assert.match(fs003.detail, /alpha=1/);
    } finally {
      db.close();
    }
  });

  it('negative alpha triggers FAIL (alpha < 0)', () => {
    const db = openDb();
    try {
      const contract = makeContract(db);
      const negAlpha: FalsifiabilityContract = { ...contract, alpha: -0.1 };
      const result = auditContract(db, negAlpha, GENESIS_HASH);
      const [, , , fs003] = result.events;
      assert.ok(fs003);
      assert.equal(fs003.outcome, 'FAIL');
      assert.match(fs003.detail, /alpha=-0\.1/);
    } finally {
      db.close();
    }
  });
});

describe('auditor.ts: RULE-FS-003 invalid seed → FAIL (lines 138-139)', () => {
  it('non-integer seed (3.14) triggers FAIL', () => {
    const db = openDb();
    try {
      const contract = makeContract(db);
      const floatSeed: FalsifiabilityContract = { ...contract, seed: 3.14 };
      const result = auditContract(db, floatSeed, GENESIS_HASH);
      const [, , , fs003] = result.events;
      assert.ok(fs003);
      assert.equal(fs003.ruleId, 'RULE-FS-003');
      assert.equal(fs003.outcome, 'FAIL');
      assert.match(fs003.detail, /seed=3\.14/);
    } finally {
      db.close();
    }
  });

  it('negative seed (-1) triggers FAIL', () => {
    const db = openDb();
    try {
      const contract = makeContract(db);
      const negSeed: FalsifiabilityContract = { ...contract, seed: -1 };
      const result = auditContract(db, negSeed, GENESIS_HASH);
      const [, , , fs003] = result.events;
      assert.ok(fs003);
      assert.equal(fs003.outcome, 'FAIL');
      assert.match(fs003.detail, /seed=-1/);
    } finally {
      db.close();
    }
  });
});

// NOTE: auditor.ts lines 166-167 (AUDITOR_ENABLED false branch) is UNREACHABLE.
// AUDITOR_ENABLED is `true as const` — a compile-time constant. TypeScript dead-code
// elimination removes the `if (!true)` branch. No test can reach it without patching
// module source (which is forbidden by scope).

// =========================================================================
// schemas.ts branch coverage
// =========================================================================

describe('schemas.ts: parseJsonObject invalid JSON → catch Error branch (lines 118-119)', () => {
  it('malformed JSON triggers Error with context prefix', () => {
    assert.throws(
      () => parseJsonObject('{invalid}', 'test-ctx'),
      /test-ctx: invalid JSON:/,
    );
  });

  it('unclosed brace triggers catch', () => {
    assert.throws(
      () => parseJsonObject('{"a":1', 'ctx'),
      /ctx: invalid JSON:/,
    );
  });

  it('trailing garbage triggers catch', () => {
    assert.throws(
      () => parseJsonObject('{}garbage', 'ctx'),
      /ctx: invalid JSON:/,
    );
  });
});

// NOTE: schemas.ts line 121 (non-Error catch branch) is UNREACHABLE.
// JSON.parse always throws SyntaxError, which extends Error. The `error instanceof Error`
// check at line 118 is always `true` for JSON.parse. Line 121 would only be reachable
// if a non-Error value were thrown, which standard engines never do for JSON.parse.

describe('schemas.ts: parseThresholdSemantics invalid value → throw (line 129)', () => {
  it('invalid semantics via parseFalsificationSpec throws', () => {
    assert.throws(
      () =>
        parseFalsificationSpec({
          prediction: 'p',
          metric: 'm',
          falsificationThreshold: 0.5,
          thresholdSemantics: 'invalid_value',
        }),
      /thresholdSemantics must be one of gt, lt, range/,
    );
  });

  it('invalid semantics via parseThresholdSpec throws', () => {
    assert.throws(
      () => parseThresholdSpec({ semantics: 'bad' }),
      /semantics must be one of gt, lt, range/,
    );
  });
});

describe('schemas.ts: optionalString non-string value → throw (line 177)', () => {
  it('non-string expectedResponseHash via parseReplayProver throws', () => {
    assert.throws(
      () =>
        parseReplayProver({
          modelSnapshot: 'm',
          messages: [],
          seed: 1,
          params: {},
          expectedResponseHash: 123,
        }),
      /expectedResponseHash must be a string when present/,
    );
  });

  it('boolean expectedResponseHash via parseReplayProver throws', () => {
    assert.throws(
      () =>
        parseReplayProver({
          modelSnapshot: 'm',
          messages: [],
          seed: 1,
          params: {},
          expectedResponseHash: true,
        }),
      /expectedResponseHash must be a string when present/,
    );
  });
});

describe('schemas.ts: optionalNullableString branch coverage (lines 186-192)', () => {
  it('non-string non-null dashscopeRequestId throws via parseSourceAnchor (line 192)', () => {
    assert.throws(
      () =>
        parseSourceAnchor({
          gitCommitSha: 'a'.repeat(40),
          isoTimestamp: '2026-01-01T00:00:00.000Z',
          rawResponseHash: 'h'.repeat(64),
          dashscopeRequestId: 456,
        }),
      /dashscopeRequestId must be a string or null/,
    );
  });

  it('string dashscopeRequestId returns as-is (lines 189-190)', () => {
    const result = parseSourceAnchor({
      gitCommitSha: 'a'.repeat(40),
      isoTimestamp: '2026-01-01T00:00:00.000Z',
      rawResponseHash: 'h'.repeat(64),
      dashscopeRequestId: 'req-789',
    });
    assert.equal(result.dashscopeRequestId, 'req-789');
  });

  it('null dashscopeRequestId returns null (line 186-187)', () => {
    const result = parseSourceAnchor({
      gitCommitSha: 'a'.repeat(40),
      isoTimestamp: '2026-01-01T00:00:00.000Z',
      rawResponseHash: 'h'.repeat(64),
      dashscopeRequestId: null,
    });
    assert.equal(result.dashscopeRequestId, null);
  });
});

describe('schemas.ts: optionalFiniteNumber NaN → throw (line 215)', () => {
  it('NaN value in parseThresholdSpec throws', () => {
    assert.throws(
      () =>
        parseThresholdSpec({
          semantics: 'gt',
          value: NaN,
        }),
      /value must be a finite number when present/,
    );
  });

  it('NaN lower in parseThresholdSpec throws', () => {
    assert.throws(
      () =>
        parseThresholdSpec({
          semantics: 'range',
          lower: NaN,
          upper: 1,
        }),
      /lower must be a finite number when present/,
    );
  });

  it('NaN lineNumber via parseSourceAnchor throws', () => {
    assert.throws(
      () =>
        parseSourceAnchor({
          gitCommitSha: 'a'.repeat(40),
          isoTimestamp: '2026-01-01T00:00:00.000Z',
          rawResponseHash: 'h'.repeat(64),
          codeLocation: {
            filePath: 'src/x.ts',
            location: 'L10',
            lineNumber: NaN,
          },
        }),
      /lineNumber must be a finite number when present/,
    );
  });
});
