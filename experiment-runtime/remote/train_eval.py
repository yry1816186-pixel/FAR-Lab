"""Reviewed remote training template (D-086-5): the ONLY code that runs on remote
devices. The orchestrator ships data + this file + a JSON payload; it returns metrics
and per-row correctness. Encoding is fitted on the train split only (D-086-10).
No user/LLM-supplied code executes remotely.

Target-side container discipline (Wave-S ag2, DockerSandbox lineage): run the SSH
device container with `--network none --memory 512m --rm` and let the orchestrator's
remote `timeout` wrapper (TERM→SIGKILL, exit 124/137) own lifecycle — no egress,
bounded memory, guaranteed teardown."""
import csv
import json
import sys

import numpy as np
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score, log_loss, roc_auc_score

ALLOWED = {
    "dummy_most_frequent": {"strategy"},
    "logistic_regression": {"C", "max_iter", "solver"},
    "random_forest_classifier": {"n_estimators", "max_depth", "min_samples_leaf"},
    "gradient_boosting_classifier": {"n_estimators", "max_depth", "learning_rate"},
}


def build(builder_id, hyperparams, seed):
    unknown = set(hyperparams) - ALLOWED.get(builder_id, set())
    if unknown:
        raise ValueError(f"hyperparameters {sorted(unknown)} not allowed for '{builder_id}'")
    if builder_id == "dummy_most_frequent":
        return DummyClassifier(strategy=str(hyperparams.get("strategy", "most_frequent")))
    if builder_id == "logistic_regression":
        return LogisticRegression(C=float(hyperparams.get("C", 1.0)), max_iter=int(hyperparams.get("max_iter", 1000)), solver=str(hyperparams.get("solver", "lbfgs")), random_state=seed)
    if builder_id == "random_forest_classifier":
        return RandomForestClassifier(n_estimators=int(hyperparams.get("n_estimators", 200)), max_depth=hyperparams.get("max_depth"), min_samples_leaf=int(hyperparams.get("min_samples_leaf", 1)), random_state=seed, n_jobs=1)
    if builder_id == "gradient_boosting_classifier":
        return GradientBoostingClassifier(n_estimators=int(hyperparams.get("n_estimators", 200)), max_depth=hyperparams.get("max_depth"), learning_rate=float(hyperparams.get("learning_rate", 0.1)), random_state=seed)
    raise ValueError(f"unknown builder '{builder_id}'")


def is_numeric_column(values):
    try:
        for v in values:
            if v != "":
                float(v)
        return True
    except ValueError:
        return False


payload = json.load(open(sys.argv[1]))
rows = [r for r in csv.reader(open(payload["csvPath"]))]
header, body = rows[0], rows[1:]
ti = header.index(payload["targetColumn"])
fi = [i for i in range(len(header)) if i != ti]
train_idx = set(payload["trainIdx"])
test_idx = set(payload["testIdx"])

xr, yr, xe, ye = [], [], [], []
for i, row in enumerate(body):
    feats = [row[j] for j in fi]
    label = row[ti]
    if i in train_idx:
        xr.append(feats)
        yr.append(label)
    elif i in test_idx:
        xe.append(feats)
        ye.append(label)

classes = sorted(set(yr))
if not set(ye).issubset(set(classes)):
    raise ValueError("test split has classes unseen in train")

# Train-fitted encoding: numeric columns parsed as floats; categorical columns
# one-hot via train vocabulary (unseen test values map to -1, never the reverse fit).
colvals = [[] for _ in fi]
for row in xr:
    for ci, v in enumerate(row):
        colvals[ci].append(v)
numeric = [ci for ci in range(len(fi)) if is_numeric_column(colvals[ci])]
categorical = [ci for ci in range(len(fi)) if ci not in numeric]
vocab = {ci: sorted({row[ci] for row in xr}) for ci in categorical}


def encode(raw_rows):
    cols = [np.array([float(r[ci]) if r[ci] != "" else 0.0 for r in raw_rows], dtype=np.float64) for ci in numeric]
    for ci in categorical:
        index = {v: k for k, v in enumerate(vocab[ci])}
        cols.append(np.array([index.get(r[ci], -1) for r in raw_rows], dtype=np.float64))
    return np.column_stack(cols) if cols else np.zeros((len(raw_rows), 0))


X_train, X_test = encode(xr), encode(xe)
y_index = {c: k for k, c in enumerate(classes)}
y_train = np.array([y_index[c] for c in yr], dtype=np.int64)
y_test = np.array([y_index[c] for c in ye], dtype=np.int64)

model = build(payload["model"]["builderId"], payload["model"].get("hyperparams", {}), int(payload["model"]["seed"]))
model.fit(X_train, y_train)
prediction = model.predict(X_test)
per_row = (prediction == y_test).astype(int).tolist()

metrics = {}
for key in payload.get("metrics", []):
    if key == "accuracy":
        metrics["accuracy"] = float(accuracy_score(y_test, prediction))
    elif key == "balanced_accuracy":
        metrics["balanced_accuracy"] = float(balanced_accuracy_score(y_test, prediction))
    elif key == "f1_macro":
        metrics["f1_macro"] = float(f1_score(y_test, prediction, average="macro"))
    elif key == "roc_auc":
        if len(classes) == 2 and hasattr(model, "predict_proba"):
            metrics["roc_auc"] = float(roc_auc_score(y_test, model.predict_proba(X_test)[:, 1]))
        else:
            metrics["roc_auc"] = float("nan")
    elif key == "log_loss":
        if hasattr(model, "predict_proba"):
            metrics["log_loss"] = float(log_loss(y_test, model.predict_proba(X_test), labels=list(range(len(classes)))))
        else:
            metrics["log_loss"] = float("nan")
    else:
        raise ValueError(f"unknown metric {key!r}")

print(json.dumps({"metrics": metrics, "perRowCorrect": per_row, "nTrain": len(xr), "nTest": len(xe), "classes": classes}, allow_nan=False))
