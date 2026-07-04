#!/usr/bin/env python3
"""FAR-Chain venv sandbox runner (P1-6).

Protocol (stdin -> stdout, both JSON):
  Request:  {"script": "<python source>", "seed": 42, "networkPolicy": "off",
             "allowedHosts": [], "workingDir": "<dir or empty>"}
  Response: {"exitCode": 0, "stdout": "...", "stderr": "...",
             "artifacts": [{"path","contentHash","bytes"}],
             "wallClockMs": 123, "timedOut": false, "networkBlocked": true}

Executes the user script deterministically: fixed seed (SR-2) + threadpoolctl nthread=1 (SR-7,
optional dep, degrades gracefully) + best-effort network policy (SR-5). The user script's
stdout/stderr are captured into buffers so this wrapper's JSON response never collides with
user output; WORKING_DIR / SEED / NETWORK_POLICY / ALLOWED_HOSTS are injected into the script
namespace.

Honesty (07_RISK_REGISTER §188): process-level OS isolation (cgroups/netns) is NOT provided
here. networkPolicy='off' only clears proxy env vars to discourage egress — it does not
enforce. Real OS-level isolation is V2+ roadmap. Timeout is enforced by the parent spawn
(kill on elapsed), not self-policed here. The script never raises to the parent process.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import random
import sys
import time
import traceback
from pathlib import Path


def emit(result: dict[str, object]) -> None:
    text = json.dumps(result, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    sys.stdout.write(text)
    sys.stdout.write("\n")
    sys.stdout.flush()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def scan_artifacts(working_dir: str) -> list[dict[str, object]]:
    base = Path(working_dir)
    if not base.is_dir():
        return []
    out: list[dict[str, object]] = []
    for p in sorted(base.rglob("*")):
        if p.is_file():
            try:
                st = p.stat()
                out.append(
                    {
                        "path": str(p.relative_to(base)).replace(os.sep, "/"),
                        "contentHash": sha256_file(p),
                        "bytes": st.st_size,
                    }
                )
            except OSError:
                continue
    return out


def apply_network_policy(network_policy: str) -> bool:
    """Best-effort egress discouragement (SR-5). Returns the networkBlocked flag.

    networkPolicy='off' clears proxy env vars; real OS-level egress blocking is NOT
    provided (07_RISK_REGISTER §188). allowlist enforcement is the user script's job
    (ALLOWED_HOSTS injected into its namespace).
    """
    if network_policy == "off":
        for key in (
            "HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
            "ALL_PROXY", "all_proxy",
        ):
            os.environ.pop(key, None)
        os.environ["NO_PROXY"] = "*"
        return True
    return False


def main() -> None:
    start = time.monotonic()
    try:
        raw = sys.stdin.read()
        try:
            cfg = json.loads(raw) if raw else {}
        except json.JSONDecodeError as exc:
            emit(
                {
                    "exitCode": 2, "stdout": "", "stderr": f"invalid_json: {exc}",
                    "artifacts": [], "wallClockMs": 0, "timedOut": False, "networkBlocked": True,
                }
            )
            return

        if not isinstance(cfg, dict):
            emit(
                {
                    "exitCode": 2, "stdout": "", "stderr": "config_not_object",
                    "artifacts": [], "wallClockMs": 0, "timedOut": False, "networkBlocked": True,
                }
            )
            return

        script = cfg.get("script", "")
        seed = int(cfg.get("seed", 42))
        network_policy = str(cfg.get("networkPolicy", "off"))
        allowed_hosts = cfg.get("allowedHosts", []) or []
        working_dir = str(cfg.get("workingDir", "") or "")

        network_blocked = apply_network_policy(network_policy)
        random.seed(seed)

        namespace: dict[str, object] = {
            "__name__": "__far_sandbox__",
            "SEED": seed,
            "NETWORK_POLICY": network_policy,
            "ALLOWED_HOSTS": list(allowed_hosts),
        }
        if working_dir:
            os.makedirs(working_dir, exist_ok=True)
            namespace["WORKING_DIR"] = working_dir

        # SR-7: threadpoolctl nthread=1 (optional dep; degrade to unbounded if absent).
        thread_ctx = None
        try:
            from threadpoolctl import threadpool_limits

            thread_ctx = threadpool_limits(limits=1)
        except Exception:  # noqa: BLE001
            thread_ctx = None

        out_buf = io.StringIO()
        err_buf = io.StringIO()
        exit_code = 0

        old_stdout, old_stderr = sys.stdout, sys.stderr
        sys.stdout, sys.stderr = out_buf, err_buf
        try:
            try:
                exec(compile(script, "<sandbox>", "exec"), namespace)
            except SystemExit as exc:
                exit_code = exc.code if isinstance(exc.code, int) else 1
            except Exception:  # noqa: BLE001
                exit_code = 1
                err_buf.write(traceback.format_exc())
        finally:
            sys.stdout, sys.stderr = old_stdout, old_stderr
            if thread_ctx is not None:
                thread_ctx.__exit__(None, None, None)

        artifacts = scan_artifacts(working_dir) if working_dir else []
        emit(
            {
                "exitCode": exit_code,
                "stdout": out_buf.getvalue(),
                "stderr": err_buf.getvalue(),
                "artifacts": artifacts,
                "wallClockMs": int((time.monotonic() - start) * 1000),
                "timedOut": False,
                "networkBlocked": network_blocked,
            }
        )
    except Exception:  # noqa: BLE001
        emit(
            {
                "exitCode": 1, "stdout": "", "stderr": f"fatal: {traceback.format_exc()}",
                "artifacts": [], "wallClockMs": int((time.monotonic() - start) * 1000),
                "timedOut": False, "networkBlocked": True,
            }
        )


if __name__ == "__main__":
    main()
