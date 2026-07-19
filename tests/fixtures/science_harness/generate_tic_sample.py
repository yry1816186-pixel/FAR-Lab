#!/usr/bin/env python3
"""Generate the C-ASTRO cached fixture lightcurve (tic_sample.cache).

诚实声明：这是**确定性合成的 transit 光变曲线**，不是真实 TESS 数据。它仅用于
驱动 BLS 流水线（让 sandbox 产真实测量指标），并验证 cached_fixture 降级路径。
真实 TESS 数据由 fetchOnlineDataset(lightkurve) 在 lightkurve+MAST 可用时获取；
不可用时落到本 cached fixture（baseline_exempt，绝不升 CONFIRMED）。

模型：box transit @ period=2.41d, depth=0.8%, duration=0.12d + Gaussian noise(σ=0.002)。
seed=42 固定 → 可独立重算（contentHash 稳定）。

用法：python generate_tic_sample.py > tic_sample.cache  （或 -o 指定路径）
"""

from __future__ import annotations

import argparse
import csv
import random
import sys

PERIOD = 2.41
T0 = 1.0
DURATION = 0.12
DEPTH = 0.008
NOISE_SIGMA = 0.002
CADENCE_DAYS = 0.05
N_POINTS = 600
SEED = 42


def in_transit(t: float) -> bool:
    phase = ((t - T0) / PERIOD) % 1.0
    d = min(phase, 1.0 - phase)
    half = DURATION / (2.0 * PERIOD)
    return d < half


def generate() -> list[tuple[float, float, float]]:
    rng = random.Random(SEED)
    rows: list[tuple[float, float, float]] = []
    for i in range(N_POINTS):
        t = i * CADENCE_DAYS
        f = 1.0 - DEPTH if in_transit(t) else 1.0
        f += rng.gauss(0.0, NOISE_SIGMA)
        rows.append((t, f, NOISE_SIGMA))
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("-o", "--output", default=None)
    args = parser.parse_args()
    rows = generate()
    header = [
        "# FAR-Chain C-ASTRO cached fixture (SYNTHETIC, not real TESS data).",
        f"# Deterministic box-transit: period={PERIOD}d depth={DEPTH} duration={DURATION}d noise_sigma={NOISE_SIGMA} seed={SEED}.",
        "# columns: time_d, flux_normalized, flux_err",
    ]
    out = open(args.output, "w", newline="") if args.output else sys.stdout
    try:
        for line in header:
            out.write(line + "\n")
        writer = csv.writer(out)
        for t, f, e in rows:
            writer.writerow([f"{t:.6f}", f"{f:.8f}", f"{e:.8f}"])
    finally:
        if args.output:
            out.close()


if __name__ == "__main__":
    main()
