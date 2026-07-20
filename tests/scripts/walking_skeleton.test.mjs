// walking_skeleton.test.mjs — Walking Skeleton 门禁化测试(Phase C / C5)。
// 真实执行 scripts/walking_skeleton.mjs,断言退出码 0 与证据产物存在。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const WS_DIR = join(ROOT, ".far-implementation", "walking-skeleton");

test("walking skeleton: 真实生产路径 6 步全通且证据落盘", { timeout: 180_000 }, () => {
  const r = spawnSync(process.execPath, ["scripts/walking_skeleton.mjs"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(
    r.status,
    0,
    `walking_skeleton.mjs exit=${r.status}\n--- stdout tail ---\n${String(r.stdout).slice(-2000)}\n--- stderr tail ---\n${String(r.stderr).slice(-2000)}`,
  );
  for (const f of ["run_log.txt", "skeleton_evidence.yaml", "README.md"]) {
    assert.ok(existsSync(join(WS_DIR, f)), `缺证据文件 ${f}`);
  }
  assert.ok(existsSync(join(WS_DIR, "demo.far-proof")), "缺 demo.far-proof bundle");
  assert.ok(existsSync(join(WS_DIR, "ask.far-proof")), "缺 ask.far-proof bundle");
  const evidence = readFileSync(join(WS_DIR, "skeleton_evidence.yaml"), "utf8");
  assert.match(evidence, /verdict: PASS \(6\/6\)/, "证据登记 verdict 非 6/6 PASS");
});
