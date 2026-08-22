"""FAR-Lab experiment execution sidecar (E3, D-081).

Stdio JSON-lines protocol; one process serves many requests.
Request:  {"id": <int>, "op": <str>, "payload": {...}}
Response: {"id": <int>, "ok": true, "result": {...}} | {"id": <int>, "ok": false, "error": {"kind", "message"}}
Log frame: {"log": "<line>"} — never a result channel.

Determinism: builders receive an explicit seed; the caller pins thread counts
(OMP_NUM_THREADS etc. are set by the TS executor before spawn). Code here is a
reviewed template registry — the orchestrator may only pass JSON parameters
through, never code (D-086-5).
"""
from __future__ import annotations

import json
import sys
import traceback

from .ops import OPS


def main() -> int:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            sys.stdout.write(json.dumps({"id": -1, "ok": False, "error": {"kind": "protocol", "message": f"unparsable request line: {exc}"}}) + "\n")
            sys.stdout.flush()
            continue
        rid = req.get("id", -1)
        op = req.get("op")
        payload = req.get("payload", {})
        handler = OPS.get(op)
        if handler is None:
            sys.stdout.write(json.dumps({"id": rid, "ok": False, "error": {"kind": "unknown_op", "message": f"unknown op {op!r}; known: {sorted(OPS)}"}}) + "\n")
            sys.stdout.flush()
            continue
        try:
            result = handler(payload)
            sys.stdout.write(json.dumps({"id": rid, "ok": True, "result": result}, allow_nan=False) + "\n")
        except Exception as exc:  # visible failures only — never swallowed
            tb = traceback.format_exc(limit=8)
            sys.stdout.write(json.dumps({"id": rid, "ok": False, "error": {"kind": "execution", "message": f"{type(exc).__name__}: {exc}", "traceback": tb}}) + "\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
