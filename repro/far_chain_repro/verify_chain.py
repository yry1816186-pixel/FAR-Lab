"""Chain-integrity verification: evidence_log hash chain validation.

Two entry points:
  verify_chain_head(db)        — SQLite (existing, backward-compatible)
  verify_chain_from_json(path) — TS-exported evidence_log JSON (new)

Both recompute canonical_hash for each entry, compare against stored currentHash,
and verify the prevHash chain forms an unbroken link from GENESIS.

Authority: cross-lang verify.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import sqlite3
from pathlib import Path
from typing import Optional, TypedDict

from .canonical_json import canonical_hash

GENESIS_PREV_HASH = "0" * 64


class BailianCredential(TypedDict):
    modelId: str
    dashscopeRequestId: Optional[str]
    reproHash: str
    gitCommitSha: str
    isoTimestamp: str


class CanonicalInput(TypedDict, total=False):
    stageId: str
    cred: BailianCredential
    payloadKind: str
    purposeTag: str
    prevHash: str
    seq: int
    currentHash: str


class CallRecordRow(TypedDict):
    seq: int
    stageId: str
    payloadKind: str
    purposeTag: str
    modelId: str
    dashscopeRequestId: Optional[str]
    reproHash: str
    gitCommitSha: str
    isoTimestamp: str
    prevHash: str
    currentHash: str
    createdAt: str


@dataclass(frozen=True)
class VerifyResult:
    ok: bool
    broken_at_seq: Optional[int]
    expected_hash: Optional[str]
    actual_hash: Optional[str]
    verified_count: int
    total_count: int = 0


@dataclass(frozen=True)
class VerifyEntry:
    """Per-entry verification detail for diagnostic reporting."""
    seq: int
    stage_id: str
    payload_kind: str
    purpose_tag: str
    prev_hash_ok: bool
    current_hash_ok: bool
    recomputed_hash: str
    stored_hash: str


@dataclass(frozen=True)
class BatchVerifyResult:
    """Full verification report including per-entry diagnostics."""
    ok: bool
    broken_at_seq: Optional[int]
    expected_hash: Optional[str]
    actual_hash: Optional[str]
    verified_count: int
    total_count: int
    entries: list[VerifyEntry]
    error_detail: Optional[str] = None


# ── SQLite path (existing, backward-compatible) ──


def row_to_call_record(row: CallRecordRow) -> CanonicalInput:
    cred: BailianCredential = {
        "modelId": row["modelId"],
        "dashscopeRequestId": row["dashscopeRequestId"],
        "reproHash": row["reproHash"],
        "gitCommitSha": row["gitCommitSha"],
        "isoTimestamp": row["isoTimestamp"],
    }
    return {
        "stageId": row["stageId"],
        "cred": cred,
        "payloadKind": row["payloadKind"],
        "purposeTag": row["purposeTag"],
        "prevHash": row["prevHash"],
        "seq": row["seq"],
        "currentHash": row["currentHash"],
    }


def verify_chain_head(db: sqlite3.Connection) -> VerifyResult:
    rows = [_parse_row(row) for row in _fetch_rows(db)]
    expected_prev_hash = GENESIS_PREV_HASH
    verified_count = 0

    for row in rows:
        if row["prevHash"] != expected_prev_hash:
            return VerifyResult(
                ok=False,
                broken_at_seq=row["seq"],
                expected_hash=expected_prev_hash,
                actual_hash=row["prevHash"],
                verified_count=verified_count,
            )

        nested = row_to_call_record(row)
        recomputed_hash = canonical_hash(nested)
        if recomputed_hash != row["currentHash"]:
            return VerifyResult(
                ok=False,
                broken_at_seq=row["seq"],
                expected_hash=recomputed_hash,
                actual_hash=row["currentHash"],
                verified_count=verified_count,
            )

        expected_prev_hash = row["currentHash"]
        verified_count += 1

    return VerifyResult(
        ok=True,
        broken_at_seq=None,
        expected_hash=None,
        actual_hash=None,
        verified_count=verified_count,
    )


# ── JSON path (new, cross-language verify) ──


def verify_chain_from_json(json_path: str | Path) -> BatchVerifyResult:
    """Verify hash chain integrity from a TS-exported evidence_log JSON file.

    The JSON file must contain an array of evidence log entries. Each entry
    must have at minimum: stageId, cred (with modelId/dashscopeRequestId/
    reproHash/gitCommitSha/isoTimestamp), payloadKind, purposeTag, prevHash,
    currentHash, and seq.

    Returns a BatchVerifyResult with per-entry diagnostics for reporting.
    """
    path = Path(json_path)
    try:
        raw_text = path.read_text(encoding="utf-8")
    except OSError as exc:
        return BatchVerifyResult(
            ok=False,
            broken_at_seq=None,
            expected_hash=None,
            actual_hash=None,
            verified_count=0,
            total_count=0,
            entries=[],
            error_detail=f"Failed to read {path}: {exc}",
        )

    try:
        raw_entries: list[object] = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        return BatchVerifyResult(
            ok=False,
            broken_at_seq=None,
            expected_hash=None,
            actual_hash=None,
            verified_count=0,
            total_count=0,
            entries=[],
            error_detail=f"Invalid JSON in {path}: {exc}",
        )

    if not isinstance(raw_entries, list):
        return BatchVerifyResult(
            ok=False,
            broken_at_seq=None,
            expected_hash=None,
            actual_hash=None,
            verified_count=0,
            total_count=0,
            entries=[],
            error_detail=f"Expected a JSON array, got {type(raw_entries).__name__}",
        )

    entries = [_parse_json_entry(item, idx) for idx, item in enumerate(raw_entries)]
    return _verify_entries(entries)


def verify_chain_from_dicts(entries: list[dict[str, object]]) -> BatchVerifyResult:
    """Verify hash chain integrity from an in-memory list of entry dicts.

    Each dict must contain the same shape as a TS-exported evidence log entry:
    stageId, cred, payloadKind, purposeTag, prevHash, currentHash, seq.
    """
    parsed = [_parse_json_entry(entry, idx) for idx, entry in enumerate(entries)]
    return _verify_entries(parsed)


def _verify_entries(entries: list[CanonicalInput]) -> BatchVerifyResult:
    if not entries:
        return BatchVerifyResult(
            ok=True,
            broken_at_seq=None,
            expected_hash=None,
            actual_hash=None,
            verified_count=0,
            total_count=0,
            entries=[],
        )

    entries_sorted = sorted(entries, key=lambda e: e.get("seq", 0))
    expected_prev_hash = GENESIS_PREV_HASH
    verified_count = 0
    details: list[VerifyEntry] = []

    for entry in entries_sorted:
        stored_prev = _require_str(entry, "prevHash", "entry")
        stored_current = _require_str(entry, "currentHash", "entry")
        seq = entry.get("seq", 0)

        prev_ok = stored_prev == expected_prev_hash

        stripped: dict[str, object] = {
            "stageId": _require_str(entry, "stageId", "entry"),
            "cred": entry.get("cred", {}),
            "payloadKind": _require_str(entry, "payloadKind", "entry"),
            "prevHash": stored_prev,
        }
        recomputed = canonical_hash(stripped)
        current_ok = recomputed == stored_current

        details.append(VerifyEntry(
            seq=int(seq) if isinstance(seq, int) else 0,
            stage_id=_require_str(entry, "stageId", "entry"),
            payload_kind=_require_str(entry, "payloadKind", "entry"),
            purpose_tag=_optional_str(entry, "purposeTag", "unknown"),
            prev_hash_ok=prev_ok,
            current_hash_ok=current_ok,
            recomputed_hash=recomputed,
            stored_hash=stored_current,
        ))

        if not prev_ok:
            return BatchVerifyResult(
                ok=False,
                broken_at_seq=int(seq) if isinstance(seq, int) else None,
                expected_hash=expected_prev_hash,
                actual_hash=stored_prev,
                verified_count=verified_count,
                total_count=len(entries_sorted),
                entries=details,
            )

        if not current_ok:
            return BatchVerifyResult(
                ok=False,
                broken_at_seq=int(seq) if isinstance(seq, int) else None,
                expected_hash=recomputed,
                actual_hash=stored_current,
                verified_count=verified_count,
                total_count=len(entries_sorted),
                entries=details,
            )

        expected_prev_hash = stored_current
        verified_count += 1

    return BatchVerifyResult(
        ok=True,
        broken_at_seq=None,
        expected_hash=None,
        actual_hash=None,
        verified_count=verified_count,
        total_count=len(entries_sorted),
        entries=details,
    )


# ── JSON entry parsing ──


def _parse_json_entry(raw: object, index: int) -> CanonicalInput:
    if not isinstance(raw, dict):
        raise TypeError(
            f"verify_chain_from_json: entry[{index}] must be a dict, got {type(raw).__name__}"
        )
    entry: dict[str, object] = raw
    return {
        "stageId": _require_str(entry, "stageId", f"entry[{index}]"),
        "cred": _parse_cred(entry.get("cred"), index),
        "payloadKind": _require_str(entry, "payloadKind", f"entry[{index}]"),
        "purposeTag": _optional_str(entry, "purposeTag", "unknown"),
        "prevHash": _require_str(entry, "prevHash", f"entry[{index}]"),
        "seq": _require_int(entry, "seq", f"entry[{index}]"),
        "currentHash": _require_str(entry, "currentHash", f"entry[{index}]"),
    }


def _parse_cred(raw: object, index: int) -> BailianCredential:
    if not isinstance(raw, dict):
        raise TypeError(
            f"verify_chain_from_json: entry[{index}].cred must be a dict, got {type(raw).__name__}"
        )
    cred: dict[str, object] = raw
    dashscope = cred.get("dashscopeRequestId")
    if dashscope is not None and not isinstance(dashscope, str):
        raise TypeError(
            f"verify_chain_from_json: entry[{index}].cred.dashscopeRequestId must be str or null"
        )
    return {
        "modelId": _require_str(cred, "modelId", f"entry[{index}].cred"),
        "dashscopeRequestId": dashscope,
        "reproHash": _require_str(cred, "reproHash", f"entry[{index}].cred"),
        "gitCommitSha": _require_str(cred, "gitCommitSha", f"entry[{index}].cred"),
        "isoTimestamp": _require_str(cred, "isoTimestamp", f"entry[{index}].cred"),
    }


# ── SQLite helpers (existing, unchanged) ──


def _fetch_rows(db: sqlite3.Connection) -> list[dict[str, object]]:
    cursor = db.execute(
        "SELECT seq, stage_id AS stageId, payload_kind AS payloadKind, "
        "purpose_tag AS purposeTag, "
        "model_id AS modelId, dashscope_request_id AS dashscopeRequestId, "
        "repro_hash AS reproHash, git_commit_sha AS gitCommitSha, "
        "iso_timestamp AS isoTimestamp, prev_hash AS prevHash, "
        "current_hash AS currentHash, created_at AS createdAt "
        "FROM call_records ORDER BY seq ASC"
    )
    columns = [description[0] for description in cursor.description]
    return [dict(zip(columns, tuple(row))) for row in cursor.fetchall()]


def _parse_row(raw: dict[str, object]) -> CallRecordRow:
    return {
        "seq": _require_int(raw, "seq"),
        "stageId": _require_str(raw, "stageId"),
        "payloadKind": _require_str(raw, "payloadKind"),
        "purposeTag": _require_str(raw, "purposeTag"),
        "modelId": _require_str(raw, "modelId"),
        "dashscopeRequestId": _optional_str(raw, "dashscopeRequestId"),
        "reproHash": _require_str(raw, "reproHash"),
        "gitCommitSha": _require_str(raw, "gitCommitSha"),
        "isoTimestamp": _require_str(raw, "isoTimestamp"),
        "prevHash": _require_str(raw, "prevHash"),
        "currentHash": _require_str(raw, "currentHash"),
        "createdAt": _require_str(raw, "createdAt"),
    }


def _require_str(raw: dict[str, object], key: str, context: str = "") -> str:
    value = raw.get(key)
    if isinstance(value, str):
        return value
    label = f"{context}: column {key}" if context else f"verify_chain: column {key}"
    raise TypeError(f"{label} must be str, got {type(value).__name__}")


def _optional_str(raw: dict[str, object], key: str, default: Optional[str] = None) -> Optional[str]:
    value = raw.get(key)
    if value is None or isinstance(value, str):
        return value if value is not None else default
    raise TypeError(f"verify_chain: column {key} must be str or None")


def _require_int(raw: dict[str, object], key: str, context: str = "") -> int:
    value = raw.get(key)
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    label = f"{context}: column {key}" if context else f"verify_chain: column {key}"
    raise TypeError(f"{label} must be int, got {type(value).__name__}")
