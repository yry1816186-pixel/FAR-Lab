"""Cross-language evidence_log roundtrip: TS export → Python verify → Python
tamper → TS detect.

Closed-loop tampering detection:
  1. TS appends evidence_log entries → exports JSON array
  2. Python reads JSON, recomputes all canonical_hash values, verifies chain
  3. Python tampers with a specific entry (changes currentHash or payload data)
  4. Python writes tampered JSON back
  5. TS reads tampered JSON, detects broken chain via verifyChainHead

The roundtrip ensures cross-language hash byte-equality: TS canonicalHash
and Python canonical_hash MUST produce identical hex for the same input.

Authority: FAR_CHAIN_DEV_SPEC/09_repro_deterministic.md §3 + cross-lang E4.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import json
from pathlib import Path
from typing import Optional

from .canonical_json import canonical_hash
from .verify_chain import (
    BatchVerifyResult,
    GENESIS_PREV_HASH,
    verify_chain_from_dicts,
    verify_chain_from_json,
)


@dataclass(frozen=True)
class TamperReport:
    """Report describing what was tampered and whether detection succeeded."""
    tampered_seq: int
    tamper_kind: str  # 'current_hash' | 'payload_data' | 'prev_hash' | 'cred_model_id'
    original_value: str
    tampered_value: str
    detected: bool
    detection_detail: Optional[str] = None


@dataclass(frozen=True)
class RoundtripResult:
    """Full roundtrip result: verify before tamper → tamper → verify after."""
    original_ok: bool
    original_verified_count: int
    original_total_count: int
    tamper_report: TamperReport
    tampered_ok: bool  # Should be False (tampering detected)
    tampered_broken_at_seq: Optional[int]
    tampered_expected_hash: Optional[str]
    tampered_actual_hash: Optional[str]

    @property
    def roundtrip_passed(self) -> bool:
        """True iff original verified OK AND tampering was correctly detected."""
        return self.original_ok and not self.tampered_ok


# ── Core roundtrip API ──


def verify_ts_export(json_path: str | Path) -> BatchVerifyResult:
    """Verify TS-exported evidence_log JSON. All hashes must match recomputation."""
    return verify_chain_from_json(json_path)


def tamper_entry(
    entries: list[dict[str, object]],
    tamper_seq: int,
    tamper_kind: str = "current_hash",
) -> tuple[list[dict[str, object]], TamperReport]:
    """Tamper with a specific entry in the evidence_log chain.

    Args:
        entries: List of evidence_log entries (dicts with stageId, cred, etc.)
        tamper_seq: The seq number of the entry to tamper (1-indexed).
        tamper_kind: How to tamper:
            'current_hash'  - replace currentHash with a wrong value
            'payload_data'  - change stageId to break hash consistency
            'prev_hash'     - break the chain by changing prevHash
            'cred_model_id' - change cred.modelId to break hash consistency

    Returns:
        (tampered_entries, TamperReport): Modified entries and a report of what changed.
    """
    if tamper_kind not in ("current_hash", "payload_data", "prev_hash", "cred_model_id"):
        raise ValueError(
            f"Unknown tamper_kind: {tamper_kind}. "
            f"Must be one of: current_hash, payload_data, prev_hash, cred_model_id"
        )

    tampered = deepcopy(entries)

    target_idx: Optional[int] = None
    for idx, entry in enumerate(tampered):
        seq = entry.get("seq")
        if isinstance(seq, int) and seq == tamper_seq:
            target_idx = idx
            break

    if target_idx is None:
        raise ValueError(f"No entry found with seq={tamper_seq}")

    target = tampered[target_idx]
    if not isinstance(target, dict):
        raise TypeError(f"Entry at seq={tamper_seq} is not a dict")

    original_value: str = ""
    tampered_value: str = ""

    if tamper_kind == "current_hash":
        stored = target.get("currentHash")
        original_value = str(stored) if isinstance(stored, str) else ""
        tampered_value = "0" * 64
        target["currentHash"] = tampered_value

    elif tamper_kind == "payload_data":
        stored = target.get("stageId")
        original_value = str(stored) if isinstance(stored, str) else ""
        tampered_value = "tampered_stage"
        target["stageId"] = tampered_value

    elif tamper_kind == "prev_hash":
        stored = target.get("prevHash")
        original_value = str(stored) if isinstance(stored, str) else ""
        tampered_value = "f" * 64
        target["prevHash"] = tampered_value

    elif tamper_kind == "cred_model_id":
        cred = target.get("cred")
        if isinstance(cred, dict):
            stored = cred.get("modelId")
            original_value = str(stored) if isinstance(stored, str) else ""
            tampered_value = "tampered-model-id"
            cred["modelId"] = tampered_value
        else:
            original_value = "cred_not_a_dict"
            tampered_value = "cannot_tamper"

    return tampered, TamperReport(
        tampered_seq=tamper_seq,
        tamper_kind=tamper_kind,
        original_value=original_value,
        tampered_value=tampered_value,
        detected=False,
    )


def detect_tampering(
    entries: list[dict[str, object]],
) -> BatchVerifyResult:
    """Re-verify entries to detect tampering. Returns BatchVerifyResult with ok=False if tampered."""
    return verify_chain_from_dicts(entries)


def run_roundtrip(
    entries: list[dict[str, object]],
    tamper_seq: int,
    tamper_kind: str = "current_hash",
) -> RoundtripResult:
    """Run full roundtrip: verify → tamper → verify.

    Args:
        entries: Original evidence_log entries.
        tamper_seq: Which entry to tamper.
        tamper_kind: How to tamper.

    Returns:
        RoundtripResult with full before/after verification details.
    """
    # Phase 1: Verify original
    original_result = verify_chain_from_dicts(entries)

    # Phase 2: Tamper
    tampered_entries, tamper_report = tamper_entry(entries, tamper_seq, tamper_kind)

    # Phase 3: Detect tampering
    tampered_result = detect_tampering(tampered_entries)

    # Enrich tamper report
    enriched_report = TamperReport(
        tampered_seq=tamper_report.tampered_seq,
        tamper_kind=tamper_report.tamper_kind,
        original_value=tamper_report.original_value,
        tampered_value=tamper_report.tampered_value,
        detected=not tampered_result.ok,
        detection_detail=(
            f"Broken at seq={tampered_result.broken_at_seq}: "
            f"expected={tampered_result.expected_hash}, actual={tampered_result.actual_hash}"
            if not tampered_result.ok
            else None
        ),
    )

    return RoundtripResult(
        original_ok=original_result.ok,
        original_verified_count=original_result.verified_count,
        original_total_count=original_result.total_count,
        tamper_report=enriched_report,
        tampered_ok=tampered_result.ok,
        tampered_broken_at_seq=tampered_result.broken_at_seq,
        tampered_expected_hash=tampered_result.expected_hash,
        tampered_actual_hash=tampered_result.actual_hash,
    )


# ── Full file-based roundtrip ──


def file_roundtrip(
    json_path: str | Path,
    tamper_seq: int,
    tamper_kind: str = "current_hash",
    output_path: str | Path | None = None,
) -> RoundtripResult:
    """Full file-based roundtrip: read JSON → tamper → write tampered → re-verify.

    Args:
        json_path: Path to TS-exported evidence_log JSON.
        tamper_seq: Which entry to tamper.
        tamper_kind: How to tamper.
        output_path: Where to write tampered JSON. If None, writes to
            {json_path}.tampered.json.

    Returns:
        RoundtripResult.
    """
    path = Path(json_path)
    raw = path.read_text(encoding="utf-8")
    entries: list[dict[str, object]] = json.loads(raw)

    if not isinstance(entries, list):
        raise TypeError(f"Expected JSON array, got {type(entries).__name__}")

    result = run_roundtrip(entries, tamper_seq, tamper_kind)

    # Write tampered version for TS-side re-verification
    tampered_entries, _report = tamper_entry(entries, tamper_seq, tamper_kind)
    out = Path(output_path) if output_path else path.with_suffix(".tampered.json")
    out.write_text(
        json.dumps(tampered_entries, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    return result


# ── Utility: Evidence log JSON builder ──


def build_evidence_chain_json(
    chain_length: int = 3,
    base_model_id: str = "qwen3.7-max-2026-05-20",
) -> list[dict[str, object]]:
    """Build a valid evidence_log JSON chain for roundtrip testing.

    Args:
        chain_length: Number of entries to generate.
        base_model_id: Model ID to use for cred.modelId.

    Returns:
        List of evidence_log entries forming a valid hash chain from GENESIS.
    """
    entries: list[dict[str, object]] = []
    prev_hash = GENESIS_PREV_HASH

    payload_kinds = ["hypothesis", "experiment", "observation", "understanding",
                     "plan", "feedback", "integration", "meta", "citation"]
    purpose_tags = ["hypothesis", "code_gen", "eval", "narrative",
                    "scoring", "gt_read", "baseline_exempt", "viz_select", "dialogue"]

    for i in range(chain_length):
        pk = payload_kinds[i % len(payload_kinds)]
        pt = purpose_tags[i % len(purpose_tags)]
        stage_id = f"stage{i + 1}_{pk}"

        entry: dict[str, object] = {
            "stageId": stage_id,
            "cred": {
                "modelId": base_model_id,
                "dashscopeRequestId": f"req-roundtrip-{i:03d}" if i % 3 != 1 else None,
                "reproHash": f"{i:064d}"[:64],
                "gitCommitSha": f"{i:040x}",
                "isoTimestamp": f"2026-06-27T10:{30 + i:02d}:00Z",
            },
            "payloadKind": pk,
            "purposeTag": pt,
            "prevHash": prev_hash,
            "seq": i + 1,
        }

        # Compute currentHash
        hash_input: dict[str, object] = {
            "stageId": entry["stageId"],
            "cred": entry["cred"],
            "payloadKind": entry["payloadKind"],
            "prevHash": entry["prevHash"],
        }
        current_hash = canonical_hash(hash_input)
        entry["currentHash"] = current_hash

        entries.append(entry)
        prev_hash = current_hash

    return entries
