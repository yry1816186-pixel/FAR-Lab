#!/usr/bin/env python3
"""10.2 sandbox venv spawn 时延测量（Linux 真实 spawn）。

测量 sandbox_runner.py 的端到端 spawn 时延：
  - cold start（python 解释器初始化 + import + exec 用户脚本）
  - 多次运行取 min/avg/max
  - 对比 wallClockMs（sandbox_runner.py 自报）与外部测量的 wall time

Authority: DEPTH_LEDGER §C P1-6a + tasks.md 10.2。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SANDBOX_RUNNER = os.path.join(REPO_ROOT, "repro", "science_harness", "sandbox_runner.py")
PYTHON_DEPS = os.path.join(REPO_ROOT, ".python-deps")
REPRO_DIR = os.path.join(REPO_ROOT, "repro")

REQUEST = json.dumps({
    "script": "print(2 + 3)",
    "seed": 42,
    "networkPolicy": "off",
    "allowedHosts": [],
    "workingDir": "",
})


def run_once(python_cmd: str) -> tuple[float, dict]:
    env = dict(os.environ)
    existing_pp = env.get("PYTHONPATH", "")
    parts = [REPRO_DIR]
    if os.path.isdir(PYTHON_DEPS):
        parts.append(PYTHON_DEPS)
    if existing_pp:
        parts.append(existing_pp)
    env["PYTHONPATH"] = os.pathsep.join(parts)

    t0 = time.perf_counter()
    proc = subprocess.run(
        [python_cmd, SANDBOX_RUNNER],
        input=REQUEST,
        capture_output=True,
        text=True,
        env=env,
        timeout=30,
    )
    t1 = time.perf_counter()

    external_ms = (t1 - t0) * 1000
    response = json.loads(proc.stdout)
    return external_ms, response


def main() -> int:
    python_cmd = sys.executable
    print(f"python: {python_cmd}")
    print(f"sandbox_runner: {SANDBOX_RUNNER}")
    print(f"platform: {sys.platform}")

    try:
        import numpy  # noqa: F401
        import threadpoolctl  # noqa: F401
        print("deps: numpy + threadpoolctl available")
    except ImportError as e:
        print(f"deps: missing {e}")

    N = 10
    results: list[tuple[float, float]] = []
    for i in range(N):
        ext_ms, resp = run_once(python_cmd)
        internal_ms = resp.get("wallClockMs", -1)
        cpu_ms = resp.get("cpuMs", -1)
        exit_code = resp.get("exitCode", -1)
        results.append((ext_ms, internal_ms))
        print(f"  run {i+1:2d}: external={ext_ms:7.1f}ms  internal={internal_ms:7.1f}ms  cpu={cpu_ms:6.1f}ms  exit={exit_code}")

    ext_values = [r[0] for r in results]
    int_values = [r[1] for r in results]

    print(f"\nExternal wall time (spawn → response):")
    print(f"  min={min(ext_values):.1f}ms  avg={sum(ext_values)/len(ext_values):.1f}ms  max={max(ext_values):.1f}ms")
    print(f"Internal wall time (sandbox_runner.py self-report):")
    print(f"  min={min(int_values):.1f}ms  avg={sum(int_values)/len(int_values):.1f}ms  max={max(int_values):.1f}ms")
    overhead = sum(ext_values)/len(ext_values) - sum(int_values)/len(int_values)
    print(f"Spawn overhead (external - internal): avg={overhead:.1f}ms")

    return 0


if __name__ == "__main__":
    sys.exit(main())
