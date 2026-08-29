"""Slice-6 FEM verification: 2D Poisson with mixed Dirichlet/Neumann boundary
conditions on the unit square, P1 triangular elements, uniform refinement
ladder, L2/H1 error measurement against a manufactured analytic solution.

Numerical-authority discipline (SCIENTIFIC_MODEL §10 / D-086-5):
- the manufactured solution arrives as EXPRESSION DATA under the same strict
  AST whitelist as identity_check (never eval, no attribute access);
- sympy derives f = -d2u/dx2 - d2u/dy2 and the Neumann fluxes du/dn EXACTLY,
  so the measured error is pure FEM discretization error;
- the op reports measurements only (errors, observed orders); VERDICTS are
  computed by the TS executor mechanically against the theoretical P1 rates
  (L2 order 2, H1 order 1). No randomness: the mesh uses a fixed diagonal
  split, so identical payloads reproduce identical floats on the same
  thread-pinned process.
"""
from __future__ import annotations

import ast as _ast
import itertools
import time
from typing import Any

import numpy as np
import scipy.sparse as sp_sparse
import scipy.sparse.linalg as sp_linalg

_ALLOWED_SYMPY_FUNCS: dict[str, Any] | None = None


def _allowed_funcs() -> dict[str, Any]:
    global _ALLOWED_SYMPY_FUNCS
    if _ALLOWED_SYMPY_FUNCS is None:
        import sympy as sp

        _ALLOWED_SYMPY_FUNCS = {
            "exp": sp.exp, "log": sp.log, "log2": lambda v: sp.log(v, 2),
            "log10": lambda v: sp.log(v, 10), "sqrt": sp.sqrt,
            "sin": sp.sin, "cos": sp.cos, "tan": sp.tan,
            "sinh": sp.sinh, "cosh": sp.cosh, "tanh": sp.tanh,
            "arcsin": sp.asin, "arccos": sp.acos, "arctan": sp.atan, "arctan2": sp.atan2,
            "abs": sp.Abs, "floor": sp.floor, "ceil": sp.ceiling,
            "min": sp.Min, "max": sp.Max,
        }
    return _ALLOWED_SYMPY_FUNCS


def expr_to_sympy(text: str, symbols: dict[str, Any]):
    """Strict AST whitelist -> sympy expression (mirrors identity_check: plain
    names, numeric literals, whitelisted functions, no attributes, no kwargs)."""
    import sympy as sp

    allowed_consts = {"pi": sp.pi, "e": sp.E}

    def build(node):
        if isinstance(node, _ast.Expression):
            return build(node.body)
        if isinstance(node, _ast.Constant):
            if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
                raise TypeError(f"fem expression: non-numeric constant {node.value!r}")
            return sp.Float(node.value)
        if isinstance(node, _ast.Name):
            if node.id in symbols:
                return symbols[node.id]
            if node.id in allowed_consts:
                return allowed_consts[node.id]
            raise ValueError(f"fem expression: unknown variable {node.id!r} (known: {sorted(symbols)})")
        if isinstance(node, _ast.BinOp):
            left = build(node.left)
            right = build(node.right)
            if isinstance(node.op, _ast.Add):
                return left + right
            if isinstance(node.op, _ast.Sub):
                return left - right
            if isinstance(node.op, _ast.Mult):
                return left * right
            if isinstance(node.op, _ast.Div):
                return left / right
            if isinstance(node.op, _ast.Pow):
                return left ** right
            if isinstance(node.op, _ast.Mod):
                return sp.Mod(left, right)
            raise ValueError("fem expression: unsupported binary operator")
        if isinstance(node, _ast.UnaryOp):
            if isinstance(node.op, _ast.UAdd):
                return build(node.operand)
            if isinstance(node.op, _ast.USub):
                return -build(node.operand)
            raise ValueError("fem expression: unsupported unary operator")
        if isinstance(node, _ast.Call):
            funcs = _allowed_funcs()
            if not isinstance(node.func, _ast.Name) or node.func.id not in funcs:
                raise ValueError("fem expression: only whitelisted plain-named functions may be called")
            if node.keywords:
                raise ValueError("fem expression: keyword arguments are not allowed")
            return funcs[node.func.id](*[build(a) for a in node.args])
        raise ValueError(f"fem expression: node {type(node).__name__} is outside the whitelist")

    try:
        tree = _ast.parse(text, mode="eval")
    except SyntaxError as exc:
        raise ValueError(f"fem expression does not parse: {exc}") from exc
    for node in _ast.walk(tree):
        if isinstance(node, _ast.Attribute):
            raise ValueError("Attribute access is forbidden in fem expressions (sandbox-escape chain)")
    return build(tree)


# 3-point barycentric quadrature (degree-2 exact): point weight = |T|/3.
_BARY = ((2.0 / 3.0, 1.0 / 6.0), (1.0 / 6.0, 2.0 / 3.0), (1.0 / 6.0, 1.0 / 6.0))
# 2-point Gauss-Legendre on [0, 1] for edge integrals.
_EDGE_GAUSS = ((0.21132486540518713, 0.5), (0.78867513459481287, 0.5))

def _nid(i: int, j: int, m: int) -> int:
    """Row-major node index in the (m x m) grid (m = n + 1)."""
    return j * m + i


def _node_xy(idx: int, xs: np.ndarray, m: int) -> tuple[float, float]:
    """Node coordinates in the row-major grid."""
    return (float(xs[idx % m]), float(xs[idx // m]))



def op_fem_poisson_2d(payload: dict[str, Any]) -> dict[str, Any]:
    u_expr = payload["manufacturedSolution"]
    edges = payload["edges"]  # {bottom, top, left, right} -> 'dirichlet' | 'neumann'
    levels = [int(n) for n in payload["levels"]]
    if not levels or any(n < 2 or n > 256 for n in levels):
        raise ValueError("fem levels must each be in 2..256")
    if sorted(levels) != levels or len(set(levels)) != len(levels):
        raise ValueError("fem levels must be a strictly increasing refinement ladder")
    if len(levels) < 3:
        raise ValueError("fem needs >= 3 levels to measure a convergence order")
    if set(edges) != {"bottom", "top", "left", "right"} or any(
        v not in ("dirichlet", "neumann") for v in edges.values()
    ):
        raise ValueError("fem edges must map each of bottom/top/left/right to dirichlet|neumann")
    if all(v == "neumann" for v in edges.values()):
        raise ValueError("pure-Neumann Poisson is ill-posed up to a constant (need >= 1 Dirichlet edge)")

    import sympy as sp

    xs_sym, ys_sym = sp.symbols("x y", real=True)
    su = expr_to_sympy(u_expr, {"x": xs_sym, "y": ys_sym})
    sf = -sp.diff(su, xs_sym, 2) - sp.diff(su, ys_sym, 2)
    flux = {
        "bottom": -sp.diff(su, ys_sym),   # outward normal (0, -1)
        "top": sp.diff(su, ys_sym),       # outward normal (0, +1)
        "left": -sp.diff(su, xs_sym),     # outward normal (-1, 0)
        "right": sp.diff(su, xs_sym),     # outward normal (+1, 0)
    }
    u_num = sp.lambdify((xs_sym, ys_sym), su, modules="numpy")
    f_num = sp.lambdify((xs_sym, ys_sym), sf, modules="numpy")
    dux_num = sp.lambdify((xs_sym, ys_sym), sp.diff(su, xs_sym), modules="numpy")
    duy_num = sp.lambdify((xs_sym, ys_sym), sp.diff(su, ys_sym), modules="numpy")
    flux_num = {k: sp.lambdify((xs_sym, ys_sym), v, modules="numpy") for k, v in flux.items()}

    results: list[dict[str, Any]] = []
    for n in levels:
        m = n + 1
        ndof = m * m
        xs = np.linspace(0.0, 1.0, m)


        triangles = []
        for j in range(n):
            for i in range(n):
                a, b, c, d = _nid(i, j, m), _nid(i + 1, j, m), _nid(i, j + 1, m), _nid(i + 1, j + 1, m)
                triangles.append((a, c, b))  # fixed diagonal split (a-c)
                triangles.append((c, d, b))

        rows: list[int] = []
        cols: list[int] = []
        vals: list[float] = []
        b_vec = np.zeros(ndof, dtype=np.float64)

        for (i0, i1, i2) in triangles:
            (xa, ya), (xc, yc), (xb, yb) = _node_xy(i0, xs, m), _node_xy(i1, xs, m), _node_xy(i2, xs, m)
            area = 0.5 * abs((xc - xa) * (yb - ya) - (xb - xa) * (yc - ya))
            if area < 1e-16:
                raise ValueError("degenerate triangle in fem mesh")
            vand = np.array([[xa, ya, 1.0], [xc, yc, 1.0], [xb, yb, 1.0]])
            eye = np.eye(3)
            idx = (i0, i1, i2)
            for r in range(3):
                grad_r = np.linalg.solve(vand, eye[r])[:2]
                for s in range(3):
                    grad_s = np.linalg.solve(vand, eye[s])[:2]
                    rows.append(idx[r])
                    cols.append(idx[s])
                    vals.append(float(area * float(grad_r @ grad_s)))
            for (l0, l1) in _BARY:
                l2c = 1.0 - l0 - l1
                qx = l0 * xa + l1 * xc + l2c * xb
                qy = l0 * ya + l1 * yc + l2c * yb
                fv = float(f_num(qx, qy))
                for r, lr in zip(range(3), (l0, l1, l2c)):
                    b_vec[idx[r]] += (area / 3.0) * fv * lr

        # Neumann boundary integrals: g_N * phi over each boundary segment.
        segments: list[tuple[int, int, Any, tuple[float, float], tuple[float, float]]] = []
        if edges["bottom"] == "neumann":
            segments += [(_nid(i, 0, m), _nid(i + 1, 0, m), flux_num["bottom"], (xs[i], 0.0), (xs[i + 1], 0.0)) for i in range(n)]
        if edges["top"] == "neumann":
            segments += [(_nid(i, n, m), _nid(i + 1, n, m), flux_num["top"], (xs[i], 1.0), (xs[i + 1], 1.0)) for i in range(n)]
        if edges["left"] == "neumann":
            segments += [(_nid(0, j, m), _nid(0, j + 1, m), flux_num["left"], (0.0, xs[j]), (0.0, xs[j + 1])) for j in range(n)]
        if edges["right"] == "neumann":
            segments += [(_nid(n, j, m), _nid(n, j + 1, m), flux_num["right"], (1.0, xs[j]), (1.0, xs[j + 1])) for j in range(n)]
        for (n0, n1, g_num, (x0, y0), (x1, y1)) in segments:
            length = float(np.hypot(x1 - x0, y1 - y0))
            for (t, w) in _EDGE_GAUSS:
                qx = x0 + t * (x1 - x0)
                qy = y0 + t * (y1 - y0)
                g = float(g_num(qx, qy))
                b_vec[n0] += length * w * g * (1.0 - t)
                b_vec[n1] += length * w * g * t

        K = sp_sparse.csr_matrix((vals, (rows, cols)), shape=(ndof, ndof))

        # Symmetric Dirichlet elimination: fold K @ u_D into b, then remove the
        # Dirichlet rows/cols and pin those dofs (K3 stays symmetric SPD).
        mask = np.ones(ndof, dtype=bool)
        u_d = np.zeros(ndof, dtype=np.float64)
        for j in range(m):
            for i in range(m):
                on_edges = []
                if j == 0:
                    on_edges.append(edges["bottom"])
                if j == n:
                    on_edges.append(edges["top"])
                if i == 0:
                    on_edges.append(edges["left"])
                if i == n:
                    on_edges.append(edges["right"])
                if any(e == "dirichlet" for e in on_edges):
                    node = _nid(i, j, m)
                    mask[node] = False
                    u_d[node] = float(u_num(xs[i], xs[j]))
        b_vec = b_vec - K @ u_d
        k_coo = K.tocoo()
        keep = mask[k_coo.row] & mask[k_coo.col]
        pinned = np.flatnonzero(~mask)
        K3 = sp_sparse.csr_matrix(
            (
                np.concatenate([k_coo.data[keep], np.ones(pinned.size)]),
                (
                    np.concatenate([k_coo.row[keep], pinned]),
                    np.concatenate([k_coo.col[keep], pinned]),
                ),
            ),
            shape=(ndof, ndof),
        )
        b_vec[~mask] = u_d[~mask]

        t0 = time.perf_counter()
        uh = sp_linalg.spsolve(K3.tocsr(), b_vec)
        solve_ms = (time.perf_counter() - t0) * 1000.0

        level: dict[str, Any] = {"n": n, "h": 1.0 / n, "ndof": ndof, "solveMs": round(solve_ms, 3)}
        if not np.all(np.isfinite(uh)):
            level.update(nonFinite=True)
            results.append(level)
            continue

        l2_sq = 0.0
        h1_sq = 0.0
        for (i0, i1, i2) in triangles:
            (xa, ya), (xc, yc), (xb, yb) = _node_xy(i0, xs, m), _node_xy(i1, xs, m), _node_xy(i2, xs, m)
            area = 0.5 * abs((xc - xa) * (yb - ya) - (xb - xa) * (yc - ya))
            vand = np.array([[xa, ya, 1.0], [xc, yc, 1.0], [xb, yb, 1.0]])
            guh = np.linalg.solve(vand, np.array([uh[i0], uh[i1], uh[i2]]))[:2]
            for (l0, l1) in _BARY:
                l2c = 1.0 - l0 - l1
                qx = l0 * xa + l1 * xc + l2c * xb
                qy = l0 * ya + l1 * yc + l2c * yb
                diff = (l0 * uh[i0] + l1 * uh[i1] + l2c * uh[i2]) - float(u_num(qx, qy))
                gdx = guh[0] - float(dux_num(qx, qy))
                gdy = guh[1] - float(duy_num(qx, qy))
                l2_sq += (area / 3.0) * diff * diff
                h1_sq += (area / 3.0) * (gdx * gdx + gdy * gdy)
        level.update(nonFinite=False, l2Err=float(np.sqrt(l2_sq)), h1Err=float(np.sqrt(h1_sq)))
        results.append(level)

    def orders(key: str) -> list[float]:
        out: list[float] = []
        for prev, cur in itertools.pairwise(results):
            if prev.get("nonFinite") or cur.get("nonFinite"):
                continue
            if not (prev[key] > 0.0 and cur[key] > 0.0):
                continue
            out.append(float(np.log(prev[key] / cur[key]) / np.log(prev["h"] / cur["h"])))
        return out

    return {
        "manufactured": u_expr,
        "forcing": str(sf),
        "edges": edges,
        "levels": results,
        "l2Orders": orders("l2Err"),
        "h1Orders": orders("h1Err"),
        "expectedL2Order": 2.0,
        "expectedH1Order": 1.0,
    }





