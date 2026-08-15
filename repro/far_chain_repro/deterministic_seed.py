"""Deterministic execution environment: fixed random seed + fixed BLAS thread count.

Produces a fully deterministic Python execution context by combining:
  1. numpy random state seeding (np.random.seed)
  2. Python random module seeding (random.seed)
  3. BLAS thread count pinning (threadpool_limits)

Combined context manager `deterministic_context(seed)` wraps all three in one
`with` block for convenience. Individual components are also exported for
incremental adoption.

Cross-language contract: the same seed + same BLAS thread count + same input
data MUST produce identical numpy array byte values across runs AND across
platforms (Linux x64 / macOS ARM / Windows x64) provided the same numpy
version and BLAS backend.

Authority: archived-spec §1-2.
"""

from __future__ import annotations

from contextlib import contextmanager
import os
import random
from typing import Iterator

from threadpoolctl import threadpool_info, threadpool_limits


# ── Per-library seeding ──


def seed_numpy(seed: int) -> None:
    """Seed numpy's global random state.

    Does NOT import numpy — caller must have imported numpy first.
    Uses np.random.seed(seed) which seeds the legacy global RandomState.

    For new code, prefer numpy.random.default_rng(seed) with an explicit
    Generator instance, but the global seed is still needed for libraries
    that use np.random.* internally.
    """
    try:
        import numpy as np
    except ImportError:
        return
    np.random.seed(seed)


def seed_python_random(seed: int) -> None:
    """Seed Python's built-in random module."""
    random.seed(seed)


def seed_all(seed: int) -> None:
    """Seed all available random number generators.

    Currently covers: numpy (if installed), Python random.
    Expand this as additional generators are added.
    """
    seed_python_random(seed)
    seed_numpy(seed)


# ── Environment variable helpers ──


def set_deterministic_env() -> dict[str, str]:
    """Set environment variables for deterministic execution.

    Sets:
      PYTHONHASHSEED=0          — deterministic hash randomization
      OMP_NUM_THREADS=1         — OpenMP single-thread
      MKL_NUM_THREADS=1         — MKL single-thread
      OPENBLAS_NUM_THREADS=1    — OpenBLAS single-thread
      NUMEXPR_NUM_THREADS=1     — NumExpr single-thread

    Returns:
        Dict of env vars that were changed, for restoration.
    """
    deterministic_vars = {
        "PYTHONHASHSEED": "0",
        "OMP_NUM_THREADS": "1",
        "MKL_NUM_THREADS": "1",
        "OPENBLAS_NUM_THREADS": "1",
        "NUMEXPR_NUM_THREADS": "1",
    }
    previous: dict[str, str] = {}
    for key, value in deterministic_vars.items():
        previous[key] = os.environ.get(key, "")
        os.environ[key] = value
    return previous


def restore_env(previous: dict[str, str]) -> None:
    """Restore environment variables to their previous values."""
    for key, value in previous.items():
        if value:
            os.environ[key] = value
        else:
            os.environ.pop(key, None)


# ── Combined context manager ──


@contextmanager
def deterministic_context(seed: int = 42, nthread: int = 1) -> Iterator[None]:
    """Fully deterministic execution context.

    Combines:
      1. PYTHONHASHSEED + BLAS thread env vars
      2. Python random.seed(seed)
      3. numpy.random.seed(seed)
      4. threadpool_limits(limits=nthread)

    Args:
        seed: Random seed for all generators. Default 42.
        nthread: BLAS thread limit. Default 1 (maximum determinism).
                 Values > 1 are prohibited (AssertionError) — non-deterministic
                 floating-point accumulation order.

    Yields:
        None. Code inside the `with` block runs deterministically.

    Raises:
        AssertionError: if nthread != 1.
        RuntimeError: if threadpool_info() is empty (BLAS not loaded).

    Example:
        with deterministic_context(seed=42):
            import numpy as np
            result = np.random.randn(10)
            # result is byte-identical across runs
    """
    assert nthread == 1, (
        f"deterministic_context requires nthread=1 for maximum determinism, "
        f"got {nthread}. For ablation studies, use threadpool_limits directly."
    )

    info_before = threadpool_info()
    if not info_before:
        raise RuntimeError(
            "threadpool_info() returned empty: no BLAS library loaded. "
            "Install numpy>=1.24 with MKL or OpenBLAS backend."
        )

    prev_env = set_deterministic_env()
    seed_python_random(seed)

    try:
        import numpy as np
        np.random.seed(seed)
    except ImportError:
        pass

    try:
        with threadpool_limits(limits=nthread, user_api="blas"):
            yield
    finally:
        restore_env(prev_env)


# ── Lightweight: seed-only context (no BLAS thread pinning) ──


@contextmanager
def seed_context(seed: int = 42) -> Iterator[None]:
    """Seed-only deterministic context (no BLAS thread pinning).

    Use when BLAS thread count is not relevant (e.g., pure Python computation,
    no numpy floating-point operations).

    Args:
        seed: Random seed for Python random and numpy.
    """
    seed_python_random(seed)
    try:
        import numpy as np
        np.random.seed(seed)
    except ImportError:
        pass
    yield


# ── Deterministic numpy Generator factory ──


def deterministic_rng(seed: int = 42) -> "object":
    """Create a seeded numpy.random.Generator with a fixed seed.

    Returns a Generator from numpy.random.default_rng(seed), which is the
    modern replacement for numpy.random.seed(). The Generator API is the
    preferred way to generate random numbers in new numpy code.

    Unlike the global np.random.seed(), this Generator is isolated and
    thread-safe.

    Returns:
        numpy.random.Generator instance, or None if numpy is not installed.
    """
    try:
        import numpy as np
        return np.random.default_rng(seed)
    except ImportError:
        return None
