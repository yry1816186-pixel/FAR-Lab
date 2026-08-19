// repro_check.test.mjs — 导出/验证复现性检查器的验收测试：本仓库 PASS + 对比函数的漂移检出。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const { compareBundleTrees, verifyResultsEquivalent, listBundleFiles } = await import(
  pathToFileURL(join(ROOT, "scripts/repro_check.mjs")).href
);

test("① repro_check 在本仓库 PASS（双导出 byte-identical + 双 bundle 重算一致）", () => {
  const r = spawnSync(process.execPath, ["scripts/repro_check.mjs"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, `应 PASS，实际:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /PASS — 同 DB 双导出 \d+ 文件 byte-identical/);
  // 反 theater：真实导出 14 个文件（数量变化时同步本断言）
  assert.match(r.stdout, /14 文件/);
});

test("② compareBundleTrees 检出字节篡改", () => {
  const a = mkdtempSync(join(tmpdir(), "cmp-a-"));
  const b = mkdtempSync(join(tmpdir(), "cmp-b-"));
  try {
    writeFileSync(join(a, "x.jsonl"), "line1\n");
    writeFileSync(join(b, "x.jsonl"), "line1-TAMPERED\n");
    const diffs = compareBundleTrees(a, b);
    assert.equal(diffs.length, 1);
    assert.match(diffs[0], /字节不一致: x\.jsonl/);
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});

test("③ compareBundleTrees 检出文件清单差异（B 缺文件）", () => {
  const a = mkdtempSync(join(tmpdir(), "cmp-a-"));
  const b = mkdtempSync(join(tmpdir(), "cmp-b-"));
  try {
    writeFileSync(join(a, "x.jsonl"), "same\n");
    writeFileSync(join(a, "extra.txt"), "only in A\n");
    writeFileSync(join(b, "x.jsonl"), "same\n");
    const diffs = compareBundleTrees(a, b);
    assert.ok(diffs.some((d) => /仅 A 目录有: extra\.txt/.test(d)), `应报清单差异，实际: ${JSON.stringify(diffs)}`);
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});

test("④ verifyResultsEquivalent 豁免 bundlePath 但不豁免实质差异", () => {
  const base = { ok: true, mode: "full", checks: [{ name: "chain", status: "PASS" }] };
  assert.equal(
    verifyResultsEquivalent({ ...base, bundlePath: "C:\\a" }, { ...base, bundlePath: "C:\\b" }),
    true,
    "仅 bundlePath 不同应视为等价"
  );
  assert.equal(
    verifyResultsEquivalent(base, { ...base, checks: [{ name: "chain", status: "FAIL" }] }),
    false,
    "实质差异不得判等价"
  );
});

test("⑤ listBundleFiles 递归子目录且排序确定", () => {
  const a = mkdtempSync(join(tmpdir(), "walk-a-"));
  try {
    mkdirSync(join(a, "code"));
    writeFileSync(join(a, "b.txt"), "b");
    writeFileSync(join(a, "a.txt"), "a");
    writeFileSync(join(a, "code", "c.py"), "c");
    assert.deepEqual(listBundleFiles(a), ["a.txt", "b.txt", "code/c.py"]);
  } finally {
    rmSync(a, { recursive: true, force: true });
  }
});
