"""Exploratory analysis op (AVO fusion G4 execution half).

Runs agent-authored ANALYSIS code inside the pinned experiment-runtime family
env -- the same process family the confirmatory sidecar uses, with the same
thread pinning and no network surface added. This is the EXPLORATORY layer
only (research/avo-nooa/02-farlab-gap-analysis.md G4 verdict):

- The TS-side static gate (src/agent/exploratory-codeact.ts) runs BEFORE this
  op and rejects confirmatory-boundary escapes; defense in depth here means a
  restricted namespace: no os/sys/subprocess/socket imports resolve at all.
- Outputs are CANDIDATE findings. They never touch ExperimentSpec/verdicts --
  those stay reachable only through reviewed template ops.
- Everything the code prints is captured and returned so the caller can persist
  it as an artifact + receipt (provenance completeness).

Namespace contract:
- available: print, json, math, statistics, re, itertools, collections,
  csv, io, datetime, decimal, fractions, hashlib, uuid4, numpy (as np)
- unavailable: open/exec/eval/compile/__import__/input/globals/locals/breakpoint
  and any import outside the allowlist (ImportError -> visible failure)
"""
from __future__ import annotations

import ast
import builtins
import io
import contextlib
import importlib
import json as _json
import math as _math
import statistics as _statistics
import re as _re
import itertools as _itertools
import collections as _collections
import csv as _csv
import datetime as _datetime
import decimal as _decimal
import fractions as _fractions
import hashlib as _hashlib

from typing import Any

# Modules the analysis namespace may import. Deliberately small; scientific
# heavyweights (numpy) are pre-bound instead of import-resolved so the
# allowlist stays auditable in one place.
_ALLOWED_MODULES = {
    "json": _json, "math": _math, "statistics": _statistics, "re": _re,
    "itertools": _itertools, "collections": _collections, "csv": _csv,
    "datetime": _datetime, "decimal": _decimal, "fractions": _fractions,
    "hashlib": _hashlib,
}

_FORBIDDEN_BUILTINS = (
    "open", "exec", "eval", "compile", "__import__", "input",
    "globals", "locals", "breakpoint", "vars", "dir",
)


def _make_import(module_map: dict[str, Any]):
    def _import(name, globals=None, locals=None, fromlist=(), level=0):
        if level or name not in module_map:
            raise ImportError(f"exploration namespace does not provide {name!r}; allowed: {sorted(module_map)}")
        return module_map[name]
    return _import


def _check_source(code: str) -> None:
    """Static AST checks mirrored from the TS gate -- cheap, loud, first."""
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        raise ValueError(f"exploration code does not parse: {exc}") from exc
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root not in _ALLOWED_MODULES:
                    raise ValueError(f"import of {root!r} is outside the exploration allowlist")
        elif isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if node.level or root not in _ALLOWED_MODULES:
                raise ValueError(f"from-import of {node.module!r} is outside the exploration allowlist")


def run_exploration(payload: dict[str, Any]) -> dict[str, Any]:
    code = payload.get("code")
    if not isinstance(code, str) or not code.strip():
        raise ValueError("payload.code must be non-empty Python source")

    _check_source(code)

    stdout = io.StringIO()
    safe_builtins = {n: getattr(builtins, n) for n in dir(builtins) if n not in _FORBIDDEN_BUILTINS}
    try:
        import numpy as np  # family env always has numpy; degrade loudly if not
    except ImportError as exc:  # pragma: no cover - env contract
        raise RuntimeError(f"family env missing numpy: {exc}") from exc

    namespace: dict[str, Any] = {
        "__builtins__": {**safe_builtins, "__import__": _make_import(_ALLOWED_MODULES)},
        "print": lambda *a, **k: print(*a, file=stdout, **k),
        "np": np,
        **_ALLOWED_MODULES,
    }

    try:
        with contextlib.redirect_stdout(stdout):
            exec(compile(code, "<exploration>", "exec"), namespace)  # noqa: S102 - sandboxed namespace, static-gated upstream
    except Exception as exc:
        # Visible failure: partial stdout + error kind. Never swallowed.
        return {
            "ok": False,
            "errorKind": type(exc).__name__,
            "errorMessage": str(exc)[:500],
            "stdout": stdout.getvalue()[-4000:],
        }

    return {
        "ok": True,
        "stdout": stdout.getvalue()[-8000:],  # bounded preview; full text via artifacts when needed
        "stdoutTruncated": len(stdout.getvalue()) > 8000,
    }


def op_run_exploration(payload: dict[str, Any]) -> dict[str, Any]:
    # Static-gate violations (allowlist/parse) propagate as PROTOCOL errors: the
    # caller's TS gate should have caught them, so a raise here is loud and correct.
    # Runtime failures inside the sandbox are RESULTS (a failed analysis is itself
    # a candidate finding), returned as exploration.ok=false.
    result = run_exploration(payload)
    return {"exploration": result}
