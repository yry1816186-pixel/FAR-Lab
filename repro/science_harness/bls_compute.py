#!/usr/bin/env python3
"""FAR-Chain C-ASTRO BLS transit search (P1-6 / Phase 5).

Real numpy box-least-squares period search over a 1D lightcurve CSV. Produces measured
transit metrics (period, depth, depth signal-residue, in/out flux arrays, odd-even symmetry)
that feed the C-ASTRO verdict pipeline (M1 = real two-sample z-test on in/out fluxes via
src/statistics/; M2 = odd-even diff; M3 = transit SNR).

Honesty: this is a from-scratch numpy BLS (no astropy/lightkurve dependency) so it runs on
the core numpy install. centroid_offset (M4) is NOT computable from a 1D lightcurve (needs
2D pixel data) → reported as null; the pipeline marks M4 SKIP (partial_skip -> INCONCLUSIVE).
Never raises to the caller; failures return {"ok": false, "error": "..."}.
"""

from __future__ import annotations

import json
import sys
import traceback
from typing import Any

import numpy as np


def read_lightcurve(path: str) -> tuple[np.ndarray, np.ndarray]:
    times: list[float] = []
    fluxes: list[float] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split(",")
            if len(parts) < 2:
                continue
            times.append(float(parts[0]))
            fluxes.append(float(parts[1]))
    if len(times) < 20:
        raise ValueError(f"lightcurve too short: {len(times)} points (need >= 20)")
    return np.asarray(times, dtype=float), np.asarray(fluxes, dtype=float)


def box_least_squares(
    times: np.ndarray,
    fluxes: np.ndarray,
    period_min: float,
    period_max: float,
    n_periods: int,
    n_phases: int,
    durations: tuple[float, ...],
) -> dict[str, Any]:
    n = int(len(times))
    flux_var = float(np.var(fluxes))
    if flux_var <= 0.0:
        flux_var = 1e-12

    best_sr = -1.0
    best: dict[str, Any] | None = None

    for pi in range(n_periods):
        period = period_min + (period_max - period_min) * pi / max(1, n_periods - 1)
        for duration in durations:
            half_phase = duration / (2.0 * period)
            for phi_i in range(n_phases):
                phi = (phi_i / n_phases) * period
                phase = np.mod((times - phi) / period, 1.0)
                d = np.minimum(phase, 1.0 - phase)
                in_mask = d < half_phase
                n_in = int(np.count_nonzero(in_mask))
                if n_in < 5 or n_in > n - 5:
                    continue
                in_flux = fluxes[in_mask]
                out_flux = fluxes[~in_mask]
                depth = float(np.mean(out_flux) - np.mean(in_flux))
                denom = float(np.sqrt(flux_var * (1.0 / n_in + 1.0 / (n - n_in))))
                sr = depth / denom if denom > 0 else 0.0
                if sr > best_sr:
                    best_sr = sr
                    best = {
                        "period": float(period),
                        "t0": float(phi),
                        "duration": float(duration),
                        "depth": depth,
                        "depthSNR": sr,
                        "in_fluxes": [float(x) for x in in_flux],
                        "out_fluxes": [float(x) for x in out_flux],
                    }
    if best is None:
        raise ValueError("bls found no valid transit candidate in the scanned grid")
    return best


def odd_even_symmetry(
    times: np.ndarray,
    fluxes: np.ndarray,
    period: float,
    t0: float,
    duration: float,
) -> dict[str, float]:
    half = duration / 2.0
    tmin = float(np.min(times))
    tmax = float(np.max(times))
    even_depths: list[float] = []
    odd_depths: list[float] = []
    k = -1
    while True:
        center = t0 + k * period
        if center > tmax + period:
            break
        if center >= tmin - period:
            mask = np.abs(times - center) < half
            n_in = int(np.count_nonzero(mask))
            if n_in >= 2:
                in_f = fluxes[mask]
                out_f = fluxes[~mask]
                depth = float(np.mean(out_f) - np.mean(in_f))
                (even_depths if k % 2 == 0 else odd_depths).append(depth)
        k += 1
    even_d = float(np.mean(even_depths)) if even_depths else 0.0
    odd_d = float(np.mean(odd_depths)) if odd_depths else 0.0
    return {"even_depth": even_d, "odd_depth": odd_d, "diff": abs(even_d - odd_d)}


def run(
    lightcurve_path: str,
    period_min: float = 1.8,
    period_max: float = 3.0,
    n_periods: int = 120,
    n_phases: int = 180,
    durations: tuple[float, ...] = (0.08, 0.12, 0.16),
) -> dict[str, Any]:
    times, fluxes = read_lightcurve(lightcurve_path)
    best = box_least_squares(times, fluxes, period_min, period_max, n_periods, n_phases, durations)
    oe = odd_even_symmetry(times, fluxes, best["period"], best["t0"], best["duration"])
    in_fluxes = best["in_fluxes"]
    out_fluxes = best["out_fluxes"]
    return {
        "ok": True,
        "n_points": int(len(times)),
        "period": best["period"],
        "duration": best["duration"],
        "depth": best["depth"],
        "depthSNR": best["depthSNR"],
        "oddEvenDiff": oe["diff"],
        "oddEvenEvenDepth": oe["even_depth"],
        "oddEvenOddDepth": oe["odd_depth"],
        # in/out flux arrays -> TS side runs real twoSampleWelchZTest (M1) via src/statistics/.
        "inFluxes": in_fluxes,
        "outFluxes": out_fluxes,
        "centroidOffset": None,  # 1D lightcurve: centroid needs 2D pixels (M4 -> SKIP)
    }


def main() -> None:
    raw = sys.stdin.read()
    try:
        cfg = json.loads(raw) if raw else {}
        path = str(cfg.get("lightcurvePath", ""))
        if not path:
            print(json.dumps({"ok": False, "error": "missing lightcurvePath"}))
            return
        result = run(path)
        # numpy types already cast to native in run(); json.dumps is safe.
        print(json.dumps(result, separators=(",", ":"), ensure_ascii=False))
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"{exc}\n{traceback.format_exc()}"}))


if __name__ == "__main__":
    main()
