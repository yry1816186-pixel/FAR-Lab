"""Reviewed model-builder templates (E3). The orchestrator passes JSON parameters ONLY;
adding logic means adding a reviewed template here, never runtime-generated code (D-086-5)."""
from __future__ import annotations

from typing import Any

from sklearn.dummy import DummyClassifier
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression

_ALLOWED_HPARAMS: dict[str, set[str]] = {
    "dummy_most_frequent": {"strategy"},
    "logistic_regression": {"C", "max_iter", "solver"},
    "random_forest_classifier": {"n_estimators", "max_depth", "min_samples_leaf"},
    "gradient_boosting_classifier": {"n_estimators", "max_depth", "learning_rate"},
}


def build(builder_id: str, hyperparams: dict[str, Any], seed: int):
    unknown = set(hyperparams) - _ALLOWED_HPARAMS.get(builder_id, set())
    if unknown:
        raise ValueError(f"hyperparameters {sorted(unknown)} not allowed for builder '{builder_id}' (allowed: {sorted(_ALLOWED_HPARAMS[builder_id])})")
    if builder_id == "dummy_most_frequent":
        return DummyClassifier(strategy=str(hyperparams.get("strategy", "most_frequent")))
    if builder_id == "logistic_regression":
        return LogisticRegression(
            C=float(hyperparams.get("C", 1.0)),
            max_iter=int(hyperparams.get("max_iter", 1000)),
            solver=str(hyperparams.get("solver", "lbfgs")),
            random_state=seed,
        )
    if builder_id == "random_forest_classifier":
        return RandomForestClassifier(
            n_estimators=int(hyperparams.get("n_estimators", 200)),
            max_depth=hyperparams.get("max_depth"),
            min_samples_leaf=int(hyperparams.get("min_samples_leaf", 1)),
            random_state=seed,
            n_jobs=1,  # thread count pinned: same-machine bit-level determinism (D-086-3)
        )
    if builder_id == "gradient_boosting_classifier":
        return GradientBoostingClassifier(
            n_estimators=int(hyperparams.get("n_estimators", 200)),
            max_depth=hyperparams.get("max_depth"),
            learning_rate=float(hyperparams.get("learning_rate", 0.1)),
            random_state=seed,
        )
    raise ValueError(f"unknown builder '{builder_id}' (known: {sorted(_ALLOWED_HPARAMS)})")
