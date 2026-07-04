import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  EmptyScopeSlipError,
  EmptyUntestedReasonError,
  FalsifiabilityGateError,
  decideVerdict,
  evaluateThreshold,
  extractExternalFact,
  falsifiabilityGate,
  getVerdict,
  makeVerdict,
  recordVerdict,
  renderHonestVerdict,
} from '../../src/falsifiability/index.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  SourceAnchor,
  ThresholdSpec,
} from '../../src/falsifiability/index.ts';
import {
  appendEvidenceLog,
  appendRecord,
  canonicalJson,
  GENESIS_PREV_HASH,
} from '../../src/evidence_log/index.ts';
import type { LlmResponse } from '../../src/llm_gateway/index.ts';
import { runMigrations } from '../../src/db/index.ts';

const SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

const BASE_SPEC: FalsificationSpec = {
  prediction: 'accuracy should be at least 0.85',
  metric: 'accuracy',
  falsificationThreshold: 0.85,
  thresholdSemantics: 'gt',
};

const BASE_THRESHOLD: ThresholdSpec = {
  semantics: 'gt',
  value: 0.85,
};

function evidence(overrides: Partial<EvidenceRecord>): EvidenceRecord {
  return {
    claim: 'measured accuracy evidence',
    supportsClaim: true,
    refutesClaim: false,
    scopeNarrowerThanClaim: false,
    sourceAnchor: SOURCE_ANCHOR,
    ...overrides,
  };
}

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function seedEvidence(db: Database.Database, evidenceId: string): void {
  const record = appendRecord(
    db,
    {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'a'.repeat(64),
        gitCommitSha: 'b'.repeat(40),
        isoTimestamp: '2026-06-27T00:00:00.000Z',
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: GENESIS_PREV_HASH,
    },
    {
      requestPayload: '{}',
      responsePayload: '{}',
      finishReason: 'stop',
      usageTokensTotal: 0,
    },
    {
      providerProfile: 'offline_replay',
    },
  );

  appendEvidenceLog(db, {
    evidenceId,
    callRecordSeq: record.seq,
    evidencePayload: { claim: 'test' },
    sourceAnchor: SOURCE_ANCHOR,
  });
}

test('decideVerdict covers all five verdict values', () => {
  assert.deepEqual(decideVerdict({ claim: 'claim', evidences: [] }), {
    verdict: 'UNTESTED',
    scopeSlipText: null,
    untestedReason: 'no evidence collected for this claim',
    conflictingEvidenceCount: 0,
  });

  assert.equal(
    decideVerdict({ claim: 'claim', evidences: [evidence({ supportsClaim: true, refutesClaim: false })] }).verdict,
    'CONFIRMED',
  );
  assert.equal(
    decideVerdict({ claim: 'claim', evidences: [evidence({ supportsClaim: false, refutesClaim: true })] }).verdict,
    'REFUTED',
  );
  assert.equal(
    decideVerdict({
      claim: 'claim',
      evidences: [
        evidence({ supportsClaim: true, refutesClaim: false }),
        evidence({ supportsClaim: false, refutesClaim: true }),
      ],
    }).verdict,
    'INCONCLUSIVE',
  );

  const degraded = decideVerdict({
    claim: 'claim',
    evidences: [
      evidence({
        claim: 'claim only holds for subset A',
        supportsClaim: true,
        refutesClaim: false,
        scopeNarrowerThanClaim: true,
      }),
    ],
  });
  assert.equal(degraded.verdict, 'DEGRADED_SCOPE');
  assert.match(degraded.scopeSlipText ?? '', /subset A/);
});

test('DEGRADED_SCOPE takes precedence over CONFIRMED', () => {
  const verdict = decideVerdict({
    claim: 'claim',
    evidences: [
      evidence({ supportsClaim: true, refutesClaim: false }),
      evidence({
        claim: 'claim only holds for subset B',
        supportsClaim: true,
        refutesClaim: false,
        scopeNarrowerThanClaim: true,
      }),
    ],
  });

  assert.equal(verdict.verdict, 'DEGRADED_SCOPE');
});

test('falsifiabilityGate and evaluateThreshold enforce finite threshold semantics', () => {
  assert.equal(
    falsifiabilityGate({
      hypothesis: 'claim',
      falsificationSpec: BASE_SPEC,
      thresholdSpec: BASE_THRESHOLD,
    }),
    BASE_SPEC,
  );
  assert.deepEqual(evaluateThreshold(0.9, BASE_THRESHOLD), {
    supportsClaim: true,
    refutesClaim: false,
  });
  assert.deepEqual(evaluateThreshold(0.8, BASE_THRESHOLD), {
    supportsClaim: false,
    refutesClaim: true,
  });

  assert.throws(
    () =>
      falsifiabilityGate({
        hypothesis: 'claim',
        falsificationSpec: {
          ...BASE_SPEC,
          thresholdSemantics: 'range',
        },
      }),
    FalsifiabilityGateError,
  );
  assert.throws(
    () =>
      falsifiabilityGate({
        hypothesis: 'claim',
        falsificationSpec: {
          ...BASE_SPEC,
          thresholdSemantics: 'range',
        },
        thresholdSpec: {
          semantics: 'range',
          lower: 0.9,
          upper: 0.8,
        },
      }),
    FalsifiabilityGateError,
  );
});

test('makeVerdict enriches metric evidence through threshold evaluation', () => {
  const result = makeVerdict({
    claim: 'claim',
    evidences: [
      evidence({
        metricValue: 0.7,
        supportsClaim: true,
        refutesClaim: false,
      }),
    ],
    falsificationSpec: BASE_SPEC,
    thresholdSpec: BASE_THRESHOLD,
  });

  assert.equal(result.verdict, 'REFUTED');
  assert.equal(result.metricValue, 0.7);
});

test('renderHonestVerdict emits anti-theater fields', () => {
  const untested = renderHonestVerdict({
    claim: 'claim',
    evidences: [],
    falsificationSpec: BASE_SPEC,
    thresholdSpec: BASE_THRESHOLD,
  });
  assert.equal(untested.verdict, 'UNTESTED');
  assert.equal(untested.untestedReason, 'EVIDENCE_MISSING');
});

test('recordVerdict writes and reads a verdict node with parsed JSON fields', () => {
  const db = openDb();
  try {
    seedEvidence(db, 'ev-record');
    const verdict = recordVerdict(db, {
      evidenceId: 'ev-record',
      parentVerdictId: null,
      nodeKind: 'hypothesis',
      verdict: 'UNTESTED',
      falsificationSpec: BASE_SPEC,
      thresholdSpec: BASE_THRESHOLD,
      metricValue: null,
      conflictingEvidenceCount: 0,
      scopeSlipText: null,
      untestedReason: 'not tested yet',
      sourceAnchor: SOURCE_ANCHOR,
      replayProver: null,
    });

    assert.match(verdict.verdictId, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    assert.equal(verdict.verdict, 'UNTESTED');
    assert.equal(verdict.untestedReason, 'not tested yet');
    assert.equal(verdict.prevHash, GENESIS_PREV_HASH);
    assert.match(verdict.currentHash, /^[0-9a-f]{64}$/);

    const readBack = getVerdict(db, verdict.verdictId);
    assert.equal(readBack?.falsificationSpec.prediction, BASE_SPEC.prediction);
    assert.equal(readBack?.sourceAnchor.rawResponseHash, SOURCE_ANCHOR.rawResponseHash);
  } finally {
    db.close();
  }
});

test('recordVerdict and SQLite triggers reject anti-theater violations', () => {
  const db = openDb();
  try {
    seedEvidence(db, 'ev-trigger');
    assert.throws(
      () =>
        recordVerdict(db, {
          evidenceId: 'ev-trigger',
          parentVerdictId: null,
          nodeKind: 'hypothesis',
          verdict: 'UNTESTED',
          falsificationSpec: BASE_SPEC,
          thresholdSpec: BASE_THRESHOLD,
          metricValue: null,
          conflictingEvidenceCount: 0,
          scopeSlipText: null,
          untestedReason: '',
          sourceAnchor: SOURCE_ANCHOR,
          replayProver: null,
        }),
      EmptyUntestedReasonError,
    );
    assert.throws(
      () =>
        recordVerdict(db, {
          evidenceId: 'ev-trigger',
          parentVerdictId: null,
          nodeKind: 'hypothesis',
          verdict: 'DEGRADED_SCOPE',
          falsificationSpec: BASE_SPEC,
          thresholdSpec: BASE_THRESHOLD,
          metricValue: null,
          conflictingEvidenceCount: 0,
          scopeSlipText: '',
          untestedReason: null,
          sourceAnchor: SOURCE_ANCHOR,
          replayProver: null,
        }),
      EmptyScopeSlipError,
    );

    assert.throws(
      () =>
        db.prepare(
          `INSERT INTO verdict_nodes (
            verdict_id, evidence_id, node_kind, verdict, falsification_spec,
            source_anchor, prev_hash, current_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          'direct-trigger-test',
          'ev-trigger',
          'hypothesis',
          'UNTESTED',
          canonicalJson(BASE_SPEC, 'test.baseSpec'),
          canonicalJson(SOURCE_ANCHOR, 'test.sourceAnchor'),
          GENESIS_PREV_HASH,
          'd'.repeat(64),
        ),
      /UNTESTED requires non-empty untested_reason/,
    );
  } finally {
    db.close();
  }
});

test('extractExternalFact derives a SourceAnchor from an LlmResponse', () => {
  const response: LlmResponse = {
    credential: {
      providerProfile: 'offline_replay',
      providerRequestId: null,
      modelId: 'offline-replay-fixture',
      modelVersion: null,
      capability: 'reasoning',
      isoTimestamp: '2026-06-27T00:00:00.000Z',
      tokenUsage: {
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3,
      },
    },
    content: 'claim',
    raw: { replayed: true },
  };

  const anchor = extractExternalFact(response, 'b'.repeat(40), {
    filePath: 'src/example.ts',
    location: 'unit-test',
  });

  assert.equal(anchor.dashscopeRequestId, null);
  assert.equal(anchor.gitCommitSha, 'b'.repeat(40));
  assert.match(anchor.rawResponseHash, /^[0-9a-f]{64}$/);
  assert.equal(anchor.codeLocation?.location, 'unit-test');
});
