"""Tests for deterministic_seed module: fixed seed + BLAS thread count.

Covers:
  - seed_python_random produces reproducible sequences
  - seed_numpy produces reproducible numpy arrays
  - deterministic_context combines seed + BLAS + env vars
  - deterministic_context asserts on nthread != 1
  - seed_context is a lighter alternative
  - deterministic_rng creates an isolated Generator
"""

from __future__ import annotations

import random
import os
import unittest

from threadpoolctl import threadpool_info

import numpy as np  # noqa: F401  trigger BLAS loading; used by all tests that need numpy arrays


def _has_blas() -> bool:
    info = threadpool_info()
    return any(entry.get("user_api") == "blas" for entry in info)


class SeedPythonRandomTest(unittest.TestCase):
    def test_reproducible_sequence(self) -> None:
        from far_chain_repro.deterministic_seed import seed_python_random

        seed_python_random(42)
        seq1 = [random.random() for _ in range(10)]

        seed_python_random(42)
        seq2 = [random.random() for _ in range(10)]

        self.assertEqual(seq1, seq2)

    def test_different_seeds_different_sequences(self) -> None:
        from far_chain_repro.deterministic_seed import seed_python_random

        seed_python_random(42)
        seq1 = [random.random() for _ in range(5)]

        seed_python_random(99)
        seq2 = [random.random() for _ in range(5)]

        self.assertNotEqual(seq1, seq2)


class SeedNumpyTest(unittest.TestCase):
    def test_reproducible_array(self) -> None:
        from far_chain_repro.deterministic_seed import seed_numpy

        seed_numpy(42)
        arr1 = np.random.randn(10).copy()

        seed_numpy(42)
        arr2 = np.random.randn(10).copy()

        np.testing.assert_array_equal(arr1, arr2)

    def test_different_seeds_different_arrays(self) -> None:
        from far_chain_repro.deterministic_seed import seed_numpy

        seed_numpy(42)
        arr1 = np.random.randn(10).copy()

        seed_numpy(99)
        arr2 = np.random.randn(10).copy()

        self.assertFalse(np.array_equal(arr1, arr2))


class DeterministicRngTest(unittest.TestCase):
    def test_returns_generator_with_same_seed(self) -> None:
        from far_chain_repro.deterministic_seed import deterministic_rng

        rng1 = deterministic_rng(42)
        rng2 = deterministic_rng(42)

        self.assertIsNotNone(rng1)
        self.assertIsNotNone(rng2)
        np.testing.assert_array_equal(rng1.standard_normal(10), rng2.standard_normal(10))

    def test_isolation_from_global_state(self) -> None:
        from far_chain_repro.deterministic_seed import deterministic_rng

        rng = deterministic_rng(42)
        arr1 = rng.standard_normal(5).copy()

        # Global state should be unaffected
        np.random.seed(99)
        arr2 = rng.standard_normal(5).copy()
        self.assertFalse(np.array_equal(arr1, arr2))


class DeterministicContextTest(unittest.TestCase):
    def setUp(self) -> None:
        if not _has_blas():
            self.skipTest("BLAS not loaded — cannot test threadpool limits")

    def test_context_asserts_on_nthread_not_one(self) -> None:
        from far_chain_repro.deterministic_seed import deterministic_context

        with self.assertRaises(AssertionError):
            with deterministic_context(seed=42, nthread=4):
                pass

    def test_context_sets_environment_vars(self) -> None:
        from far_chain_repro.deterministic_seed import deterministic_context

        with deterministic_context(seed=42):
            self.assertEqual(os.environ.get("PYTHONHASHSEED"), "0")
            self.assertEqual(os.environ.get("OMP_NUM_THREADS"), "1")
            self.assertEqual(os.environ.get("MKL_NUM_THREADS"), "1")
            self.assertEqual(os.environ.get("OPENBLAS_NUM_THREADS"), "1")
            self.assertEqual(os.environ.get("NUMEXPR_NUM_THREADS"), "1")

    def test_context_restores_environment(self) -> None:
        from far_chain_repro.deterministic_seed import deterministic_context

        os.environ["PYTHONHASHSEED"] = "random"
        try:
            with deterministic_context(seed=42):
                self.assertEqual(os.environ["PYTHONHASHSEED"], "0")
            self.assertEqual(os.environ["PYTHONHASHSEED"], "random")
        finally:
            os.environ.pop("PYTHONHASHSEED", None)

    def test_numpy_reproducible_under_context(self) -> None:
        from far_chain_repro.deterministic_seed import deterministic_context

        with deterministic_context(seed=42):
            arr1 = np.random.randn(10).copy()

        with deterministic_context(seed=42):
            arr2 = np.random.randn(10).copy()

        np.testing.assert_array_equal(arr1, arr2)

    def test_python_random_reproducible_under_context(self) -> None:
        from far_chain_repro.deterministic_seed import deterministic_context

        with deterministic_context(seed=42):
            seq1 = [random.random() for _ in range(10)]

        with deterministic_context(seed=42):
            seq2 = [random.random() for _ in range(10)]

        self.assertEqual(seq1, seq2)


class SeedContextTest(unittest.TestCase):
    """Lightweight seed-only context (no BLAS dependency)."""

    def test_reproducible_numpy(self) -> None:
        from far_chain_repro.deterministic_seed import seed_context

        with seed_context(seed=42):
            arr1 = np.random.randn(8).copy()

        with seed_context(seed=42):
            arr2 = np.random.randn(8).copy()

        np.testing.assert_array_equal(arr1, arr2)

    def test_different_seeds_different_output(self) -> None:
        from far_chain_repro.deterministic_seed import seed_context

        with seed_context(seed=42):
            arr1 = np.random.randn(8).copy()

        with seed_context(seed=99):
            arr2 = np.random.randn(8).copy()

        self.assertFalse(np.array_equal(arr1, arr2))


class EnvVarHelpersTest(unittest.TestCase):
    def test_set_deterministic_env_and_restore(self) -> None:
        from far_chain_repro.deterministic_seed import (
            restore_env,
            set_deterministic_env,
        )

        orig_hashseed = os.environ.get("PYTHONHASHSEED", "")
        os.environ["PYTHONHASHSEED"] = "custom_value"

        try:
            prev = set_deterministic_env()
            self.assertEqual(os.environ["PYTHONHASHSEED"], "0")
            restore_env(prev)
            self.assertEqual(os.environ["PYTHONHASHSEED"], "custom_value")
        finally:
            if orig_hashseed:
                os.environ["PYTHONHASHSEED"] = orig_hashseed
            else:
                os.environ.pop("PYTHONHASHSEED", None)


if __name__ == "__main__":
    unittest.main()
