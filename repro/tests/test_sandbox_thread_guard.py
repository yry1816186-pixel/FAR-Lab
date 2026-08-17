"""tests for science_harness.sandbox_runner._verify_thread_limit.

Vacuous-attestation guard (SR-7 fail-closed): a script that imported a
threadpool-capable module must yield at least one visible pool — zero pools
means platform introspection failed (observed: macOS CI) and attesting
singleThreaded would be evidence-free.
"""

import sys
import unittest

from science_harness.sandbox_runner import _verify_thread_limit


def _probe_returning(pools):
    return lambda: pools


class VerifyThreadLimitTests(unittest.TestCase):
    def setUp(self):
        # 测试进程自身可能已 import numpy（repro 测试环境）——记录并清场，保证分支隔离。
        self._touched = []
        for name in (
            "numpy",
            "numpy.core._multiarray_umath",
            "scipy",
            "sklearn",
            "numexpr",
            "torch",
            "xgboost",
        ):
            if name in sys.modules:
                self._touched.append((name, sys.modules[name]))
                del sys.modules[name]

    def tearDown(self):
        for name, module in self._touched:
            sys.modules[name] = module

    def test_all_pools_one_thread_verifies(self):
        self.assertEqual(
            _verify_thread_limit(_probe_returning([{"num_threads": 1}, {"num_threads": 1}])),
            (True, "threadpoolctl_verified"),
        )

    def test_pool_not_one_invalidates(self):
        self.assertEqual(
            _verify_thread_limit(_probe_returning([{"num_threads": 1}, {"num_threads": 2}])),
            (False, "threadpool_limit_not_one"),
        )

    def test_no_pools_no_capable_module_passes_vacuously_legit(self):
        # 纯 Python 脚本（未 import BLAS 库）零池 = 合法：无可限制对象。
        self.assertEqual(
            _verify_thread_limit(_probe_returning([])),
            (True, "threadpoolctl_applied_no_supported_pools"),
        )

    def test_no_pools_with_numpy_loaded_fails_closed(self):
        # macOS CI 实测反例：numpy 已导入、threadpoolctl 枚举 0 池 → 空真，
        # 必须拒绝背书 singleThreaded（anti-fake-green）。
        sys.modules["numpy"] = type(sys)("numpy")
        try:
            self.assertEqual(
                _verify_thread_limit(_probe_returning([])),
                (False, "threadpool_introspection_gap"),
            )
        finally:
            del sys.modules["numpy"]

    def test_no_pools_with_scipy_loaded_fails_closed(self):
        sys.modules["scipy"] = type(sys)("scipy")
        try:
            self.assertEqual(
                _verify_thread_limit(_probe_returning([])),
                (False, "threadpool_introspection_gap"),
            )
        finally:
            del sys.modules["scipy"]

    def test_probe_failure_converts_to_honest_receipt(self):
        def raising_probe():
            raise SystemExit(126)  # audit-hook rejection during probe

        self.assertEqual(
            _verify_thread_limit(raising_probe),
            (False, "threadpoolctl_verification_failed"),
        )

    def test_non_list_pools_rejected(self):
        self.assertEqual(
            _verify_thread_limit(_probe_returning({"num_threads": 1})),
            (False, "threadpoolctl_verification_failed"),
        )

    def test_malformed_pool_entry_rejected(self):
        self.assertEqual(
            _verify_thread_limit(_probe_returning([{"num_threads": True}])),
            (False, "threadpoolctl_verification_failed"),
        )


if __name__ == "__main__":
    unittest.main()
