"""FEM verification ops (AOSSA scenario A): 2D Poisson with mixed
Dirichlet/Neumann boundary conditions on the unit square.

Slice-6a: UNIFORM refinement ladder, P1 triangles, L2/H1 error measurement
against a manufactured analytic solution.

Slice-6b: ADAPTIVE refinement (AFEM) — residual-based estimator per element,
Doerfler bulk marking, newest-vertex bisection (NVB) with conformity closure.

Numerical-authority discipline (SCIENTIFIC_MODEL §10 / D-086-5):
- the manufactured solution arrives as EXPRESSION DATA under the same strict
  AST whitelist as identity_check (never eval, no attribute access);
- sympy derives f = -d2u/dx2 - d2u/dy2 and the Neumann fluxes du/dn EXACTLY,
  so the measured error is pure FEM discretization error;
- the ops report measurements only (errors, observed orders/rates, estimator
  effectivity); VERDICTS are computed by the TS executor mechanically against
  theoretical rates (uniform P1: L2 order 2 / H1 order 1; adaptive energy-norm
  optimal rate N^{-1/2}). No randomness; fixed diagonal splits and bisection
  decisions from deterministic estimator arithmetic make reruns identical.
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

# ---------------------------------------------------------------------------
# generic assembly over an UNSTRUCTURED conforming P1 mesh
# ---------------------------------------------------------------------------

EdgeKey = tuple[int, int]


def _ekey(a: int, b: int) -> EdgeKey:
    return (a, b) if a < b else (b, a)


def _assemble_solve_measure(
    verts: list[tuple[float, float]],
    tris: list[tuple[int, int, int]],
    edges_cfg: dict[str, str],
    f_num, u_num, dux_num, duy_num, flux_num: dict,
) -> dict[str, Any]:
    """Assemble + solve + measure on the given conforming P1 mesh.

    Returns ndof, uh, l2Err, h1Err and the residual-based element estimator
    etaSq (squared per triangle, indices aligned with `tris`).
    """
    ndof = len(verts)
    rows: list[int] = []
    cols: list[int] = []
    vals: list[float] = []
    b_vec = np.zeros(ndof, dtype=np.float64)

    for (i0, i1, i2) in tris:
        (xa, ya), (xc, yc), (xb, yb) = verts[i0], verts[i1], verts[i2]
        area = 0.5 * abs((xc - xa) * (yb - ya) - (xb - xa) * (yc - ya))
        if area < 1e-16:
            raise ValueError("degenerate triangle in fem mesh")
        vand = np.array([[xa, ya, 1.0], [xc, yc, 1.0], [xb, yb, 1.0]])
        eye = np.eye(3)
        g = [np.linalg.solve(vand, eye[r])[:2] for r in range(3)]
        idx = (i0, i1, i2)
        for r in range(3):
            for s in range(3):
                rows.append(idx[r])
                cols.append(idx[s])
                vals.append(float(area * float(g[r] @ g[s])))
        for (l0, l1) in _BARY:
            l2c = 1.0 - l0 - l1
            qx = l0 * xa + l1 * xc + l2c * xb
            qy = l0 * ya + l1 * yc + l2c * yb
            fv = float(f_num(qx, qy))
            for r, lr in zip(range(3), (l0, l1, l2c)):
                b_vec[idx[r]] += (area / 3.0) * fv * lr

    edge_count: dict[EdgeKey, int] = {}
    for (i0, i1, i2) in tris:
        for a, b in ((i0, i1), (i1, i2), (i2, i0)):
            k = _ekey(a, b)
            edge_count[k] = edge_count.get(k, 0) + 1

    # Neumann boundary integrals: boundary edges of the matching family.
    for (a, b), count in edge_count.items():
        if count != 1:
            continue
        (x0, y0), (x1, y1) = verts[a], verts[b]
        if abs(y0) < 1e-12 and abs(y1) < 1e-12:
            family = "bottom"
        elif abs(y0 - 1.0) < 1e-12 and abs(y1 - 1.0) < 1e-12:
            family = "top"
        elif abs(x0) < 1e-12 and abs(x1) < 1e-12:
            family = "left"
        elif abs(x0 - 1.0) < 1e-12 and abs(x1 - 1.0) < 1e-12:
            family = "right"
        else:
            continue
        if edges_cfg[family] != "neumann":
            continue
        length = float(np.hypot(x1 - x0, y1 - y0))
        g_num = flux_num[family]
        for (t, w) in _EDGE_GAUSS:
            qx = x0 + t * (x1 - x0)
            qy = y0 + t * (y1 - y0)
            gv = float(g_num(qx, qy))
            b_vec[a] += length * w * gv * (1.0 - t)
            b_vec[b] += length * w * gv * t

    K = sp_sparse.csr_matrix((vals, (rows, cols)), shape=(ndof, ndof))

    def dirichlet_family(i: int):
        (x, y) = verts[i]
        fams = []
        if abs(y) < 1e-12:
            fams.append("bottom")
        if abs(y - 1.0) < 1e-12:
            fams.append("top")
        if abs(x) < 1e-12:
            fams.append("left")
        if abs(x - 1.0) < 1e-12:
            fams.append("right")
        for f in fams:
            if edges_cfg[f] == "dirichlet":
                return f
        return None

    mask = np.ones(ndof, dtype=bool)
    u_d = np.zeros(ndof, dtype=np.float64)
    for i in range(ndof):
        if dirichlet_family(i) is not None:
            mask[i] = False
            u_d[i] = float(u_num(*verts[i]))
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
    if not np.all(np.isfinite(uh)):
        return {"ndof": ndof, "nonFinite": True, "solveMs": solve_ms}

    l2_sq = 0.0
    h1_sq = 0.0
    eta_sq: list[float] = []
    guh_list: list[tuple[float, float]] = []
    for t_i, (i0, i1, i2) in enumerate(tris):
        (xa, ya), (xc, yc), (xb, yb) = verts[i0], verts[i1], verts[i2]
        area = 0.5 * abs((xc - xa) * (yb - ya) - (xb - xa) * (yc - ya))
        h_T = max(abs(xc - xa), abs(yc - ya), abs(xb - xa), abs(yb - ya), abs(xb - xc), abs(yb - yc))
        vand = np.array([[xa, ya, 1.0], [xc, yc, 1.0], [xb, yb, 1.0]])
        guh = np.linalg.solve(vand, np.array([uh[i0], uh[i1], uh[i2]]))[:2]
        guh_list.append((float(guh[0]), float(guh[1])))
        res_sq = 0.0
        for (l0, l1) in _BARY:
            l2c = 1.0 - l0 - l1
            qx = l0 * xa + l1 * xc + l2c * xb
            qy = l0 * ya + l1 * yc + l2c * yb
            fv = float(f_num(qx, qy))
            diff = (l0 * uh[i0] + l1 * uh[i1] + l2c * uh[i2]) - float(u_num(qx, qy))
            gdx = guh[0] - float(dux_num(qx, qy))
            gdy = guh[1] - float(duy_num(qx, qy))
            l2_sq += (area / 3.0) * diff * diff
            h1_sq += (area / 3.0) * (gdx * gdx + gdy * gdy)
            res_sq += (area / 3.0) * fv * fv
        eta_sq.append(h_T * h_T * res_sq)

    # edge terms: interior jumps [[grad uh . n]] (constant per edge, P1) plus
    # the Neumann boundary residual h_e * ||du_h/dn - g||^2_{L2(e)} on Gamma_N
    # (audit scientific W2: without the boundary term the estimator underestimates
    # boundary-driven error and Dörfler marking misplaces refinement).
    edge_tris: dict[EdgeKey, list[int]] = {}
    for t_i, (i0, i1, i2) in enumerate(tris):
        for a, b in ((i0, i1), (i1, i2), (i2, i0)):
            edge_tris.setdefault(_ekey(a, b), []).append(t_i)
    for (a, b), owners in edge_tris.items():
        (x0, y0), (x1, y1) = verts[a], verts[b]
        length = float(np.hypot(x1 - x0, y1 - y0))
        if length < 1e-14:
            continue
        n_hat = np.array([(y1 - y0), -(x1 - x0)]) / length
        if len(owners) == 2:
            g1 = np.array(guh_list[owners[0]])
            g2 = np.array(guh_list[owners[1]])
            # h_e * ||jump||^2_{L2(e)} = h_e * (jump^2 * h_e) for a CONSTANT jump
            jump = float(abs((g1 - g2) @ n_hat))
            contrib = length * length * jump * jump / 2.0  # half to each owner
            eta_sq[owners[0]] += contrib
            eta_sq[owners[1]] += contrib
            continue
        if len(owners) != 1:
            continue
        if abs(y0) < 1e-12 and abs(y1) < 1e-12:
            family, n_out = "bottom", (0.0, -1.0)
        elif abs(y0 - 1.0) < 1e-12 and abs(y1 - 1.0) < 1e-12:
            family, n_out = "top", (0.0, 1.0)
        elif abs(x0) < 1e-12 and abs(x1) < 1e-12:
            family, n_out = "left", (-1.0, 0.0)
        elif abs(x0 - 1.0) < 1e-12 and abs(x1 - 1.0) < 1e-12:
            family, n_out = "right", (1.0, 0.0)
        else:
            continue
        if edges_cfg.get(family) != "neumann":
            continue
        gx, gy = guh_list[owners[0]]
        duh_dn = gx * n_out[0] + gy * n_out[1]
        g_num = flux_num[family]
        s = 0.0
        for (t, w) in _EDGE_GAUSS:
            qx = x0 + t * (x1 - x0)
            qy = y0 + t * (y1 - y0)
            r = duh_dn - float(g_num(qx, qy))
            s += w * r * r
        eta_sq[owners[0]] += length * length * s

    return {
        "ndof": ndof,
        "nonFinite": False,
        "solveMs": solve_ms,
        "uh": uh,
        "l2Err": float(np.sqrt(l2_sq)),
        "h1Err": float(np.sqrt(h1_sq)),
        "etaSq": eta_sq,
        "nTris": len(tris),
    }

# ---------------------------------------------------------------------------
# uniform ladder op (slice 6a)
# ---------------------------------------------------------------------------

def _structured_mesh(n: int) -> tuple[list[tuple[float, float]], list[tuple[int, int, int]]]:
    m = n + 1
    xs = np.linspace(0.0, 1.0, m)
    verts = [(float(xs[i]), float(xs[j])) for j in range(m) for i in range(m)]
    tris: list[tuple[int, int, int]] = []
    for j in range(n):
        for i in range(n):
            a, b, c, d = _nid(i, j, m), _nid(i + 1, j, m), _nid(i, j + 1, m), _nid(i + 1, j + 1, m)
            tris.append((a, c, b))  # fixed diagonal split (a-c)
            tris.append((c, d, b))
    return verts, tris


def _manufactured_lambdas(u_expr: str):
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
    return (
        sp.lambdify((xs_sym, ys_sym), su, modules="numpy"),
        sp.lambdify((xs_sym, ys_sym), sf, modules="numpy"),
        sp.lambdify((xs_sym, ys_sym), sp.diff(su, xs_sym), modules="numpy"),
        sp.lambdify((xs_sym, ys_sym), sp.diff(su, ys_sym), modules="numpy"),
        {k: sp.lambdify((xs_sym, ys_sym), v, modules="numpy") for k, v in flux.items()},
        str(sf),
    )


def _check_edges_levels(edges: dict[str, str], levels: list[int]) -> None:
    if set(edges) != {"bottom", "top", "left", "right"} or any(
        v not in ("dirichlet", "neumann") for v in edges.values()
    ):
        raise ValueError("fem edges must map each of bottom/top/left/right to dirichlet|neumann")
    if all(v == "neumann" for v in edges.values()):
        raise ValueError("pure-Neumann Poisson is ill-posed up to a constant (need >= 1 Dirichlet edge)")
    if not levels or any(n < 2 or n > 256 for n in levels):
        raise ValueError("fem levels must each be in 2..256")
    if sorted(levels) != levels or len(set(levels)) != len(levels):
        raise ValueError("fem levels must be a strictly increasing refinement ladder")
    if len(levels) < 3:
        raise ValueError("fem needs >= 3 levels to measure a convergence order")


def op_fem_poisson_2d(payload: dict[str, Any]) -> dict[str, Any]:
    u_expr = payload["manufacturedSolution"]
    edges = payload["edges"]
    levels = [int(n) for n in payload["levels"]]
    _check_edges_levels(edges, levels)

    u_num, f_num, dux_num, duy_num, flux_num, f_str = _manufactured_lambdas(u_expr)

    results: list[dict[str, Any]] = []
    for n in levels:
        verts, tris = _structured_mesh(n)
        out = _assemble_solve_measure(verts, tris, edges, f_num, u_num, dux_num, duy_num, flux_num)
        results.append({
            "n": n, "h": 1.0 / n, "ndof": out["ndof"], "solveMs": round(out["solveMs"], 3),
            "nonFinite": out["nonFinite"],
            **({"l2Err": out["l2Err"], "h1Err": out["h1Err"]} if not out["nonFinite"] else {}),
        })

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
        "forcing": f_str,
        "edges": edges,
        "mode": "uniform",
        "levels": results,
        "l2Orders": orders("l2Err"),
        "h1Orders": orders("h1Err"),
        "expectedL2Order": 2.0,
        "expectedH1Order": 1.0,
    }

# ---------------------------------------------------------------------------
# adaptive op (slice 6b): SOLVE -> ESTIMATE -> MARK -> REFINE (NVB)
# ---------------------------------------------------------------------------

class _NvbMesh:
    """Newest-vertex-bisection mesh: conforming P1 triangulation.

    tris: {tid: (v0, v1, v2, newest)} where newest in {0,1,2} is the index of
    the newest vertex; the refinement edge is the one OPPOSITE it. Splitting
    always bisects that edge; both children get the bisection midpoint as
    their newest vertex. Conformity closure refines neighbours sharing a
    bisected edge (NVB theory: bounded extra refinements, shape regular).
    """

    def __init__(self, n: int):
        m = n + 1
        xs = np.linspace(0.0, 1.0, m)
        self.verts: list[tuple[float, float]] = [(float(xs[i]), float(xs[j])) for j in range(m) for i in range(m)]
        self.tris: dict[int, tuple[int, int, int, int]] = {}
        self._next = 0
        for j in range(n):
            for i in range(n):
                a, b, c, d = _nid(i, j, m), _nid(i + 1, j, m), _nid(i, j + 1, m), _nid(i + 1, j + 1, m)
                self._add(a, c, b, 0)   # newest = a: opposite edge (c,b) IS the diagonal
                self._add(c, d, b, 1)   # newest = index 1 (d): opposite edge (v0,v2)=(c,b) is the diagonal
        self.edge_mid: dict[EdgeKey, int] = {}
        self.coord_index: dict[tuple[float, float], int] = {}
        for i, v in enumerate(self.verts):
            self.coord_index[self._ck(v)] = i

    @staticmethod
    def _ck(v: tuple[float, float]) -> tuple[float, float]:
        # duplicate-vertex defence: NVB midpoints of DIFFERENT edges can coincide
        # geometrically (horizontal vs vertical edge midpoints); keying vertices
        # by rounded coordinates keeps the mesh a single connected complex.
        return (round(v[0], 12), round(v[1], 12))

    def _add(self, v0: int, v1: int, v2: int, newest: int) -> int:
        tid = self._next
        self._next += 1
        self.tris[tid] = (v0, v1, v2, newest)
        return tid

    def _refinement_edge(self, tid: int) -> EdgeKey:
        v0, v1, v2, newest = self.tris[tid]
        vs = (v0, v1, v2)
        a = vs[(newest + 1) % 3]
        b = vs[(newest + 2) % 3]
        return _ekey(a, b)

    def _owners_of_edge(self, e: EdgeKey) -> list[int]:
        owners = []
        for tid, (v0, v1, v2, _nw) in self.tris.items():
            if e in (_ekey(v0, v1), _ekey(v1, v2), _ekey(v2, v0)):
                owners.append(tid)
        return owners

    def _midpoint(self, e: EdgeKey) -> int:
        mid = self.edge_mid.get(e)
        if mid is None:
            (x0, y0), (x1, y1) = self.verts[e[0]], self.verts[e[1]]
            cand = (0.5 * (x0 + x1), 0.5 * (y0 + y1))
            key = self._ck(cand)
            mid = self.coord_index.get(key)
            if mid is None:
                mid = len(self.verts)
                self.verts.append(cand)
                self.coord_index[key] = mid
            self.edge_mid[e] = mid
        return mid

    def _split(self, tid: int) -> tuple[int, int]:
        """Bisect tid at its refinement edge (assumes closure already done)."""
        v0, v1, v2, newest = self.tris[tid]
        vs = (v0, v1, v2)
        apex = vs[newest]
        e = self._refinement_edge(tid)
        a, b = e
        mid = self._midpoint(e)
        del self.tris[tid]
        child_a = self._add(apex, a, mid, 2)   # newest = mid (index 2)
        child_b = self._add(apex, b, mid, 2)   # newest = mid (index 2) — reordered so BOTH children carry the midpoint as newest
        return child_a, child_b

    def refine_triangle(self, tid: int) -> None:
        """Single NVB bisection of tid at its refinement edge (no closure)."""
        if tid not in self.tris:
            return
        self._split(tid)

    def refine_marked(self, marked: list[int]) -> None:
        """Split the marked triangles, then restore conformity iteratively.

        Closure: a live triangle with an edge whose midpoint already exists
        (a bisected edge it does not see) splits at its OWN refinement edge —
        a legal NVB bisection that rotates the newest-vertex label toward the
        offending edge; after O(1) rotations a descendant splits exactly
        there. Every split is a valid NVB bisection (shape regular), the
        pending set strictly shrinks in potential, and a hard guard makes
        non-convergence fail visible instead of looping.
        """
        for tid in marked:
            self.refine_triangle(tid)
        guard = 0
        while True:
            pending = []
            for tid in self.tris:
                for edge in self._edges_of(tid):
                    if edge in self.edge_mid:
                        pending.append(tid)
                        break
            if not pending:
                return
            guard += len(pending)
            if guard > 500_000:
                raise ValueError("NVB closure failed to converge (guard exceeded)")
            for tid in pending:
                self.refine_triangle(tid)

    def _edges_of(self, tid: int) -> set[EdgeKey]:
        v0, v1, v2, _nw = self.tris[tid]
        return {_ekey(v0, v1), _ekey(v1, v2), _ekey(v2, v0)}

    def check_conforming(self) -> None:
        """Invariant: every edge is owned by exactly 1 or 2 triangles."""
        edge_tris: dict[EdgeKey, int] = {}
        for (v0, v1, v2, _nw) in self.tris.values():
            for a, b in ((v0, v1), (v1, v2), (v2, v0)):
                k = _ekey(a, b)
                edge_tris[k] = edge_tris.get(k, 0) + 1
        bad = [e for e, c in edge_tris.items() if c > 2]
        if bad:
            raise ValueError(f"non-conforming mesh: {len(bad)} edges owned by more than 2 triangles")

    def mesh_lists(self) -> tuple[list[tuple[float, float]], list[tuple[int, int, int]]]:
        tris = [(v0, v1, v2) for (v0, v1, v2, _nw) in self.tris.values()]
        return self.verts, tris

def op_fem_poisson_2d_adaptive(payload: dict[str, Any]) -> dict[str, Any]:
    """AFEM loop: SOLVE -> ESTIMATE (residual) -> MARK (Doerfler) -> REFINE (NVB).

    Reports the per-iteration history (ndof, true L2/H1 errors, estimator
    total, effectivity index), the log-log slope of the H1 error vs ndof
    (optimal adaptive rate: -1/2) and per-step rates. Verdicts stay in TS.
    """
    u_expr = payload["manufacturedSolution"]
    edges = payload["edges"]
    base_n = int(payload.get("baseGrid", 4))
    theta = float(payload.get("markingTheta", 0.5))
    iterations = int(payload.get("iterations", 10))
    if not (2 <= base_n <= 64):
        raise ValueError("adaptive baseGrid must be in 2..64")
    if not (0.1 <= theta <= 0.9):
        raise ValueError("adaptive markingTheta (Doerfler bulk) must be in [0.1, 0.9]")
    if not (3 <= iterations <= 30):
        raise ValueError("adaptive iterations must be in 3..30")
    if set(edges) != {"bottom", "top", "left", "right"} or any(
        v not in ("dirichlet", "neumann") for v in edges.values()
    ):
        raise ValueError("fem edges must map each of bottom/top/left/right to dirichlet|neumann")
    if all(v == "neumann" for v in edges.values()):
        raise ValueError("pure-Neumann Poisson is ill-posed up to a constant (need >= 1 Dirichlet edge)")

    u_num, f_num, dux_num, duy_num, flux_num, f_str = _manufactured_lambdas(u_expr)

    mesh = _NvbMesh(base_n)
    history: list[dict[str, Any]] = []
    for _it in range(iterations):
        mesh.check_conforming()
        verts, tris = mesh.mesh_lists()
        out = _assemble_solve_measure(verts, tris, edges, f_num, u_num, dux_num, duy_num, flux_num)
        if out["nonFinite"]:
            history.append({"ndof": out["ndof"], "nonFinite": True})
            break
        eta_sq = np.array(out["etaSq"])
        total = float(eta_sq.sum())
        history.append({
            "ndof": out["ndof"], "nTris": out["nTris"], "solveMs": round(out["solveMs"], 3),
            "l2Err": out["l2Err"], "h1Err": out["h1Err"],
            "etaTotal": float(np.sqrt(total)),
            "effectivity": float(np.sqrt(total) / out["h1Err"]) if out["h1Err"] > 0 else None,
        })
        order = np.argsort(eta_sq)[::-1]
        cum = np.cumsum(eta_sq[order])
        cutoff = int(np.searchsorted(cum, theta * total) + 1)
        marked_ids = []
        for tri in [tris[i] for i in order[:cutoff]]:
            tid = next((t for t, v in mesh.tris.items() if (v[0], v[1], v[2]) == tri), None)
            if tid is not None:
                marked_ids.append(tid)
        mesh.refine_marked(marked_ids)

    usable = [h for h in history if not h.get("nonFinite")]
    h1_rates: list[float] = []
    for prev, cur in itertools.pairwise(usable):
        if prev["h1Err"] > 0 and cur["h1Err"] > 0 and cur["ndof"] > prev["ndof"]:
            h1_rates.append(float(np.log(prev["h1Err"] / cur["h1Err"]) / np.log(cur["ndof"] / prev["ndof"])))
    slope = None
    if len(usable) >= 3:
        xs_l = np.log([h["ndof"] for h in usable])
        ys_l = np.log([h["h1Err"] for h in usable])
        slope = float(np.polyfit(xs_l, ys_l, 1)[0])

    return {
        "manufactured": u_expr,
        "forcing": f_str,
        "edges": edges,
        "mode": "adaptive",
        "markingTheta": theta,
        "baseGrid": base_n,
        "iterations": iterations,
        "history": history,
        "h1Rates": h1_rates,
        "h1SlopeVsNdof": slope,
        "expectedOptimalSlope": -0.5,
        "effectivities": [h.get("effectivity") for h in usable if h.get("effectivity") is not None],
    }







