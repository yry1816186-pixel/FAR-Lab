// policy_guard.test.mjs — PreToolUse hook P0-P4 风险分级增强测试。
// 对接 AGENTS.md §12 + docs/governance/AGENT-LIFECYCLE.md §4。
// 测试方式: spawnSync 调 python，stdin 注入 Claude Code hook JSON event。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();
const HOOK = join(ROOT, ".claude", "hooks", "policy_guard.py");
const PY = process.platform === "win32" ? "python" : "python3";

/** 跑 hook，stdin 注入 event。cwd 设临时目录避免污染仓库审计日志。返回 { status, stderr, cwd }。 */
function runHook(event) {
  const tmpCwd = mkdtempSync(join(tmpdir(), "far-policy-test-"));
  try {
    const r = spawnSync(PY, [HOOK], {
      cwd: tmpCwd,
      encoding: "utf8",
      input: JSON.stringify(event),
    });
    return { status: r.status, stderr: r.stderr, stdout: r.stdout, cwd: tmpCwd };
  } finally {
    // 清理临时目录（含审计日志）
    try { rmSync(tmpCwd, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

/** 检查 python 可用，不可用则 skip（graceful，同项目 env-gated 测试模式）。 */
function pythonAvailable() {
  const r = spawnSync(PY, ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

const hasPython = pythonAvailable();

test("① 安全命令 git status → exit 0", { skip: !hasPython && "python unavailable" }, () => {
  const r = runHook({ tool_name: "Bash", tool_input: { command: "git status --short" } });
  assert.equal(r.status, 0, `应 exit 0，stderr=${r.stderr}`);
});

test("② git reset --hard → exit 2 + P4 标注", { skip: !hasPython && "python unavailable" }, () => {
  const r = runHook({ tool_name: "Bash", tool_input: { command: "git reset --hard HEAD~1" } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /\[FAR-Lab policy P4\]/);
  assert.match(r.stderr, /git reset --hard/);
});

test("③ npm publish → exit 2 + P4（新增检测）", { skip: !hasPython && "python unavailable" }, () => {
  const r = runHook({ tool_name: "Bash", tool_input: { command: "npm publish" } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /\[FAR-Lab policy P4\]/);
  assert.match(r.stderr, /npm publish/);
});

test("④ docker push → exit 2 + P4（新增检测）", { skip: !hasPython && "python unavailable" }, () => {
  const r = runHook({ tool_name: "Bash", tool_input: { command: "docker push far-lab:latest" } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /\[FAR-Lab policy P4\]/);
  assert.match(r.stderr, /docker push/);
});

test("⑤ gh pr merge → exit 2 + P4（新增检测）", { skip: !hasPython && "python unavailable" }, () => {
  const r = runHook({ tool_name: "Bash", tool_input: { command: "gh pr merge 123" } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /\[FAR-Lab policy P4\]/);
  assert.match(r.stderr, /gh pr merge/);
});

test("⑥ git tag v1.0 → exit 2 + P4（新增检测）", { skip: !hasPython && "python unavailable" }, () => {
  const r = runHook({ tool_name: "Bash", tool_input: { command: "git tag v1.0.0" } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /\[FAR-Lab policy P4\]/);
  assert.match(r.stderr, /git tag/);
});

test("⑦ Edit .env → exit 2 + P4", { skip: !hasPython && "python unavailable" }, () => {
  const r = runHook({ tool_name: "Edit", tool_input: { file_path: ".env" } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /\[FAR-Lab policy P4\]/);
  assert.match(r.stderr, /protected or sensitive path/);
});

test("⑧ Edit schema/migrations/*.sql → exit 2 + P3（forward-fix only，新增）", { skip: !hasPython && "python unavailable" }, () => {
  const r = runHook({ tool_name: "Edit", tool_input: { file_path: "schema/migrations/001_init.sql" } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /\[FAR-Lab policy P3\]/);
  assert.match(r.stderr, /forward-fix only/);
});

test("⑨ Edit src/foo.ts → exit 0（安全路径）", { skip: !hasPython && "python unavailable" }, () => {
  const r = runHook({ tool_name: "Edit", tool_input: { file_path: "src/foo.ts" } });
  assert.equal(r.status, 0, `应 exit 0，stderr=${r.stderr}`);
});

test("⑩ 审计日志写入 .far-master/POLICY_AUDIT.jsonl", { skip: !hasPython && "python unavailable" }, () => {
  const tmpCwd = mkdtempSync(join(tmpdir(), "far-audit-test-"));
  try {
    const r = spawnSync(PY, [HOOK], {
      cwd: tmpCwd,
      encoding: "utf8",
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git reset --hard" }, cwd: tmpCwd }),
    });
    assert.equal(r.status, 2);
    const logPath = join(tmpCwd, ".far-master", "POLICY_AUDIT.jsonl");
    assert.ok(existsSync(logPath), "审计日志文件应已生成");
    const logContent = readFileSync(logPath, "utf8").trim();
    const record = JSON.parse(logContent);
    assert.equal(record.event, "blocked");
    assert.equal(record.p_level, "P4");
    assert.equal(record.tool, "Bash");
    assert.match(record.reason, /git reset --hard/);
    assert.ok(record.timestamp, "应有 ISO 8601 时间戳");
  } finally {
    try { rmSync(tmpCwd, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

test("⑪ git checkout broad (.) → exit 2 + P3（不是 P4）", { skip: !hasPython && "python unavailable" }, () => {
  const r = runHook({ tool_name: "Bash", tool_input: { command: "git checkout -- ." } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /\[FAR-Lab policy P3\]/);
});

test("⑫ 安全命令 pnpm test → exit 0", { skip: !hasPython && "python unavailable" }, () => {
  const r = runHook({ tool_name: "Bash", tool_input: { command: "pnpm test" } });
  assert.equal(r.status, 0, `应 exit 0，stderr=${r.stderr}`);
});
