"""FAR-Lab deterministic replay package scaffold.

Module exports aligned with 09_repro_deterministic.md §1.2 / §3 / §5:
- canonical_json: byte-level hash engine
- verify_chain: chain hash verification (SQLite + JSON paths)
- cross_lang_roundtrip: TS → Python → TS tampering detection closed loop
- deterministic_seed: fixed seed + fixed BLAS thread count execution context
- golden_vectors: E4 golden hex anchors (9 vectors covering all purpose_tags)
- calc_bridge: seven-factor repro_hash engine
- ast_guard: AST gradient symbol scanner (R4 fix)
- dataclasses_ext: dataclass → dict serialization helper
- model_snapshot: COMPETITION_MODEL_SNAPSHOT constant + repro_hash serialization seam (R15 fix)
- proof_hash: ProofEnvelope V2 proofHash 跨语言镜像（RULE-PE-010）
- verdict_kernel_v2: 五值裁决内核 Python 镜像
- math_input_hash / math_types: 数学域 canonical 输入哈希与类型守卫
- merkle_root: Merkle 树独立重算
"""

from __future__ import annotations

from . import (
    ast_guard,
    calc_bridge,
    canonical_json,
    cross_lang_roundtrip,
    dataclasses_ext,
    deterministic_seed,
    golden_vectors,
    math_input_hash,
    math_types,
    merkle_root,
    model_snapshot,
    proof_hash,
    verdict_kernel_v2,
    verify_chain,
)

# `from far_chain_repro import *` 导出全部公开子模块（函数/类经模块命名空间访问，
# 例如 `far_chain_repro.proof_hash.compute_proof_hash_v2`）。
__all__: list[str] = [
    "ast_guard",
    "calc_bridge",
    "canonical_json",
    "cross_lang_roundtrip",
    "dataclasses_ext",
    "deterministic_seed",
    "golden_vectors",
    "math_input_hash",
    "math_types",
    "merkle_root",
    "model_snapshot",
    "proof_hash",
    "verdict_kernel_v2",
    "verify_chain",
]
