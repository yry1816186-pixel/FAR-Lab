"""Tests for verify_chain JSON path — TS evidence_log JSON export verification.

Covers:
  - verify_chain_from_json with valid chain
  - verify_chain_from_json with tampered entries
  - verify_chain_from_dicts (in-memory verification)
  - BatchVerifyResult with per-entry diagnostics
  - Error handling for malformed input
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from far_chain_repro.canonical_json import canonical_hash
from far_chain_repro.verify_chain import (
    GENESIS_PREV_HASH,
    VerifyEntry,
    verify_chain_from_dicts,
    verify_chain_from_json,
)


def _build_entry(
    seq: int,
    stage_id: str,
    payload_kind: str,
    purpose_tag: str,
    prev_hash: str,
    model_id: str = "qwen3.7-max-2026-05-20",
) -> dict[str, object]:
    entry: dict[str, object] = {
        "stageId": stage_id,
        "cred": {
            "modelId": model_id,
            "dashscopeRequestId": f"req-{seq:03d}" if seq % 2 == 1 else None,
            "reproHash": f"{seq:064d}"[:64],
            "gitCommitSha": f"{seq:040x}",
            "isoTimestamp": f"2026-06-27T10:{30 + seq:02d}:00Z",
        },
        "payloadKind": payload_kind,
        "purposeTag": purpose_tag,
        "prevHash": prev_hash,
        "seq": seq,
    }
    hash_input = {
        "stageId": entry["stageId"],
        "cred": entry["cred"],
        "payloadKind": entry["payloadKind"],
        "prevHash": entry["prevHash"],
    }
    entry["currentHash"] = canonical_hash(hash_input)
    return entry


def _build_chain(length: int = 3) -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []
    prev = GENESIS_PREV_HASH
    for i in range(length):
        entry = _build_entry(
            seq=i + 1,
            stage_id=f"stage{i + 1}_test",
            payload_kind="hypothesis",
            purpose_tag="hypothesis",
            prev_hash=prev,
        )
        entries.append(entry)
        prev = str(entry["currentHash"])
    return entries


class VerifyChainFromDictsTest(unittest.TestCase):
    def test_empty_chain_returns_ok(self) -> None:
        result = verify_chain_from_dicts([])
        self.assertTrue(result.ok)
        self.assertEqual(result.verified_count, 0)
        self.assertEqual(result.total_count, 0)

    def test_valid_chain_passes(self) -> None:
        entries = _build_chain(3)
        result = verify_chain_from_dicts(entries)
        self.assertTrue(result.ok)
        self.assertEqual(result.verified_count, 3)
        self.assertEqual(result.total_count, 3)
        self.assertEqual(len(result.entries), 3)
        for entry in result.entries:
            self.assertTrue(entry.prev_hash_ok)
            self.assertTrue(entry.current_hash_ok)

    def test_single_entry_genesis_passes(self) -> None:
        entry = _build_entry(1, "stage1", "hypothesis", "hypothesis", GENESIS_PREV_HASH)
        result = verify_chain_from_dicts([entry])
        self.assertTrue(result.ok)
        self.assertEqual(result.verified_count, 1)

    def test_detects_broken_prev_hash_chain(self) -> None:
        entries = _build_chain(3)
        # Break the chain: set entry 2's prevHash to genesis
        entries[1]["prevHash"] = GENESIS_PREV_HASH
        # Don't recompute currentHash — this simulates tampering where the
        # prevHash was changed but currentHash wasn't updated.

        result = verify_chain_from_dicts(entries)
        self.assertFalse(result.ok)
        self.assertEqual(result.broken_at_seq, 2)
        self.assertEqual(result.verified_count, 1)

    def test_detects_tampered_current_hash(self) -> None:
        entries = _build_chain(3)
        entries[1]["currentHash"] = "tampered"

        result = verify_chain_from_dicts(entries)
        self.assertFalse(result.ok)
        self.assertEqual(result.broken_at_seq, 2)
        self.assertIsNotNone(result.expected_hash)
        self.assertEqual(result.actual_hash, "tampered")

    def test_unsorted_entries_sorted_by_seq(self) -> None:
        entries = _build_chain(3)
        # Reverse order — should still verify OK because _verify_entries sorts by seq
        entries_reversed = list(reversed(entries))
        result = verify_chain_from_dicts(entries_reversed)
        self.assertTrue(result.ok)
        self.assertEqual(result.verified_count, 3)


class VerifyChainFromJsonTest(unittest.TestCase):
    def test_valid_json_file_passes(self) -> None:
        entries = _build_chain(3)
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        ) as f:
            json.dump(entries, f, ensure_ascii=False)
            tmp_path = f.name

        try:
            result = verify_chain_from_json(tmp_path)
            self.assertTrue(result.ok)
            self.assertEqual(result.verified_count, 3)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_tampered_json_file_detected(self) -> None:
        entries = _build_chain(3)
        entries[1]["currentHash"] = "0" * 64

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        ) as f:
            json.dump(entries, f, ensure_ascii=False)
            tmp_path = f.name

        try:
            result = verify_chain_from_json(tmp_path)
            self.assertFalse(result.ok)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_nonexistent_file_returns_error(self) -> None:
        result = verify_chain_from_json("/nonexistent/path/evidence.json")
        self.assertFalse(result.ok)
        self.assertIsNotNone(result.error_detail)

    def test_invalid_json_returns_error(self) -> None:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        ) as f:
            f.write("not valid json {{{")
            tmp_path = f.name

        try:
            result = verify_chain_from_json(tmp_path)
            self.assertFalse(result.ok)
            self.assertIn("Invalid JSON", result.error_detail or "")
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_non_array_json_returns_error(self) -> None:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        ) as f:
            json.dump({"not": "an array"}, f)
            tmp_path = f.name

        try:
            result = verify_chain_from_json(tmp_path)
            self.assertFalse(result.ok)
            self.assertIn("array", result.error_detail or "")
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_batch_result_per_entry_diagnostics(self) -> None:
        entries = _build_chain(2)
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        ) as f:
            json.dump(entries, f, ensure_ascii=False)
            tmp_path = f.name

        try:
            result = verify_chain_from_json(tmp_path)
            self.assertTrue(result.ok)
            self.assertEqual(len(result.entries), 2)
            self.assertEqual(result.entries[0].seq, 1)
            self.assertEqual(result.entries[1].seq, 2)
            for entry in result.entries:
                self.assertIsInstance(entry, VerifyEntry)
                self.assertTrue(entry.prev_hash_ok)
                self.assertTrue(entry.current_hash_ok)
                self.assertEqual(len(entry.recomputed_hash), 64)
                self.assertEqual(len(entry.stored_hash), 64)
        finally:
            Path(tmp_path).unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
