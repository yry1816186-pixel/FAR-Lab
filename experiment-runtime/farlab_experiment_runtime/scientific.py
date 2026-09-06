"""SciPy-backed scientific primitives exposed through the sidecar protocol."""
from __future__ import annotations

from typing import Any
import hashlib
import html
import io

import numpy as np
from scipy import optimize, stats
from .torch_ops import op_torch_predict_cpu, op_torch_resume_cpu, op_torch_train_cpu as op_torch_train_cpu_v2


def op_bayesian_beta_binomial(payload: dict[str, Any]) -> dict[str, Any]:
    a = float(payload["priorAlpha"])
    b = float(payload["priorBeta"])
    successes = int(payload["successes"])
    trials = int(payload["trials"])
    level = float(payload.get("credibleLevel", 0.95))
    if not (a > 0 and b > 0 and 0 <= successes <= trials and 0 < level < 1):
        raise ValueError("invalid beta-binomial parameters")
    pa, pb = a + successes, b + trials - successes
    mean, variance = stats.beta.stats(pa, pb, moments="mv")
    low, high = stats.beta.ppf([(1 - level) / 2, (1 + level) / 2], pa, pb)
    return {"posteriorAlpha": float(pa), "posteriorBeta": float(pb), "mean": float(mean), "variance": float(variance), "credibleInterval": {"level": level, "low": float(low), "high": float(high)}, "provenance": "COMPUTED", "engine": "scipy.stats.beta"}


def op_causal_backdoor(payload: dict[str, Any]) -> dict[str, Any]:
    treatment = np.asarray(payload["treatment"], dtype=float)
    outcome = np.asarray(payload["outcome"], dtype=float)
    confounder = np.asarray(payload["confounder"], dtype=object)
    threshold = float(payload.get("treatmentThreshold", 0.5))
    if treatment.ndim != 1 or outcome.shape != treatment.shape or confounder.shape != treatment.shape or treatment.size < 2:
        raise ValueError("treatment, outcome and confounder arrays must have equal non-empty shape")
    rows = []
    effect = 0.0
    for level in dict.fromkeys(map(str, confounder.tolist())):
        mask = np.asarray([str(v) == level for v in confounder], dtype=bool)
        treated = outcome[mask & (treatment >= threshold)]
        control = outcome[mask & (treatment < threshold)]
        if treated.size == 0 or control.size == 0:
            raise ValueError(f"confounder stratum '{level}' lacks both treatment groups")
        tm, cm = float(np.mean(treated)), float(np.mean(control))
        contrast = tm - cm
        weight = float(np.sum(mask) / treatment.size)
        effect += weight * contrast
        rows.append({"level": level, "weight": weight, "treatedN": int(treated.size), "controlN": int(control.size), "treatedMean": tm, "controlMean": cm, "contrast": contrast})
    return {"estimand": "standardized_mean_difference", "effect": effect, "strata": rows, "assumptions": ["consistency", "conditional exchangeability given supplied confounder", "positivity within every confounder stratum", "no measurement error in treatment/outcome/confounder"], "provenance": "COMPUTED", "engine": "numpy"}


def op_optimize_quadratic(payload: dict[str, Any]) -> dict[str, Any]:
    q = np.asarray(payload["matrix"], dtype=float)
    c = np.asarray(payload["linear"], dtype=float)
    x0 = np.asarray(payload["initial"], dtype=float)
    if q.ndim != 2 or q.shape[0] != q.shape[1] or q.shape[0] != c.size or x0.size != c.size or not np.allclose(q, q.T, atol=1e-10):
        raise ValueError("matrix must be symmetric square and match linear/initial dimensions")
    def objective(x: np.ndarray) -> float:
        return float(0.5 * x @ q @ x + c @ x)
    def jac(x: np.ndarray) -> np.ndarray:
        return q @ x + c
    result = optimize.minimize(objective, x0, jac=jac, method="BFGS", options={"maxiter": int(payload.get("maxIterations", 10000)), "gtol": float(payload.get("tolerance", 1e-8))})
    if not np.all(np.isfinite(result.x)):
        raise ValueError("optimization diverged to a non-finite value")
    return {"solution": result.x.tolist(), "objective": objective(result.x), "gradientNorm": float(np.linalg.norm(jac(result.x))), "iterations": int(result.nit), "status": "converged" if bool(result.success) else "max_iterations", "provenance": "COMPUTED", "engine": "scipy.optimize.BFGS", "message": str(result.message)}


def op_data_profile(payload: dict[str, Any]) -> dict[str, Any]:
    columns = payload.get("columns") or []
    rows = payload.get("rows") or []
    if not columns or len(columns) > 200 or len(rows) > 100_000:
        raise ValueError("columns required and row/column limits exceeded")
    out = []
    for i, name in enumerate(columns):
        vals = [(r[i] if i < len(r) else None) for r in rows]
        missing = sum(v is None or v == "" for v in vals)
        nums = []
        for v in vals:
            try:
                if v is not None and v != "": nums.append(float(v))
            except (TypeError, ValueError):
                pass
        unique = len({str(v) for v in vals if v is not None and v != ""})
        if nums and len(nums) == len(vals) - missing:
            s = sorted(nums); q = lambda p: s[min(len(s)-1, int(p*(len(s)-1)))]
            mean = float(np.mean(nums)); std = float(np.std(nums)); q1, q3 = q(.25), q(.75); iqr = q3 - q1
            out.append({"name": name, "index": i, "type": "numeric", "count": len(vals), "missing": missing, "unique": unique, "min": s[0], "max": s[-1], "mean": mean, "stddev": std, "quantiles": {"p25": q1, "p50": q(.5), "p75": q3}, "outliers": sum(v < q1-1.5*iqr or v > q3+1.5*iqr for v in nums)})
        else:
            out.append({"name": name, "index": i, "type": "categorical", "count": len(vals), "missing": missing, "unique": unique})
    return {"rows": len(rows), "columns": out, "provenance": "COMPUTED", "engine": "farlab.data_profile.v1"}


def op_dataframe_groupby(payload: dict[str, Any]) -> dict[str, Any]:
    import pandas as pd
    columns = payload.get("columns") or []
    rows = payload.get("rows") or []
    group_by = payload.get("groupBy"); value_column = payload.get("valueColumn")
    if not columns or group_by not in columns or value_column not in columns:
        raise ValueError("groupBy and valueColumn must name declared columns")
    if len(rows) > 100_000: raise ValueError("row limit exceeded")
    frame = pd.DataFrame(rows, columns=columns)
    frame[value_column] = pd.to_numeric(frame[value_column], errors="coerce")
    if frame[value_column].isna().all(): raise ValueError("valueColumn has no numeric values")
    grouped = frame.groupby(group_by, dropna=False, sort=True, as_index=False)[value_column].agg(["count", "mean"])
    # Pandas' named aggregation output is normalized to a stable JSON shape.
    result_rows = []
    for _, row in grouped.iterrows():
        group_value = row[group_by]
        group_value = None if pd.isna(group_value) else group_value
        mean = None if pd.isna(row["mean"]) else float(row["mean"])
        result_rows.append({group_by: group_value, "count": int(row["count"]), "mean": mean})
    return {"rows": result_rows, "groupBy": group_by, "valueColumn": value_column, "provenance": "COMPUTED", "engine": f"pandas-{pd.__version__}"}


def op_ols_regression(payload: dict[str, Any]) -> dict[str, Any]:
    import statsmodels.api as sm
    y = np.asarray(payload.get("y", []), dtype=float)
    x = np.asarray(payload.get("x", []), dtype=float)
    if y.ndim != 1 or x.ndim != 2 or len(y) != len(x) or len(y) < 3 or not np.isfinite(x).all() or not np.isfinite(y).all():
        raise ValueError("x must be a finite 2D matrix matching finite y with at least 3 rows")
    if x.shape[1] < 1 or x.shape[1] > 100: raise ValueError("x column count out of bounds")
    fit = sm.OLS(y, sm.add_constant(x, has_constant="add")).fit()
    import statsmodels
    return {"coefficients": fit.params.tolist(), "standardErrors": fit.bse.tolist(), "tValues": fit.tvalues.tolist(), "pValues": fit.pvalues.tolist(), "rSquared": float(fit.rsquared), "adjustedRSquared": float(fit.rsquared_adj), "n": int(len(y)), "provenance": "COMPUTED", "engine": f"statsmodels-{statsmodels.__version__}"}


def op_parquet_roundtrip(payload: dict[str, Any]) -> dict[str, Any]:
    import base64
    import pyarrow as pa
    import pyarrow.parquet as pq
    columns = payload.get("columns") or []
    rows = payload.get("rows") or []
    if not columns or len(rows) > 100_000: raise ValueError("columns required and row limit exceeded")
    if any(len(r) != len(columns) for r in rows): raise ValueError("every row must match columns")
    table = pa.table({name: [r[i] for r in rows] for i, name in enumerate(columns)})
    buf = io.BytesIO(); pq.write_table(table, buf, compression="zstd")
    raw = buf.getvalue(); restored = pq.read_table(io.BytesIO(raw))
    return {"format": "parquet", "rows": restored.num_rows, "columns": restored.column_names, "contentBase64": base64.b64encode(raw).decode("ascii"), "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "provenance": "COMPUTED", "engine": f"pyarrow-{pa.__version__}"}


def op_hdf5_roundtrip(payload: dict[str, Any]) -> dict[str, Any]:
    import base64
    import h5py
    values = np.asarray(payload.get("values", []), dtype=float)
    if values.size == 0 or values.size > 1_000_000 or not np.isfinite(values).all(): raise ValueError("values must be finite and contain 1..1000000 entries")
    buf = io.BytesIO()
    with h5py.File(buf, "w") as h5:
        h5.create_dataset(str(payload.get("dataset", "values")), data=values, compression="gzip", shuffle=True)
    raw = buf.getvalue()
    with h5py.File(io.BytesIO(raw), "r") as h5:
        name = str(payload.get("dataset", "values")); restored = np.asarray(h5[name])
    return {"format": "hdf5", "dataset": name, "shape": list(restored.shape), "contentBase64": base64.b64encode(raw).decode("ascii"), "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "provenance": "COMPUTED", "engine": f"h5py-{h5py.__version__}"}


def op_plot_svg(payload: dict[str, Any]) -> dict[str, Any]:
    kind = payload.get("kind"); w = int(payload.get("width", 800)); h = int(payload.get("height", 500)); pad = 48
    if not (160 <= w <= 2400 and 120 <= h <= 1600): raise ValueError("plot dimensions out of bounds")
    axis = f'<rect x="{pad}" y="{pad}" width="{w-2*pad}" height="{h-2*pad}" fill="white" stroke="#64748b"/><line x1="{pad}" y1="{h-pad}" x2="{w-pad}" y2="{h-pad}" stroke="#334155"/><line x1="{pad}" y1="{pad}" x2="{pad}" y2="{h-pad}" stroke="#334155"/>'
    title = f'<text x="{w/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="16">{html.escape(str(payload["title"]))}</text>' if payload.get("title") else ""
    marks = ""
    if kind in ("line", "scatter"):
        x, y = payload.get("x", []), payload.get("y", [])
        if len(x) != len(y) or not x: raise ValueError("x and y must have equal non-empty length")
        xmin, xmax, ymin, ymax = min(x), max(x), min(y), max(y); sx = (w-2*pad)/(xmax-xmin or 1); sy = (h-2*pad)/(ymax-ymin or 1)
        pts = [f"{pad+(a-xmin)*sx},{h-pad-(b-ymin)*sy}" for a,b in zip(x,y)]
        marks = f'<polyline points="{" ".join(pts)}" fill="none" stroke="#dc2626" stroke-width="2"/>' if kind == "line" else "".join(f'<circle cx="{p.split(",")[0]}" cy="{p.split(",")[1]}" r="3" fill="#7c3aed"/>' for p in pts)
    elif kind == "histogram":
        values = payload.get("values", []); bins = int(payload.get("bins", 20))
        if not values or not (2 <= bins <= 100): raise ValueError("histogram values/bins invalid")
        lo, hi = min(values), max(values); span = hi-lo or 1; counts = [0]*bins
        for v in values: counts[min(bins-1, int((v-lo)/span*bins))] += 1
        peak = max(counts) or 1; bw = (w-2*pad)/bins
        marks = "".join(f'<rect x="{pad+i*bw}" y="{h-pad-c/peak*(h-2*pad)}" width="{max(1,bw-1)}" height="{c/peak*(h-2*pad)}" fill="#0f766e"/>' for i,c in enumerate(counts))
    elif kind == "bar":
        labels, values = payload.get("labels", []), payload.get("values", [])
        if len(labels) != len(values) or not values: raise ValueError("labels and values must have equal non-empty length")
        peak = max(max(abs(v) for v in values), 1); bw = (w-2*pad)/len(values)
        marks = "".join(f'<rect x="{pad+i*bw+bw*.1}" y="{h-pad-abs(v)/peak*(h-2*pad) if v>=0 else h-pad}" width="{bw*.8}" height="{abs(v)/peak*(h-2*pad)}" fill="#2563eb"><title>{html.escape(str(labels[i]))}: {v}</title></rect>' for i,v in enumerate(values))
    else: raise ValueError("unknown plot kind")
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{title}{axis}{marks}</svg>'
    return {"format": "svg", "width": w, "height": h, "svg": svg, "bytes": len(svg.encode()), "sha256": hashlib.sha256(svg.encode()).hexdigest(), "provenance": "COMPUTED", "engine": "farlab.plot_svg.v1"}


def op_plot(payload: dict[str, Any]) -> dict[str, Any]:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    kind = payload.get("kind"); fmt = payload.get("format", "svg"); w = int(payload.get("width", 800)); h = int(payload.get("height", 500))
    fig, ax = plt.subplots(figsize=(w / 100, h / 100), dpi=100, layout="constrained")
    if kind in ("line", "scatter"):
        x, y = payload.get("x", []), payload.get("y", [])
        if len(x) != len(y) or not x: raise ValueError("x and y must have equal non-empty length")
        (ax.plot if kind == "line" else ax.scatter)(x, y)
    elif kind == "histogram":
        values = payload.get("values", []); bins = int(payload.get("bins", 20))
        if not values or not (2 <= bins <= 100): raise ValueError("histogram values/bins invalid")
        ax.hist(values, bins=bins)
    elif kind == "bar":
        labels, values = payload.get("labels", []), payload.get("values", [])
        if len(labels) != len(values) or not values: raise ValueError("labels and values must have equal non-empty length")
        ax.bar(labels, values)
    else: raise ValueError("unknown plot kind")
    if payload.get("title"): ax.set_title(str(payload["title"]))
    buf = io.BytesIO(); fig.savefig(buf, format=fmt, metadata={"Creator": "FAR-Lab scientific runtime"}); plt.close(fig)
    raw = buf.getvalue(); mime = "image/png" if fmt == "png" else "image/svg+xml"
    return {"format": fmt, "mimeType": mime, "width": w, "height": h, "contentBase64": __import__("base64").b64encode(raw).decode("ascii"), "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "provenance": "COMPUTED", "engine": "matplotlib"}


OPS = {
    "bayesian_beta_binomial": op_bayesian_beta_binomial,
    "causal_backdoor": op_causal_backdoor,
    "optimize_quadratic": op_optimize_quadratic,
    "data_profile": op_data_profile,
    "dataframe_groupby": op_dataframe_groupby,
    "ols_regression": op_ols_regression,
    "parquet_roundtrip": op_parquet_roundtrip,
    "hdf5_roundtrip": op_hdf5_roundtrip,
    "torch_train_cpu": op_torch_train_cpu_v2,
    "torch_predict_cpu": op_torch_predict_cpu,
    "torch_resume_cpu": op_torch_resume_cpu,
    "plot_svg": op_plot_svg,
    "plot": op_plot,
}
