// test_registry_check.test.mjs — CLI 命令注册表完整性检查器的验收测试：
// 本仓库 PASS + 三类漂移（隐藏命令 / 幽灵命令 / DETAILED_HELP 缺段 fallback）检出。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const ROOT = process.cwd();

test("① test_registry 在本仓库 PASS（R1 结构 + R2 双向 + R3 入口段）", () => {
  const r = spawnSync(process.execPath, ["scripts/test_registry.mjs", "--quick"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, `本仓库应 PASS，实际:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /PASS — \d+ 命令注册表↔help↔专属帮助三方一致/);
  // 反 theater：注册表不是空抽（真实仓库当前 40 命令；数量变化时同步本断言）
  assert.match(r.stdout, /PASS — 40 命令/);
});

/** 构造最小 shim 仓库：help 列出 helpCmds；--help 子命令输出 dedicated 为 true 时专属首行。 */
function makeShimRepo(helpCmds, dedicated) {
  const tmp = join(tmpdir(), `test-registry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(join(tmp, "src", "cli"), { recursive: true });
  const lines = [
    "// shim far.ts for test_registry drift injection",
    "const COMMANDS: readonly CliCommand[] = [",
    "  { name: 'foo', description: 'foo command' },",
    "  { name: 'ok', description: 'ok command' },",
    "];",
    "const args = process.argv.slice(2);",
    "if (args.length === 0 || args[0] === '--help') {",
    ...helpCmds.map((c) => `  console.log('  far ${c}   does ${c}');`),
    "  process.exit(0);",
    "}",
    `const dedicated = ${JSON.stringify(dedicated)};`,
    "if (args[1] === '--help') {",
    "  if (dedicated.includes(args[0])) { console.log(`FAR-Lab CLI — ${args[0]}`); process.exit(0); }",
    "  console.log('FAR-Lab CLI — claim-level verification for AI4S scientific claims'); process.exit(0);",
    "}",
    "console.log('ran ' + args[0]);",
    "type CliCommand = { name: string; description: string };",
    "",
  ].join("\n");
  writeFileSync(join(tmp, "src", "cli", "far.ts"), lines);
  return tmp;
}

test("② 隐藏命令漂移（注册但 help 未列）→ exit 1 且点名", () => {
  const tmp = makeShimRepo(["ok"], ["ok"]); // foo 已注册但 help 缺席
  try {
    const r = spawnSync(process.execPath, ["scripts/test_registry.mjs", "--dir", tmp], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 1, "隐藏命令须 exit 1");
    assert.match(r.stderr, /R2: 隐藏命令——'foo' 已注册但 far --help 未列出/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("③ 幽灵命令漂移（help 列出但未注册）→ exit 1 且点名", () => {
  const tmp = makeShimRepo(["ok", "bar"], ["ok"]); // bar 未注册
  try {
    const r = spawnSync(process.execPath, ["scripts/test_registry.mjs", "--dir", tmp], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 1, "幽灵命令须 exit 1");
    assert.match(r.stderr, /R2: 幽灵命令——far --help 列出 'bar' 但 COMMANDS 未注册/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("④ DETAILED_HELP 缺段静默 fallback（--help 首行非专属）→ exit 1 且点名", () => {
  const tmp = makeShimRepo(["ok", "foo"], ["ok"]); // foo 无专属帮助段
  try {
    const r = spawnSync(process.execPath, ["scripts/test_registry.mjs", "--dir", tmp], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 1, "fallback 须 exit 1");
    assert.match(r.stderr, /R4: far foo --help 无专属段落/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("⑤ shim 全一致（注册=help=专属帮助）→ exit 0（防检查器无差别 FAIL）", () => {
  const tmp = makeShimRepo(["ok", "foo"], ["ok", "foo"]);
  try {
    const r = spawnSync(process.execPath, ["scripts/test_registry.mjs", "--dir", tmp], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 0, `一致仓库应 PASS，实际:\n${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /PASS — 2 命令/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
