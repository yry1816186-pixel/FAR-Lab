"""COMPETITION_MODEL_SNAPSHOT 常量 + repro_hash 序列化接缝测试（R15 修复）。

Authority: FAR_CHAIN_DEV_SPEC/09_repro_deterministic.md §5 + 00_项目宪法 §8.6.

跨语言一致性：本测试覆盖 Python 侧确定性。
TS↔Python 跨语言 model 字面量一致性由 tests/llm_gateway/model_snapshot_cross_source.test.ts
断言（读取本模块 COMPETITION_MODEL_SNAPSHOT 字面量与 TS Core/adapter 比对·闭环三源·审计 [E]）。
"""

from __future__ import annotations

import hashlib
import json
import unittest

from far_chain_repro.model_snapshot import (
    BASE_URL,
    COMPETITION_BASE_URL,
    COMPETITION_MODEL_SNAPSHOT,
    MODEL_SNAPSHOT,
    repro_hash_of_active_models,
)


class ModelSnapshotConstantsTest(unittest.TestCase):
    """常量与 TS snapshot.ts 字节级一致（C10 + 09 §5）。"""

    def test_competition_model_snapshot_value(self) -> None:
        # 与 src/llm_gateway/adapters/aliyun_qwen/snapshot.ts 同名常量字节级一致
        self.assertEqual(COMPETITION_MODEL_SNAPSHOT, "qwen3.7-max-2026-05-20")

    def test_model_snapshot_is_alias(self) -> None:
        # MODEL_SNAPSHOT 是 legacy alias（competition profile 兼容）
        self.assertIs(MODEL_SNAPSHOT, COMPETITION_MODEL_SNAPSHOT)

    def test_competition_base_url_value(self) -> None:
        self.assertEqual(COMPETITION_BASE_URL, "https://dashscope.aliyuncs.com/compatible-mode/v1")

    def test_base_url_is_alias(self) -> None:
        self.assertIs(BASE_URL, COMPETITION_BASE_URL)


class ReproHashOfActiveModelsTest(unittest.TestCase):
    """repro_hash_of_active_models：sorted + sha256 + UTF-8 字节级确定。"""

    def test_returns_64_char_lowercase_hex(self) -> None:
        h = repro_hash_of_active_models(["qwen-max"])
        self.assertEqual(len(h), 64)
        self.assertRegex(h, r"^[0-9a-f]{64}$")

    def test_deterministic_same_input_same_hash(self) -> None:
        """同输入两次 run，hash 逐字节一致（确定性最硬证据）。"""
        ids = ["qwen-max", "qwen-plus", "qwen3.7-max-2026-05-20"]
        h1 = repro_hash_of_active_models(ids)
        h2 = repro_hash_of_active_models(ids)
        self.assertEqual(h1, h2)

    def test_order_independent(self) -> None:
        """sorted 内部：输入顺序不影响 hash。"""
        h1 = repro_hash_of_active_models(["qwen-max", "qwen-plus"])
        h2 = repro_hash_of_active_models(["qwen-plus", "qwen-max"])
        self.assertEqual(h1, h2)

    def test_empty_list_stable(self) -> None:
        """空 list 也能算（不 raise，hex 稳定）。"""
        h1 = repro_hash_of_active_models([])
        h2 = repro_hash_of_active_models([])
        self.assertEqual(h1, h2)
        self.assertEqual(len(h1), 64)

    def test_different_inputs_different_hashes(self) -> None:
        """不同 model 集应得不同 hash。"""
        h1 = repro_hash_of_active_models(["qwen-max"])
        h2 = repro_hash_of_active_models(["qwen-plus"])
        self.assertNotEqual(h1, h2)

    def test_hash_matches_reference_implementation(self) -> None:
        """与 09 §5 给出的 reference 实现字节级一致：
        sorted(ids) -> json.dumps(sort_keys=True, separators=(',',':'), allow_nan=False,
        ensure_ascii=False) -> sha256(.encode('utf-8')).hexdigest()
        """
        ids = ["qwen-max", "qwen-plus", "qwen3.7-max-2026-05-20"]
        expected = hashlib.sha256(
            json.dumps(
                sorted(ids),
                sort_keys=True,
                allow_nan=False,
                separators=(",", ":"),
                ensure_ascii=False,
            ).encode("utf-8")
        ).hexdigest()
        self.assertEqual(repro_hash_of_active_models(ids), expected)

    def test_unicode_id_handled(self) -> None:
        """ensure_ascii=False：unicode model id 不被转义为 \\uXXXX（与 TS JSON.stringify 行为一致）。"""
        ids = ["qwen-中文-model"]
        h = repro_hash_of_active_models(ids)
        # 与 reference 字节级一致
        expected = hashlib.sha256(
            json.dumps(
                sorted(ids),
                sort_keys=True,
                allow_nan=False,
                separators=(",", ":"),
                ensure_ascii=False,
            ).encode("utf-8")
        ).hexdigest()
        self.assertEqual(h, expected)


if __name__ == "__main__":
    unittest.main()
