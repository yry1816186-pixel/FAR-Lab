"""FAR-Chain deterministic replay package scaffold.

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
"""

from __future__ import annotations

__all__: list[str] = []
