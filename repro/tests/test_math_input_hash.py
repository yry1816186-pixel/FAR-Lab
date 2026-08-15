"""Python-side determinism tests for compute_input_hash (audit [F]).

Cross-language byte-equality (TS↔Python) is verified on the TS side by
``tests/math/math_input_hash_cross_lang.test.ts`` (spawnSync Python
``compute_input_hash``). This module covers Python-side determinism +
``canonical_confidence`` normalization (including -0.0, which cannot be passed
across process boundaries via argv/JSON — both lose the negative zero sign).

Authority: archived-spec §1 + 03 §2.4 + CLAUDE.md Red Line #5.
"""

from __future__ import annotations

import unittest

from far_chain_repro.math_input_hash import (
    canonical_confidence,
    compute_input_hash,
)


class CanonicalConfidenceTest(unittest.TestCase):
    """canonical_confidence: fixed-point 6 decimals + -0 normalization."""

    def test_integer_float_gets_decimal_suffix(self) -> None:
        # F-1 核心：整数浮点 1.0 → "1.000000"（非 JS JSON.stringify "1"）对齐 Python json.dumps("1.0")
        self.assertEqual(canonical_confidence(1.0), "1.000000")
        self.assertEqual(canonical_confidence(0.0), "0.000000")

    def test_non_integer_keeps_value_fixed_point(self) -> None:
        self.assertEqual(canonical_confidence(0.9), "0.900000")
        self.assertEqual(canonical_confidence(0.5), "0.500000")

    def test_negative_zero_normalized_to_positive(self) -> None:
        # -0.0 → "0.000000"（对齐 JS (-0).toFixed(6)="0.000000"·消除 Python "-0.000000" 分歧）
        # 注：-0.0 无法跨进程传递（argv/JSON 丢失负号）·此测试在 Python 进程内验证归一化
        self.assertEqual(canonical_confidence(-0.0), "0.000000")

    def test_tiny_value_rounds_to_zero_fixed_point(self) -> None:
        # 1e-10 < 5e-7 → 6 位定点为 "0.000000"（无指数分歧·JS/Python 同）
        self.assertEqual(canonical_confidence(1e-10), "0.000000")


class ComputeInputHashTest(unittest.TestCase):
    """compute_input_hash: 64-char hex + determinism + avalanche."""

    def test_returns_64_char_lowercase_hex(self) -> None:
        h = compute_input_hash("smtlib", '{"lhs":"x","rhs":"x"}', "core_neutral@v1", 0.9)
        self.assertEqual(len(h), 64)
        self.assertRegex(h, r"^[0-9a-f]{64}$")

    def test_deterministic_same_input_same_hash(self) -> None:
        args = ("smtlib", '{"lhs":"x","rhs":"x"}', "core_neutral@v1", 0.9)
        self.assertEqual(compute_input_hash(*args), compute_input_hash(*args))

    def test_changes_when_source_changes(self) -> None:
        h1 = compute_input_hash("smtlib", '{"lhs":"x","rhs":"x"}', "core_neutral@v1", 0.9)
        h2 = compute_input_hash("smtlib", '{"lhs":"x","rhs":"y"}', "core_neutral@v1", 0.9)
        self.assertNotEqual(h1, h2)

    def test_changes_when_confidence_changes(self) -> None:
        # confidence 进 hash（规范化后）——avalanche
        h1 = compute_input_hash("smtlib", "src", "core_neutral@v1", 0.9)
        h2 = compute_input_hash("smtlib", "src", "core_neutral@v1", 0.8)
        self.assertNotEqual(h1, h2)

    def test_confidence_integer_values_stable_and_distinct(self) -> None:
        # 整数浮点 1.0 / 0.0 规范化为定点串（非 JS "1"/"0"）·稳定 64 hex + 互异
        h1 = compute_input_hash("smtlib", "src", "f@v1", 1.0)
        h2 = compute_input_hash("smtlib", "src", "f@v1", 0.0)
        self.assertRegex(h1, r"^[0-9a-f]{64}$")
        self.assertRegex(h2, r"^[0-9a-f]{64}$")
        self.assertNotEqual(h1, h2)


if __name__ == "__main__":
    unittest.main()
