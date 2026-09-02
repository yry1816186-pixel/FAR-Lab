"""Minimal JSONL entrypoint for untrusted exploratory code.

Only attestation and the exploration operation are reachable. Confirmatory
operations remain on the trusted sidecar entrypoint and are never exported by
this container.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import traceback

from .exploration import op_run_exploration


def _read_status() -> dict[str, str]:
    facts: dict[str, str] = {}
    for line in Path("/proc/self/status").read_text(encoding="utf-8").splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            facts[key] = value.strip()
    return facts


def _read_cgroup_limit(name: str) -> int:
    raw = Path("/sys/fs/cgroup", name).read_text(encoding="ascii").strip()
    if raw == "max":
        raise RuntimeError(f"cgroup {name} is unlimited")
    return int(raw)


def _mount_is_read_only(mountinfo: str, mountpoint: str = "/") -> bool:
    """Return the kernel-reported mount mode, never a permission heuristic."""
    for line in mountinfo.splitlines():
        fields = line.split()
        if len(fields) < 6 or fields[4] != mountpoint:
            continue
        options = fields[5].split(",")
        if "ro" in options:
            return True
        if "rw" in options:
            return False
        raise RuntimeError(f"mount {mountpoint} reports neither ro nor rw")
    raise RuntimeError(f"mount {mountpoint} is absent from /proc/self/mountinfo")


def _sandbox_info(_payload: dict[str, object]) -> dict[str, object]:
    policy_path = Path(os.environ.get("FARLAB_SANDBOX_POLICY_PATH", "/opt/farlab/sandbox-policy.json"))
    policy_bytes = policy_path.read_bytes()
    policy = json.loads(policy_bytes)
    status = _read_status()

    rootfs_read_only = _mount_is_read_only(
        Path("/proc/self/mountinfo").read_text(encoding="utf-8")
    )

    tmp_writable = False
    try:
        fd, probe = tempfile.mkstemp(prefix="farlab-sandbox-", dir="/tmp")
        os.close(fd)
        Path(probe).unlink()
        tmp_writable = True
    except OSError:
        pass

    # Docker --network none leaves only loopback. This is an observed namespace
    # fact, not an outbound-connect heuristic that could be confused by outages.
    network_disabled = socket.if_nameindex() == [(1, "lo")]

    return {
        "backend": "docker-linux",
        "uid": os.getuid(),
        "gid": os.getgid(),
        "noNewPrivs": status.get("NoNewPrivs") == "1",
        "seccompEnabled": status.get("Seccomp") in {"1", "2"},
        "seccompMode": int(status.get("Seccomp", "0")),
        "capEff": status.get("CapEff", ""),
        "rootfsReadOnly": rootfs_read_only,
        "tmpWritable": tmp_writable,
        "networkDisabled": network_disabled,
        "interfaces": [name for _, name in socket.if_nameindex()],
        "policyHash": hashlib.sha256(policy_bytes).hexdigest(),
        "policyVersion": policy.get("version"),
        "cgroup": {
            "memoryMaxBytes": _read_cgroup_limit("memory.max"),
            "pidsMax": _read_cgroup_limit("pids.max"),
            "cpuMax": Path("/sys/fs/cgroup/cpu.max").read_text(encoding="ascii").strip(),
        },
    }


_OPS = {
    "sandbox_info": _sandbox_info,
    "run_exploration": op_run_exploration,
}


def main() -> int:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request_id = -1
        try:
            request = json.loads(line)
            request_id = request.get("id", -1)
            operation = request.get("op")
            handler = _OPS.get(operation)
            if handler is None:
                raise ValueError(f"unknown sandbox op {operation!r}; known: {sorted(_OPS)}")
            result = handler(request.get("payload", {}))
            frame = {"id": request_id, "ok": True, "result": result}
        except Exception as exc:
            frame = {
                "id": request_id,
                "ok": False,
                "error": {
                    "kind": "execution",
                    "message": f"{type(exc).__name__}: {exc}",
                    "traceback": traceback.format_exc(limit=8),
                },
            }
        sys.stdout.write(json.dumps(frame, allow_nan=False) + "\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
