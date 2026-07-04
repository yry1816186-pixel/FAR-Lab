#!/usr/bin/env python3
"""Z3 SMT backend for FAR-Chain math verification.

Protocol (stdin -> stdout, both JSON):
  Request:  {"script": "<SMT-LIB assertions>"}
  Response: {"sat": "sat"|"unsat"|"unknown", "rawOutput": "...", "stderr": "..."}

The script never raises to the parent process. Missing z3-solver or malformed
SMT-LIB returns sat="unknown" with stderr populated.
"""

from __future__ import annotations

import json
import sys
import traceback


def emit(result: dict[str, object]) -> None:
    text = json.dumps(result, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    sys.stdout.write(text)
    sys.stdout.write("\n")
    sys.stdout.flush()


def main() -> None:
    try:
        try:
            import z3
        except Exception as exc:  # noqa: BLE001
            emit({"sat": "unknown", "rawOutput": "", "stderr": f"z3_solver_not_installed: {exc}"})
            return

        raw = sys.stdin.read()
        if not raw:
            emit({"sat": "unknown", "rawOutput": "", "stderr": "empty_stdin"})
            return

        try:
            request = json.loads(raw)
        except json.JSONDecodeError as exc:
            emit({"sat": "unknown", "rawOutput": "", "stderr": f"invalid_json: {exc}"})
            return

        script = request.get("script")
        if not isinstance(script, str) or len(script.strip()) == 0:
            emit({"sat": "unknown", "rawOutput": "", "stderr": "missing_script"})
            return

        solver = z3.Solver()
        try:
            assertions = z3.parse_smt2_string(script)
            solver.add(assertions)
            check_result = solver.check()
        except Exception as exc:  # noqa: BLE001
            emit({"sat": "unknown", "rawOutput": "", "stderr": f"smt_parse_or_check_failed: {exc}"})
            return

        sat = str(check_result)
        if sat not in {"sat", "unsat", "unknown"}:
            sat = "unknown"
        emit({"sat": sat, "rawOutput": sat, "stderr": f"z3-solver={z3.get_version_string()}"})
    except Exception:  # noqa: BLE001
        emit({"sat": "unknown", "rawOutput": "", "stderr": f"fatal: {traceback.format_exc()}"})


if __name__ == "__main__":
    main()
