"""Sidecar operations: env_info, train_eval, paired_stats. All numeric work lives here;
the TS side orchestrates and computes verdicts mechanically (SCIENTIFIC_MODEL §10)."""
from __future__ import annotations

import platform
from typing import Any

import numpy as np
from scipy import stats as scipy_stats
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score, log_loss, r2_score, roc_auc_score

from . import builders
from .exploration import op_run_exploration
from .netcdf import op_netcdf_profile, op_netcdf_extract_features
from .fem import op_fem_poisson_2d, op_fem_poisson_2d_adaptive

CLASSIFICATION_METRICS = ("accuracy", "balanced_accuracy", "f1_macro", "roc_auc", "log_loss")
REGRESSION_METRICS = ("mean_squared_error", "r2")


def op_env_info(_payload: dict[str, Any]) -> dict[str, Any]:
    import os

    import sklearn
    import scipy

    return {
        "pythonVersion": platform.python_version(),
        "versions": {
            "sklearn": sklearn.__version__,
            "scipy": scipy.__version__,
            "numpy": np.__version__,
        },
        # R2-10 hardware capture: reproducibility context recorded into the run's
        # environment (cross-device bit-identity is NOT claimed — D-086-3 same-device only).
        "hardware": {
            "system": platform.system(),
            "machine": platform.machine(),
            "pythonImplementation": platform.python_implementation(),
            "cpuCount": str(os.cpu_count()),
        },
    }


def _load_tabular(payload: dict[str, Any], task: str = "classification") -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, dict[str, Any]]:
    """Read the CSV the TS side points at (path()-based access — binary-safe, D-085 note).

    task='regression' (R2-10): the target is parsed as float (visible failure on
    non-numeric targets) and stays float — class-index encoding never applies."""
    import csv as _csv

    path = payload["csvPath"]
    target_column = payload["targetColumn"]
    train_idx = set(payload["trainIdx"])
    test_idx = set(payload["testIdx"])
    with open(path, "r", encoding="utf-8", newline="") as fh:
        reader = _csv.reader(fh)
        header = next(reader)
        rows = [row for row in reader]
    target_i = header.index(target_column)
    feature_is = [i for i in range(len(header)) if i != target_i]

    def matrix(indices: set[int]) -> tuple[list[list[str]], list[str]]:
        xs, ys = [], []
        for i, row in enumerate(rows):
            if i in indices:
                xs.append([row[j] for j in feature_is])
                ys.append(row[target_i])
        return xs, ys

    x_train_raw, y_train = matrix(train_idx)
    x_test_raw, y_test = matrix(test_idx)

    # One-hot for categorical features, numeric for numeric — deterministic, fitted on TRAIN only (D-086-10).
    column_values: list[list[str]] = [[] for _ in feature_is]
    for row in x_train_raw:
        for ci, v in enumerate(row):
            column_values[ci].append(v)

    def is_numeric_column(values: list[str]) -> bool:
        try:
            for v in values:
                if v != "":
                    float(v)
            return True
        except ValueError:
            return False

    numeric_is = [ci for ci in range(len(feature_is)) if is_numeric_column(column_values[ci])]
    categorical_is = [ci for ci in range(len(feature_is)) if ci not in numeric_is]
    cat_vocab: dict[int, list[str]] = {
        ci: sorted({row[ci] for row in x_train_raw}) for ci in categorical_is
    }

    def encode(rows_raw: list[list[str]]) -> np.ndarray:
        cols: list[np.ndarray] = []
        for ci in numeric_is:
            cols.append(np.array([float(r[ci]) if r[ci] != "" else 0.0 for r in rows_raw], dtype=np.float64))
        for ci in categorical_is:
            vocab = cat_vocab[ci]
            index = {v: k for k, v in enumerate(vocab)}
            cols.append(np.array([index.get(r[ci], -1) for r in rows_raw], dtype=np.float64))
        return np.column_stack(cols) if cols else np.zeros((len(rows_raw), 0))

    X_train = encode(x_train_raw)
    X_test = encode(x_test_raw)
    meta = {
        "nTrain": len(x_train_raw),
        "nTest": len(x_test_raw),
    }
    if task == "regression":
        def _float_target(labels: list[str]) -> np.ndarray:
            try:
                return np.array([float(v) for v in labels], dtype=np.float64)
            except ValueError as exc:
                raise ValueError(
                    f"regression target column {target_column!r} contains non-numeric values ({exc}); regressor builders need a numeric target"
                ) from exc
        y_train_enc = _float_target(y_train)
        y_test_enc = _float_target(y_test)
        meta["classes"] = []
        return X_train, X_test, y_train_enc, y_test_enc, meta
    classes = sorted(set(y_train))
    if not set(y_test).issubset(set(classes)):
        raise ValueError("test split contains classes unseen in train (leak-safe encoding impossible)")
    y_index = {c: k for k, c in enumerate(classes)}
    meta["classes"] = classes
    y_train_enc = np.array([y_index[c] for c in y_train], dtype=np.int64)
    y_test_enc = np.array([y_index[c] for c in y_test], dtype=np.int64)
    return X_train, X_test, y_train_enc, y_test_enc, meta


def op_train_eval(payload: dict[str, Any]) -> dict[str, Any]:
    builder_id = str(payload["model"]["builderId"])
    regression = builders.is_regressor(builder_id)
    X_train, X_test, y_train, y_test, meta = _load_tabular(payload, task="regression" if regression else "classification")
    model = builders.build(builder_id, payload["model"].get("hyperparams", {}), int(payload["model"]["seed"]))
    model.fit(X_train, y_train)

    prediction = model.predict(X_test)
    if regression:
        # Per-row SQUARED error: mean(per-row) == MSE exactly — the per-row statistic
        # the confirmatory statistics chain bootstraps (comparison metricKey mean_squared_error).
        residuals = prediction.astype(np.float64) - y_test
        per_row_correct = np.square(residuals).tolist()
    else:
        per_row_correct = (prediction == y_test).astype(np.int64).tolist()

    metrics: dict[str, float] = {}
    for key in payload.get("metrics", []):
        # Task/metric coherence is enforced upstream (checkExperimentSpec); this is the
        # defense-in-depth mirror — a mismatch raises visibly, never silently mislabels.
        if regression and key in CLASSIFICATION_METRICS:
            raise ValueError(f"metric {key!r} is classification-only; builder {builder_id!r} is a regressor")
        if not regression and key in REGRESSION_METRICS:
            raise ValueError(f"metric {key!r} is regression-only; builder {builder_id!r} is a classifier")
        if key == "accuracy":
            metrics["accuracy"] = float(accuracy_score(y_test, prediction))
        elif key == "balanced_accuracy":
            metrics["balanced_accuracy"] = float(balanced_accuracy_score(y_test, prediction))
        elif key == "f1_macro":
            metrics["f1_macro"] = float(f1_score(y_test, prediction, average="macro"))
        elif key == "roc_auc":
            n_classes = len(meta["classes"])
            if n_classes == 2 and hasattr(model, "predict_proba"):
                proba = model.predict_proba(X_test)[:, 1]
                metrics["roc_auc"] = float(roc_auc_score(y_test, proba))
            else:
                metrics["roc_auc"] = float("nan")  # honest: not computable for this builder/task
        elif key == "log_loss":
            if hasattr(model, "predict_proba"):
                proba = model.predict_proba(X_test)
                metrics["log_loss"] = float(log_loss(y_test, proba, labels=list(range(len(meta["classes"])))))
            else:
                metrics["log_loss"] = float("nan")
        elif key == "r2":
            metrics["r2"] = float(r2_score(y_test, prediction))
        elif key == "mean_squared_error":
            metrics["mean_squared_error"] = float(np.mean(np.square(residuals)))
        else:
            raise ValueError(f"unknown metric {key!r}")

    return {
        "metrics": metrics,
        "perRowCorrect": per_row_correct,
        **meta,
    }


def op_paired_stats(payload: dict[str, Any]) -> dict[str, Any]:
    """Preregistered paired comparison over per-row outcomes (A minus B).

    - paired_bootstrap_ci: percentile bootstrap over per-row score differences,
      seeded -> deterministic (analysisSeed from the frozen statistics plan).
    - paired_t: paired t-test on per-row differences.
    Returns point estimate, CI and (for t) p-value. Verdicts are computed by TS.
    """
    a = np.asarray(payload["rowsA"], dtype=np.float64)
    b = np.asarray(payload["rowsB"], dtype=np.float64)
    diff_mode = payload.get("diffMode", "correctness")  # correctness: 1/0 per row; error: signed residual
    alpha = float(payload["alpha"])
    kind = payload["kind"]

    if diff_mode == "correctness":
        d = a - b  # +1: A right B wrong; -1: A wrong B right
    else:
        d = b - a  # signed errors: positive means A's error smaller
    point = float(np.mean(d))

    if kind == "paired_t":
        t_stat, p_value = scipy_stats.ttest_rel(a, b)
        n = len(d)
        df = n - 1
        tcrit = float(scipy_stats.t.ppf(1 - alpha / 2, df))
        se = float(np.std(d, ddof=1) / np.sqrt(n)) if n > 1 else 0.0
        half = tcrit * se
        return {
            "pointEstimate": point,
            "ci": {"level": 1 - alpha, "low": point - half, "high": point + half},
            "pValue": float(p_value),
            "n": n,
            "effect": {"kind": "mean_paired_diff", "value": point},
        }
    if kind == "paired_bootstrap_ci":
        n_boot = int(payload.get("nBoot", 2000))
        seed = int(payload["analysisSeed"])
        rng = np.random.default_rng(seed)
        n = len(d)
        idx = rng.integers(0, n, size=(n_boot, n))
        means = d[idx].mean(axis=1)
        lo, hi = np.quantile(means, [alpha / 2, 1 - alpha / 2])
        return {
            "pointEstimate": point,
            "ci": {"level": 1 - alpha, "low": float(lo), "high": float(hi)},
            "nBoot": n_boot,
            "n": n,
            "effect": {"kind": "mean_paired_diff", "value": point},
        }
    raise ValueError(f"unknown stats kind {kind!r}")


def op_abs_stats(payload: dict[str, Any]) -> dict[str, Any]:
    """CI for a single model's aggregate metric via bootstrap over per-row outcomes."""
    rows = np.asarray(payload["rows"], dtype=np.float64)
    alpha = float(payload["alpha"])
    n_boot = int(payload.get("nBoot", 2000))
    seed = int(payload["analysisSeed"])
    point = float(np.mean(rows))
    rng = np.random.default_rng(seed)
    n = len(rows)
    idx = rng.integers(0, n, size=(n_boot, n))
    means = rows[idx].mean(axis=1)
    lo, hi = np.quantile(means, [alpha / 2, 1 - alpha / 2])
    return {
        "pointEstimate": point,
        "ci": {"level": 1 - alpha, "low": float(lo), "high": float(hi)},
        "nBoot": n_boot,
        "n": n,
        "effect": {"kind": "mean", "value": point},
    }


def op_dataset_audit(payload: dict[str, Any]) -> dict[str, Any]:
    """RU-8 GO1: pre-execution dataset audit (verdict ceiling = data quality).

    Deterministic: seeded cross_val_predict; thread counts pinned by the TS
    executor. Findings are ADVISORY to the researcher (data is never
    auto-mutated); verdict 'degraded' marks leakage/duplicates/label-error
    rates that cap the trustworthiness of a preregistered verdict.
    """
    import hashlib

    from cleanlab.filter import find_label_issues
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import cross_val_predict

    X_train, X_test, y_train, y_test, meta = _load_tabular(payload)
    seed = int(payload.get("seed", 0))

    # Leakage semantics (calibrated on a real small-discrete fixture the first,
    # feature-only version falsely rejected): identical FEATURES alone are
    # common in small discrete datasets and are NOT leakage. Leakage = identical
    # features AND label across splits — that poisons the verdict. In-split
    # duplicates are advisory (resampling is legitimate).
    def _feat_hashes(X):
        return [hashlib.sha256(np.asarray(row, dtype=np.float64).tobytes()).hexdigest() for row in X]

    def _full_hashes(X, y):
        return [
            hashlib.sha256(np.asarray(row, dtype=np.float64).tobytes() + str(lbl).encode()).hexdigest()
            for row, lbl in zip(X, y)
        ]

    train_feat = _feat_hashes(X_train)
    test_feat = _feat_hashes(X_test)
    train_dup = len(train_feat) - len(set(train_feat))
    test_dup = len(test_feat) - len(set(test_feat))
    leak = len(set(_full_hashes(X_train, y_train)) & set(_full_hashes(X_test, y_test)))

    try:
        clf = LogisticRegression(max_iter=1000, random_state=seed)
        probs = cross_val_predict(clf, X_train, y_train, cv=min(5, len(y_train)), method="predict_proba")
        issue_idx = find_label_issues(
            y_train, probs, return_indices_ranked_by="self_confidence",
        ).tolist()
        label_issue_rate = len(issue_idx) / max(len(y_train), 1)
    except Exception:
        issue_idx = []
        label_issue_rate = float("nan")  # honest: not computable (e.g. single class)

    verdict = "ok" if (leak == 0 and not (label_issue_rate > 0.2)) else "degraded"
    return {
        "rows": {"train": len(y_train), "test": len(y_test)},
        "exactDuplicates": {"train": train_dup, "test": test_dup},
        "trainTestLeakRows": leak,
        "labelIssueCount": len(issue_idx),
        "labelIssueRate": label_issue_rate,
        "verdict": verdict,
        **meta,
    }


def op_simulate(payload: dict[str, Any]) -> dict[str, Any]:
    """R2-10 Monte-Carlo simulation template: per-REPLICATE outcomes that ride the
    confirmatory statistics chain (abs_stats/paired_stats) exactly like ML per-row
    outcomes. JSON params only — never code (D-086-5 discipline).

    CRN discipline: the raw RNG stream depends ONLY on (family, seed, replicates,
    blockSize) — distribution parameters transform the stream AFTER drawing, so two
    configs sharing those four consume identical randomness and pair honestly
    (common random numbers variance reduction). The TS validator enforces CRN
    compatibility for paired comparisons; this op just executes the template.
    """
    template = payload.get("template")
    if template != "monte_carlo":
        raise ValueError(f"unknown simulation template {template!r} (known: ['monte_carlo'])")
    d = payload["distribution"]
    stat = payload["statistic"]
    n = int(payload["replicates"])
    seed = int(payload["seed"])
    family = d["family"]
    block = int(payload.get("blockSize", 1))
    if stat == "variance":
        if block < 2:
            raise ValueError("variance statistic requires blockSize >= 2 (one block per replicate)")
        count = n * block
    else:
        count = n

    rng = np.random.default_rng(seed)
    if family == "normal":
        x = float(d["mu"]) + float(d["sigma"]) * rng.standard_normal(count)
    elif family == "uniform":
        x = float(d["low"]) + (float(d["high"]) - float(d["low"])) * rng.random(count)
    elif family == "bernoulli":
        x = (rng.random(count) < float(d["p"])).astype(np.float64)
    else:
        raise ValueError(f"unknown distribution family {family!r}")

    if stat == "mean":
        per = x.astype(np.float64)
    elif stat == "threshold_prob":
        per = (x > float(payload["threshold"])).astype(np.float64)
    elif stat == "variance":
        per = x.reshape(n, block).var(axis=1, ddof=1)
    else:
        raise ValueError(f"unknown statistic {stat!r}")
    return {
        "perReplicate": per.tolist(),
        "pointEstimate": float(np.mean(per)),
        "n": n,
        "blockSize": block,
    }


def op_identity_check(payload: dict[str, Any]) -> dict[str, Any]:
    """Slice-5 theory identity check: evaluate lhs/rhs expression DATA over the
    preregistered variable grid and report residual statistics.

    Expressions are parsed with the stdlib ast module into a strict whitelist
    (numeric literals, arithmetic, whitelisted numpy functions, grid variables
    and the constants pi/e) — never eval(), never attribute access (exploration.py
    P0 lesson: attribute traversal reaches os/sys through auto-imported submodules).
    The TS validator gates first (lexical + free-variable); this is the
    authoritative fail-closed second gate. Verdicts are computed by TS.
    """
    import ast as _ast

    allowed_funcs = {
        "exp": np.exp, "log": np.log, "log2": np.log2, "log10": np.log10, "sqrt": np.sqrt,
        "sin": np.sin, "cos": np.cos, "tan": np.tan,
        "sinh": np.sinh, "cosh": np.cosh, "tanh": np.tanh,
        "arcsin": np.arcsin, "arccos": np.arccos, "arctan": np.arctan, "arctan2": np.arctan2,
        "abs": np.abs, "floor": np.floor, "ceil": np.ceil,
        "min": np.minimum, "max": np.maximum,
    }
    allowed_consts = {"pi": np.pi, "e": np.e}
    bin_ops = {_ast.Add: np.add, _ast.Sub: np.subtract, _ast.Mult: np.multiply,
               _ast.Div: np.true_divide, _ast.Pow: np.power, _ast.Mod: np.mod, _ast.FloorDiv: np.floor_divide}
    unary_ops = {_ast.UAdd: lambda v: v, _ast.USub: np.negative}

    def evaluate(node, env):
        if isinstance(node, _ast.Expression):
            return evaluate(node.body, env)
        if isinstance(node, _ast.Constant):
            if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
                raise ValueError(f"identity expression: non-numeric constant {node.value!r}")
            return np.asarray(node.value, dtype=np.float64)
        if isinstance(node, _ast.Name):
            if node.id in env:
                return env[node.id]
            raise ValueError(f"identity expression: unknown variable {node.id!r} (grid: {sorted(env)})")
        if isinstance(node, _ast.BinOp) and type(node.op) in bin_ops:
            return bin_ops[type(node.op)](evaluate(node.left, env), evaluate(node.right, env))
        if isinstance(node, _ast.UnaryOp) and type(node.op) in unary_ops:
            return unary_ops[type(node.op)](evaluate(node.operand, env))
        if isinstance(node, _ast.Call):
            if not isinstance(node.func, _ast.Name) or node.func.id not in allowed_funcs:
                raise ValueError("identity expression: only whitelisted plain-named functions may be called")
            if node.keywords:
                raise ValueError("identity expression: keyword arguments are not allowed")
            args = [evaluate(a, env) for a in node.args]
            return allowed_funcs[node.func.id](*args)
        raise ValueError(f"identity expression: node {type(node).__name__} is outside the whitelist")

    def parse_expr(text):
        try:
            tree = _ast.parse(text, mode="eval")
        except SyntaxError as exc:
            raise ValueError(f"identity expression does not parse: {exc}") from exc
        for node in _ast.walk(tree):
            if isinstance(node, _ast.Attribute):
                raise ValueError("Attribute access is forbidden in identity expressions (sandbox-escape chain)")
        return tree

    variables = payload.get("variables") or []
    if not variables:
        raise ValueError("identity_check requires at least one grid variable")
    grids = {v["name"]: np.linspace(float(v["low"]), float(v["high"]), int(v["n"])) for v in variables}
    n_points = int(np.prod([int(v["n"]) for v in variables]))
    if n_points > 20000:
        raise ValueError(f"identity grid too large: {n_points} points > 20000 (preregistered cap)")
    mesh = np.meshgrid(*[grids[v["name"]] for v in variables], indexing="ij")
    # Grid variables shadow the whitelisted constants (TS rejects variables named pi/e).
    env = {**allowed_consts, **{v["name"]: mesh[i] for i, v in enumerate(variables)}}

    lhs = evaluate(parse_expr(payload["lhs"]), env)
    rhs = evaluate(parse_expr(payload["rhs"]), env)
    residual = np.abs(lhs - rhs)
    finite = np.isfinite(residual)
    non_finite = int((~finite).sum())
    if not finite.any():
        raise ValueError("identity expressions produced no finite evaluation points on this grid (domain error)")
    fin = residual[finite]
    worst = int(np.argmax(np.where(finite, residual, -np.inf)))  # non-finite points never win the max
    worst_point = {v["name"]: float(mesh[i].flat[worst]) for i, v in enumerate(variables)}
    # A constant operand (e.g. rhs "1") is 0-d; broadcast to the residual shape
    # before indexing with the flattened worst point.
    lhs_full = np.broadcast_to(lhs, residual.shape)
    rhs_full = np.broadcast_to(rhs, residual.shape)
    worst_point["lhs"] = float(lhs_full.flat[worst])
    worst_point["rhs"] = float(rhs_full.flat[worst])
    return {
        "maxAbsResidual": float(fin.max()),
        "meanAbsResidual": float(fin.mean()),
        "nPoints": n_points,
        "nonFinitePoints": non_finite,
        "worstPoint": worst_point,
        "residuals": fin.tolist()[:20000],
    }


OPS = {
    "env_info": op_env_info,
    "dataset_audit": op_dataset_audit,
    "train_eval": op_train_eval,
    "paired_stats": op_paired_stats,
    "abs_stats": op_abs_stats,
    # AVO fusion G4: exploratory CodeAct (restricted namespace; TS static gate
    # runs first; outputs are CANDIDATE findings, never confirmatory facts).
    "run_exploration": op_run_exploration,
    # R2-10: reviewed simulation template (per-replicate outcomes -> shared stats chain).
    "simulate": op_simulate,
    # Slice-5: theory identity check (whitelisted-AST expressions on a grid).
    "identity_check": op_identity_check,
    # Slice-6: FEM verification (2D Poisson, mixed BCs, convergence orders).
    "fem_poisson_2d": op_fem_poisson_2d,
    "fem_poisson_2d_adaptive": op_fem_poisson_2d_adaptive,
    # AOSSA scientific data plane: NetCDF profiling + record-time QC.
    "netcdf_profile": op_netcdf_profile,
    "netcdf_extract_features": op_netcdf_extract_features,
}



