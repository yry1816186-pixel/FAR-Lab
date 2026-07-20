#!/usr/bin/env node
/**
 * hero_multiseed.mjs — 备 Hero:HERO-MULTISEED(IC-08 · D-S5-03)。
 *
 * 叙事(90 秒):「cherry-pick 现形记」——预注册多种子真实 BLS 计算(noise-injected,
 * 每 seed 独立),研究者瞒报未检出的种子时,机器以 ANTI_THEATER_FAIL + HIDDEN_FAILED_RUN 抓出。
 *
 * 验收 Oracle(合同 contract-008):
 *   ② 全程 ≤90 秒;③ 输出含 honest status 段;每 seed 真实计算(非常量 replay)。
 *   exit 语义:far audit-multiseed exit 0 = cherry-pick DETECTED(本脚本 exit 0=演示链路如预期)。
 *
 * 诚实声明(冻结自承):RED(local)——local noise-injection,NOT online TESS;
 * doer=grader(预注册多种子+瞒报检测的机器演示,非生产裁决路径;需要 python+numpy)。
 */
import { spawnSync } from "node:child_process";

const BUDGET_MS = 90_000;
const started = Date.now();

function elapsed() {
  return ((Date.now() - started) / 1000).toFixed(1);
}

console.log("══ HERO-MULTISEED · cherry-pick 现形记 ══");
console.log(`t=${elapsed()}s  step 1/2: far audit-multiseed --json(预注册多种子真实 BLS)`);
const r = spawnSync(process.execPath, ["src/cli/far.ts", "audit-multiseed", "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
const status = r.status ?? -1;
console.log(`  exit=${status} ${status === 0 ? "✓" : "✗"}`);

let failures = 0;
let report = null;
if (status !== 0) {
  failures += 1;
  console.log(`  stderr tail: ${String(r.stderr ?? "").slice(-300)}`);
} else {
  try {
    report = JSON.parse(String(r.stdout ?? "").slice(String(r.stdout).indexOf("{")));
  } catch (e) {
    failures += 1;
    console.log(`  ✗ JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

if (report !== null) {
  const declared = Array.isArray(report.declaredSeeds) ? report.declaredSeeds.length : 0;
  const hidden = Array.isArray(report.hiddenSeeds) ? report.hiddenSeeds.length : 0;
  const perSeed = Array.isArray(report.perSeedResults) ? report.perSeedResults.length : 0;
  const checks = [
    ["antiTheaterHasFail === true(机器抓出瞒报)", report.antiTheaterHasFail === true],
    ["decisiveRuleId === ANTI_THEATER_FAIL", report.decisiveRuleId === "ANTI_THEATER_FAIL"],
    ["machineVerdict === UNTESTED(证据不足=诚实五值,不拔高)", report.machineVerdict === "UNTESTED"],
    [`存在被瞒报的未检出种子 hiddenSeeds=${hidden}`, hidden > 0],
    [`预注册多种子 declaredSeeds=${declared} ≥5 且每 seed 真实计算 perSeedResults=${perSeed}`, declared >= 5 && perSeed === declared],
  ];
  console.log(`t=${elapsed()}s  step 2/2: 结构化断言`);
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (!ok) failures += 1;
  }
}

const totalMs = Date.now() - started;
console.log("");
console.log("── honest status(诚实边界,冻结自承 RED(local))──");
console.log("  证明了: 预注册多种子真实计算 + 瞒报未检出种子 → 机器检出 cherry-pick(ANTI_THEATER_FAIL)。");
console.log("  不证明: 非 online TESS(local noise-injection fixture);非生产裁决路径(doer=grader);");
console.log("          不证明任何科学真理;需要 python+numpy 环境。");
console.log(`── 计时: ${(totalMs / 1000).toFixed(1)}s / 预算 90s ${totalMs <= BUDGET_MS ? "✓" : "✗ 超时"} ──`);

if (totalMs > BUDGET_MS) failures += 1;
console.log(`hero-multiseed: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failures)`);
process.exit(failures === 0 ? 0 : 1);
