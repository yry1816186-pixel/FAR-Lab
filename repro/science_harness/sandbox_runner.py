#!/usr/bin/env python3
"""FAR-Lab venv sandbox runner (P1-6).

Protocol (stdin -> stdout, both JSON):
  Request:  {"script": "<python source>", "seed": 42, "networkPolicy": "off",
             "allowedHosts": [], "workingDir": "<dir or empty>"}
  Response: {"exitCode": 0, "stdout": "...", "stderr": "...",
             "artifacts": [{"path","contentHash","bytes"}],
             "wallClockMs": 123, "timedOut": false, "networkBlocked": true,
             "singleThreaded": true, "threadLimitReason": "threadpoolctl_verified",
             "cpuMs": 45, "peakRssKb": 32768}

Executes the user script deterministically: fixed seed (SR-2) + threadpoolctl nthread=1 (SR-7,
required and fail-closed) + best-effort network policy (SR-5). The user script's
stdout/stderr are captured into buffers so this wrapper's JSON response never collides with
user output; WORKING_DIR / SEED / NETWORK_POLICY / ALLOWED_HOSTS are injected into the script
namespace.

Honesty (07_RISK_REGISTER §188): process-level OS isolation (cgroups/netns) is NOT provided
here. networkPolicy='off' only clears proxy env vars to discourage egress — it does not
enforce. Real OS-level isolation is V2+ roadmap. Timeout is enforced by the parent spawn
(kill on elapsed), not self-policed here. ``singleThreaded`` attests only threadpoolctl-visible
numerical pools; it cannot prove that arbitrary Python/native code created no other threads.
The script never raises to the parent process.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import random
import re
import sys
import time
import traceback
from pathlib import Path
from threading import get_ident


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


def _peak_rss_kb() -> int:
    """FUSION-OS-7: peak resident set size in KB (Open Science per-cell resource 三元组范式).

    POSIX: resource.getrusage(RUSAGE_SELF).ru_maxrss — Linux reports KB, macOS reports bytes
    (normalize to KB). Windows: `resource` module is unavailable → return 0 (honest "not measured";
    TS-side magnitude comparison treats 0 as incomparable, no false mismatch flag).
    """
    try:
        import resource  # POSIX-only; ImportError on Windows.
    except ImportError:
        return 0
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if sys.platform == "darwin":
        return peak // 1024  # macOS ru_maxrss is in bytes.
    return peak  # Linux ru_maxrss is already KB.


def apply_env_hardening(network_policy: str) -> bool:
    """Best-effort egress discouragement (SR-5) + secret env strip (FUSION-OS-8).

    networkPolicy='off' clears proxy env vars; real OS-level egress blocking is NOT
    provided (07_RISK_REGISTER §188). allowlist enforcement is the user script's job
    (ALLOWED_HOSTS injected into its namespace).

    FUSION-OS-8 secret-strip (defense in depth): the parent spawn (buildVenvPythonEnv)
    already whitelists + strips secret env, but the sandbox must not trust that the
    parent actually stripped — strip again here so a user script cannot read
    OPENAI_API_KEY / *_TOKEN / *_SECRET via os.environ (来源不可自填).
    """
    for key in (
        "HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
        "ALL_PROXY", "all_proxy",
    ):
        os.environ.pop(key, None)
    os.environ["NO_PROXY"] = "*"
    secret_re = re.compile(r"(API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE_KEY|ACCESS_KEY)", re.I)
    for key in list(os.environ):
        if secret_re.search(key):
            os.environ.pop(key, None)
    return network_policy == "off"


# FUSION-OS-8 dlopen/spawn audit hook (Open Science dlopen guard 范式·PEP 578).
# 拒绝用户脚本加载原生库 / 派生子进程——确定性科学复算不应 ctypes.CDLL 或 subprocess。
# 事件名取 PEP 578 实际事件（ctypes.dlopen / subprocess.Popen / os.system / os.exec / os.spawn /
# os.fork）；不含 'exec'（会阻断 sandbox 自身 exec 用户脚本）/ 不含 'import'（numpy C 扩展正常加载）。
_AUDIT_REJECT_EVENTS = frozenset({
    "ctypes.dlopen", "subprocess.Popen", "os.system",
    "os.exec", "os.spawn", "os.fork",
})


_THREAD_LIMIT_ENV_VARS = (
    "OMP_NUM_THREADS",
    "OPENBLAS_NUM_THREADS",
    "MKL_NUM_THREADS",
    "BLIS_NUM_THREADS",
    "VECLIB_MAXIMUM_THREADS",
    "NUMEXPR_NUM_THREADS",
)


def _prepare_thread_limit():
    """Apply SR-7 before user imports and return (context, info function, error reason).

    Environment variables cover supported numerical libraries loaded later by the user script;
    threadpoolctl applies the same limit to libraries already loaded.  Import/setup failure is a
    hard execution precondition failure: the script must not run and the receipt must say false.
    """
    for key in _THREAD_LIMIT_ENV_VARS:
        os.environ[key] = "1"
    try:
        from threadpoolctl import threadpool_info, threadpool_limits
    except ImportError:
        return None, None, "threadpoolctl_unavailable"
    except Exception:  # noqa: BLE001 - a present-but-broken dependency is a setup failure.
        return None, None, "threadpoolctl_setup_failed"
    try:
        return threadpool_limits(limits=1), threadpool_info, None
    except Exception:  # noqa: BLE001 - external backend failure is classified, not ignored.
        return None, None, "threadpoolctl_setup_failed"


def _install_user_audit_hook(threadpool_info):
    """Install the user-code audit gate and return a bound threadpool-info probe.

    threadpoolctl verifies loaded libraries with ctypes RTLD_NOLOAD, which emits the same
    ``ctypes.dlopen`` event that untrusted user code is forbidden to invoke.  A closure-scoped
    flag opens that event only on the audit-installing thread while the bound post-exec probe
    runs; it cannot be repurposed with an arbitrary callable. Audit hooks cannot be removed.
    """
    allow_threadpool_probe = False
    audit_thread_id = get_ident()
    reject_events = _AUDIT_REJECT_EVENTS

    def audit(event: str, args: object) -> None:
        if event == "ctypes.dlopen" and allow_threadpool_probe and get_ident() == audit_thread_id:
            return
        if event in reject_events:
            sys.exit(126)

    def trusted_threadpool_probe():
        nonlocal allow_threadpool_probe
        allow_threadpool_probe = True
        try:
            return threadpool_info()
        finally:
            allow_threadpool_probe = False

    sys.addaudithook(audit)
    return trusted_threadpool_probe


def _verify_thread_limit(trusted_threadpool_probe):
    """Verify every threadpoolctl-visible pool reports exactly one worker."""
    try:
        pools = trusted_threadpool_probe()
    except BaseException:  # includes audit/SystemExit; convert to an honest failed receipt.
        return False, "threadpoolctl_verification_failed"
    if not isinstance(pools, list):
        return False, "threadpoolctl_verification_failed"
    if len(pools) == 0:
        return True, "threadpoolctl_applied_no_supported_pools"
    for pool in pools:
        if not isinstance(pool, dict):
            return False, "threadpoolctl_verification_failed"
        num_threads = pool.get("num_threads")
        if isinstance(num_threads, bool) or not isinstance(num_threads, int):
            return False, "threadpoolctl_verification_failed"
        if num_threads != 1:
            return False, "threadpool_limit_not_one"
    return True, "threadpoolctl_verified"


def _append_stderr(buffer: io.StringIO, message: str) -> None:
    if buffer.tell() > 0 and not buffer.getvalue().endswith("\n"):
        buffer.write("\n")
    buffer.write(message)


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
                    "singleThreaded": False, "threadLimitReason": "execution_not_started",
                }
            )
            return

        if not isinstance(cfg, dict):
            emit(
                {
                    "exitCode": 2, "stdout": "", "stderr": "config_not_object",
                    "artifacts": [], "wallClockMs": 0, "timedOut": False, "networkBlocked": True,
                    "singleThreaded": False, "threadLimitReason": "execution_not_started",
                }
            )
            return

        script = cfg.get("script", "")
        seed = int(cfg.get("seed", 42))
        network_policy = str(cfg.get("networkPolicy", "off"))
        allowed_hosts = cfg.get("allowedHosts", []) or []
        working_dir = str(cfg.get("workingDir", "") or "")

        network_blocked = apply_env_hardening(network_policy)
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

        # SR-7 is a declared deterministic-execution precondition.  Missing/broken threadpoolctl
        # must fail before user code instead of running unbounded and claiming singleThreaded=true.
        thread_ctx, threadpool_info, thread_setup_error = _prepare_thread_limit()
        if thread_setup_error is not None or thread_ctx is None or threadpool_info is None:
            reason = thread_setup_error or "threadpoolctl_setup_failed"
            emit(
                {
                    "exitCode": 78,
                    "stdout": "",
                    "stderr": f"thread_limit_precondition_failed: {reason}",
                    "artifacts": [],
                    "wallClockMs": int((time.monotonic() - start) * 1000),
                    "timedOut": False,
                    "networkBlocked": network_blocked,
                    "singleThreaded": False,
                    "threadLimitReason": reason,
                    "cpuMs": 0,
                    "peakRssKb": _peak_rss_kb(),
                }
            )
            return

        out_buf = io.StringIO()
        err_buf = io.StringIO()
        exit_code = 0

        old_stdout, old_stderr = sys.stdout, sys.stderr
        sys.stdout, sys.stderr = out_buf, err_buf
        # FUSION-OS-8: install audit hook AFTER threadpoolctl setup (its ctypes queries would
        # otherwise self-trip) so the hook governs user-script exec — reject dlopen/spawn.
        trusted_threadpool_probe = _install_user_audit_hook(threadpool_info)
        # FUSION-OS-7: cpu time of user-script exec (cross-platform time.process_time·excludes sleep/wait).
        cpu_start = time.process_time()
        try:
            try:
                exec(compile(script, "<sandbox>", "exec"), namespace)
            except SystemExit as exc:
                exit_code = exc.code if isinstance(exc.code, int) else 1
            except Exception:  # noqa: BLE001
                exit_code = 1
                err_buf.write(traceback.format_exc())
        finally:
            single_threaded, thread_limit_reason = _verify_thread_limit(trusted_threadpool_probe)
            try:
                thread_ctx.__exit__(None, None, None)
            except Exception:  # noqa: BLE001 - restoration failure invalidates the attestation.
                single_threaded = False
                thread_limit_reason = "threadpoolctl_verification_failed"
            sys.stdout, sys.stderr = old_stdout, old_stderr
        if not single_threaded:
            if exit_code == 0:
                exit_code = 78
            _append_stderr(err_buf, f"thread_limit_attestation_failed: {thread_limit_reason}")
        cpu_ms = int((time.process_time() - cpu_start) * 1000)

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
                "singleThreaded": single_threaded,
                "threadLimitReason": thread_limit_reason,
                "cpuMs": cpu_ms,
                "peakRssKb": _peak_rss_kb(),
            }
        )
    except Exception:  # noqa: BLE001
        emit(
            {
                "exitCode": 1, "stdout": "", "stderr": f"fatal: {traceback.format_exc()}",
                "artifacts": [], "wallClockMs": int((time.monotonic() - start) * 1000),
                "timedOut": False, "networkBlocked": True,
                "singleThreaded": False, "threadLimitReason": "execution_interrupted",
            }
        )


if __name__ == "__main__":
    main()
