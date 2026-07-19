"""Cross-language roundtrip tests: TS export → Python verify → Python tamper → TS detect.

Tests the full closed-loop tampering detection pipeline:
  1. Build a valid evidence_log chain
  2. Verify all entries pass
  3. Tamper with one entry
  4. Verify tampering is detected
  5. Verify roundtrip result reports correct broken_at_seq

Also covers:
  - All four tamper kinds: current_hash, payload_data, prev_hash, cred_model_id
  - File-based roundtrip (JSON roundtrip)
  - Evidence chain JSON builder
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from far_chain_repro.cross_lang_roundtrip import (
    build_evidence_chain_json,
    detect_tampering,
    file_roundtrip,
    run_roundtrip,
    tamper_entry,
    verify_ts_export,
)
from far_chain_repro.verify_chain import GENESIS_PREV_HASH


class BuildEvidenceChainJsonTest(unittest.TestCase):
    def test_builds_valid_chain(self) -> None:
        entries = build_evidence_chain_json(chain_length=3)
        self.assertEqual(len(entries), 3)

        prev = GENESIS_PREV_HASH
        for i, entry in enumerate(entries):
            self.assertEqual(entry["seq"], i + 1)
            self.assertEqual(entry["prevHash"], prev)
            self.assertIn("currentHash", entry)
            self.assertEqual(len(str(entry["currentHash"])), 64)
            self.assertRegex(str(entry["currentHash"]), r"^[0-9a-f]{64}$")
            prev = str(entry["currentHash"])

    def test_chain_length_zero(self) -> None:
        entries = build_evidence_chain_json(chain_length=0)
        self.assertEqual(len(entries), 0)

    def test_chain_with_custom_model_id(self) -> None:
        entries = build_evidence_chain_json(chain_length=2, base_model_id="custom-model")
        self.assertEqual(entries[0]["cred"]["modelId"], "custom-model")
        self.assertEqual(entries[1]["cred"]["modelId"], "custom-model")

    def test_chain_hashes_form_valid_sequence(self) -> None:
        """Each entry's prevHash should equal previous entry's currentHash."""
        entries = build_evidence_chain_json(chain_length=5)
        for i in range(1, len(entries)):
            self.assertEqual(
                entries[i]["prevHash"],
                entries[i - 1]["currentHash"],
                f"Chain broken at seq={i + 1}",
            )


class VerifyTsExportTest(unittest.TestCase):
    def test_verifies_valid_json_export(self) -> None:
        entries = build_evidence_chain_json(chain_length=3)
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        ) as f:
            json.dump(entries, f, ensure_ascii=False)
            tmp_path = f.name

        try:
            result = verify_ts_export(tmp_path)
            self.assertTrue(result.ok)
            self.assertEqual(result.verified_count, 3)
        finally:
            Path(tmp_path).unlink(missing_ok=True)


class TamperEntryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.entries = build_evidence_chain_json(chain_length=3)

    def test_tamper_current_hash(self) -> None:
        tampered, report = tamper_entry(self.entries, tamper_seq=2, tamper_kind="current_hash")
        self.assertEqual(report.tampered_seq, 2)
        self.assertEqual(report.tamper_kind, "current_hash")
        self.assertEqual(tampered[1]["currentHash"], "0" * 64)

    def test_tamper_payload_data(self) -> None:
        tampered, report = tamper_entry(self.entries, tamper_seq=1, tamper_kind="payload_data")
        self.assertEqual(report.tamper_kind, "payload_data")
        self.assertEqual(tampered[0]["stageId"], "tampered_stage")

    def test_tamper_prev_hash(self) -> None:
        tampered, report = tamper_entry(self.entries, tamper_seq=2, tamper_kind="prev_hash")
        self.assertEqual(report.tamper_kind, "prev_hash")
        self.assertEqual(tampered[1]["prevHash"], "f" * 64)

    def test_tamper_cred_model_id(self) -> None:
        tampered, report = tamper_entry(self.entries, tamper_seq=3, tamper_kind="cred_model_id")
        self.assertEqual(report.tamper_kind, "cred_model_id")
        self.assertEqual(tampered[2]["cred"]["modelId"], "tampered-model-id")

    def test_original_unchanged(self) -> None:
        """Tamper must not mutate original entries (deepcopy)."""
        original_stage = self.entries[0]["stageId"]
        tamper_entry(self.entries, tamper_seq=1, tamper_kind="payload_data")
        self.assertEqual(self.entries[0]["stageId"], original_stage,
                         "original entries should not be mutated")

    def test_invalid_tamper_kind_raises(self) -> None:
        with self.assertRaises(ValueError):
            tamper_entry(self.entries, tamper_seq=1, tamper_kind="nonexistent")

    def test_nonexistent_seq_raises(self) -> None:
        with self.assertRaises(ValueError):
            tamper_entry(self.entries, tamper_seq=999, tamper_kind="current_hash")


class DetectTamperingTest(unittest.TestCase):
    def test_detects_tampered_current_hash(self) -> None:
        entries = build_evidence_chain_json(chain_length=3)
        tampered, _report = tamper_entry(entries, tamper_seq=2, tamper_kind="current_hash")
        result = detect_tampering(tampered)
        self.assertFalse(result.ok)
        self.assertEqual(result.broken_at_seq, 2)

    def test_detects_tampered_payload_data(self) -> None:
        entries = build_evidence_chain_json(chain_length=3)
        tampered, _report = tamper_entry(entries, tamper_seq=1, tamper_kind="payload_data")
        result = detect_tampering(tampered)
        self.assertFalse(result.ok)
        self.assertEqual(result.broken_at_seq, 1)

    def test_detects_tampered_prev_hash(self) -> None:
        entries = build_evidence_chain_json(chain_length=3)
        tampered, _report = tamper_entry(entries, tamper_seq=2, tamper_kind="prev_hash")
        result = detect_tampering(tampered)
        self.assertFalse(result.ok)
        self.assertEqual(result.broken_at_seq, 2)

    def test_detects_tampered_cred_model_id(self) -> None:
        entries = build_evidence_chain_json(chain_length=3)
        tampered, _report = tamper_entry(entries, tamper_seq=1, tamper_kind="cred_model_id")
        result = detect_tampering(tampered)
        self.assertFalse(result.ok)
        self.assertEqual(result.broken_at_seq, 1)

    def test_valid_chain_passes(self) -> None:
        entries = build_evidence_chain_json(chain_length=5)
        result = detect_tampering(entries)
        self.assertTrue(result.ok)
        self.assertEqual(result.verified_count, 5)


class RunRoundtripTest(unittest.TestCase):
    def test_full_roundtrip_current_hash_tamper(self) -> None:
        entries = build_evidence_chain_json(chain_length=3)
        result = run_roundtrip(entries, tamper_seq=2, tamper_kind="current_hash")

        self.assertTrue(result.original_ok)
        self.assertEqual(result.original_verified_count, 3)
        self.assertFalse(result.tampered_ok)
        self.assertEqual(result.tampered_broken_at_seq, 2)
        self.assertTrue(result.tamper_report.detected)
        self.assertTrue(result.roundtrip_passed)

    def test_full_roundtrip_payload_tamper(self) -> None:
        entries = build_evidence_chain_json(chain_length=3)
        result = run_roundtrip(entries, tamper_seq=1, tamper_kind="payload_data")

        self.assertTrue(result.original_ok)
        self.assertFalse(result.tampered_ok)
        self.assertTrue(result.tamper_report.detected)
        self.assertTrue(result.roundtrip_passed)

    def test_full_roundtrip_prev_hash_tamper(self) -> None:
        entries = build_evidence_chain_json(chain_length=4)
        result = run_roundtrip(entries, tamper_seq=3, tamper_kind="prev_hash")

        self.assertTrue(result.original_ok)
        self.assertFalse(result.tampered_ok)
        self.assertTrue(result.tamper_report.detected)
        self.assertTrue(result.roundtrip_passed)

    def test_all_tamper_kinds_detected(self) -> None:
        """All four tamper kinds must be detected by detect_tampering."""
        kinds = ["current_hash", "payload_data", "prev_hash", "cred_model_id"]
        for kind in kinds:
            with self.subTest(kind=kind):
                entries = build_evidence_chain_json(chain_length=3)
                result = run_roundtrip(entries, tamper_seq=2, tamper_kind=kind)
                self.assertTrue(result.original_ok, f"Original should pass for {kind}")
                self.assertFalse(result.tampered_ok, f"Tampered should fail for {kind}")
                self.assertTrue(result.tamper_report.detected, f"Should detect tamper {kind}")
                self.assertTrue(result.roundtrip_passed, f"Roundtrip should pass for {kind}")


class FileRoundtripTest(unittest.TestCase):
    def test_file_roundtrip_writes_tampered_json(self) -> None:
        entries = build_evidence_chain_json(chain_length=3)
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        ) as f:
            json.dump(entries, f, ensure_ascii=False)
            tmp_path = f.name

        try:
            result = file_roundtrip(tmp_path, tamper_seq=2, tamper_kind="current_hash")
            self.assertTrue(result.original_ok)
            self.assertFalse(result.tampered_ok)
            self.assertTrue(result.roundtrip_passed)

            # Verify tampered file was written
            tampered_path = Path(tmp_path).with_suffix(".tampered.json")
            self.assertTrue(tampered_path.exists())

            # Verify tampered file content
            tampered_content = json.loads(tampered_path.read_text(encoding="utf-8"))
            self.assertEqual(tampered_content[1]["currentHash"], "0" * 64)
            tampered_path.unlink(missing_ok=True)
        finally:
            Path(tmp_path).unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
