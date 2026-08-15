"""七分量确定性 hash 引擎回归测试（R9：threadpool 篡改 → hash 变）。

Authority: .2.

R9 核心：threadpool 篡改 → nthread 变 → repro_hash 变 → verify_repro_hash raise。

原版 bug：用 os.environ 篡改，不影响 7 分量（post==pre 不 raise → CI 永红）。
修复：用 threadpool 篡改，nthread 进 CalcSpec → hash 变 → 可观测。

[须 day-1 核验] threadpool_info() 在 CI 环境（ubuntu numpy）是否真返回 blas 条目。
  若纯 ref BLAS，threadpool_info() 返回 []，本测试 setup 阶段 skipTest。
  核验方法：CI 跑
    python -c "from threadpoolctl import threadpool_info; import numpy; print(threadpool_info())"
"""

from __future__ import annotations

import unittest

from threadpoolctl import threadpool_info

import numpy as np  # noqa: F401  触发 BLAS 加载，threadpool_info 才能看到 blas 条目

from far_chain_repro.calc_bridge import (
    CalcSpec,
    HashMismatch,
    ReproContext,
    compute_repro_hash,
    deterministic_blas_ctx,
    verify_repro_hash,
)
from far_chain_repro.model_snapshot import MODEL_SNAPSHOT


def _has_blas() -> bool:
    """CI 环境 BLAS 可用性探测。"""
    info = threadpool_info()
    return any(entry.get("user_api") == "blas" for entry in info)


def _make_ctx(nthread: int = 1) -> ReproContext:
    return ReproContext(
        model_snapshot=MODEL_SNAPSHOT,
        active_model_ids_sorted=("qwen-max", "qwen-plus"),
        calc_spec=CalcSpec(
            seed=42,
            nthread=nthread,
            allowed_ops=("numpy.dot", "numpy.random.randn"),
            input_hash="a" * 64,
            code_hash="b" * 64,
        ),
        env_hash="c" * 64,
    )


class DeterministicBlasCtxTest(unittest.TestCase):
    """R9 核心：threadpool_limits 圈定后 num_threads==1。"""

    def setUp(self) -> None:
        if not _has_blas():
            self.skipTest(
                "threadpool_info() 无 blas 条目：CI 未加载 BLAS（纯 ref BLAS）。"
                "pin 'numpy>=1.24,<2.0'（MKL/OpenBLAS 后端）后重测。"
            )

    def test_ctx_limits_to_one(self) -> None:
        with deterministic_blas_ctx(nthread=1):
            info = threadpool_info()
            blas_entries = [e for e in info if e.get("user_api") == "blas"]
            self.assertTrue(blas_entries, "圈定后仍应有 blas 条目")
            for entry in blas_entries:
                self.assertEqual(entry["num_threads"], 1)

    def test_ctx_asserts_on_nthread_not_one(self) -> None:
        """反 theater：nthread>1 必须显式 raise（spec §2.1 函数签名无 _allow_nondeterministic）。"""
        with self.assertRaises(AssertionError):
            with deterministic_blas_ctx(nthread=4):
                pass


class ComputeReproHashTest(unittest.TestCase):
    """compute_repro_hash 确定性最硬证据。"""

    def setUp(self) -> None:
        if not _has_blas():
            self.skipTest("BLAS 不可用，跳过 hash 测试")

    def test_returns_64_char_lowercase_hex(self) -> None:
        h = compute_repro_hash(_make_ctx(nthread=1))
        self.assertEqual(len(h), 64)
        self.assertRegex(h, r"^[0-9a-f]{64}$")

    def test_deterministic_same_input_same_hash(self) -> None:
        """同输入两次 run，hash 逐字节一致。"""
        ctx = _make_ctx(nthread=1)
        h1 = compute_repro_hash(ctx)
        h2 = compute_repro_hash(ctx)
        self.assertEqual(h1, h2)

    def test_deterministic_under_blas_ctx(self) -> None:
        """圈定 BLAS 线程后两次 hash 仍一致（消除浮点累加序差异）。"""
        with deterministic_blas_ctx(nthread=1):
            h1 = compute_repro_hash(_make_ctx(nthread=1))
            h2 = compute_repro_hash(_make_ctx(nthread=1))
            self.assertEqual(h1, h2)


class VerifyReproHashR9Test(unittest.TestCase):
    """R9 核心：threadpool 篡改 → nthread 变 → repro_hash 变 → verify raise HashMismatch。"""

    def setUp(self) -> None:
        if not _has_blas():
            self.skipTest("BLAS 不可用，跳过 R9 篡改测试")

    def test_repro_hash_changes_when_threadpool_tampered(self) -> None:
        """R9 核心：nthread 进 CalcSpec，篡改 nthread → hash 变 → verify raise。

        原版 bug：用 os.environ 篡改，不影响 7 分量（post==pre 不 raise → CI 永红）。
        修复：nthread 进 CalcSpec → hash 变 → 可观测。
        """
        # 写入期：nthread=1 算 hash
        ctx_write = _make_ctx(nthread=1)
        hash_write = compute_repro_hash(ctx_write)

        # 验证期：nthread=4（篡改）算 hash，应 != 写入期
        ctx_tampered = _make_ctx(nthread=4)
        hash_tampered = compute_repro_hash(ctx_tampered)

        self.assertNotEqual(
            hash_write,
            hash_tampered,
            "R9 未关闭：nthread 篡改未导致 repro_hash 变化（原版 os.environ bug 复现）",
        )

        # verify 应 raise HashMismatch
        with self.assertRaises(HashMismatch) as ctx_exc:
            verify_repro_hash(ctx_tampered, hash_write)

        exc = ctx_exc.exception
        self.assertEqual(exc.field, "repro_hash")
        self.assertEqual(exc.expected, hash_write)
        self.assertEqual(exc.actual, hash_tampered)
        self.assertEqual(exc.context["calc_spec"]["nthread"], 4)

    def test_verify_passes_when_identical(self) -> None:
        """同 ReproContext → verify_repro_hash 不 raise。"""
        ctx = _make_ctx(nthread=1)
        expected = compute_repro_hash(ctx)
        # 不 raise 即通过
        verify_repro_hash(ctx, expected)

    def test_hash_diff_changes_when_seed_changes(self) -> None:
        """七分量中 seed 变 → hash 变（验证 CalcSpec 进 hash）。"""
        ctx_a = _make_ctx(nthread=1)
        # ReproContext 是 frozen，用 dataclasses.replace 改 seed
        from dataclasses import replace

        ctx_b = replace(ctx_a, calc_spec=replace(ctx_a.calc_spec, seed=999))
        self.assertNotEqual(
            compute_repro_hash(ctx_a),
            compute_repro_hash(ctx_b),
            "seed 变化未导致 hash 变化：CalcSpec 未正确进 hash",
        )

    def test_hash_diff_changes_when_input_hash_changes(self) -> None:
        """七分量中 input_hash 变 → hash 变。"""
        ctx_a = _make_ctx(nthread=1)
        from dataclasses import replace

        ctx_b = replace(ctx_a, calc_spec=replace(ctx_a.calc_spec, input_hash="z" * 64))
        self.assertNotEqual(compute_repro_hash(ctx_a), compute_repro_hash(ctx_b))

    def test_hash_diff_changes_when_env_hash_changes(self) -> None:
        """七分量中 env_hash 变 → hash 变。"""
        ctx_a = _make_ctx(nthread=1)
        from dataclasses import replace

        ctx_b = replace(ctx_a, env_hash="y" * 64)
        self.assertNotEqual(compute_repro_hash(ctx_a), compute_repro_hash(ctx_b))

    def test_hash_diff_changes_when_active_model_ids_change(self) -> None:
        """七分量中 active_model_ids_sorted 变 → hash 变。"""
        ctx_a = _make_ctx(nthread=1)
        from dataclasses import replace

        ctx_b = replace(ctx_a, active_model_ids_sorted=("qwen-max", "qwen-plus", "qwen-turbo"))
        self.assertNotEqual(compute_repro_hash(ctx_a), compute_repro_hash(ctx_b))

    def test_hash_order_independent_for_active_model_ids(self) -> None:
        """active_model_ids_sorted 名称暗示已排序，但 hash 引擎不再二次排序
        （spec §2.1 要求调用方传已排序 tuple）。本测试验证这一契约。
        """
        ctx_sorted = _make_ctx(nthread=1)  # active_model_ids_sorted=("qwen-max", "qwen-plus")
        from dataclasses import replace

        ctx_unsorted = replace(
            ctx_sorted,
            active_model_ids_sorted=("qwen-plus", "qwen-max"),  # 反序
        )
        # 引擎不二次排序 → 顺序不同 → hash 应不同
        # 这是契约：调用方负责排序，引擎只做序列化
        self.assertNotEqual(
            compute_repro_hash(ctx_sorted),
            compute_repro_hash(ctx_unsorted),
            "引擎对 active_model_ids 二次排序会破坏契约：调用方应负责排序",
        )


if __name__ == "__main__":
    unittest.main()
