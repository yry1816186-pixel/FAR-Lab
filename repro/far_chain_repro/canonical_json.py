from __future__ import annotations

from dataclasses import asdict, is_dataclass
import hashlib
import math
import sys
from typing import Any

try:
    # rfc8785 包 API 是 dumps/dump（返回 bytes），不存在 serialize 导出——
    # 曾错写 `from rfc8785 import serialize` 且被 except ImportError 吞掉，
    # 导致即使安装了 rfc8785 也永远静默走 json.dumps fallback（非 RFC 8785）。
    from rfc8785 import dumps as _rfc8785_dumps
    _HAS_RFC8785 = True
except ImportError:
    _HAS_RFC8785 = False
    import json as _json_module
    # 响亮降级（非静默）：fallback 与 RFC 8785 在浮点指数形式上存在已知字节差异
    # （如 1e-07 vs 1e-7），跨语言 byte-equal 契约在此模式下不成立。
    sys.stderr.write(
        "far_chain_repro.canonical_json: WARNING — rfc8785 unavailable, "
        "falling back to json.dumps(sort_keys) (NOT RFC 8785; cross-language "
        "byte-equality not guaranteed). Install with: pip install rfc8785\n"
    )


def canonical_json(obj: Any) -> str:
    value = _to_plain(obj)
    _assert_no_non_finite(value, "canonical_json")
    if _HAS_RFC8785:
        # rfc8785.dumps 返回 bytes（UTF-8 编码的规范 JSON）。
        # int 先经 _es6_numbers 规约到 double 域（RFC 8785 §3.2.2.3：ES6 无整数域，
        # 一切数字按 IEEE754 double 序列化；Python json.loads 的任意精度 int 若不
        # 规约会在 >2^53-1 处触发 rfc8785 IntegerDomainError，与 TS JSON.parse
        # 语义错位）。
        return _rfc8785_dumps(_es6_numbers(value)).decode("utf-8")
    # Fallback: sort_keys + compact separators (pre-RFC 8785 behavior)
    return _json_module.dumps(
        value,
        sort_keys=True,
        allow_nan=False,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def _es6_numbers(value: Any) -> Any:
    """int → float 规约（RFC 8785 数字域 = ES6 double）。

    Python int 是任意精度；RFC 8785 要求按 ES6 Number（IEEE754 double）序列化。
    精确可表示的 int（含 2^53 本身与所有 2 的幂）转换无损；不可精确表示即
    fail-closed（RFC 8785 明令高精度数不得静默损失精度直接进 JCS——应转字符串
    或显式处理，绝不静默取整）。bool 是 int 子类，必须先排除。
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        as_float = float(value)
        if int(as_float) != value:
            raise ValueError(
                f"integer {value} is not exactly representable as an IEEE754 double — "
                "RFC 8785 forbids silent precision loss (encode as string instead)"
            )
        return as_float
    if isinstance(value, list):
        return [_es6_numbers(item) for item in value]
    if isinstance(value, dict):
        return {key: _es6_numbers(item) for key, item in value.items()}
    return value


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
