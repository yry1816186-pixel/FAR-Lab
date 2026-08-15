"""dataclass → dict 序列化辅助测试（09 §1.2 字段顺序保留 + 嵌套递归）。

Authority: .2 / §8.3.
"""

from __future__ import annotations

import unittest
from dataclasses import dataclass
from typing import Any

from far_chain_repro.dataclasses_ext import to_canonical_dict


@dataclass(frozen=True)
class _InnerCred:
    modelId: str
    dashscopeRequestId: str | None
    reproHash: str


@dataclass(frozen=True)
class _OuterRecord:
    stageId: str
    cred: _InnerCred
    payloadKind: str
    prevHash: str


class ToCanonicalDictTest(unittest.TestCase):
    """to_canonical_dict：递归转嵌套 dataclass + 字段顺序 = 定义顺序。"""

    def test_recursively_converts_nested_dataclass(self) -> None:
        cred = _InnerCred(
            modelId="qwen3.7-max-2026-05-20",
            dashscopeRequestId="req-abc",
            reproHash="a" * 64,
        )
        record = _OuterRecord(
            stageId="stage3_hypothesis",
            cred=cred,
            payloadKind="hypothesis",
            prevHash="0" * 64,
        )
        d = to_canonical_dict(record)

        self.assertIsInstance(d, dict)
        # 嵌套 cred 应被递归转为 dict（而非保留 _InnerCred 实例）
        self.assertIsInstance(d["cred"], dict)
        self.assertEqual(d["cred"]["modelId"], "qwen3.7-max-2026-05-20")
        self.assertEqual(d["cred"]["dashscopeRequestId"], "req-abc")
        self.assertEqual(d["cred"]["reproHash"], "a" * 64)

    def test_field_order_matches_definition_order(self) -> None:
        """字段顺序 = dataclass 定义顺序（保证 hash 字节级稳定）。"""
        cred = _InnerCred(modelId="m", dashscopeRequestId=None, reproHash="r")
        record = _OuterRecord(stageId="s", cred=cred, payloadKind="p", prevHash="0")
        d = to_canonical_dict(record)
        self.assertEqual(list(d.keys()), ["stageId", "cred", "payloadKind", "prevHash"])
        self.assertEqual(list(d["cred"].keys()), ["modelId", "dashscopeRequestId", "reproHash"])

    def test_raises_on_non_dataclass_instance(self) -> None:
        """非 dataclass 实例抛 TypeError（反 theater 设计：禁止静默 fallback）。"""
        with self.assertRaises(TypeError):
            to_canonical_dict({"a": 1})  # type: ignore[arg-type]
        with self.assertRaises(TypeError):
            to_canonical_dict([1, 2, 3])  # type: ignore[arg-type]
        with self.assertRaises(TypeError):
            to_canonical_dict("string")  # type: ignore[arg-type]
        with self.assertRaises(TypeError):
            to_canonical_dict(None)  # type: ignore[arg-type]

    def test_raises_on_dataclass_class_not_instance(self) -> None:
        """dataclass 类（class 本身，非实例）抛 TypeError。"""
        with self.assertRaises(TypeError):
            to_canonical_dict(_InnerCred)  # type: ignore[arg-type]
        with self.assertRaises(TypeError):
            to_canonical_dict(_OuterRecord)  # type: ignore[arg-type]

    def test_plain_dict_value_preserved(self) -> None:
        """嵌套 dict 类型的字段保持原样（asdict 对非 dataclass 值不再递归）。"""
        @dataclass(frozen=True)
        class WithDict:
            payload: dict[str, Any]

        record = WithDict(payload={"k": [1, 2, {"nested": True}]})
        d = to_canonical_dict(record)
        self.assertEqual(d["payload"], {"k": [1, 2, {"nested": True}]})


if __name__ == "__main__":
    unittest.main()
