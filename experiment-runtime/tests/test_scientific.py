import base64
import hashlib
import io
import json
import math
import subprocess
import sys

import pytest

from farlab_experiment_runtime.scientific import (
    op_bayesian_beta_binomial,
    op_causal_backdoor,
    op_optimize_quadratic,
)
from farlab_experiment_runtime.torch_ops import op_torch_predict_cpu, op_torch_resume_cpu, op_torch_train_cpu


def test_beta_binomial_uses_scipy_credible_interval() -> None:
    result = op_bayesian_beta_binomial({"priorAlpha": 1, "priorBeta": 1, "successes": 8, "trials": 10})
    assert result["posteriorAlpha"] == 9.0
    assert result["posteriorBeta"] == 3.0
    assert result["credibleInterval"]["low"] < result["mean"] < result["credibleInterval"]["high"]
    assert result["engine"] == "scipy.stats.beta"


def test_backdoor_adjustment_requires_positivity() -> None:
    with pytest.raises(ValueError, match="lacks both treatment groups"):
        op_causal_backdoor({"treatment": [1, 1, 0, 0], "outcome": [1, 2, 3, 4], "confounder": ["a", "a", "b", "b"]})


def test_quadratic_optimization_is_finite_and_converged() -> None:
    result = op_optimize_quadratic({"matrix": [[2, 0], [0, 4]], "linear": [-4, 8], "initial": [0, 0]})
    assert result["status"] == "converged"
    assert math.isclose(result["solution"][0], 2, abs_tol=1e-5)
    assert math.isclose(result["solution"][1], -2, abs_tol=1e-5)
    assert result["engine"] == "scipy.optimize.BFGS"


def test_torch_cpu_training_returns_reloadable_hashed_checkpoint() -> None:
    features = [[float(i), float(i % 2)] for i in range(12)]
    targets = [2.0 * row[0] - 0.5 * row[1] + 1.0 for row in features]
    result = op_torch_train_cpu({
        "features": features,
        "targets": targets,
        "epochs": 80,
        "hiddenDim": 8,
        "learningRate": 0.02,
        "seed": 7,
    })
    assert result["device"] == "cpu"
    assert result["engine"].startswith("torch-") and result["engine"].endswith(".cpu")
    assert result["loss"]["final"] < result["loss"]["initial"]
    assert result["loss"]["historyEpochs"] == list(range(81))
    assert result["loss"]["history"][-1] == result["loss"]["final"]
    assert result["checkpointBytes"] > 0
    raw = base64.b64decode(result["checkpointBase64"], validate=True)
    assert len(raw) == result["checkpointBytes"]
    assert hashlib.sha256(raw).hexdigest() == result["checkpointSha256"]
    import torch
    checkpoint = torch.load(io.BytesIO(raw), map_location="cpu", weights_only=True)
    assert checkpoint["inputDim"] == 2
    assert checkpoint["hiddenDim"] == 8
    assert checkpoint["seed"] == 7
    assert result["checkpointReloadLoss"] == pytest.approx(result["loss"]["final"], rel=1e-6)


def test_torch_cpu_training_rejects_non_finite_input() -> None:
    with pytest.raises(ValueError, match="finite"):
        op_torch_train_cpu({"features": [[1.0], [float("nan")]], "targets": [1.0, 2.0]})


def test_torch_cpu_resume_preserves_state_and_honors_learning_rate() -> None:
    import torch
    data = {"features": [[0.0], [1.0], [2.0]], "targets": [1.0, 3.0, 5.0]}
    trained = op_torch_train_cpu({**data, "epochs": 2, "learningRate": 0.01})
    resumed = op_torch_resume_cpu({**data, "checkpointBase64": trained["checkpointBase64"], "checkpointSha256": trained["checkpointSha256"], "epochs": 3, "learningRate": 0.025})
    checkpoint = torch.load(io.BytesIO(base64.b64decode(resumed["checkpointBase64"])), map_location="cpu", weights_only=True)
    assert checkpoint["epochs"] == 5
    assert checkpoint["optimizer"]["param_groups"][0]["lr"] == 0.025
    prediction = op_torch_predict_cpu({**data, "checkpointBase64": resumed["checkpointBase64"], "checkpointSha256": resumed["checkpointSha256"]})
    assert len(prediction["predictions"]) == 3
    assert prediction["mse"] == pytest.approx(resumed["checkpointReloadLoss"], rel=1e-6)
    assert prediction["mse"] == pytest.approx(resumed["loss"]["final"], rel=1e-6)
    with pytest.raises(ValueError, match="does not match"):
        op_torch_predict_cpu({**data, "checkpointBase64": resumed["checkpointBase64"], "checkpointSha256": "0" * 64})


@pytest.mark.parametrize("payload,message", [
    ({"features": [[0.0], [1.0, 2.0]], "targets": [0.0, 1.0]}, "rectangular"),
    ({"features": [[0.0], [1.0]], "targets": [0.0]}, "matching"),
    ({"features": [[0.0], [1.0]], "targets": [0.0, 1.0], "epochs": 0}, "epochs"),
    ({"features": [[0.0], [1.0]], "targets": [0.0, 1.0], "hiddenDim": 129}, "hiddenDim"),
    ({"features": [[0.0], [1.0]], "targets": [0.0, 1.0], "learningRate": float("nan")}, "learningRate"),
    ({"features": [[0.0] * 256] * 10, "targets": [0.0] * 10, "epochs": 5000, "hiddenDim": 128}, "work budget"),
    ({"features": [[1e30], [1e30]], "targets": [1e30, 1e30]}, "diverged"),
])
def test_torch_cpu_training_rejects_invalid_configuration(payload: dict, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        op_torch_train_cpu(payload)


def test_torch_cpu_sidecar_emits_failure_and_handles_next_request() -> None:
    invalid = {"id": 1, "op": "torch_train_cpu", "payload": {"features": [[0], [None]], "targets": [1, 2]}}
    valid = {"id": 2, "op": "torch_train_cpu", "payload": {"features": [[0], [1]], "targets": [1, 3], "epochs": 2}}
    result = subprocess.run(
        [sys.executable, "-m", "farlab_experiment_runtime"],
        input=json.dumps(invalid) + "\n" + json.dumps(valid) + "\n",
        text=True,
        capture_output=True,
        timeout=60,
        check=True,
    )
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    assert responses[0]["ok"] is False
    assert responses[0]["error"]["kind"] == "execution"
    assert "rectangular numeric" in responses[0]["error"]["message"]
    assert responses[1]["ok"] is True
    assert responses[1]["result"]["device"] == "cpu"
