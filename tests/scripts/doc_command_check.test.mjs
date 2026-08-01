// doc_command_check.test.mjs — DEF-14 验收：doc↔CLI 一致性工具跑通 + 漂移检测。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const ROOT = process.cwd();

test("① doc_command_check 在本仓库 PASS（exit 0 + 文档命令全在 CLI）", () => {
  const r = spawnSync(process.execPath, ["scripts/doc_command_check.mjs"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, `doc_command_check 应 PASS，实际:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /PASS — \d+ 文档命令全部存在于 CLI/);
  // CLI 子命令须被正确抽取（反 theater：不是空跑）
  assert.match(r.stdout, /demo/);
  assert.match(r.stdout, /doctor/);
});

test("② doc_command_check 检出文档命令漂移（CLI 不存在的子命令）→ exit 1", () => {
  // 构造一个含伪造 `far nonexistent-cmd` 的临时 README，用 --dir 指向临时仓库根
  const tmp = join(tmpdir(), "doc-check-drift-" + Date.now());
  mkdirSync(join(tmp, "src", "cli"), { recursive: true });
  // 最小 far.ts：打印含 version 的 help（让 realSubcommands 抽到 'version'）
  writeFileSync(join(tmp, "src", "cli", "far.ts"),
    "console.log('  far version   print version');\nconsole.log('  far demo      demo');\n");
  writeFileSync(join(tmp, "README.md"),
    "```sh\n$ far nonexistent-cmd --x\n$ far demo\n```\n");
  try {
    const r = spawnSync(process.execPath, ["scripts/doc_command_check.mjs", "--dir", tmp],
      { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 1, "漂移命令须 exit 1");
    assert.match(r.stderr, /FAIL — 1 个文档命令在 CLI 不存在/);
    assert.match(r.stderr, /nonexistent-cmd/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
