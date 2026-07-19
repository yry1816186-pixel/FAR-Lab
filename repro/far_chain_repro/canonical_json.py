from __future__ import annotations

from dataclasses import asdict, is_dataclass
import hashlib
import json
import math
from typing import Any


def canonical_json(obj: Any) -> str:
    value = _to_plain(obj)
    _assert_no_non_finite(value, "canonical_json")
    return json.dumps(
        value,
        sort_keys=True,
        allow_nan=False,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def canonical_hash(obj: Any) -> str:
    value = _hashable(_to_plain(obj))
    payload = canonical_json(value).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def hash_canonical_json(obj: dict[str, Any]) -> str:
    payload = canonical_json(obj).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _hashable(obj: Any) -> dict[str, Any]:
    if not isinstance(obj, dict):
        raise TypeError("canonical_hash expects a dict-like canonical input")
    missing = [key for key in ("stageId", "cred", "payloadKind", "prevHash") if key not in obj]
    if missing:
        raise ValueError(f"canonical_hash missing required keys: {', '.join(missing)}")
    return {
        "stageId": obj["stageId"],
        "cred": obj["cred"],
        "payloadKind": obj["payloadKind"],
        "prevHash": obj["prevHash"],
    }


def _to_plain(obj: Any) -> Any:
    if is_dataclass(obj):
        return _tuple_to_list(asdict(obj))
    if isinstance(obj, tuple):
        return _tuple_to_list(list(obj))
    return obj


def _tuple_to_list(value: Any) -> Any:
    """递归把 tuple 转 list（与 TS JSON.stringify 字节级对齐）。

    dataclasses.asdict 不转 tuple 字段（保留 tuple），json.dumps 隐式转 tuple→list
    但语义依赖隐式行为不够明确。本函数显式递归转换，保证跨语言 hash 字节级一致。
    """
    if isinstance(value, tuple):
        return [_tuple_to_list(item) for item in value]
    if isinstance(value, list):
        return [_tuple_to_list(item) for item in value]
    if isinstance(value, dict):
        return {key: _tuple_to_list(item) for key, item in value.items()}
    return value


def _assert_no_non_finite(value: Any, path: str) -> None:
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError(f"{path}: NaN and Infinity are not allowed in canonical JSON")
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            _assert_no_non_finite(item, f"{path}[{index}]")
        return
    if isinstance(value, dict):
        for key, item in value.items():
            _assert_no_non_finite(item, f"{path}.{key}")
