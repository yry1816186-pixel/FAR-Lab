// generate_json_schema.test.mjs — IC-12 验收:四类 Schema 生成+漂移检查(FF-14)。
// Oracle: ①四类 Schema 生成成功;②手改生成物→漂移检出;③改 TS 类型不重生成→检出(由 ② 同构覆盖)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const GEN = ["scripts/generate_json_schema.mts"];
const FILES = ["fec.schema.json", "proof-envelope.schema.json", "verdict.schema.json", "data-manifest.schema.json"];

function runGen(args) {
  return spawnSync(process.execPath, [...GEN, ...args], { cwd: ROOT, encoding: "utf8" });
}

test("① 四类 Schema 存在于 schema/json 且 --check 零漂移", () => {
  for (const f of FILES) {
    assert.ok(existsSync(join(ROOT, "schema", "json", f)), `缺 ${f}(跑 node scripts/generate_json_schema.mts)`);
  }
  const r = runGen(["--check"]);
  assert.equal(r.status, 0, `drift check failed:\n${r.stdout}\n${r.stderr}`);
  for (const f of FILES) {
    const doc = JSON.parse(readFileSync(join(ROOT, "schema", "json", f), "utf8"));
    assert.equal(typeof doc.title, "string");
    assert.match(doc["x-generated-by"], /generate_json_schema/);
  }
});

test("② 手改生成物 → --check 检出漂移(exit 1)", () => {
  const dir = mkdtempSync(join(tmpdir(), "schema-drift-"));
  try {
    const gen = runGen(["--dir", dir]);
    assert.equal(gen.status, 0, `generate failed:\n${gen.stdout}\n${gen.stderr}`);
    const okRun = runGen(["--check", "--dir", dir]);
    assert.equal(okRun.status, 0, "刚生成即检查应零漂移");
    // 手改其中一个生成物(模拟人工编辑/类型改动未重生成)
    const target = join(dir, "verdict.schema.json");
    const doc = JSON.parse(readFileSync(target, "utf8"));
    doc.enum = [...doc.enum, "TAMPERED_VALUE"];
    writeFileSync(target, JSON.stringify(doc, null, 2) + "\n", "utf8");
    const drift = runGen(["--check", "--dir", dir]);
    assert.equal(drift.status, 1, "篡改后未检出漂移");
    assert.match(drift.stdout, /DRIFT.*verdict\.schema\.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("③ 生成产物内容与类型语义一致(抽查)", () => {
  const verdict = JSON.parse(readFileSync(join(ROOT, "schema", "json", "verdict.schema.json"), "utf8"));
  assert.deepEqual(verdict.enum, ["CONFIRMED", "REFUTED", "INCONCLUSIVE", "DEGRADED_SCOPE", "UNTESTED"]);
  const fec = JSON.parse(readFileSync(join(ROOT, "schema", "json", "fec.schema.json"), "utf8"));
  assert.equal(fec.properties.contractVersion.const, "FEC/2.0");
  assert.ok(fec.required.includes("fecId") && fec.required.includes("freeze"));
  const env = JSON.parse(readFileSync(join(ROOT, "schema", "json", "proof-envelope.schema.json"), "utf8"));
  assert.equal(env.properties.sealedBy.const, "deterministic_sealer");
  assert.ok(!env.required.includes("rulesetUri"), "rulesetUri 应为 optional(legacy 兼容)");
});

test("④ DEBT-11 collision guard: 跨文件同名 interface → ambiguousNames 标记 + assertUnambiguous fail-closed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "schema-collision-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    // entry.ts 同时 import a.ts 与 b.ts → 两者均进 program import 闭包；a/b 各声明同名 Foo → 碰撞
    writeFileSync(join(dir, "src", "entry.ts"),
      "import './a.ts';\nimport './b.ts';\nexport interface Entry { foo: Foo }\n", "utf8");
    writeFileSync(join(dir, "src", "a.ts"), "export interface Foo { x: string }\n", "utf8");
    writeFileSync(join(dir, "src", "b.ts"), "export interface Foo { y: number }\n", "utf8");
    const mod = await import(pathToFileURL(join(ROOT, "scripts", "generate_json_schema.mts")).href);
    const index = mod.buildIndex(dir, [
      { file: "entry.schema.json", title: "t", source: "src/entry.ts#Entry", kind: "interface", name: "Entry" },
    ]);
    assert.ok(index.ambiguousNames.has("Foo"), "跨文件同名 Foo 须被 collision-guard 检出进 ambiguousNames");
    assert.throws(() => mod.assertUnambiguous(index, "Foo"), /ambiguous type reference 'Foo'/,
      "解析到同名碰撞的类型时须 fail-closed 抛错（禁止静默 last-wins 覆盖）");
    // 反向：唯一名不抛（防止守卫过敏误伤合法类型）
    assert.doesNotThrow(() => mod.assertUnambiguous(index, "Entry"),
      "唯一声明名不应被 collision-guard 误报");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
