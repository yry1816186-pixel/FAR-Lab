/**
 * tests/research/frozen_multirun.test.ts — the §4.2 N>=5 rule applied to the
 * frozen evaluation set: below N=5 per question the aggregator REFUSES to emit
 * means (INSUFFICIENT_N); at N>=5 with a homogeneous runMode it emits per-metric
 * means with seeded bootstrap 95% CIs that any third party can recompute from
 * the report alone. Failed runs are ledgered, never dropped; mixed runModes are
 * never averaged; single-run values stay debug-only; no quality-score language.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateFrozenMultirun,
  deriveBootstrapSeed,
  FROZEN_MINIMUM_N,
  renderFrozenMultirun,
  SINGLE_RUN_DISCLAIMER,
  type FrozenRunObservation,
  type QuestionMultirunInput,
  type VariabilityLedger,
} from '../../src/research/evaluation/frozen_multirun.ts';
import { bootstrapCi } from '../../src/research/evaluation/rediscovery/engine.ts';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function ledger(overrides: Partial<VariabilityLedger> = {}): VariabilityLedger {
  return {
    retrievalSnapshotId: 'snap-x',
    retrievalRootHash: `hash-${Math.random().toString(36).slice(2, 8)}`,
    retrievalSnapshotCreatedAt: '2026-08-15T10:00:00.000Z',
    corpusDocumentCount: 25,
    modelId: 'qwen3.7-max-2026-05-20',
    provider: 'aliyun',
    temperature: null, // the FACT: request did not pin a temperature
    samplingSeed: null,
    gitCommit: 'dcf81dc',
    startedAt: '2026-08-15T10:31:39.000Z',
    strategyIds: ['induction', 'analogy', 'inversion'],
    tokenUsage: { inputTokens: 47786, outputTokens: 45772, totalTokens: 93558 },
    ...overrides,
  };
}

interface ObsOverrides {
  metrics?: { name: string; value: number | boolean | null }[];
  runMode?: string;
  status?: 'OK' | 'FAILED';
  errorKind?: string | null;
  variability?: VariabilityLedger | null;
}

function obs(runIndex: number, o: ObsOverrides = {}): FrozenRunObservation {
  return {
    runIndex,
    runMode: o.runMode ?? 'LIVE',
    status: o.status ?? 'OK',
    errorKind: o.errorKind ?? null,
    metrics: o.metrics ?? [
      { name: 'citationBindingRate', value: 0.8 },
      { name: 'hypothesisCount', value: 3 },
      { name: 'gateVerdictResearchable', value: true },
    ],
    // Explicit null must survive (?? would swallow it back into a ledger).
    variability: o.variability !== undefined ? o.variability : ledger(),
  };
}

/** N OK runs with per-run citationBindingRate values, all other metrics fixed. */
function runsWithBinding(values: readonly number[]): FrozenRunObservation[] {
  return values.map((v, i) =>
    obs(i + 1, {
      metrics: [
        { name: 'citationBindingRate', value: v },
        { name: 'hypothesisCount', value: 3 },
      ],
    }),
  );
}

const OPTS = { seed: 777, iterations: 2000, generatedAt: '2026-08-15T00:00:00.000Z' };

// ─── N>=5 gate ───────────────────────────────────────────────────────────────

describe('frozen_multirun N>=5 gate (§4.2 补遗)', () => {
  it('N=4 → INSUFFICIENT_N: per-metric aggregates suppressed, debug values still visible', () => {
    const report = aggregateFrozenMultirun(
      [{ questionId: 'q1', runs: runsWithBinding([0.5, 0.6, 0.7, 0.8]) }],
      OPTS,
    );
    const q = report.perQuestion[0];
    assert.ok(q);
    assert.equal(q.status, 'INSUFFICIENT_N');
    assert.equal(q.n, 4);
    assert.deepEqual(q.perMetric, []);
    // Debug visibility: per-run values remain, but only as debug views.
    assert.equal(q.perRunDebugView.length, 4);
    assert.equal(report.status, 'NONE_REPORTED');
    const text = renderFrozenMultirun(report);
    assert.ok(text.includes('mean SUPPRESSED — INSUFFICIENT_N'));
    assert.ok(text.includes('NOT reportable as aggregates'));
  });

  it('N=5 homogeneous LIVE → REPORTED with exact mean across every metric', () => {
    const report = aggregateFrozenMultirun(
      [{ questionId: 'q1', runs: runsWithBinding([1, 0, 1, 1, 0]) }],
      OPTS,
    );
    const q = report.perQuestion[0];
    assert.ok(q);
    assert.equal(q.status, 'REPORTED');
    assert.equal(q.runMode, 'LIVE');
    const binding = q.perMetric.find((m) => m.name === 'citationBindingRate');
    assert.ok(binding?.stats);
    assert.equal(binding.stats.mean, 0.6);
    assert.equal(binding.nNonNull, 5);
    const hyps = q.perMetric.find((m) => m.name === 'hypothesisCount');
    assert.ok(hyps?.stats);
    assert.equal(hyps.stats.mean, 3);
    assert.equal(report.status, 'ALL_REPORTED');
  });

  it('N=0 (empty runs) still renders honestly without crashing', () => {
    const report = aggregateFrozenMultirun([{ questionId: 'q1', runs: [] }], OPTS);
    const q = report.perQuestion[0];
    assert.ok(q);
    assert.equal(q.status, 'INSUFFICIENT_N');
    assert.equal(q.n, 0);
    assert.equal(q.runMode, null);
    assert.equal(q.retrievalSnapshotFrozen, null);
    const text = renderFrozenMultirun(report);
    assert.ok(text.includes('INSUFFICIENT_N'));
  });
});

// ─── Bootstrap CI audit path ─────────────────────────────────────────────────

describe('bootstrap CI reproducibility (third-party recompute)', () => {
  it('recorded CI equals an independent recompute via the recorded seed + iterations', () => {
    const values = [1, 0.5, 0.75, 0.25, 1];
    const report = aggregateFrozenMultirun(
      [{ questionId: 's125-d9', runs: runsWithBinding(values) }],
      OPTS,
    );
    const row = report.perQuestion[0]?.perMetric.find((m) => m.name === 'citationBindingRate');
    assert.ok(row?.stats);
    const recomputed = bootstrapCi(values, {
      seed: deriveBootstrapSeed(OPTS.seed, 's125-d9', 'citationBindingRate'),
      iterations: OPTS.iterations,
    });
    assert.equal(row.stats.ci95.lower, recomputed.lower);
    assert.equal(row.stats.ci95.upper, recomputed.upper);
    // CI brackets the mean and records its method/seed/unit.
    assert.ok(row.stats.ci95.lower <= row.stats.mean && row.stats.mean <= row.stats.ci95.upper);
    assert.equal(row.stats.ci95.method, 'percentile-bootstrap');
    assert.equal(row.stats.ci95.unit, 'run');
  });

  it('same inputs + same base seed → byte-identical report (determinism)', () => {
    const input: QuestionMultirunInput[] = [
      { questionId: 'q1', runs: runsWithBinding([0.2, 0.4, 0.6, 0.8, 1]) },
    ];
    const a = aggregateFrozenMultirun(input, OPTS);
    const b = aggregateFrozenMultirun(input, OPTS);
    assert.deepEqual(a, b);
  });

  it('different (questionId, metric) pairs derive different seeds — CIs are per-metric', () => {
    const s1 = deriveBootstrapSeed(777, 'q1', 'metricA');
    const s2 = deriveBootstrapSeed(777, 'q1', 'metricB');
    const s3 = deriveBootstrapSeed(777, 'q2', 'metricA');
    assert.notEqual(s1, s2);
    assert.notEqual(s1, s3);
  });
});

// ─── Multi-question aggregation ──────────────────────────────────────────────

describe('multi-question aggregation', () => {
  it('two questions aggregate independently; no cross-question blended metric exists', () => {
    const report = aggregateFrozenMultirun(
      [
        { questionId: 'q1', runs: runsWithBinding([1, 1, 1, 1, 1]) },
        { questionId: 'q2', runs: runsWithBinding([0, 0, 0, 0, 0]) },
      ],
      OPTS,
    );
    assert.equal(report.perQuestion.length, 2);
    assert.equal(report.status, 'ALL_REPORTED');
    const q1 = report.perQuestion.find((q) => q.questionId === 'q1');
    const q2 = report.perQuestion.find((q) => q.questionId === 'q2');
    assert.equal(q1?.perMetric.find((m) => m.name === 'citationBindingRate')?.stats?.mean, 1);
    assert.equal(q2?.perMetric.find((m) => m.name === 'citationBindingRate')?.stats?.mean, 0);
    // Structural honesty: blending is refused BY TYPE — there is no field that
    // could hold a cross-question mean, and the report says so.
    assert.equal(report.crossQuestionBlending, 'NONE_BY_DESIGN');
  });

  it('one REPORTED + one INSUFFICIENT_N question → PARTIAL status', () => {
    const report = aggregateFrozenMultirun(
      [
        { questionId: 'q1', runs: runsWithBinding([0.5, 0.5, 0.5, 0.5, 0.5]) },
        { questionId: 'q2', runs: runsWithBinding([0.5, 0.5]) },
      ],
      OPTS,
    );
    assert.equal(report.status, 'PARTIAL');
    assert.equal(report.perQuestion.find((q) => q.questionId === 'q2')?.status, 'INSUFFICIENT_N');
  });
});

// ─── Variability ledger (auditability of "independent runs") ─────────────────

describe('variability ledger', () => {
  it('successful runs\' ledgers are echoed into the report with all audit fields', () => {
    const report = aggregateFrozenMultirun(
      [{ questionId: 'q1', runs: runsWithBinding([0.5, 0.6, 0.7, 0.8, 0.9]) }],
      OPTS,
    );
    const q = report.perQuestion[0];
    assert.ok(q);
    assert.equal(q.variabilityLedger.length, 5);
    for (const l of q.variabilityLedger) {
      assert.equal(l.modelId, 'qwen3.7-max-2026-05-20');
      assert.equal(l.temperature, null); // the temperature-null FACT is recorded
      assert.equal(l.gitCommit, 'dcf81dc');
      assert.equal(l.tokenUsage?.totalTokens, 93558);
      assert.ok(l.retrievalRootHash.length > 0);
      assert.ok(l.retrievalSnapshotCreatedAt.length > 0);
      assert.ok(l.strategyIds.length > 0);
    }
  });

  it('identical root hashes across runs → retrievalSnapshotFrozen=true; differing → false', () => {
    const frozenRuns = [1, 2, 3, 4, 5].map((i) =>
      obs(i, { variability: ledger({ retrievalRootHash: 'same-hash' }) }),
    );
    const frozen = aggregateFrozenMultirun([{ questionId: 'q1', runs: frozenRuns }], OPTS);
    assert.equal(frozen.perQuestion[0]?.retrievalSnapshotFrozen, true);
    assert.deepEqual(frozen.perQuestion[0]?.distinctSnapshotHashes, ['same-hash']);

    const live = aggregateFrozenMultirun([{ questionId: 'q1', runs: runsWithBinding([1, 1, 1, 1, 1]) }], OPTS);
    assert.equal(live.perQuestion[0]?.retrievalSnapshotFrozen, false);
    assert.equal(live.perQuestion[0]?.distinctSnapshotHashes.length, 5);
  });
});

// ─── Failed-run honesty ───────────────────────────────────────────────────────

describe('failed-run honesty (no silent retry, no silent drop)', () => {
  it('a failed run is ledgered and NOT counted toward N, but 5 successes still aggregate', () => {
    const runs: FrozenRunObservation[] = [
      ...runsWithBinding([0.5, 0.6, 0.7, 0.8, 0.9]),
      obs(6, { status: 'FAILED', errorKind: 'HTTP_429', metrics: [], variability: null }),
    ];
    const report = aggregateFrozenMultirun([{ questionId: 'q1', runs }], OPTS);
    const q = report.perQuestion[0];
    assert.ok(q);
    assert.equal(q.status, 'REPORTED');
    assert.equal(q.n, 5);
    assert.equal(q.failedRunCount, 1);
    assert.deepEqual(q.failureLedger, [{ runIndex: 6, errorKind: 'HTTP_429' }]);
    const text = renderFrozenMultirun(report);
    assert.ok(text.includes('run#6 HTTP_429'));
    assert.ok(text.includes('never silently retried'));
  });

  it('only 2 successes + 3 failures → INSUFFICIENT_N with the failure ledger still visible', () => {
    const runs: FrozenRunObservation[] = [
      ...runsWithBinding([0.5, 0.6]),
      obs(3, { status: 'FAILED', errorKind: 'QUOTA_BREAKER', metrics: [], variability: null }),
      obs(4, { status: 'FAILED', errorKind: 'QUOTA_BREAKER', metrics: [], variability: null }),
      obs(5, { status: 'FAILED', errorKind: 'HTTP_429', metrics: [], variability: null }),
    ];
    const report = aggregateFrozenMultirun([{ questionId: 'q1', runs }], OPTS);
    const q = report.perQuestion[0];
    assert.ok(q);
    assert.equal(q.status, 'INSUFFICIENT_N');
    assert.equal(q.n, 2);
    assert.equal(q.failureLedger.length, 3);
    const text = renderFrozenMultirun(report);
    assert.ok(text.includes('QUOTA_BREAKER'));
  });

  it('a FAILED run without errorKind is rejected (malformed input)', () => {
    assert.throws(
      () =>
        aggregateFrozenMultirun(
          [{
            questionId: 'q1',
            runs: [obs(1, { status: 'FAILED', errorKind: null, metrics: [], variability: null })],
          }],
          OPTS,
        ),
      /FAILED run 1 .* must carry errorKind/,
    );
  });
});

// ─── runMode honesty ──────────────────────────────────────────────────────────

describe('runMode honesty', () => {
  it('mixing LIVE and OFFLINE_REPLAY runs → MIXED_RUN_MODE, means suppressed', () => {
    const runs: FrozenRunObservation[] = [
      obs(1, { runMode: 'LIVE' }),
      obs(2, { runMode: 'LIVE' }),
      obs(3, { runMode: 'LIVE' }),
      obs(4, { runMode: 'OFFLINE_REPLAY' }),
      obs(5, { runMode: 'OFFLINE_REPLAY' }),
    ];
    const report = aggregateFrozenMultirun([{ questionId: 'q1', runs }], OPTS);
    const q = report.perQuestion[0];
    assert.ok(q);
    assert.equal(q.status, 'MIXED_RUN_MODE');
    assert.equal(q.runMode, null);
    assert.deepEqual(q.perMetric, []);
    const text = renderFrozenMultirun(report);
    assert.ok(text.includes('MIXED_RUN_MODE'));
    assert.ok(text.includes('cannot be averaged'));
  });

  it('every rendered metric row carries the homogeneous runMode column', () => {
    const report = aggregateFrozenMultirun(
      [{ questionId: 'q1', runs: runsWithBinding([1, 1, 1, 1, 1]) }],
      OPTS,
    );
    const text = renderFrozenMultirun(report);
    assert.ok(text.includes('citationBindingRate [LIVE]:'));
    assert.ok(text.includes('hypothesisCount [LIVE]:'));
  });
});

// ─── Value-kind handling ──────────────────────────────────────────────────────

describe('value kinds and null handling', () => {
  it('boolean metrics aggregate as rates (valueKind=boolean_rate)', () => {
    const runs = [1, 2, 3, 4, 5].map((i) =>
      obs(i, {
        metrics: [{ name: 'gateVerdictResearchable', value: i <= 4 }],
      }),
    );
    const report = aggregateFrozenMultirun([{ questionId: 'q1', runs }], OPTS);
    const row = report.perQuestion[0]?.perMetric.find((m) => m.name === 'gateVerdictResearchable');
    assert.ok(row?.stats);
    assert.equal(row.stats.mean, 0.8);
    assert.equal(row.valueKind, 'boolean_rate');
  });

  it('a metric null in 2 of 5 runs → that row is INSUFFICIENT_N with counts; others unaffected', () => {
    const runs: FrozenRunObservation[] = [1, 2, 3, 4, 5].map((i) =>
      obs(i, {
        metrics: [
          { name: 'citationBindingRate', value: i <= 3 ? 0.8 : null },
          { name: 'hypothesisCount', value: 3 },
        ],
      }),
    );
    const report = aggregateFrozenMultirun([{ questionId: 'q1', runs }], OPTS);
    const binding = report.perQuestion[0]?.perMetric.find((m) => m.name === 'citationBindingRate');
    assert.ok(binding);
    assert.equal(binding.status, 'INSUFFICIENT_N');
    assert.equal(binding.nNonNull, 3);
    assert.equal(binding.nullValueCount, 2);
    assert.equal(binding.stats, null);
    const hyps = report.perQuestion[0]?.perMetric.find((m) => m.name === 'hypothesisCount');
    assert.equal(hyps?.status, 'REPORTED');
    // Question-level status stays REPORTED (the N gate is run-level), but the
    // suppressed metric row is rendered with its reason.
    const text = renderFrozenMultirun(report);
    assert.ok(text.includes('citationBindingRate: INSUFFICIENT_N (nNonNull=3 < 5, nullValueCount=2)'));
  });

  it('mixing boolean and number values for one metric is rejected', () => {
    const runs: FrozenRunObservation[] = [1, 2, 3, 4, 5].map((i) =>
      obs(i, {
        metrics: [{ name: 'weird', value: i === 1 ? true : 0.5 }],
      }),
    );
    assert.throws(
      () => aggregateFrozenMultirun([{ questionId: 'q1', runs }], OPTS),
      /metric "weird" mixes/,
    );
  });
});

// ─── Variance honesty ─────────────────────────────────────────────────────────

describe('variance honesty (flag only, raw numbers always shown)', () => {
  it('a bounded metric with CI width >= 0.4 gets the HIGH_VARIANCE display flag', () => {
    const report = aggregateFrozenMultirun(
      [{ questionId: 'q1', runs: runsWithBinding([1, 1, 0, 0, 1]) }],
      OPTS,
    );
    const row = report.perQuestion[0]?.perMetric.find((m) => m.name === 'citationBindingRate');
    assert.ok(row?.stats);
    assert.equal(row.stats.varianceFlag, 'HIGH_VARIANCE');
    assert.ok(renderFrozenMultirun(report).includes('HIGH_VARIANCE flag — see raw sd/range'));
    // Raw dispersion stays visible next to the flag.
    assert.ok(row.stats.sd > 0);
    assert.deepEqual([row.stats.min, row.stats.max], [0, 1]);
  });

  it('a degenerate all-equal sample keeps varianceFlag OK (point CI)', () => {
    const report = aggregateFrozenMultirun(
      [{ questionId: 'q1', runs: runsWithBinding([0.6, 0.6, 0.6, 0.6, 0.6]) }],
      OPTS,
    );
    const row = report.perQuestion[0]?.perMetric.find((m) => m.name === 'citationBindingRate');
    assert.ok(row?.stats);
    assert.equal(row.stats.sd, 0);
    assert.equal(row.stats.varianceFlag, 'OK');
  });
});

// ─── Anti-Goodhart / structural honesty ───────────────────────────────────────

describe('anti-Goodhart honesty guards', () => {
  it('renderer emits the single-run disclaimer and power caveat verbatim', () => {
    const report = aggregateFrozenMultirun(
      [{ questionId: 'q1', runs: runsWithBinding([1, 1, 1, 1, 1]) }],
      OPTS,
    );
    const text = renderFrozenMultirun(report);
    assert.ok(text.includes(SINGLE_RUN_DISCLAIMER));
    assert.ok(text.includes('Power caveat'));
    assert.ok(text.includes('directional signals'));
    assert.ok(text.includes('NONE BY DESIGN'));
  });

  it('duplicate runIndex for one question is rejected (runs must be independently indexed)', () => {
    assert.throws(
      () =>
        aggregateFrozenMultirun(
          [{ questionId: 'q1', runs: [...runsWithBinding([1, 1, 1, 1, 1]), obs(1)] }],
          OPTS,
        ),
      /duplicate runIndex 1/,
    );
  });

  it('an OK run without a variability ledger is rejected (audit trail is mandatory)', () => {
    assert.throws(
      () =>
        aggregateFrozenMultirun(
          [{ questionId: 'q1', runs: [obs(1, { variability: null })] }],
          OPTS,
        ),
      /must carry a variability ledger/,
    );
  });

  it('minimumN is pinned to the §4.2 floor of 5 and equals FROZEN_MINIMUM_N', () => {
    const report = aggregateFrozenMultirun(
      [{ questionId: 'q1', runs: runsWithBinding([1, 1, 1, 1, 1]) }],
      OPTS,
    );
    assert.equal(report.minimumN, 5);
    assert.equal(FROZEN_MINIMUM_N, 5);
  });
});
