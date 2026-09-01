"""Preregistered ODE initial-value problems solved numerically against an
optional closed-form analytical solution.

Wave B vertical slice (FA-SCI-05): the same discipline as identity_check and
fem_poisson_2d —

- the right-hand sides arrive as DATA (closed expression strings), parsed with
  the strict AST whitelist shared with fem (never eval, no attribute access);
- solver method and tolerances are preregistered in the payload; the sidecar
  never invents numerics;
- when an analytical solution is supplied, the verdict quantity is the max
  absolute residual |y_num - y_analytic| on a declared sampling grid — a
  deterministic, reproducible comparison (solver step selection is internal,
  but rtol/atol pin the accuracy regime);
- no analytical solution -> the op integrates honestly and reports the
  trajectory; the caller marks the claim UNRESOLVED-BY-CONSTRUCTION rather
  than fabricating a residual.
"""
from __future__ import annotations

from typing import Any

import numpy as np

from .fem import expr_to_sympy

_METHODS = ("RK45", "DOP853", "Radau", "BDF", "LSODA")


def _finite(v: Any, what: str) -> float:
    out = float(v)
    if not np.isfinite(out):
        raise ValueError(f"ode: {what} must be finite, got {v!r}")
    return out


def op_ode_integrate(payload: dict[str, Any]) -> dict[str, Any]:
    import sympy as sp
    from scipy.integrate import solve_ivp

    state = payload["stateVariables"]
    if not 1 <= len(state) <= 6:
        raise ValueError("ode: 1..6 state variables")
    names = [str(s["name"]) for s in state]
    if len(set(names)) != len(names):
        raise ValueError("ode: duplicate state variable names")
    if "t" in names:
        raise ValueError("ode: 't' is reserved for the independent variable")

    method = str(payload.get("method", "DOP853"))
    if method not in _METHODS:
        raise ValueError(f"ode: method must be one of {_METHODS}, got {method!r}")
    rtol = _finite(payload.get("rtol", 1e-10), "rtol")
    atol = _finite(payload.get("atol", 1e-12), "atol")
    if not (1e-14 <= rtol <= 1e-2 and 1e-14 <= atol <= 1e-2):
        raise ValueError("ode: rtol/atol must lie in [1e-14, 1e-2]")

    t_span = payload["tSpan"]
    t0, t1 = _finite(t_span[0], "tSpan[0]"), _finite(t_span[1], "tSpan[1]")
    if not t1 > t0:
        raise ValueError("ode: tSpan[1] must exceed tSpan[0]")
    if t1 - t0 > 1e6:
        raise ValueError("ode: integration span capped at 1e6 time units")

    n_grid = int(payload.get("samplePoints", 101))
    if not 2 <= n_grid <= 2001:
        raise ValueError("ode: samplePoints must be 2..2001")

    t_sym = sp.Symbol("t", real=True)
    y_syms = [sp.Symbol(n, real=True) for n in names]
    known = {"t": t_sym, **dict(zip(names, y_syms))}

    rhs_exprs = [expr_to_sympy(str(s["rhs"]), known) for s in state]
    rhs_funcs = [sp.lambdify((t_sym, *y_syms), e, modules="numpy") for e in rhs_exprs]

    def rhs(_t: float, _y: np.ndarray) -> np.ndarray:
        return np.array([f(_t, *_y) for f in rhs_funcs], dtype=float)

    y0 = np.array([_finite(s["y0"], f"y0[{names[i]}]") for i, s in enumerate(state)], dtype=float)

    analytical = payload.get("analyticalSolution")
    grid = np.linspace(t0, t1, n_grid)
    sol = solve_ivp(rhs, (t0, t1), y0, method=method, rtol=rtol, atol=atol, dense_output=True)
    if not sol.success:
        return {
            "status": "failed",
            "message": str(sol.message),
            "nfev": int(sol.nfev),
        }
    ys = sol.sol(grid)

    out_vars: list[dict[str, Any]] = []
    max_abs: float | None = None
    rms: float | None = None
    if analytical is not None:
        if len(analytical) != len(state):
            raise ValueError("ode: analyticalSolution entries must match stateVariables")
        residuals = []
        for i, entry in enumerate(analytical):
            if str(entry["name"]) != names[i]:
                raise ValueError(f"ode: analyticalSolution[{i}] name mismatch ({entry['name']!r} vs {names[i]!r})")
            a_expr = expr_to_sympy(str(entry["expr"]), {"t": t_sym})
            a_func = sp.lambdify(t_sym, a_expr, modules="numpy")
            exact = np.asarray(a_func(grid), dtype=float)
            if exact.shape != grid.shape:
                exact = np.broadcast_to(exact, grid.shape).astype(float)
            residuals.append(np.abs(ys[i] - exact))
        res = np.stack(residuals)
        finite = np.isfinite(res)
        non_finite = int((~finite).sum())
        if non_finite == 0:
            max_abs = float(res.max())
            rms = float(np.sqrt((res ** 2).mean()))
        out_vars.append({
            "nonFinitePoints": non_finite,
        })
    else:
        out_vars.append({"nonFinitePoints": 0})

    # Trajectory summary per state variable: sampled values are content for the
    # audit trail; cap the payload at the declared grid resolution.
    trajectories = {}
    for i, n in enumerate(names):
        trajectories[n] = [float(v) if np.isfinite(v) else None for v in ys[i]]

    return {
        "status": "ok",
        "method": method,
        "rtol": rtol,
        "atol": atol,
        "tSpan": [t0, t1],
        "samplePoints": n_grid,
        "nfev": int(sol.nfev),
        "maxAbsResidual": max_abs,
        "rmsResidual": rms,
        "hasAnalytical": analytical is not None,
        "trajectories": trajectories,
        **out_vars[0],
    }
