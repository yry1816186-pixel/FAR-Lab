"""merkle_root —— 证据链 Merkle 完整性根 + 包含证明（TS 字节相等对端）。

Authority: FAR_CHAIN_DEV_SPEC/09_repro_determinism.md §4 + 23 §5.2.
Mirror: src/evidence_log/merkle_root.ts（两侧算法逐行对应·duplicate-last-on-odd）。

跨语言字节相等：combine(left,right)=sha256((left+right).encode utf8)。
left/right 为 ASCII hex → .encode("utf-8") 与 TS update(left+right,'utf8') 字节相同。
由 tests/evidence_log/merkle_cross_lang.test.ts spawnSync python3 逐位断言根相等。

零容忍：叶非 64-hex 抛 ValueError（fail-fast·禁静默 coerce）。
"""

from __future__ import annotations

import hashlib
import re
from typing import TypedDict


ZERO_MERKLE_ROOT = "0" * 64

_HEX64 = re.compile(r"[0-9a-f]{64}")


class MerkleTree(TypedDict):
    levels: list[list[str]]
    leafCount: int
    root: str


class MerkleInclusionProof(TypedDict):
    leafIndex: int
    leafCount: int
    leaf: str
    siblings: list[str]
    expectedRoot: str


def combine_hashes(left: str, right: str) -> str:
    _assert_hex64(left, "combine_hashes.left")
    _assert_hex64(right, "combine_hashes.right")
    return hashlib.sha256((left + right).encode("utf-8")).hexdigest()


def build_merkle_tree(leaf_hashes: list[str]) -> MerkleTree:
    if len(leaf_hashes) == 0:
        return {"levels": [], "leafCount": 0, "root": ZERO_MERKLE_ROOT}

    for index, leaf in enumerate(leaf_hashes):
        _assert_hex64(leaf, f"build_merkle_tree.leaf_hashes[{index}]")

    levels: list[list[str]] = [list(leaf_hashes)]
    current = levels[0]

    if len(current) == 1:
        return {"levels": levels, "leafCount": len(leaf_hashes), "root": current[0]}

    while len(current) > 1:
        next_level: list[str] = []
        for i in range(0, len(current), 2):
            left = current[i]
            right = current[i + 1] if i + 1 < len(current) else current[i]
            next_level.append(combine_hashes(left, right))
        levels.append(next_level)
        current = next_level

    return {"levels": levels, "leafCount": len(leaf_hashes), "root": current[0]}


def compute_merkle_root(leaf_hashes: list[str]) -> str:
    return build_merkle_tree(leaf_hashes)["root"]


def compute_merkle_inclusion_proof(leaf_hashes: list[str], leaf_index: int) -> MerkleInclusionProof:
    if len(leaf_hashes) == 0:
        raise ValueError("compute_merkle_inclusion_proof: empty tree has no inclusion proof")
    if not isinstance(leaf_index, int) or leaf_index < 0 or leaf_index >= len(leaf_hashes):
        raise ValueError(
            f"compute_merkle_inclusion_proof: leaf_index {leaf_index} "
            f"out of range [0, {len(leaf_hashes)})"
        )

    tree = build_merkle_tree(leaf_hashes)
    siblings: list[str] = []
    idx = leaf_index

    for level in range(len(tree["levels"]) - 1):
        nodes = tree["levels"][level]
        sibling_index = idx + 1 if idx % 2 == 0 else idx - 1
        sibling = nodes[sibling_index] if sibling_index < len(nodes) else nodes[idx]
        siblings.append(sibling)
        idx //= 2

    return {
        "leafIndex": leaf_index,
        "leafCount": len(leaf_hashes),
        "leaf": leaf_hashes[leaf_index],
        "siblings": siblings,
        "expectedRoot": tree["root"],
    }


def verify_merkle_inclusion_proof(proof: MerkleInclusionProof) -> dict[str, bool]:
    computed = proof["leaf"]
    idx = proof["leafIndex"]

    for sibling in proof["siblings"]:
        if idx % 2 == 0:
            computed = combine_hashes(computed, sibling)
        else:
            computed = combine_hashes(sibling, computed)
        idx //= 2

    return {"ok": computed == proof["expectedRoot"]}


def _assert_hex64(value: object, context: str) -> None:
    if not isinstance(value, str) or _HEX64.fullmatch(value) is None:
        raise ValueError(
            f"{context}: expected 64-char lowercase hex SHA-256, "
            f"got {type(value).__name__} '{value}'"
        )
