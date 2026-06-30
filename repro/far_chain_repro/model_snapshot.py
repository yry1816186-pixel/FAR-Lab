"""COMPETITION_MODEL_SNAPSHOT constant + repro_hash serialization seam (R15 fix).

This module mirrors the TS competition adapter constants for cross-language
hash byte-equality. It is NOT the SSOT — the TS adapter
(src/llm_gateway/adapters/aliyun_qwen/snapshot.ts) is the primary source.

Authority: FAR_CHAIN_DEV_SPEC/09_repro_deterministic.md §5 + 00_项目宪法 §8.6.
"""

from __future__ import annotations

import hashlib
import json

# Mirror of TS src/llm_gateway/adapters/aliyun_qwen/snapshot.ts.
# MODEL_SNAPSHOT is the legacy alias for competition profile compatibility.
COMPETITION_MODEL_SNAPSHOT: str = "qwen3.7-max-2026-05-20"
MODEL_SNAPSHOT: str = COMPETITION_MODEL_SNAPSHOT

COMPETITION_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
BASE_URL: str = COMPETITION_BASE_URL


def repro_hash_of_active_models(active_model_ids: list[str]) -> str:
    """Compute deterministic hash of active model ids (R15 serialization seam).

    TS side: JSON.stringify(sortedActiveModelIds) -> sha256
    Python side: json.dumps(sorted(ids), sort_keys=True, ...) -> sha256

    Both sides use sort_keys + compact separators + UTF-8 for byte-equality.

    Args:
        active_model_ids: active model id list (unsorted ok, sorted internally).

    Returns:
        sha256 hex lowercase (64 chars).
    """
    sorted_ids = sorted(active_model_ids)
    canonical_str = json.dumps(
        sorted_ids,
        sort_keys=True,
        allow_nan=False,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()
