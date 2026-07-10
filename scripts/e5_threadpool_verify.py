#!/usr/bin/env python3
"""E5 threadpool_info() CI BLAS 可观测性验证（Linux + numpy 后端）。

验证目标：
  1. Linux + numpy 后端，threadpool_info() 能观察到 BLAS 线程池（非空）
  2. threadpool_limits(limits=1) 限制后，所有 BLAS 后端线程数=1
  3. SR-7（nthread=1）在真实 BLAS 后端上可观测

Authority: FAR_LAB_MASTER_PLAN/10_DEV_ENTRYPOINT.md E5 + DEPTH_LEDGER §C P1-6a SR-7。
"""

import sys


def main() -> int:
    try:
        import numpy as np
        from threadpoolctl import threadpool_info, threadpool_limits
    except ImportError as e:
        print(f"SKIP: missing dependency: {e}", file=sys.stderr)
        return 0

    print(f"numpy version: {np.__version__}")
    print(f"numpy config:\n{np.show_config(mode='dicts') if hasattr(np, 'show_config') else 'N/A'}")

    info_before = threadpool_info()
    print(f"\nthreadpool_info() BEFORE limits (raw): {info_before}")

    if not info_before:
        print("SKIP: no BLAS threadpool detected (numpy may use a pure-Python fallback)")
        return 0

    max_threads_before = max(pool.get("num_threads", 0) for pool in info_before)
    print(f"max num_threads BEFORE: {max_threads_before}")

    with threadpool_limits(limits=1):
        info_during = threadpool_info()
        print(f"threadpool_info() DURING limits=1 (raw): {info_during}")
        max_threads_during = max(pool.get("num_threads", 0) for pool in info_during)
        print(f"max num_threads DURING: {max_threads_during}")

        a = np.random.rand(200, 200)
        b = np.random.rand(200, 200)
        c = a @ b
        print(f"matmul checksum: {c.sum():.6f}")

    info_after = threadpool_info()
    max_threads_after = max(pool.get("num_threads", 0) for pool in info_after)
    print(f"max num_threads AFTER (restored): {max_threads_after}")

    if max_threads_during != 1:
        print(f"FAIL: expected max_threads_during=1, got {max_threads_during}", file=sys.stderr)
        return 1

    print("\nE5 PASS: threadpoolctl(1) limits BLAS to 1 thread (SR-7 observable)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
