"""AST gradient symbol scanner (R4 fixed version).

dataclass definitions are placed before FORBIDDEN_PATTERNS to avoid NameError
on import. The scanner covers both ast.Call and ast.Attribute nodes to detect
gradient-training symbols that would pollute repro_hash by consuming
random_state.

Authority: FAR_CHAIN_DEV_SPEC/09_repro_deterministic.md §3.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class ForbiddenPattern:
    """A forbidden gradient symbol pattern.

    frozen=True guarantees immutability. Must be defined before
    FORBIDDEN_PATTERNS to avoid NameError on import (R4 root cause).
    """

    dotted_path: str
    node_kind: str
    reason: str


@dataclass(frozen=True)
class ScanViolation:
    """A scan hit record."""

    dotted_path: str
    node_kind: str
    lineno: int
    col_offset: int
    source_snippet: str


FORBIDDEN_PATTERNS: tuple[ForbiddenPattern, ...] = (
    ForbiddenPattern(
        dotted_path="torch.autograd.grad",
        node_kind="call",
        reason="autograd.grad consumes random_state, gradient training pollutes repro_hash",
    ),
    ForbiddenPattern(
        dotted_path="torch.Tensor.backward",
        node_kind="call",
        reason="backward() backprop consumes random state",
    ),
    ForbiddenPattern(
        dotted_path="torch.Tensor.backward",
        node_kind="attribute",
        reason="backward attribute reference (may precede .backward() call)",
    ),
    ForbiddenPattern(
        dotted_path="torch.optim.Optimizer.step",
        node_kind="call",
        reason="optimizer.step() updates parameters, breaks determinism",
    ),
    ForbiddenPattern(
        dotted_path="torch.optim.Optimizer.zero_grad",
        node_kind="call",
        reason="zero_grad() clears gradients, signals training loop presence",
    ),
    ForbiddenPattern(
        dotted_path="torch.compile",
        node_kind="call",
        reason="torch.compile fuses kernels, float accumulation order not reproducible",
    ),
    ForbiddenPattern(
        dotted_path="torch.jit.script",
        node_kind="call",
        reason="JIT compilation fuses kernels, same as torch.compile",
    ),
)


class GradientSymbolLeak(Exception):
    """Gradient symbol leaked past ALLOWED_OPS whitelist."""

    def __init__(self, violations: Sequence[ScanViolation]) -> None:
        self.violations = tuple(violations)
        detail = "\n".join(
            f"  L{v.lineno}:{v.col_offset} {v.dotted_path} ({v.node_kind}) - {v.source_snippet!r}"
            for v in violations
        )
        super().__init__(
            f"gradient symbol leaked past ALLOWED_OPS whitelist ({len(violations)} hits):\n{detail}"
        )


def scan(source: str) -> None:
    """Scan Python source for gradient symbols and raise on hit.

    Args:
        source: Python source string to scan.

    Raises:
        GradientSymbolLeak: when any FORBIDDEN_PATTERNS hit.
        SyntaxError: when source is not valid Python.
    """
    tree = ast.parse(source)
    violations: list[ScanViolation] = []

    for node in ast.walk(tree):
        for pattern in FORBIDDEN_PATTERNS:
            if pattern.node_kind == "call" and isinstance(node, ast.Call):
                dotted = _dotted_path_of_call(node)
                if dotted == pattern.dotted_path:
                    violations.append(
                        ScanViolation(
                            dotted_path=dotted,
                            node_kind="call",
                            lineno=node.lineno,
                            col_offset=node.col_offset,
                            source_snippet=ast.get_source_segment(source, node) or "",
                        )
                    )
            elif pattern.node_kind == "attribute" and isinstance(node, ast.Attribute):
                dotted = _dotted_path_of_attribute(node)
                if dotted == pattern.dotted_path:
                    violations.append(
                        ScanViolation(
                            dotted_path=dotted,
                            node_kind="attribute",
                            lineno=node.lineno,
                            col_offset=node.col_offset,
                            source_snippet=ast.get_source_segment(source, node) or "",
                        )
                    )

    if violations:
        raise GradientSymbolLeak(violations)


def _dotted_path_of_call(node: ast.Call) -> str:
    """Recover the dotted path of an ast.Call func. Returns empty string for unknown shapes."""
    func = node.func
    parts: list[str] = []
    while isinstance(func, ast.Attribute):
        parts.append(func.attr)
        func = func.value
    if isinstance(func, ast.Name):
        parts.append(func.id)
        return ".".join(reversed(parts))
    return ""


def _dotted_path_of_attribute(node: ast.Attribute) -> str:
    """Recover the dotted path of an ast.Attribute."""
    parts: list[str] = [node.attr]
    func = node.value
    while isinstance(func, ast.Attribute):
        parts.append(func.attr)
        func = func.value
    if isinstance(func, ast.Name):
        parts.append(func.id)
        return ".".join(reversed(parts))
    return ""
