"""dataclass to dict serialization helper.

Hand-written dicts cannot guarantee field order matches dataclass definition
order, and nested dataclasses are not recursively expanded, causing hash drift.
dataclasses.asdict recursively converts to dict with field order preserved.

Authority: FAR_CHAIN_DEV_SPEC/09_repro_deterministic.md §1.2.
"""

from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any


def to_canonical_dict(obj: Any) -> dict[str, Any]:
    """Recursively convert a dataclass instance to dict for canonical_hash.

    Args:
        obj: dataclass instance (e.g. CalcRecord / BailianCredential / CallRecord).

    Returns:
        Nested dict with field order = dataclass definition order.

    Raises:
        TypeError: when obj is not a dataclass instance. Explicitly rejected
                   to prevent silent fallback (anti-theater design).
    """
    if not is_dataclass(obj) or isinstance(obj, type):
        raise TypeError(
            f"to_canonical_dict requires a dataclass instance, got {type(obj).__name__}."
            f" Non-dataclass values must be explicitly constructed as dict before"
            f" passing to canonical_hash."
        )
    return asdict(obj)
