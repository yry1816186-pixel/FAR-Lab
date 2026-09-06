"""Restricted CPU-only PyTorch training, prediction and resume operations."""
from __future__ import annotations

import base64
import hashlib
import io
from typing import Any

import numpy as np

MAX_CHECKPOINT_BYTES = 8 * 1024 * 1024
MAX_WORK = 500_000_000


def _arrays(payload: dict[str, Any], features_key: str = "features", targets_key: str = "targets"):
    import torch
    try:
        x = torch.tensor(payload.get(features_key, []), dtype=torch.float32)
        y = torch.tensor(payload.get(targets_key, []), dtype=torch.float32)
    except (TypeError, ValueError, RuntimeError) as exc:
        raise ValueError(f"features and targets must be rectangular numeric arrays: {exc}") from exc
    if x.ndim != 2 or x.shape[0] < 2 or x.shape[0] > 100_000 or x.shape[1] < 1 or x.shape[1] > 256:
        raise ValueError("features must be a 2D matrix with 2..100000 rows and 1..256 columns")
    if y.ndim != 1 or y.shape[0] != x.shape[0]:
        raise ValueError("targets must be a 1D vector matching feature rows")
    if not torch.isfinite(x).all() or not torch.isfinite(y).all():
        raise ValueError("features and targets must contain only finite values")
    return x, y


def _limits(payload: dict[str, Any], n: int, d: int, hidden: int, epochs: int) -> None:
    lr = float(payload.get("learningRate", 1e-2))
    if not (1 <= epochs <= 5000): raise ValueError("epochs must be between 1 and 5000")
    if not (1 <= hidden <= 128): raise ValueError("hiddenDim must be between 1 and 128")
    if not (0 < lr <= 10) or not np.isfinite(lr): raise ValueError("learningRate must be in (0, 10]")
    if n * (d + 1) * hidden * epochs > MAX_WORK:
        raise ValueError("training work budget exceeded: rows * (inputDim + 1) * hiddenDim * epochs must be <= 500000000")


def _model(d: int, hidden: int):
    from torch import nn
    return nn.Sequential(nn.Linear(d, hidden), nn.ReLU(), nn.Linear(hidden, 1))


def _encode(model, optimizer, d: int, hidden: int, seed: int, epochs: int) -> bytes:
    import torch
    state = {"format": "farlab.torch.mlp.v2", "model": model.state_dict(), "optimizer": optimizer.state_dict(), "inputDim": d, "hiddenDim": hidden, "seed": seed, "epochs": epochs}
    buf = io.BytesIO(); torch.save(state, buf)
    raw = buf.getvalue()
    if len(raw) > MAX_CHECKPOINT_BYTES: raise ValueError("checkpoint exceeds 8 MiB limit")
    return raw


def _decode(raw_b64: str, expected_sha256: str | None = None) -> dict[str, Any]:
    import torch
    if not isinstance(raw_b64, str) or len(raw_b64) > MAX_CHECKPOINT_BYTES * 2:
        raise ValueError("checkpointBase64 exceeds size limit")
    try: raw = base64.b64decode(raw_b64, validate=True)
    except Exception as exc: raise ValueError(f"checkpointBase64 is invalid: {exc}") from exc
    if not raw or len(raw) > MAX_CHECKPOINT_BYTES: raise ValueError("checkpoint bytes exceed 8 MiB limit")
    if expected_sha256 is not None and hashlib.sha256(raw).hexdigest() != expected_sha256:
        raise ValueError("checkpointSha256 does not match checkpointBase64")
    try: state = torch.load(io.BytesIO(raw), map_location="cpu", weights_only=True)
    except Exception as exc: raise ValueError(f"checkpoint cannot be safely loaded with weights_only=True: {exc}") from exc
    if not isinstance(state, dict) or state.get("format") != "farlab.torch.mlp.v2": raise ValueError("unsupported checkpoint format")
    d, hidden = state.get("inputDim"), state.get("hiddenDim")
    if not isinstance(d, int) or not 1 <= d <= 256 or not isinstance(hidden, int) or not 1 <= hidden <= 128: raise ValueError("checkpoint architecture is invalid")
    model_state, optim_state = state.get("model"), state.get("optimizer")
    if not isinstance(model_state, dict) or not isinstance(optim_state, dict): raise ValueError("checkpoint lacks model or optimizer state")
    expected = {"0.weight": (hidden, d), "0.bias": (hidden,), "2.weight": (1, hidden), "2.bias": (1,)}
    for name, shape in expected.items():
        tensor = model_state.get(name)
        if tensor is None or not hasattr(tensor, "shape") or tuple(tensor.shape) != shape or tensor.dtype != torch.float32 or not torch.isfinite(tensor).all(): raise ValueError(f"checkpoint tensor {name} is invalid")
    for value in optim_state.get("state", {}).values():
        if not isinstance(value, dict): raise ValueError("checkpoint optimizer state is invalid")
        for v in value.values():
            if torch.is_tensor(v) and (v.numel() > 1_000_000 or (v.is_floating_point() and not torch.isfinite(v).all())): raise ValueError("checkpoint optimizer tensor is invalid")
    return {"raw": raw, "state": state, "inputDim": d, "hiddenDim": hidden}


def _result(raw: bytes, **extra: Any) -> dict[str, Any]:
    return {"device": "cpu", "checkpointBase64": base64.b64encode(raw).decode("ascii"), "checkpointBytes": len(raw), "checkpointSha256": hashlib.sha256(raw).hexdigest(), "provenance": "COMPUTED", **extra}


def op_torch_train_cpu(payload: dict[str, Any]) -> dict[str, Any]:
    import torch
    from torch import nn
    x, y = _arrays(payload)
    hidden, epochs, seed = int(payload.get("hiddenDim", 16)), int(payload.get("epochs", 100)), int(payload.get("seed", 0))
    _limits(payload, x.shape[0], x.shape[1], hidden, epochs)
    torch.manual_seed(seed); torch.set_num_threads(1)
    model, criterion = _model(x.shape[1], hidden), nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=float(payload.get("learningRate", .01)))
    losses = []
    for _ in range(epochs):
        optimizer.zero_grad(set_to_none=True); loss = criterion(model(x).squeeze(1), y)
        if not torch.isfinite(loss): raise ValueError("training diverged to a non-finite loss")
        loss.backward(); optimizer.step(); losses.append(float(loss.detach()))
    with torch.no_grad(): final = float(criterion(model(x).squeeze(1), y))
    if not np.isfinite(final): raise ValueError("training diverged to a non-finite final loss")
    raw = _encode(model, optimizer, x.shape[1], hidden, seed, epochs)
    reloaded = op_torch_predict_cpu({"checkpointBase64": base64.b64encode(raw).decode("ascii"), "features": payload["features"], "targets": payload["targets"]})
    return _result(raw, task="regression", torchVersion=torch.__version__, engine=f"torch-{torch.__version__}.cpu", n=int(x.shape[0]), inputDim=int(x.shape[1]), hiddenDim=hidden, epochs=epochs, seed=seed, loss={"initial": losses[0], "final": final, "history": losses + [final] if epochs <= 200 else [losses[0], final], "historyEpochs": list(range(epochs + 1)) if epochs <= 200 else [0, epochs]}, checkpointReloadLoss=reloaded["mse"])


def op_torch_predict_cpu(payload: dict[str, Any]) -> dict[str, Any]:
    import torch
    ck = _decode(payload.get("checkpointBase64"), payload.get("checkpointSha256")); x = torch.tensor(payload.get("features", []), dtype=torch.float32)
    if x.ndim != 2 or x.shape[0] > 100_000 or x.shape[1] != ck["inputDim"] or not torch.isfinite(x).all(): raise ValueError("features must be finite 2D data matching checkpoint inputDim")
    model = _model(ck["inputDim"], ck["hiddenDim"]); model.load_state_dict(ck["state"]["model"])
    with torch.no_grad(): pred = model(x).squeeze(1)
    if not torch.isfinite(pred).all(): raise ValueError("prediction produced non-finite values")
    out = {"predictions": pred.tolist(), "inputDim": ck["inputDim"], "n": int(x.shape[0]), "engine": f"torch-{torch.__version__}.cpu"}
    if "targets" in payload:
        _, y = _arrays({"features": payload.get("features"), "targets": payload.get("targets")})
        out["mse"] = float(torch.mean((pred - y) ** 2))
        if not np.isfinite(out["mse"]): raise ValueError("prediction produced a non-finite loss")
    return {"device": "cpu", "provenance": "COMPUTED", **out}


def op_torch_resume_cpu(payload: dict[str, Any]) -> dict[str, Any]:
    import torch
    from torch import nn
    ck = _decode(payload.get("checkpointBase64"), payload.get("checkpointSha256")); x, y = _arrays(payload); epochs = int(payload.get("epochs", 1)); _limits(payload, x.shape[0], x.shape[1], ck["hiddenDim"], epochs)
    if x.shape[1] != ck["inputDim"]: raise ValueError("resume features do not match checkpoint inputDim")
    torch.set_num_threads(1); model, criterion = _model(ck["inputDim"], ck["hiddenDim"]), nn.MSELoss(); model.load_state_dict(ck["state"]["model"])
    optimizer = torch.optim.Adam(model.parameters(), lr=float(payload.get("learningRate", ck["state"].get("optimizer", {}).get("param_groups", [{"lr": .01}])[0].get("lr", .01))))
    optimizer.load_state_dict(ck["state"]["optimizer"])
    if "learningRate" in payload:
        for group in optimizer.param_groups:
            group["lr"] = float(payload["learningRate"])
    for group in optimizer.param_groups:
        _limits({"learningRate": group["lr"]}, x.shape[0], x.shape[1], ck["hiddenDim"], epochs)
    for _ in range(epochs):
        optimizer.zero_grad(set_to_none=True); loss = criterion(model(x).squeeze(1), y)
        if not torch.isfinite(loss): raise ValueError("resumed training diverged to a non-finite loss")
        loss.backward(); optimizer.step()
    with torch.no_grad(): final = float(criterion(model(x).squeeze(1), y))
    if not np.isfinite(final): raise ValueError("resumed training diverged to a non-finite final loss")
    raw = _encode(model, optimizer, ck["inputDim"], ck["hiddenDim"], int(ck["state"].get("seed", 0)), int(ck["state"].get("epochs", 0)) + epochs)
    reloaded = op_torch_predict_cpu({"checkpointBase64": base64.b64encode(raw).decode("ascii"), "features": payload["features"], "targets": payload["targets"]})
    return _result(raw, task="regression", torchVersion=torch.__version__, engine=f"torch-{torch.__version__}.cpu", n=int(x.shape[0]), inputDim=ck["inputDim"], hiddenDim=ck["hiddenDim"], epochs=epochs, loss={"final": final}, checkpointReloadLoss=reloaded["mse"])
