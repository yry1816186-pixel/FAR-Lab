#!/usr/bin/env python3
"""Claude Code PreToolUse guard for high-risk commands and protected writes.

P0-P4 风险分级接入（对接 AGENTS.md §12 + docs/governance/AGENT-LIFECYCLE.md §4）。
additive 增强（2026-08-07）:
  - 每条检测标注 P-level（P2-P4）
  - 审计日志写入 .far-master/POLICY_AUDIT.jsonl（final-auditor 追溯用）
  - 新增 P4 命令检测: npm publish / docker push / gh pr merge / git tag（对接 settings.json ask 列表）
  - 新增 P3 检测: 编辑现有 schema/migrations/*.sql（forward-fix only，AGENTS.md §7）

诚实边界: 审计日志写入失败不阻断拦截（try/except 包裹）；现有检测逻辑字节保留。
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


def audit_log(event: dict) -> None:
    """写审计日志到 .far-master/POLICY_AUDIT.jsonl（append-only）。失败不阻断。"""
    try:
        cwd = Path(event.get("cwd") or os.getcwd())
        log_path = cwd / ".far-master" / "POLICY_AUDIT.jsonl"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **event,
        }
        with log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        # 审计日志失败不影响拦截功能（best-effort）
        pass


def deny(reason: str, p_level: str = "P4", tool: str = "", args_redacted: str = "") -> None:
    """拦截 + 审计日志。p_level 标注风险级（P2-P4）。"""
    audit_log({
        "event": "blocked",
        "tool": tool,
        "p_level": p_level,
        "reason": reason,
        "args_redacted": args_redacted[:200],  # 脱敏 + 截断
        "cwd": os.getcwd(),
    })
    print(f"[FAR-Lab policy {p_level}] Blocked: {reason}", file=sys.stderr)
    raise SystemExit(2)


def norm(path: str, cwd: str) -> str:
    p = Path(path)
    if not p.is_absolute():
        p = Path(cwd) / p
    try:
        return str(p.resolve(strict=False)).replace("\\", "/").lower()
    except Exception:
        return str(p).replace("\\", "/").lower()


def main() -> int:
    try:
        event = json.load(sys.stdin)
    except Exception as exc:
        deny(f"invalid hook input: {exc}", p_level="P1", tool="unknown")

    tool = str(event.get("tool_name", ""))
    data = event.get("tool_input") or {}
    cwd = str(event.get("cwd") or os.getcwd())

    if tool in {"Edit", "Write"}:
        raw_path = str(data.get("file_path") or data.get("path") or "")
        path = norm(raw_path, cwd)
        protected = (
            "/.git/",
            "/.env",
            "/secrets/",
            "/credentials/",
            "/.ssh/",
        )
        secret_suffixes = (".pem", ".key", ".p12", ".pfx", ".keystore")
        if any(token in path for token in protected) or path.endswith(secret_suffixes):
            deny(f"write/edit targets protected or sensitive path: {raw_path}", p_level="P4", tool=tool, args_redacted=raw_path)

        # P3: 编辑现有 schema/migrations/*.sql（forward-fix only，AGENTS.md §7）
        if "/schema/migrations/" in path and path.endswith(".sql"):
            deny(
                "editing existing schema/migrations/*.sql violates forward-fix only (AGENTS.md §7) — create a new migration instead",
                p_level="P3", tool=tool, args_redacted=raw_path,
            )

    if tool == "Bash":
        command = str(data.get("command") or "")
        # (pattern, reason, p_level) 三元组——p_level 对接 AGENTS.md §12
        dangerous = [
            (r"\bgit\s+reset\s+--hard\b", "git reset --hard can destroy user work", "P4"),
            (r"\bgit\s+clean\s+-[^\n]*[fdx]", "git clean can delete untracked or ignored files", "P4"),
            (r"\bgit\s+push\b[^\n]*(--force|-f)\b", "force push rewrites remote history", "P4"),
            (r"\bgit\s+(checkout|restore)\b[^\n]*(--\s+\.|\s+\.$)", "broad checkout/restore can overwrite user work", "P3"),
            (r"\brm\s+-[^\n]*r[^\n]*f|\brm\s+-[^\n]*f[^\n]*r", "recursive forced deletion is not allowed", "P4"),
            (r"\b(del|erase)\s+/[sq]\b", "broad Windows deletion is not allowed", "P4"),
            (r"\bRemove-Item\b[^\n]*-Recurse[^\n]*-Force", "recursive forced PowerShell deletion is not allowed", "P4"),
            (r"\b(drop\s+(database|table)|truncate\s+table)\b", "destructive database operation requires explicit authorization", "P4"),
            (r"\b(terraform\s+destroy|kubectl\s+delete\b|helm\s+uninstall\b)", "infrastructure destruction requires explicit authorization", "P4"),
            (r"(curl|wget)[^\n|]*\|\s*(sh|bash|zsh|powershell|pwsh)\b", "remote script piping is forbidden", "P4"),
            (r"\b(iwr|invoke-webrequest)\b[^\n|]*\|\s*(iex|invoke-expression)\b", "remote PowerShell execution is forbidden", "P4"),
            # P4 新增（对接 settings.json ask 列表 + AGENTS.md §12）
            (r"\bnpm\s+publish\b", "npm publish requires dual authorization (AGENTS.md §12 P4)", "P4"),
            (r"\bdocker\s+push\b", "docker push requires dual authorization (AGENTS.md §12 P4)", "P4"),
            (r"\bgh\s+pr\s+merge\b", "gh pr merge requires dual authorization (AGENTS.md §12 P4)", "P4"),
            (r"\bgit\s+tag\b\s+\S+", "git tag requires dual authorization (AGENTS.md §12 P4)", "P4"),
        ]
        lowered = command.lower()
        for pattern, reason, p_level in dangerous:
            if re.search(pattern, lowered, flags=re.IGNORECASE):
                deny(reason, p_level=p_level, tool=tool, args_redacted=command[:200])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
