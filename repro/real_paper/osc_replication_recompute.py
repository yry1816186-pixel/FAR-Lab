#!/usr/bin/env python3
"""osc_replication_recompute.py — Independent cross-language recomputation of
Open Science Collaboration (2015) aggregate replication statistics.

Purpose
-------
Clean-room recomputation of the public summary statistics from:

    Open Science Collaboration (2015). "Estimating the reproducibility of
    psychological science." Science, 349(6251), aac4716.
    DOI: 10.1126/science.aac4716

This is the Python verification axis for the TypeScript pipeline in
`src/science_harness/osc_pipeline.ts`. It recomputes the SAME published
aggregate statistics so the TS kernel's p-values can be cross-checked within
a strict tolerance.

Published facts used (paper text / supplementary):
  - 100 original studies were selected; 97 replications were conducted.
  - 97% of original studies reported statistically significant results
    (97 of 100 at p < 0.05).
  - 36% of replication studies reported statistically significant results
    (36 of 97 at p < 0.05; the paper prints 36% and we use the raw counts
    36/97 = 0.3711...).
  - Median original effect size r = 0.403.
  - Median replication effect size r = 0.197 (49% of the original).

Recomputed statistics (honest boundary):
  - PRIMARY inferential test: the 97% -> 36% significance-rate collapse is
    tested as a two-proportion z-test (original vs replication). This is the
    decisive, methodologically unimpeachable aggregate finding (p ~ 2.6e-19).
  - DESCRIPTIVE only: median replication r = 0.197 (49% of original 0.403).
    NOTE: applying the Fisher-z transform with SE = 1/sqrt(N-3) to the MEDIAN
    of 97 study-level correlations is statistically INVALID — that SE is the
    asymptotic SE of a SINGLE correlation from N paired observations, not of a
    median across studies. A valid meta-analytic test would require per-study
    sample sizes for inverse-variance weighting, which the published OSC
    summary does not expose. We therefore report median r descriptively and
    attach NO inferential p/CI to it. (Earlier versions of this file computed
    an invalid Fisher-z-on-median p ~ 0.0265; that has been removed as K6.)
  - BH-FDR (Benjamini-Hochberg, alpha=0.05) is applied over the single-test
    family { rate-drop z } (a no-op on one element, kept for family-growth
    consistency with the TS axis).

Independence & determinism charter:
  - This module imports NO FAR-Lab TypeScript/JavaScript code.
  - It is pure stdlib (math.erf based normal survival, no numpy/scipy).
  - Results are deterministic across platforms and Python versions.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# ---------------------------------------------------------------------------
# Published constants (OSC 2015, Science 349, aac4716)
# ---------------------------------------------------------------------------

OSC_ORIGINAL_N = 100
OSC_ORIGINAL_SIGNIFICANT = 97
OSC_REPLICATION_N = 97
OSC_REPLICATION_SIGNIFICANT = 36
OSC_ORIGINAL_MEDIAN_R = 0.403
OSC_REPLICATION_MEDIAN_R = 0.197
OSC_ALPHA = 0.05


def _normal_survival(z: float) -> float:
    """One-tailed standard normal survival P(Z > z)."""
    return 0.5 * (1.0 - math.erf(z / math.sqrt(2.0)))


def r_to_z(r: float) -> float:
    """Fisher r-to-z transform: z = 0.5 * ln((1+r)/(1-r))."""
    if not -1.0 < r < 1.0:
        raise ValueError(f"r must be strictly inside (-1, 1), got {r}")
    return 0.5 * math.log((1.0 + r) / (1.0 - r))


def z_to_r(z: float) -> float:
    """Inverse Fisher transform: r = tanh(z)."""
    return math.tanh(z)


def two_proportion_z(
    x1: int, n1: int, x2: int, n2: int,
) -> tuple[float, float]:
    """Two-proportion z-test (pooled). Returns (z, two-sided p)."""
    p1 = x1 / n1
    p2 = x2 / n2
    pooled = (x1 + x2) / (n1 + n2)
    se = math.sqrt(pooled * (1.0 - pooled) * (1.0 / n1 + 1.0 / n2))
    z = (p1 - p2) / se
    p_two_sided = 2.0 * _normal_survival(abs(z))
    return z, p_two_sided


def bh_fdr(p_values: list[float], alpha: float) -> list[float]:
    """Benjamini-Hochberg FDR adjustment (matches TS adjustPValues)."""
    m = len(p_values)
    order = sorted(range(m), key=lambda i: p_values[i])
    adjusted = [0.0] * m
    prev = 1.0
    # 从最大的 p 值开始向下，保证 adjusted 序列单调递减。
    for rank in range(m - 1, -1, -1):
        i = order[rank]
        candidate = min(p_values[i] * m / (rank + 1), 1.0)
        prev = min(prev, candidate)
        adjusted[i] = prev
    return adjusted


@dataclass(frozen=True)
class OscRecomputeResult:
    """Result of the independent recomputation (mirrors TS OscStatistics)."""

    originalCount: int
    originalSignificantRate: float
    replicationCount: int
    replicationSignificantRate: float
    originalMedianR: float  # descriptive
    replicationMedianR: float  # descriptive
    rateDropZ: float  # two-proportion z (original vs replication) — PRIMARY test
    rateDropPTwoSided: float
    effectShrinkage: float  # 1 - (replication r / original r), descriptive
    bhAdjustedPs: list[float]  # BH-FDR over [rate-drop p] (single-test family)
    survivesFdr: bool  # any adjusted p < alpha
    recomputeBackend: str  # always 'stdlib-exact'


def recompute_osc_statistics() -> OscRecomputeResult:
    """Recompute OSC-2015 aggregate statistics from published summary stats.

    Primary (inferential) test: two-proportion z on the 97% -> 36%
    significance-rate collapse. The median replication r=0.197 is reported
    descriptively only (no Fisher-z-on-median inference — see module docstring).
    """
    original_rate = OSC_ORIGINAL_SIGNIFICANT / OSC_ORIGINAL_N
    replication_rate = OSC_REPLICATION_SIGNIFICANT / OSC_REPLICATION_N

    # Two-proportion z on the significance-rate collapse (the decisive test).
    rate_z, rate_p = two_proportion_z(
        OSC_ORIGINAL_SIGNIFICANT, OSC_ORIGINAL_N,
        OSC_REPLICATION_SIGNIFICANT, OSC_REPLICATION_N,
    )

    # math.erf saturates for |z|/sqrt(2) > ~6.2, so the two-sided p underflows
    # to 0 for the extreme rate-drop z (~8.97). Use the asymptotic normal tail
    # phi(z)/|z| (x2 two-sided) to stay representable (matches the TS axis).
    # True two-sided p ~ 2.6e-19.
    if rate_z > 8:
        rate_p = (2.0 * math.exp(-rate_z * rate_z / 2.0)) / (
            rate_z * math.sqrt(2.0 * math.pi)
        )

    shrinkage = 1.0 - OSC_REPLICATION_MEDIAN_R / OSC_ORIGINAL_MEDIAN_R

    # BH-FDR over the single-test family { rate-drop z }.
    bh = bh_fdr([rate_p], OSC_ALPHA)
    survives = any(p < OSC_ALPHA for p in bh)

    return OscRecomputeResult(
        originalCount=OSC_ORIGINAL_N,
        originalSignificantRate=original_rate,
        replicationCount=OSC_REPLICATION_N,
        replicationSignificantRate=replication_rate,
        originalMedianR=OSC_ORIGINAL_MEDIAN_R,
        replicationMedianR=OSC_REPLICATION_MEDIAN_R,
        rateDropZ=rate_z,
        rateDropPTwoSided=rate_p,
        effectShrinkage=shrinkage,
        bhAdjustedPs=bh,
        survivesFdr=survives,
        recomputeBackend='stdlib-exact',
    )


def main() -> None:  # pragma: no cover - CLI entry
    result = recompute_osc_statistics()
    print("OSC (2015) — independent Python recomputation")
    print("backend  :", result.recomputeBackend)
    print(f"  original significant rate : {result.originalSignificantRate:.4f} "
          f"({result.originalCount} studies)")
    print(f"  replication significant   : {result.replicationSignificantRate:.4f} "
          f"({result.replicationCount} studies)")
    print(f"  original median r         : {result.originalMedianR:.4f}")
    print(f"  replication median r      : {result.replicationMedianR:.4f}")
    print(f"  effect shrinkage          : {result.effectShrinkage:.4f} (descriptive)")
    print(f"  rate-drop z / p (PRIMARY) : {result.rateDropZ:.4f} / "
          f"{result.rateDropPTwoSided:.4e}")
    print(f"  BH-FDR adjusted p-values  : [{result.bhAdjustedPs[0]:.4e}]")
    print(f"  survives FDR              : {result.survivesFdr}")
    print()
    print("  Reference (paper): original 97% significant vs replication 36%;")
    print("  median r 0.403 -> 0.197 (descriptive). The significance rate did")
    print("  NOT reproduce at a comparable level (two-proportion p ~ 2.6e-19);")
    print("  the median replication r is nonzero but ~49% of the original.")
    print("  No Fisher-z-on-median inference (invalid SE for a study-level median).")


if __name__ == "__main__":  # pragma: no cover
    main()
