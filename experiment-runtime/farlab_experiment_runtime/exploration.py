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
- getattr is GUARDED (dunder strings and dangerous-module resolutions raise);
  setattr/delattr are unavailable
- unavailable: open/exec/eval/compile/__import__/input/globals/locals/breakpoint
  and any import outside the allowlist (ImportError -> visible failure)
- runtime containment: dangerous modules (os/sys/subprocess/socket, by
  identity) are scrubbed from bound-module attribute sets for the duration of
  each run and restored afterwards (np.f2py.os-style traversal finds nothing)
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
# Host-side identity anchors for the runtime scrub below. Importing them here
# is a HOST privilege; they are never exposed to the sandboxed namespace.
import os as _os
import sys as _sys
import subprocess as _subprocess
import socket as _socket
import types as _types

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
    # Endgame audit 2026-08-30: attribute mutation defeats every static name
    # ban; legitimate analysis code never needs these.
    "setattr", "delattr",
)

# Host-side identity set for the runtime scrub: modules that must never be
# reachable from the sandboxed namespace, even through bound-module attribute
# traversal (np.f2py.os was a live-confirmed escape surface).
_DANGEROUS_MODULES = frozenset({_os, _sys, _subprocess, _socket})

_SUCCESS_STDOUT_CHARS = 8_000
_ERROR_STDOUT_CHARS = 4_000


class _BoundedTextBuffer(io.TextIOBase):
    """Text sink that retains only the newest ``max_output_chars`` chars."""

    def __init__(self, max_output_chars: int) -> None:
        if max_output_chars < 0:
            raise ValueError("max_output_chars must be non-negative")
        super().__init__()
        self.max_output_chars = max_output_chars
        self.truncated = False
        self._chunks: _collections.deque[str] = _collections.deque()
        self._size = 0

    def writable(self) -> bool:
        return True

    def write(self, text: str) -> int:
        if not isinstance(text, str):
            raise TypeError(f"write() argument must be str, not {type(text).__name__}")

        chars_written = len(text)
        if chars_written == 0:
            return 0

        if self._size + chars_written > self.max_output_chars:
            self.truncated = True

        if self.max_output_chars == 0:
            self._chunks.clear()
            self._size = 0
            return chars_written

        if chars_written >= self.max_output_chars:
            self._chunks.clear()
            tail = text[-self.max_output_chars:]
            self._chunks.append(tail)
            self._size = len(tail)
            return chars_written

        self._chunks.append(text)
        self._size += chars_written
        overflow = self._size - self.max_output_chars
        while overflow > 0:
            oldest = self._chunks[0]
            if len(oldest) <= overflow:
                self._chunks.popleft()
                self._size -= len(oldest)
                overflow -= len(oldest)
            else:
                self._chunks[0] = oldest[overflow:]
                self._size -= overflow
                overflow = 0
        return chars_written

    def getvalue(self) -> str:
        return "".join(self._chunks)


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
    # Endgame audit 2026-08-30: aliasing (p = np / m = np.f2py) renamed the
    # root out of the depth check. Track alias bindings of allowed roots and
    # lower the threshold by the binding depth so the SAME escape surface stays
    # rejected regardless of what the root is called this line.
    aliases: dict[str, int] = {}
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
        ):
            target = node.targets[0].id
            value: ast.expr = node.value
            depth = 0
            while isinstance(value, ast.Attribute):
                value = value.value
                depth += 1
            if isinstance(value, ast.Name) and value.id in _ALLOWED_ROOTS and target != value.id:
                aliases[target] = depth
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            depth = 0
            while isinstance(func, ast.Attribute):
                func = func.value
                depth += 1
            if isinstance(func, ast.Name):
                if func.id in _ALLOWED_ROOTS and depth >= 3:
                    raise ValueError(
                        "deep module-attribute chain from a bound root (e.g. np.x.y(...)) "
                        "is forbidden — numpy re-exports os/sys via auto-imported submodules"
                    )
                bind_depth = aliases.get(func.id)
                if bind_depth is not None and depth >= max(1, 3 - bind_depth):
                    raise ValueError(
                        f"deep module-attribute chain through alias {func.id!r} of a bound root "
                        "is forbidden — renaming the root does not change the escape surface"
                    )


def _scrub_dangerous(
    obj: Any, removed: list[tuple[Any, str, Any]], depth: int = 0, seen: set[int] | None = None
) -> None:
    """Runtime containment (endgame audit 2026-08-30): delete attributes that
    ARE dangerous modules (by identity — e.g. np.f2py.os is the real `os`)
    from the bound modules the sandbox exposes, recording every deletion for
    restoration after the run. This is the layer a static gate cannot provide:
    even a chain the AST pass misses finds the module GONE. Sidecar calls are
    serialized, so scrub→exec→restore cannot interleave; a failed best-effort
    restore is self-healing because the next run scrubs again.
    """
    if seen is None:
        seen = set()
    if id(obj) in seen:
        return
    seen.add(id(obj))
    if not isinstance(obj, _types.ModuleType):
        return
    for name, val in list(vars(obj).items()):
        if isinstance(val, _types.ModuleType):
            if val in _DANGEROUS_MODULES:
                try:
                    delattr(obj, name)
                    removed.append((obj, name, val))
                except (AttributeError, TypeError):
                    pass
            elif depth < 2:
                _scrub_dangerous(val, removed, depth + 1, seen)


def run_exploration(payload: dict[str, Any]) -> dict[str, Any]:
    code = payload.get("code")
    if not isinstance(code, str) or not code.strip():
        raise ValueError("payload.code must be non-empty Python source")

    _check_source(code)

    stdout = _BoundedTextBuffer(_SUCCESS_STDOUT_CHARS)
    safe_builtins = {n: getattr(builtins, n) for n in dir(builtins) if n not in _FORBIDDEN_BUILTINS}
    try:
        import numpy as np  # family env always has numpy; degrade loudly if not
    except ImportError as exc:  # pragma: no cover - env contract
        raise RuntimeError(f"family env missing numpy: {exc}") from exc

    # Runtime containment: strip dangerous-module attributes (identity check)
    # from every module the namespace binds, restore afterwards.
    removed: list[tuple[Any, str, Any]] = []
    _scrub_dangerous(np, removed)
    for bound in _ALLOWED_MODULES.values():
        _scrub_dangerous(bound, removed)

    # Guarded getattr (defense in depth behind the TS-side total ban): dunder
    # resolution via dynamic strings and any resolution onto a dangerous
    # module both fail loudly inside the sandbox.
    _real_getattr = builtins.getattr

    def _guarded_getattr(obj: Any, name: Any, *default: Any) -> Any:
        if isinstance(name, str) and name.startswith("__") and name.endswith("__"):
            raise ValueError("getattr dunder access is forbidden in the exploration sandbox")
        val = _real_getattr(obj, name, *default)
        if isinstance(val, _types.ModuleType) and val in _DANGEROUS_MODULES:
            raise ValueError(
                f"getattr resolved to a forbidden module: {_real_getattr(val, '__name__', 'module')!r}"
            )
        return val

    namespace: dict[str, Any] = {
        "__builtins__": {**safe_builtins, "__import__": _make_import({**_ALLOWED_MODULES, "numpy": np})},
        "print": lambda *a, **k: print(*a, file=stdout, **k),
        "np": np,
        "getattr": _guarded_getattr,
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
            "stdout": stdout.getvalue()[-_ERROR_STDOUT_CHARS:],
        }
    finally:
        for obj, name, val in removed:
            try:
                setattr(obj, name, val)
            except Exception:  # best-effort restore; next run scrubs again
                pass

    return {
        "ok": True,
        "stdout": stdout.getvalue(),
        "stdoutTruncated": stdout.truncated,
    }


def op_run_exploration(payload: dict[str, Any]) -> dict[str, Any]:
    # Static-gate violations (allowlist/parse) propagate as PROTOCOL errors: the
    # caller's TS gate should have caught them, so a raise here is loud and correct.
    # Runtime failures inside the sandbox are RESULTS (a failed analysis is itself
    # a candidate finding), returned as exploration.ok=false.
    result = run_exploration(payload)
    return {"exploration": result}
