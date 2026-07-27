#!/usr/bin/env python3
"""SymPy CAS backend for the FAR-Lab math verification layer (spec 38 §3).

Protocol (stdin → stdout, both JSON):
  Request:  {"mode": "expand"|"simplify"|"parse", "lhs": "...", "rhs": "...", "expr": "..."}
  Response: {"artifact": "...", "log": "...", "outcome": "verified"|"refuted"|"unknown"}

Soundness layer (spec 38 §3.1):
  - mode='expand':    expand(lhs) == expand(rhs) → outcome='verified' (SOUND).
                       expand(lhs) != expand(rhs) → outcome='refuted'  (SOUND for the
                       expanded normal form; not a complete refutation in general, but
                       sound for polynomial/structural identity).
  - mode='simplify':  heuristic; outcome='unknown' always. The simplified forms are
                       returned in `artifact` for human inspection. We do NOT claim
                       'verified' because simplify is incomplete.
  - mode='parse':     parse and simplify a single expression; outcome='unknown'.

The script MUST never crash. On any exception (including missing sympy) it emits
outcome='unknown' with a diagnostic log and exits 0.
"""

from __future__ import annotations

import json
import sys
import traceback


def emit(result: dict) -> None:
    """Write a canonical-JSON response to stdout and flush."""
    text = json.dumps(result, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    sys.stdout.write(text)
    sys.stdout.write("\n")
    sys.stdout.flush()


def main() -> None:
    try:
        try:
            import sympy  # type: ignore[import-not-found]
        except Exception as exc:  # noqa: BLE001 — must degrade gracefully
            emit({"outcome": "unknown", "artifact": None, "log": f"sympy_not_installed: {exc}"})
            return

        raw = sys.stdin.read()
        if not raw:
            emit({"outcome": "unknown", "artifact": None, "log": "empty_stdin"})
            return

        try:
            req = json.loads(raw)
        except json.JSONDecodeError as exc:
            emit({"outcome": "unknown", "artifact": None, "log": f"invalid_json: {exc}"})
            return

        mode = req.get("mode", "expand")
        lhs_str = req.get("lhs")
        rhs_str = req.get("rhs")
        expr_str = req.get("expr")

        if mode == "parse":
            if expr_str is None:
                emit({"outcome": "unknown", "artifact": None, "log": "parse_mode_requires_expr"})
                return
            try:
                expr = sympy.sympify(expr_str)
            except Exception as exc:  # noqa: BLE001
                emit({"outcome": "unknown", "artifact": None, "log": f"parse_failed: {exc}"})
                return
            simplified = sympy.simplify(expr)
            emit({
                "outcome": "unknown",
                "artifact": json.dumps({"simplified": str(simplified)}, sort_keys=True, ensure_ascii=False),
                "log": f"parsed_and_simplified; sympy={sympy.__version__}",
            })
            return

        # equality-style modes require lhs and rhs
        if lhs_str is None or rhs_str is None:
            emit({"outcome": "unknown", "artifact": None, "log": "missing_lhs_or_rhs"})
            return

        try:
            lhs = sympy.sympify(lhs_str)
            rhs = sympy.sympify(rhs_str)
        except Exception as exc:  # noqa: BLE001
            emit({"outcome": "unknown", "artifact": None, "log": f"sympify_failed: {exc}"})
            return

        if mode == "expand":
            lhs_expanded = sympy.expand(lhs)
            rhs_expanded = sympy.expand(rhs)
            equal = (lhs_expanded == rhs_expanded)
            artifact = json.dumps(
                {"lhs_expanded": str(lhs_expanded), "rhs_expanded": str(rhs_expanded)},
                sort_keys=True,
                ensure_ascii=False,
            )
            # SOUND: structural equality of expanded forms.
            outcome = "verified" if equal else "refuted"
            emit({"outcome": outcome, "artifact": artifact, "log": f"expand; sympy={sympy.__version__}"})
            return

        if mode == "simplify":
            lhs_simplified = sympy.simplify(lhs)
            rhs_simplified = sympy.simplify(rhs)
            artifact = json.dumps(
                {"lhs_simplified": str(lhs_simplified), "rhs_simplified": str(rhs_simplified)},
                sort_keys=True,
                ensure_ascii=False,
            )
            # HEURISTIC: simplify is incomplete; we never claim verified. The caller
            # may upgrade to a stronger backend (SMT/Formal) for a sound verdict.
            emit({"outcome": "unknown", "artifact": artifact, "log": f"simplify_heuristic; sympy={sympy.__version__}"})
            return

        emit({"outcome": "unknown", "artifact": None, "log": f"unknown_mode: {mode}"})

    except Exception:  # noqa: BLE001 — last-resort guard, must never crash
        emit({"outcome": "unknown", "artifact": None, "log": f"fatal: {traceback.format_exc()}"})


if __name__ == "__main__":
    main()
