// generate_openapi.test.mjs — R-15 验收：OpenAPI 3.0 生成 + 漂移检查。
// Oracle: ① schema/openapi.json 存在且 --check 零漂移；② 生成物为合法 OpenAPI 3.x 且含 6 个 v2-receipts 端点；
//         ③ verify 端点契约 schema 完整（requestBody + 200/400 响应）；④ 手改生成物 → --check 检出漂移(exit 1)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();
const GEN = "scripts/generate_openapi.mjs";
const V2_PATHS = [
  "/api/v2/receipts/demo",
  "/api/v2/receipts/verify",
  "/api/v2/receipts",
  "/api/v2/receipts/{id}",
  "/api/v2/receipts/{id}/verify",
];

function runGen(args) {
  return spawnSync(process.execPath, [GEN, ...args], { cwd: ROOT, encoding: "utf8" });
}

test("① schema/openapi.json 存在且 --check 零漂移", () => {
  assert.ok(existsSync(join(ROOT, "schema", "openapi.json")), "缺 schema/openapi.json (跑 node scripts/generate_openapi.mjs)");
  const r = runGen(["--check"]);
  assert.equal(r.status, 0, `drift check failed:\n${r.stdout}\n${r.stderr}`);
});

test("② 生成物为合法 OpenAPI 3.x 且含 5 个 v2-receipts 契约端点 + tag", () => {
  const spec = JSON.parse(readFileSync(join(ROOT, "schema", "openapi.json"), "utf8"));
  assert.match(spec.openapi, /^3\./, "须为 OpenAPI 3.x");
  const pathKeys = Object.keys(spec.paths);
  for (const expected of V2_PATHS) {
    assert.ok(pathKeys.includes(expected), `缺路径 ${expected}`);
  }
  const tagNames = (spec.tags ?? []).map((t) => t.name);
  assert.ok(tagNames.includes("v2-receipts"), "须含 v2-receipts tag");
});

test("③ verify 端点契约 schema 完整（requestBody + 200/400 响应）", () => {
  const spec = JSON.parse(readFileSync(join(ROOT, "schema", "openapi.json"), "utf8"));
  const verifyOp = spec.paths["/api/v2/receipts/verify"]?.post;
  assert.ok(verifyOp !== undefined, "POST /receipts/verify 须存在");
  assert.ok(verifyOp.requestBody?.content?.["application/json"]?.schema !== undefined, "requestBody schema 须存在（契约 SSOT）");
  assert.ok(verifyOp.responses?.["200"]?.content?.["application/json"]?.schema !== undefined, "200 响应 schema 须存在");
  assert.ok(verifyOp.responses?.["400"]?.content?.["application/json"]?.schema !== undefined, "400 响应 schema 须存在（RFC 7807）");
});

test("④ 手改生成物 → --check 检出漂移(exit 1)", () => {
  const dir = mkdtempSync(join(tmpdir(), "openapi-drift-"));
  try {
    const out = join(dir, "openapi.json");
    const gen = runGen(["--out", out]);
    assert.equal(gen.status, 0, `generate failed:\n${gen.stdout}\n${gen.stderr}`);
    const okRun = runGen(["--check", "--out", out]);
    assert.equal(okRun.status, 0, "刚生成即检查应零漂移");
    // 手改（模拟 route schema 改了但 openapi.json 忘记重生成）
    const doc = JSON.parse(readFileSync(out, "utf8"));
    doc.info.title = "TAMPERED";
    writeFileSync(out, JSON.stringify(doc, null, 2) + "\n", "utf8");
    const drift = runGen(["--check", "--out", out]);
    assert.equal(drift.status, 1, "篡改后未检出漂移");
    assert.match(drift.stdout, /DRIFT.*openapi\.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
