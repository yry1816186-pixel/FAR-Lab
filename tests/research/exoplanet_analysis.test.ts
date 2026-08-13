// tests/research/exoplanet_analysis.test.ts
// Phase 3 hero-case analysis core (pure, deterministic):
//   - Kepler III + insolation have authoritative closed-form checks (Earth = 1)
//   - Pearson r validated against Anscombe's quartet (published reference)
//   - p-value / Fisher-z CI behave on boundary inputs (n<3/n<4, constant vector)
//   - analyzeRadiusInsolation preserves nulls/small samples honestly (FAILED/PARTIAL)

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeRadiusInsolation,
  fisherZConfidenceInterval,
  insolationEarthFlux,
  pearsonR,
  pearsonTwoSidedP,
  semiMajorAxisAu,
} from '../../src/research/adapters/exoplanet_analysis.ts';
import type { PsRow } from '../../src/research/adapters/exoplanet_dataset.ts';

describe('semiMajorAxisAu / insolationEarthFlux (closed-form checks)', () => {
  test('Earth: 1 yr, 1 Msun → a = 1 AU', () => {
    assert.ok(Math.abs(semiMajorAxisAu(365.25, 1) - 1) < 1e-9);
  });

  test('Earth: solar params + 1 AU → insolation ≈ 1 Earth flux', () => {
    assert.ok(Math.abs(insolationEarthFlux(5777, 1, 365.25, 1) - 1) < 1e-9);
  });

  test('closer orbit → higher insolation (monotonic)', () => {
    const near = insolationEarthFlux(5777, 1, 10, 1);
    const far = insolationEarthFlux(5777, 1, 365.25, 1);
    assert.ok(near > far * 10);
  });
});

describe('pearsonR (Anscombe reference + boundaries)', () => {
  test('Anscombe I: r = 0.8164 (published value, tolerance 1e-3)', () => {
    const xs = [10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5];
    const ys = [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68];
    assert.ok(Math.abs(pearsonR(xs, ys) - 0.8164) < 1e-3);
  });

  test('perfect positive / negative / zero (constant vector)', () => {
    assert.equal(pearsonR([1, 2, 3], [2, 4, 6]), 1);
    assert.equal(pearsonR([1, 2, 3], [6, 4, 2]), -1);
    assert.equal(pearsonR([1, 2, 3], [5, 5, 5]), 0);
  });

  test('length mismatch → throw; n<2 → throw', () => {
    assert.throws(() => pearsonR([1, 2], [1]), /length mismatch/);
    assert.throws(() => pearsonR([1], [1]), /at least 2/);
  });
});

describe('pearsonTwoSidedP / fisherZConfidenceInterval', () => {
  test('p is two-sided and bounded [0,1]; n<3 → null', () => {
    const p = pearsonTwoSidedP(0.8164, 11);
    assert.ok(p !== null && p > 0 && p < 0.01); // Anscombe I is highly significant
    assert.equal(pearsonTwoSidedP(0.5, 2), null);
  });

  test('perfect r=1 → p=0', () => {
    assert.equal(pearsonTwoSidedP(1, 20), 0);
  });

  test('CI symmetric around r in z-space; n<4 → null', () => {
    const ci = fisherZConfidenceInterval(0.5, 30, 0.95);
    assert.ok(ci !== null);
    assert.ok(ci[0] < 0.5 && 0.5 < ci[1]);
    assert.equal(fisherZConfidenceInterval(0.5, 3, 0.95), null);
  });
});

describe('analyzeRadiusInsolation (honest status semantics)', () => {
  function row(overrides: Partial<PsRow> = {}): PsRow {
    return {
      plName: 'X b',
      radiusEarth: 10,
      massEarth: 300,
      periodDays: 3,
      stellarTeffK: 6000,
      stellarRadiusRsun: 1,
      stellarMassMsun: 1,
      ...overrides,
    };
  }

  test('null stellar params are excluded and counted (PARTIAL)', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ plName: `p${i}` }));
    rows.push(row({ plName: 'missing-teff', stellarTeffK: null }));
    rows.push(row({ plName: 'missing-mass', stellarMassMsun: null }));
    const obs = analyzeRadiusInsolation(rows, { minRadiusEarth: 6, maxPeriodDays: 10, confidenceLevel: 0.95 }, '2026-08-13T00:00:00.000Z');
    assert.equal(obs.status, 'PARTIAL');
    assert.equal(obs.excludedMissing, 2);
    assert.equal(obs.n, 20);
  });

  test('small sample → FAILED (never a fake conclusion)', () => {
    const obs = analyzeRadiusInsolation([row()], { minRadiusEarth: 6, maxPeriodDays: 10, confidenceLevel: 0.95 }, '2026-08-13T00:00:00.000Z');
    assert.equal(obs.status, 'FAILED');
    assert.equal(obs.pearsonR, null);
    assert.match(obs.summary, /insufficient sample/);
  });

  test('deterministic: same rows → same observation (including inputHash)', () => {
    const rows = Array.from({ length: 15 }, (_, i) => row({ plName: `p${i}`, radiusEarth: 8 + i }));
    const a = analyzeRadiusInsolation(rows, { minRadiusEarth: 6, maxPeriodDays: 10, confidenceLevel: 0.95 }, 'T');
    const b = analyzeRadiusInsolation(rows, { minRadiusEarth: 6, maxPeriodDays: 10, confidenceLevel: 0.95 }, 'T');
    assert.equal(a.inputHash, b.inputHash);
    assert.equal(a.pearsonR, b.pearsonR);
    assert.deepEqual(a.confidenceInterval, b.confidenceInterval);
  });
});
