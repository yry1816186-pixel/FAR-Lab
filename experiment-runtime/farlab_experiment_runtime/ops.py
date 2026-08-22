"""Sidecar operations: env_info, train_eval, paired_stats. All numeric work lives here;
the TS side orchestrates and computes verdicts mechanically (SCIENTIFIC_MODEL §10)."""
from __future__ import annotations

import platform
from typing import Any

import numpy as np
from scipy import stats as scipy_stats
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score, log_loss, r2_score, roc_auc_score

from . import builders

CLASSIFICATION_METRICS = ("accuracy", "balanced_accuracy", "f1_macro", "roc_auc", "log_loss")
REGRESSION_METRICS = ("mean_squared_error", "r2")


def op_env_info(_payload: dict[str, Any]) -> dict[str, Any]:
    import sklearn
    import scipy

    return {
        "pythonVersion": platform.python_version(),
        "versions": {
            "sklearn": sklearn.__version__,
            "scipy": scipy.__version__,
            "numpy": np.__version__,
        },
    }


def _load_tabular(payload: dict[str, Any]) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    """Read the CSV the TS side points at (path()-based access — binary-safe, D-085 note)."""
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
    classes = sorted(set(y_train))
    if not set(y_test).issubset(set(classes)):
        raise ValueError("test split contains classes unseen in train (leak-safe encoding impossible)")

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

    y_index = {c: k for k, c in enumerate(classes)}
    meta = {
        "nTrain": len(x_train_raw),
        "nTest": len(x_test_raw),
        "classes": classes,
    }
    X_train = encode(x_train_raw)
    X_test = encode(x_test_raw)
    y_train_enc = np.array([y_index[c] for c in y_train], dtype=np.int64)
    y_test_enc = np.array([y_index[c] for c in y_test], dtype=np.int64)
    return X_train, X_test, y_train_enc, y_test_enc, meta


def op_train_eval(payload: dict[str, Any]) -> dict[str, Any]:
    X_train, X_test, y_train, y_test, meta = _load_tabular(payload)
    model = builders.build(payload["model"]["builderId"], payload["model"].get("hyperparams", {}), int(payload["model"]["seed"]))
    model.fit(X_train, y_train)

    prediction = model.predict(X_test)
    per_row_correct = (prediction == y_test).astype(np.int64).tolist()

    metrics: dict[str, float] = {}
    for key in payload.get("metrics", []):
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
            metrics["mean_squared_error"] = float(np.mean((prediction.astype(np.float64) - y_test.astype(np.float64)) ** 2))
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


OPS = {
    "env_info": op_env_info,
    "train_eval": op_train_eval,
    "paired_stats": op_paired_stats,
    "abs_stats": op_abs_stats,
}
