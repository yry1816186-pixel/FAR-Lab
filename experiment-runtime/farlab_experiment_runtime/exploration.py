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
import importlib
import io
import contextlib
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

# Dunder introspection names banned at AST level (mirror of the TS gate's
# E-ESCAPE). Adversarial audit 2026-08-24: without this ban the restricted
# namespace is defeatable by pure attribute traversal —
# ().__class__.__bases__[0].__subclasses__() ... __init__.__globals__
# ['__builtins__'] recovers the real open/__import__. Analysis code has no
# legitimate use for interpreter internals.
#
# P0 fix (adversarial review 06, empirically confirmed): the escape does NOT
# need any dunder at all — numpy auto-imports submodules that re-export os/sys:
#   np.f2py.os.system("...") executed a real command in a live probe.
# The namespace only pre-binds `np`, but attribute traversal into ANY bound
# object can reach arbitrary modules, so module-attribute chains must be
# resolved and checked against the allowlist at AST level. Dunder names stay
# banned as defense-in-depth; this check closes the non-dunder path.
_ALLOWED_ROOTS = frozenset(_ALLOWED_MODULES.keys()) | {"np"}
_ESCAPE_ATTRS = frozenset({
    "__class__", "__bases__", "__base__", "__mro__", "__subclasses__",
    "__globals__", "__builtins__", "__dict__", "__code__",
    "__func__", "__closure__", "__defaults__", "__kwdefaults__",
    # loader/import-system surface reachable WITHOUT dunders:
    "__loader__", "__spec__", "__import__", "load_module", "exec_module",
    "get_code", "find_module", "create_module",
})


def _make_import(module_map: dict[str, Any]):
    def _import(name, globals=None, locals=None, fromlist=(), level=0):
        if level:
            raise ImportError(f"relative imports are not provided by the exploration namespace: {name!r}")
        if name in module_map:
            return module_map[name]
        # 14-F2 (2026-08-26): numpy>=2 ops dispatch through LAZY submodule imports
        # (e.g. numpy._core._methods) at runtime — the payload never names them,
        # numpy's own internals do. Dotted names under an ALREADY-BOUND family
        # root resolve through importlib so the family's own machinery completes;
        # this does not widen the sandbox (the resolved module belongs to the
        # allowed package; attribute-chain escapes stay closed by the AST gate).
        root = name.split(".")[0]
        if root in module_map or root == "np":
            return importlib.import_module(name)
        raise ImportError(f"exploration namespace does not provide {name!r}; allowed: {sorted(module_map)}")
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
        elif isinstance(node, ast.Attribute):
            if node.attr in _ESCAPE_ATTRS:
                raise ValueError(
                    f"attribute {node.attr!r} is forbidden: interpreter introspection is the sandbox-escape chain"
                )
            # P0 fix (review 06): attribute chains rooted at a pre-bound module
            # (np.f2py.os.system) reach arbitrary modules without any import or
            # dunder. Only ONE level of module-attribute access is allowed, and
            # only for names that are not themselves module objects on the
            # allowlist roots. Deeper chains -> reject.
        elif isinstance(node, ast.Constant):
            # getattr(obj, "__globals__") carries the dunder as a plain string.
            if isinstance(node.value, str) and node.value in _ESCAPE_ATTRS:
                raise ValueError(
                    f"string form of {node.value!r} is forbidden (introspection via getattr does not bypass the gate)"
                )
    # Second pass over Attribute CHAINS (not single nodes): np.a.b... is an
    # escape regardless of the individual names.
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            depth = 0
            while isinstance(func, ast.Attribute):
                func = func.value
                depth += 1
            if depth >= 3 and isinstance(func, ast.Name) and func.id in _ALLOWED_ROOTS:
                raise ValueError(
                    "deep module-attribute chain from a bound root (e.g. np.x.y(...)) "
                    "is forbidden — numpy re-exports os/sys via auto-imported submodules"
                )


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
        "__builtins__": {**safe_builtins, "__import__": _make_import({**_ALLOWED_MODULES, "numpy": np})},
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
