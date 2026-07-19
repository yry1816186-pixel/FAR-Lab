"""Cross-language canonical_hash consistency tests.

Validates that Python-side canonical_hash produces identical hex to
TS-side canonicalHash for the same inputs (golden vectors).

Also validates the 9-vector mini-chain: each vector's prevHash matches the
previous vector's computed hash, forming an unbroken chain from GENESIS.
"""

from __future__ import annotations

import unittest

from far_chain_repro.canonical_json import canonical_hash
from far_chain_repro.golden_vectors import (
    CHAIN_VECTORS,
    GENESIS_PREV_HASH,
    GOLDEN_VECTORS,
    REPRO_CONTEXT_FIXTURE,
    REPRO_CONTEXT_FIXTURE_EXPECTED_HEX,
)


class CrossLangConsistencyTest(unittest.TestCase):
    def test_python_fixture_matches_expected_hex(self) -> None:
        self.assertRegex(REPRO_CONTEXT_FIXTURE_EXPECTED_HEX, r"^[0-9a-f]{64}$")
        self.assertEqual(
            canonical_hash(REPRO_CONTEXT_FIXTURE),
            REPRO_CONTEXT_FIXTURE_EXPECTED_HEX,
        )

    def test_all_golden_vectors_match_expected_hex(self) -> None:
        for vector in GOLDEN_VECTORS:
            name = str(vector["name"])
            with self.subTest(vector=name):
                self.assertRegex(str(vector["expectedHex"]), r"^[0-9a-f]{64}$")
                self.assertEqual(
                    canonical_hash(vector["input"]),
                    vector["expectedHex"],
                    f"Golden vector '{name}' hash mismatch",
                )

    def test_golden_vector_count(self) -> None:
        """We should have 10 golden vectors: 1 meta + 9 agent-loop vectors."""
        self.assertEqual(len(GOLDEN_VECTORS), 10,
                         f"Expected 10 golden vectors, got {len(GOLDEN_VECTORS)}")

    def test_meta_minimal_genesis_is_first(self) -> None:
        self.assertEqual(GOLDEN_VECTORS[0]["name"], "meta_minimal_genesis")


class GoldenChainIntegrityTest(unittest.TestCase):
    """9-vector mini-chain: each entry's prevHash = previous hash, forming
    an unbroken chain from GENESIS."""

    def test_chain_vectors_count(self) -> None:
        self.assertEqual(len(CHAIN_VECTORS), 9)

    def test_chain_starts_from_genesis(self) -> None:
        first = CHAIN_VECTORS[0]["input"]
        self.assertEqual(first["prevHash"], GENESIS_PREV_HASH)

    def test_chain_links_are_continuous(self) -> None:
        """Each vector's prevHash must match previous vector's computed hash."""
        prev_hash: str = GENESIS_PREV_HASH
        for i, vector in enumerate(CHAIN_VECTORS):
            name = str(vector["name"])
            inp = vector["input"]
            with self.subTest(vector=name, seq=i + 1):
                self.assertEqual(
                    inp["prevHash"],
                    prev_hash,
                    f"Chain broken at '{name}': prevHash should be {prev_hash}",
                )
                prev_hash = str(vector["expectedHex"])

    def test_chain_hashes_are_correct(self) -> None:
        """Each vector's expectedHex matches canonical_hash of its input."""
        for vector in CHAIN_VECTORS:
            name = str(vector["name"])
            with self.subTest(vector=name):
                self.assertEqual(
                    canonical_hash(vector["input"]),
                    vector["expectedHex"],
                    f"Chain vector '{name}' hash mismatch",
                )

    def test_chain_covers_all_purpose_tags(self) -> None:
        """The 9-chain should demonstrate each purpose_tag at least once."""
        seen_tags: set[str] = set()
        for vector in CHAIN_VECTORS:
            tag = str(vector["input"]["purposeTag"])
            seen_tags.add(tag)
        # 9 purpose tags from the CHECK constraint
        expected_tags = {
            "hypothesis", "narrative", "viz_select", "code_gen", "dialogue",
            "eval", "scoring", "gt_read", "baseline_exempt",
        }
        self.assertEqual(seen_tags, expected_tags)


if __name__ == "__main__":
    unittest.main()
