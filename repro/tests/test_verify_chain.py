from __future__ import annotations

from pathlib import Path
import sqlite3
import unittest

from far_chain_repro.canonical_json import canonical_hash
from far_chain_repro.verify_chain import GENESIS_PREV_HASH, verify_chain_head


DDL = Path("schema/migrations/0001_initial.sql").read_text(encoding="utf-8")


def open_db() -> sqlite3.Connection:
    db = sqlite3.connect(":memory:")
    db.executescript(DDL)
    return db


def append_row(db: sqlite3.Connection, index: int) -> str:
    previous = db.execute(
        "SELECT current_hash FROM call_records ORDER BY seq DESC LIMIT 1"
    ).fetchone()
    prev_hash = GENESIS_PREV_HASH if previous is None else previous[0]
    nested = {
        "stageId": f"stage{index}",
        "cred": {
            "modelId": "offline-replay-fixture",
            "dashscopeRequestId": None,
            "reproHash": str(index) * 64,
            "gitCommitSha": "b" * 40,
            "isoTimestamp": f"2026-06-27T00:00:0{index}.000Z",
        },
        "payloadKind": "hypothesis",
        "purposeTag": "hypothesis",
        "prevHash": prev_hash,
    }
    current_hash = canonical_hash(nested)
    db.execute(
        "INSERT INTO call_records ("
        "stage_id, payload_kind, purpose_tag, model_id, dashscope_request_id, "
        "repro_hash, git_commit_sha, iso_timestamp, request_payload, response_payload, "
        "finish_reason, usage_tokens_total, prev_hash, current_hash"
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            nested["stageId"],
            nested["payloadKind"],
            nested["purposeTag"],
            nested["cred"]["modelId"],
            nested["cred"]["dashscopeRequestId"],
            nested["cred"]["reproHash"],
            nested["cred"]["gitCommitSha"],
            nested["cred"]["isoTimestamp"],
            "{}",
            "{}",
            "stop",
            index,
            prev_hash,
            current_hash,
        ),
    )
    db.commit()
    return current_hash


class VerifyChainTest(unittest.TestCase):
    def test_accepts_valid_chain(self) -> None:
        db = open_db()
        try:
            append_row(db, 1)
            append_row(db, 2)

            result = verify_chain_head(db)
            self.assertTrue(result.ok)
            self.assertEqual(result.verified_count, 2)
            self.assertIsNone(result.broken_at_seq)
        finally:
            db.close()

    def test_detects_hash_tampering(self) -> None:
        db = open_db()
        try:
            append_row(db, 1)
            db.execute("DROP TRIGGER trg_call_records_no_update")
            db.execute("UPDATE call_records SET current_hash = 'tampered' WHERE seq = 1")
            db.commit()

            result = verify_chain_head(db)
            self.assertFalse(result.ok)
            self.assertEqual(result.broken_at_seq, 1)
            self.assertEqual(result.actual_hash, "tampered")
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
